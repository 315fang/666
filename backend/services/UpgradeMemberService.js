/**
 * UpgradeMemberService — 升级申请业务逻辑层
 *
 * 从 upgradeController.js 中提取所有 DB 操作，使 Controller 仅负责 HTTP 请求/响应。
 *
 * 标准路径（C/B）：用户提交申请 → 支付 → 审核通过 → 升级角色
 * N 路径：n_join（小n入场） / n_upgrade（小n升大N）
 */

const { User, UpgradeApplication, sequelize, AppConfig, CommissionLog } = require('../models');
const AgentWalletService = require('./AgentWalletService');
const NSystemService = require('./NSystemService');
const { sendNotification } = require('../models/notificationUtil');
const constants = require('../config/constants');
const { secureRandomHex } = require('../utils/secureRandom');
const { logError } = require('../utils/logger');

const LEVEL_NAMES = constants.ROLE_NAMES;
const { ROLES, UPGRADE_RULES } = constants;

const UPGRADE_AMOUNTS = {
    3: 3000,
    4: 30000,
    5: 198000
};

class UpgradeMemberService {

    // ─────────────────────────────────────────────
    //  申请提交
    // ─────────────────────────────────────────────

    /**
     * 提交升级申请（标准路径 / N 路径）
     * @param {number} userId - 当前用户 ID
     * @param {object} body - 请求体 { target_level, payment_type, proof_image, path_type, leader_id, team_upgrade }
     * @returns {{ code: number, message: string, data?: object }}
     */
    static async applyUpgrade(userId, body) {
        const { target_level, payment_type, proof_image, path_type, leader_id, team_upgrade } = body;

        const user = await User.findByPk(userId);
        if (!user) return { code: -1, message: '用户不存在' };

        // ── N 路径申请 ──
        if (path_type === 'n_join') {
            return this._applyNJoin(user, { payment_type, proof_image, leader_id });
        }
        if (path_type === 'n_upgrade') {
            return this._applyNUpgrade(user, { payment_type, proof_image, team_upgrade });
        }

        // ── 标准路径 ──
        if (!target_level || target_level < 3 || target_level > 5) {
            return { code: -1, message: '目标等级无效' };
        }
        if (user.role_level >= target_level) {
            return { code: -1, message: '您已经是该等级或更高等级' };
        }
        if (target_level - user.role_level > 1 && user.role_level < 2) {
            return { code: -1, message: '请先升级到高级代理(C2)再申请合伙人' };
        }

        const existing = await UpgradeApplication.findOne({
            where: { user_id: userId, status: ['pending_payment', 'pending_review'] }
        });
        if (existing) {
            return {
                code: -1,
                message: '您已有进行中的升级申请',
                data: { id: existing.id, status: existing.status }
            };
        }

        const amount = UPGRADE_AMOUNTS[target_level] || 0;
        const app = await UpgradeApplication.create({
            user_id: userId,
            current_level: user.role_level,
            target_level,
            amount,
            payment_type: payment_type || 'wechat_pay',
            proof_image: proof_image || null,
            status: payment_type === 'offline_transfer' ? 'pending_review' : 'pending_payment',
            path_type: 'standard'
        });

        return {
            code: 0,
            data: { id: app.id, amount, status: app.status, target_level_name: LEVEL_NAMES[target_level] },
            message: payment_type === 'offline_transfer'
                ? '申请已提交，请等待管理员审核'
                : `请完成支付 ¥${amount}`
        };
    }

    /**
     * 加入N路径：由大N邀约，小程序支付 ¥3000
     * @param {User} user - 用户模型实例
     * @param {{ payment_type, proof_image, leader_id }} opts
     * @returns {{ code: number, message: string, data?: object }}
     */
    static async _applyNJoin(user, { payment_type, proof_image, leader_id }) {
        if (!leader_id) {
            return { code: -1, message: '缺少邀约人大N ID' };
        }
        if (user.role_level === ROLES.N_MEMBER || user.role_level === ROLES.N_LEADER) {
            return { code: -1, message: '您已在N路径中' };
        }

        const leader = await User.findByPk(leader_id);
        if (!leader || leader.role_level !== ROLES.N_LEADER) {
            return { code: -1, message: '邀约人不是有效的大N' };
        }

        const existing = await UpgradeApplication.findOne({
            where: { user_id: user.id, path_type: 'n_join', status: ['pending_payment', 'pending_review'] }
        });
        if (existing) {
            return { code: -1, message: '您已有进行中的N路径入场申请' };
        }

        const amount = UPGRADE_RULES.N_JOIN.recharge_amount;
        const app = await UpgradeApplication.create({
            user_id: user.id,
            current_level: user.role_level,
            target_level: ROLES.N_MEMBER,
            amount,
            payment_type: payment_type || 'wechat_pay',
            proof_image: proof_image || null,
            path_type: 'n_join',
            leader_id,
            status: payment_type === 'offline_transfer' ? 'pending_review' : 'pending_payment'
        });

        return {
            code: 0,
            data: { id: app.id, amount, status: app.status, target_level_name: LEVEL_NAMES[ROLES.N_MEMBER] },
            message: `请完成支付 ¥${amount}，完成后等待审核加入${leader.nickname || '大N'}的团队`
        };
    }

