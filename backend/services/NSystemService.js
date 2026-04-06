/**
 * NSystemService — N 路径分销体系核心业务逻辑
 *
 * 角色说明：
 *   小n (role_level=6)：N路径分销代理，被大N邀约入场，缴纳¥3000
 *   大N (role_level=7)：N路径独立代理，可招募小n，管理其货款配额
 *
 * 货款流转：大N划拨 → 小n账户 → 小n下单（钱从小n账户扣，差价归大N可提现余额）
 * 脱离奖励：小n升大N时，原大N获得¥30000×10% = ¥3000一次性奖励（进User.balance）
 */

const { User, NFundRequest, CommissionLog, UpgradeApplication, sequelize } = require('../models');
const AgentWalletService = require('./AgentWalletService');
const { sendNotification } = require('../models/notificationUtil');
const constants = require('../config/constants');
const { ROLES, UPGRADE_RULES, N_SYSTEM, ROLE_NAMES } = constants;

class NSystemService {

    // ─────────────────────────────────────────────
    //  货款管理
    // ─────────────────────────────────────────────

    /**
     * 大N 主动划拨货款给 小n（无需申请直接执行）
     * @param {number} leaderId - 大N user_id
     * @param {number} memberId - 小n user_id
     * @param {number} amount
     * @param {string} [remark]
     */
    static async allocateFunds(leaderId, memberId, amount, remark = '') {
        const leader = await User.findByPk(leaderId);
        if (!leader || leader.role_level !== ROLES.N_LEADER) {
            throw new Error('操作人不是大N，无权划拨货款');
        }
        const member = await User.findByPk(memberId);
        if (!member || member.role_level !== ROLES.N_MEMBER) {
            throw new Error('目标用户不是小n');
        }
        if (member.n_leader_id !== leaderId) {
            throw new Error('该小n不在你的名下');
        }
        if (!amount || amount <= 0) {
            throw new Error('划拨金额必须大于0');
        }

        const result = await AgentWalletService.transfer(leaderId, memberId, amount, {
            remark: remark || `大N划拨货款给小n #${memberId}`
        });

        sendNotification(memberId, '货款到账', `大N已为你划拨 ¥${amount}，可用于下单提货。`, 'wallet').catch(() => {});
        return result;
    }

    /**
     * 小n 提交货款申请（向大N请求划拨）
     * @param {number} memberId - 小n user_id
     * @param {number} amount
     * @param {string} [note]
     * @returns {NFundRequest}
     */
    static async requestFunds(memberId, amount, note = '') {
        const member = await User.findByPk(memberId);
        if (!member || member.role_level !== ROLES.N_MEMBER) {
            throw new Error('只有小n可以提交货款申请');
        }
        if (!member.n_leader_id) {
            throw new Error('你还没有绑定大N，请联系客服');
        }
        if (!amount || amount <= 0) {
            throw new Error('申请金额必须大于0');
        }

        const existing = await NFundRequest.findOne({
            where: { requester_id: memberId, status: 'pending' }
        });
        if (existing) {
            throw new Error('您已有一条待处理的申请，请等待大N审核后再提交');
        }

        const req = await NFundRequest.create({
            requester_id: memberId,
            leader_id: member.n_leader_id,
            amount,
            note: note || null,
            status: 'pending'
        });

        sendNotification(member.n_leader_id, '货款申请', `小n ${member.nickname || '#' + memberId} 申请货款 ¥${amount}，请及时处理。`, 'n_fund').catch(() => {});
        return req;
    }

    /**
     * 大N 审核货款申请（approve → 执行划拨 | reject → 驳回）
     * @param {number} requestId - NFundRequest.id
     * @param {number} leaderId  - 操作人大N的 user_id
     * @param {'approve'|'reject'} action
     * @param {string} [rejectReason]
     */
    static async reviewFundRequest(requestId, leaderId, action, rejectReason = '') {
        const request = await NFundRequest.findByPk(requestId);
        if (!request) throw new Error('申请不存在');
        if (request.leader_id !== leaderId) throw new Error('无权操作该申请');
        if (request.status !== 'pending') throw new Error('该申请已处理');

        if (action === 'approve') {
            await AgentWalletService.transfer(leaderId, request.requester_id, parseFloat(request.amount), {
                refId: String(request.id),
                remark: `审核通过货款申请 #${request.id}`
            });
            request.status = 'approved';
            request.reviewed_at = new Date();
            await request.save();

            sendNotification(request.requester_id, '货款申请通过', `你的 ¥${request.amount} 货款申请已通过，已到账。`, 'wallet').catch(() => {});
        } else if (action === 'reject') {
            request.status = 'rejected';
            request.reject_reason = rejectReason || null;
            request.reviewed_at = new Date();
            await request.save();

            sendNotification(request.requester_id, '货款申请被驳回', `你的 ¥${request.amount} 货款申请被驳回${rejectReason ? '：' + rejectReason : ''}。`, 'n_fund').catch(() => {});
        } else {
            throw new Error('action 必须是 approve 或 reject');
        }

        return request;
    }

