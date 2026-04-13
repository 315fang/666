/**
 * N路径路由
 *
 * 大N 操作：
 *   POST /api/n/allocate           — 主动划拨货款给小n
 *   GET  /api/n/members            — 查看名下小n列表
 *   GET  /api/n/fund-requests      — 查看待审核货款申请
 *   POST /api/n/fund-requests/:id/review — 审核货款申请
 *
 * 小n 操作：
 *   POST /api/n/fund-request       — 申请货款
 *   GET  /api/n/my-requests        — 查看自己的申请历史
 *   GET  /api/n/my-leader          — 查看自己的大N信息
 *
 * 通用（登录即可查看）：
 *   GET  /api/n/upgrade-eligibility — 小n查询升大N的团队条件进度
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authenticate = auth.authenticate;
const NSystemService = require('../services/NSystemService');
const { User, AppConfig } = require('../models');
const constants = require('../config/constants');
const { ROLES } = constants;

// ─── N 邀请卡（兼容旧前端邀约页，公开可访问） ───────────────────────
router.get('/invite-card', async (req, res, next) => {
    try {
        const leaderId = parseInt(req.query.leader_id, 10);
        if (!leaderId) {
            return res.status(400).json({ code: -1, message: '缺少 leader_id' });
        }

        const leader = await User.findByPk(leaderId, {
            attributes: ['id', 'nickname', 'avatar_url', 'phone', 'role_level']
        });
        if (!leader || leader.role_level !== ROLES.N_LEADER) {
            return res.status(404).json({ code: -1, message: '邀约人不存在或不是有效的大N' });
        }

        const memberCount = await User.count({
            where: {
                n_leader_id: leader.id,
                role_level: ROLES.N_MEMBER
            }
        });

        const phone = String(leader.phone || '');
        const phoneMasked = phone && phone.length >= 7
            ? `${phone.slice(0, 3)}****${phone.slice(-4)}`
            : '';

        let inviteConfig = {};
        try {
            const row = await AppConfig.findOne({
                where: { category: 'activity', config_key: 'n_invite_card_config', status: 1 }
            });
            if (row?.config_value) {
                inviteConfig = JSON.parse(row.config_value) || {};
            }
        } catch (_) { /* ignore */ }

        const nickname = leader.nickname || '大N导师';
        res.json({
            code: 0,
            data: {
                leader_id: leader.id,
                nickname,
                avatar_url: leader.avatar_url || '',
                role_label: inviteConfig.role_label || '大N导师',
                member_count: memberCount,
                phone_masked: phoneMasked || '暂未公开',
                invite_title: inviteConfig.invite_title || `${nickname} 邀请你加入 N1`,
                invite_subtitle: inviteConfig.invite_subtitle || '完成入场后即可加入导师团队，开启 N 路径成长',
                hero_title: inviteConfig.hero_title || '专属定向邀约',
                hero_desc: inviteConfig.hero_desc || '加入后可获得团队扶持、成长路径与专属货款协作',
                join_amount: constants.UPGRADE_RULES?.N_JOIN?.recharge_amount || 3000
            }
        });
    } catch (err) {
        next(err);
    }
});

// 除公开邀约卡外，其余 N 路径接口都需要登录
router.use(authenticate);

// ─── 大N：划拨货款给小n ────────────────────────────────────────────
router.post('/allocate', async (req, res, next) => {
    try {
        const leaderId = req.user.id;
        const { member_id, amount, remark } = req.body;
        if (!member_id || !amount || amount <= 0) {
            return res.status(400).json({ code: -1, message: '缺少参数：member_id 或 amount' });
        }
        const result = await NSystemService.allocateFunds(leaderId, parseInt(member_id), parseFloat(amount), remark);
        res.json({ code: 0, data: result, message: `已成功划拨 ¥${amount} 给小n` });
    } catch (err) { next(err); }
});

// ─── 大N：查看名下小n列表 ──────────────────────────────────────────
router.get('/members', async (req, res, next) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user || user.role_level !== ROLES.N_LEADER) {
            return res.status(403).json({ code: -1, message: '仅大N可查看成员列表' });
        }
        const { page, limit } = req.query;
        const result = await NSystemService.getMembers(req.user.id, { page, limit });
        res.json({ code: 0, data: result });
    } catch (err) { next(err); }
});

// ─── 大N：查看待审核的货款申请 ────────────────────────────────────
router.get('/fund-requests', async (req, res, next) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user || user.role_level !== ROLES.N_LEADER) {
            return res.status(403).json({ code: -1, message: '仅大N可查看货款申请' });
        }
        const requests = await NSystemService.getPendingRequests(req.user.id);
        res.json({ code: 0, data: requests });
    } catch (err) { next(err); }
});

// ─── 大N：审核货款申请 ────────────────────────────────────────────
router.post('/fund-requests/:id/review', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { action, reject_reason } = req.body;
        if (!action || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({ code: -1, message: 'action 必须是 approve 或 reject' });
        }
        const result = await NSystemService.reviewFundRequest(parseInt(id), req.user.id, action, reject_reason);
        res.json({ code: 0, data: result, message: action === 'approve' ? '已审核通过并划拨' : '已驳回' });
    } catch (err) { next(err); }
});

// ─── 小n：申请货款 ───────────────────────────────────────────────
router.post('/fund-request', async (req, res, next) => {
    try {
        const { amount, note } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ code: -1, message: '申请金额必须大于0' });
        }
        const request = await NSystemService.requestFunds(req.user.id, parseFloat(amount), note);
        res.json({ code: 0, data: request, message: '货款申请已提交，等待大N审核' });
    } catch (err) { next(err); }
});

// ─── 小n：查看自己的申请历史 ──────────────────────────────────────
router.get('/my-requests', async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const result = await NSystemService.getMyRequests(req.user.id, { page, limit });
        res.json({ code: 0, data: result });
    } catch (err) { next(err); }
});

// ─── 小n：查看自己的大N信息 ──────────────────────────────────────
router.get('/my-leader', async (req, res, next) => {
    try {
        const user = await User.findByPk(req.user.id, {
            include: [{ model: User, as: 'nLeader', attributes: ['id', 'nickname', 'avatar_url', 'phone'] }]
        });
        if (!user || user.role_level !== ROLES.N_MEMBER) {
            return res.status(403).json({ code: -1, message: '仅小n可查看大N信息' });
        }
        res.json({ code: 0, data: user.nLeader || null });
    } catch (err) { next(err); }
});

// ─── 小n：查询升大N的团队条件进度 ────────────────────────────────
router.get('/upgrade-eligibility', async (req, res, next) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user || user.role_level !== ROLES.N_MEMBER) {
            return res.json({ code: 0, data: { eligible: false, message: '仅小n可查询升级条件' } });
        }
        const result = await NSystemService.checkNUpgradeEligibility(req.user.id);
        res.json({ code: 0, data: result });
    } catch (err) { next(err); }
});

module.exports = router;