    /**
     * 小n申请升大N：直充3万 或 团队满10个小n
     * @param {User} user - 用户模型实例
     * @param {{ payment_type, proof_image, team_upgrade }} opts
     * @returns {{ code: number, message: string, data?: object }}
     */
    static async _applyNUpgrade(user, { payment_type, proof_image, team_upgrade }) {
        if (user.role_level !== ROLES.N_MEMBER) {
            return { code: -1, message: '只有小n才能申请升级为大N' };
        }

        const existing = await UpgradeApplication.findOne({
            where: { user_id: user.id, path_type: 'n_upgrade', status: ['pending_payment', 'pending_review'] }
        });
        if (existing) {
            return { code: -1, message: '您已有进行中的升大N申请' };
        }

        const isTeamUpgrade = team_upgrade === true;

        if (isTeamUpgrade) {
            // 团队路径：验证名下小n数量
            const { eligible, count, required } = await NSystemService.checkNUpgradeEligibility(user.id);
            if (!eligible) {
                return {
                    code: -1,
                    message: `团队路径需要 ${required} 个已入场的小n，当前 ${count} 个`,
                    data: { count, required }
                };
            }
            const app = await UpgradeApplication.create({
                user_id: user.id,
                current_level: ROLES.N_MEMBER,
                target_level: ROLES.N_LEADER,
                amount: 0,
                payment_type: 'offline_transfer',
                path_type: 'n_upgrade',
                team_upgrade: true,
                status: 'pending_review'
            });
            return {
                code: 0,
                data: { id: app.id, amount: 0, status: app.status },
                message: `团队条件已满足，升大N申请已提交，等待审核`
            };
        }

        // 直充路径：走微信支付 ¥30000
        const amount = UPGRADE_RULES.N_MEMBER_TO_LEADER.recharge_amount;
        const app = await UpgradeApplication.create({
            user_id: user.id,
            current_level: ROLES.N_MEMBER,
            target_level: ROLES.N_LEADER,
            amount,
            payment_type: payment_type || 'wechat_pay',
            proof_image: proof_image || null,
            path_type: 'n_upgrade',
            team_upgrade: false,
            status: payment_type === 'offline_transfer' ? 'pending_review' : 'pending_payment'
        });

        return {
            code: 0,
            data: { id: app.id, amount, status: app.status, target_level_name: LEVEL_NAMES[ROLES.N_LEADER] },
            message: `请完成支付 ¥${amount}`
        };
    }

    // ─────────────────────────────────────────────
    //  预支付 & 支付回调
    // ─────────────────────────────────────────────

    /**
     * 创建微信预支付订单
     * @param {number} userId - 当前用户 ID
     * @param {string} applicationId - 升级申请 ID
     * @returns {{ code: number, data?: object, message?: string }}
     */
    static async prepayUpgrade(userId, applicationId) {
        const app = await UpgradeApplication.findOne({
            where: { id: applicationId, user_id: userId, status: 'pending_payment' }
        });
        if (!app) return { code: -1, message: '升级申请不存在或已处理' };

        const { createUnifiedOrder, buildJsApiParams } = require('../utils/wechat');
        const user = await User.findByPk(userId);

        const orderNo = `UP${Date.now()}${secureRandomHex(2)}`; // 4位十六进制随机 ≈ 4位十进制随机
        app.payment_no = orderNo;
        await app.save();

        const prepayId = await createUnifiedOrder({
            orderNo,
            amount: parseFloat(app.amount),
            openid: user.openid,
            body: `升级${LEVEL_NAMES[app.target_level]}`
        });

        const payParams = buildJsApiParams(prepayId);
        return { code: 0, data: { ...payParams, application_id: app.id } };
    }