    // ─────────────────────────────────────────────
    //  升级与邀约
    // ─────────────────────────────────────────────

    /**
     * 检查小n是否达到团队升大N的条件（10个已完成入场的小n）
     * @param {number} memberId - 小n user_id
     * @returns {{ eligible: boolean, count: number, required: number }}
     */
    static async checkNUpgradeEligibility(memberId) {
        const required = UPGRADE_RULES.N_MEMBER_TO_LEADER.team_member_count;

        // 计算该小n名下、已完成入场（UpgradeApplication approved）的小n数量
        const count = await User.count({
            where: { n_leader_id: memberId, role_level: ROLES.N_MEMBER }
        });

        // 同时校验这些小n的入场申请确实是 approved 状态（防止重复计数）
        const approvedCount = await UpgradeApplication.count({
            where: {
                leader_id: memberId,
                path_type: 'n_join',
                status: 'approved'
            }
        });

        const finalCount = Math.min(count, approvedCount);
        return { eligible: finalCount >= required, count: finalCount, required };
    }

    /**
     * 小n 升大N 时，给原大N发放一次性脱离奖励（10% × ¥30000 = ¥3000）
     * 奖励进原大N的 User.balance（可提现佣金余额）
     * @param {number} memberId  - 即将升为大N的 小n user_id
     * @param {object} transaction - 外部事务（必须在同一事务内执行）
     */
    static async handleSeparationBonus(memberId, transaction) {
        const member = await User.findByPk(memberId, { transaction });
        if (!member || !member.n_leader_id) return;

        const upgradeAmount = UPGRADE_RULES.N_MEMBER_TO_LEADER.recharge_amount;
        const bonusAmount = parseFloat((upgradeAmount * N_SYSTEM.SEPARATION_BONUS_RATE).toFixed(2));
        if (bonusAmount <= 0) return;

        await User.increment('balance', {
            by: bonusAmount,
            where: { id: member.n_leader_id },
            transaction
        });

        await CommissionLog.create({
            user_id: member.n_leader_id,
            order_id: null,
            amount: bonusAmount,
            type: 'n_separation_bonus',
            status: 'settled',
            settled_at: new Date(),
            remark: `小n #${memberId}(${member.nickname || ''}) 升级为大N，一次性脱离奖励 ¥${bonusAmount}`
        }, { transaction });

        sendNotification(member.n_leader_id, '脱离奖励到账',
            `你名下的 ${member.nickname || '小n代理'} 已升级为大N独立代理，脱离奖励 ¥${bonusAmount} 已入账至可提现余额。`,
            'reward').catch(() => {});
    }

    /**
     * 小n升大N后，解除与原大N的绑定关系（n_leader_id 置 null）
     * @param {number} memberId
     * @param {object} transaction
     */
    static async detachFromLeader(memberId, transaction) {
        await User.update(
            { n_leader_id: null },
            { where: { id: memberId }, transaction }
        );
    }

    // ─────────────────────────────────────────────
    //  查询
    // ─────────────────────────────────────────────

    /**
     * 大N 查看名下所有小n（含货款余额）
     */
    static async getMembers(leaderId, { page = 1, limit = 20 } = {}) {
        const { AgentWalletAccount } = require('../models');
        const { count, rows } = await User.findAndCountAll({
            where: { n_leader_id: leaderId, role_level: ROLES.N_MEMBER },
            include: [{ model: AgentWalletAccount, as: 'agentWallet', attributes: ['balance'] }],
            attributes: ['id', 'nickname', 'avatar_url', 'phone', 'role_level', 'joined_team_at', 'n_leader_id'],
            order: [['joined_team_at', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });
        return { list: rows, total: count };
    }

    /**
     * 大N 查看待审核的货款申请
     */
    static async getPendingRequests(leaderId) {
        return NFundRequest.findAll({
            where: { leader_id: leaderId, status: 'pending' },
            include: [{ model: User, as: 'requester', attributes: ['id', 'nickname', 'avatar_url', 'phone'] }],
            order: [['created_at', 'ASC']]
        });
    }

    /**
     * 小n 查看自己的货款申请历史
     */
    static async getMyRequests(memberId, { page = 1, limit = 20 } = {}) {
        const { count, rows } = await NFundRequest.findAndCountAll({
            where: { requester_id: memberId },
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });
        return { list: rows, total: count };
    }
}

module.exports = NSystemService;