    /**
     * 处理微信支付回调
     * @param {object} notifyData - 解密后的通知数据（含 out_trade_no）
     * @returns {{ status: 'SUCCESS'|'FAIL', reason?: string }}
     */
    static async handlePayNotify(notifyData) {
        const orderNo = notifyData?.out_trade_no;
        if (!orderNo || !orderNo.startsWith('UP')) {
            return { status: 'SUCCESS' }; // 非本系统订单，忽略但不报错
        }

        const app = await UpgradeApplication.findOne({ where: { payment_no: orderNo } });
        if (!app || app.status !== 'pending_payment') {
            return { status: 'SUCCESS' }; // 已处理或不存在，幂等返回成功
        }

        const t = await sequelize.transaction();
        try {
            app.status = 'pending_review';
            await app.save({ transaction: t });

            await AgentWalletService.recharge({
                userId: app.user_id,
                amount: parseFloat(app.amount),
                refType: 'upgrade_payment',
                refId: String(app.id),
                remark: `升级缴费(${LEVEL_NAMES[app.target_level]}) ¥${app.amount}`
            }, t);

            await t.commit();

            sendNotification(app.user_id, '升级缴费成功',
                `您的 ¥${app.amount} 已充入货款钱包，升级申请正在等待审核。`,
                'upgrade', String(app.id)).catch(() => {});
        } catch (e) {
            if (!t.finished) await t.rollback();
            logError('[升级支付回调] 处理失败', e);
            return { status: 'FAIL', reason: e.message };
        }

        return { status: 'SUCCESS' };
    }

    // ─────────────────────────────────────────────
    //  查询
    // ─────────────────────────────────────────────

    /**
     * 获取当前用户的升级申请列表
     * @param {number} userId
     * @returns {Array<UpgradeApplication>}
     */
    static async getMyApplications(userId) {
        return UpgradeApplication.findAll({
            where: { user_id: userId },
            order: [['created_at', 'DESC']],
            limit: 10
        });
    }

    /**
     * 管理员分页查询升级申请列表
     * @param {object} query - 查询参数 { status, page, limit, path_type }
     * @returns {{ list: Array, total: number }}
     */
    static async adminGetApplications(query) {
        const { Op } = require('sequelize');
        const { status, page = 1, limit = 20, path_type } = query;
        const where = {};
        if (status) where.status = status;
        if (path_type) {
            const types = path_type.split(',').map(t => t.trim()).filter(Boolean);
            where.path_type = types.length === 1 ? types[0] : { [Op.in]: types };
        }

        const { count, rows } = await UpgradeApplication.findAndCountAll({
            where,
            include: [{ model: User, as: 'user', attributes: ['id', 'nickname', 'avatar_url', 'phone', 'role_level'] }],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });

        return { list: rows, total: count };
    }

    // ─────────────────────────────────────────────
    //  管理员审核
    // ─────────────────────────────────────────────

    /**
     * 管理员审核升级申请（通过/驳回）
     * @param {object} params
     * @param {number} params.applicationId - 申请 ID
     * @param {'approve'|'reject'} params.action - 操作类型
     * @param {string} [params.remark] - 审核备注
     * @param {number} [params.adminId] - 管理员 ID
     * @returns {{ code: number, message: string }}
     */
    static async adminReviewApplication({ applicationId, action, remark, adminId }) {
        const app = await UpgradeApplication.findByPk(applicationId);
        if (!app) return { code: -1, message: '申请不存在' };
        if (app.status !== 'pending_review') return { code: -1, message: '该申请不在待审核状态' };

        if (action === 'approve') {
            return this._approveApplication(app, adminId, remark);
        }
        if (action === 'reject') {
            return this._rejectApplication(app, adminId, remark);
        }
        return { code: -1, message: 'action 必须是 approve 或 reject' };
    }

    /**
     * 通过升级申请
     * @private
     */
    static async _approveApplication(app, adminId, remark) {
        const t = await sequelize.transaction();
        try {
            const user = await User.findByPk(app.user_id, { transaction: t, lock: t.LOCK.UPDATE });

            // ── N 路径审核 ──
            if (app.path_type === 'n_join') {
                user.role_level = ROLES.N_MEMBER;
                user.n_leader_id = app.leader_id;
                user.joined_team_at = new Date();
                await user.save({ transaction: t });

                app.status = 'approved';
                app.admin_id = adminId;
                app.admin_remark = remark || '';
                app.reviewed_at = new Date();
                await app.save({ transaction: t });
                await t.commit();

                sendNotification(app.user_id, '欢迎加入N路径',
                    `恭喜！您已成功成为小n代理，请联系您的大N获取货款额度开始提货。`,
                    'upgrade', String(app.id)).catch(() => {});
                sendNotification(app.leader_id, '新小n加入',
                    `${user.nickname || '新用户'} 已通过审核加入您的团队，记得为其分配货款。`,
                    'team').catch(() => {});

                return { code: 0, message: '审核通过，用户已成为小n代理' };
            }

            if (app.path_type === 'n_upgrade') {
                await NSystemService.handleSeparationBonus(app.user_id, t);
                await NSystemService.detachFromLeader(app.user_id, t);

                user.role_level = ROLES.N_LEADER;
                await user.save({ transaction: t });

                app.status = 'approved';
                app.admin_id = adminId;
                app.admin_remark = remark || '';
                app.reviewed_at = new Date();
                await app.save({ transaction: t });
                await t.commit();

                sendNotification(app.user_id, '恭喜晋升大N',
                    `您已成功升级为大N独立代理！现在可以开始邀约小n并管理团队货款。`,
                    'upgrade', String(app.id)).catch(() => {});

                return { code: 0, message: '审核通过，用户已升级为大N独立代理' };
            }

            // ── 标准路径审核 ──
            if (user.role_level < app.target_level) {
                user.role_level = app.target_level;
                if (app.target_level >= 3 && app.target_level <= 5) user.agent_level = app.target_level - 2;
                await user.save({ transaction: t });
            }

            app.status = 'approved';
            app.admin_id = adminId;
            app.admin_remark = remark || '';
            app.reviewed_at = new Date();
            await app.save({ transaction: t });

            await t.commit();

            sendNotification(app.user_id, '升级审核通过',
                `恭喜！您已成功升级为${LEVEL_NAMES[app.target_level]}，享受对应等级权益。`,
                'upgrade', String(app.id)).catch(() => {});

            // 异步发放平级奖 + 基金池现金部分
            setImmediate(() => this._dispatchPostApprovalRewards(app));

            return { code: 0, message: '审核通过，用户已升级' };
        } catch (e) {
            if (!t.finished) await t.rollback();
            throw e;
        }
    }

    /**
     * 驳回升级申请
     * @private
     */
    static async _rejectApplication(app, adminId, remark) {
        app.status = 'rejected';
        app.admin_id = adminId;
        app.admin_remark = remark || '';
        app.reviewed_at = new Date();
        await app.save();

        sendNotification(app.user_id, '升级申请被驳回',
            `您的升级申请未通过，原因：${remark || '未说明'}。如有疑问请联系客服。`,
            'upgrade', String(app.id)).catch(() => {});

        return { code: 0, message: '已驳回' };
    }

    /**
     * 审核通过后的异步奖励发放（平级直推奖 + 基金池现金）
     * @private
     */
    static async _dispatchPostApprovalRewards(app) {
        // 平级直推奖金
        try {
            const upgradedUser = await User.findByPk(app.user_id);
            if (upgradedUser && upgradedUser.parent_id) {
                const upline = await User.findByPk(upgradedUser.parent_id);
                if (upline) {
                    const { handleSameLevelReferral } = require('../utils/commission');
                    await handleSameLevelReferral(upline, upgradedUser);
                }
            }
        } catch (e) {
            logError('[平级奖发放] 失败', e);
        }

        // 基金池现金部分
        try {
            const cfg = await AppConfig.findOne({ where: { config_key: 'agent_system_fund_pool', status: 1 } });
            if (!cfg) return;
            const pool = JSON.parse(cfg.config_value);
            if (!pool.enabled) return;
            const levelKey = { 3: 'b1', 4: 'b2', 5: 'b3' }[app.target_level];
            if (!levelKey || !pool[levelKey]) return;
            const lp = pool[levelKey];
            const total = parseFloat(lp.total || 0);
            if (total <= 0) return;
            const cashPct = (parseFloat(lp.mirror_ops_pct || 0) + parseFloat(lp.personal_pct || 0)) / 100;
            const cashAmount = parseFloat((total * cashPct).toFixed(2));
            if (cashAmount > 0) {
                await User.increment('balance', { by: cashAmount, where: { id: app.user_id } });
                await CommissionLog.create({
                    user_id: app.user_id, order_id: null, amount: cashAmount,
                    type: 'Fund_Pool', status: 'settled', settled_at: new Date(),
                    remark: `${LEVEL_NAMES[app.target_level]}基金池现金发放（镜像运营+个人奖励）`
                });
                sendNotification(app.user_id, '基金池奖励到账',
                    `¥${cashAmount} 基金池现金已入账（旅行基金和父母奖将由公司线下组织发放）`,
                    'reward').catch(() => {});
            }
        } catch (e) {
            logError('[基金池发放] 失败', e);
        }
    }
}

module.exports = UpgradeMemberService;
