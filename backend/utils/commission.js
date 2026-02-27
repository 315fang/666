/**
 * 佣金计算工具
 * 基于 Project Master Specification 第3.1节的佣金分配算法
 */
const { ROLES, UPGRADE_RULES } = require('../config/constants');

/**
 * 佣金配置
 */
const COMMISSION_CONFIG = {
    // 会员直推佣金
    MEMBER_DIRECT: 60,
    // 团长直推佣金
    LEADER_DIRECT: 90,
    // 团长团队佣金（从下级会员的推荐中获得）
    LEADER_TEAM: 30,
    // 合伙人无库存时的推荐费（等同于团长直推）
    PARTNER_NO_STOCK: 90
};

/**
 * @deprecated 此函数为旧版遗留，使用固定金额分配逻辑，与当前系统的差价体系（price gap）不符。
 * 实际佣金计算已在 orderController.js 的 shipOrder() 中内联实现（动态差价分润）。
 * 保留此函数仅供历史参考，禁止在新业务中调用。
 *
 * 计算订单佣金分配
 * @param {Object} params
 * @param {number} params.retailPrice - 零售价
 * @param {number} params.wholesalePrice - 批发价
 * @param {Object} params.distributor - 分销商信息 { id, role_level, parent }
 * @param {Object} params.buyer - 购买者信息
 * @returns {Array} 佣金分配记录
 */
function calculateCommission({ retailPrice, wholesalePrice, distributor, buyer }) {
    const commissionLogs = [];
    const profitPool = retailPrice - wholesalePrice; // 利润池

    // 如果没有分销商，利润归公司
    if (!distributor) {
        return commissionLogs;
    }

    const distributorRole = distributor.role_level;

    // Case 1: 会员销售
    if (distributorRole === 1) {
        // 会员获得直推佣金
        commissionLogs.push({
            user_id: distributor.id,
            amount: COMMISSION_CONFIG.MEMBER_DIRECT,
            type: 'Direct'
        });

        // 检查上级
        if (distributor.parent) {
            const parentRole = distributor.parent.role_level;

            // 上级是团长，获得团队佣金
            if (parentRole === 2) {
                commissionLogs.push({
                    user_id: distributor.parent.id,
                    amount: COMMISSION_CONFIG.LEADER_TEAM,
                    type: 'Indirect'
                });

                // 检查团长的上级合伙人
                if (distributor.parent.parent && distributor.parent.parent.role_level === 3) {
                    const remainder = profitPool - COMMISSION_CONFIG.MEMBER_DIRECT - COMMISSION_CONFIG.LEADER_TEAM;
                    commissionLogs.push({
                        user_id: distributor.parent.parent.id,
                        amount: remainder,
                        type: 'Stock_Diff'
                    });
                }
            }
            // 上级是合伙人，获得剩余利润
            else if (parentRole === 3) {
                const remainder = profitPool - COMMISSION_CONFIG.MEMBER_DIRECT;
                commissionLogs.push({
                    user_id: distributor.parent.id,
                    amount: remainder,
                    type: 'Stock_Diff'
                });
            }
        }
    }

    // Case 2: 团长销售
    else if (distributorRole === 2) {
        // 团长获得直推佣金（60+30）
        commissionLogs.push({
            user_id: distributor.id,
            amount: COMMISSION_CONFIG.LEADER_DIRECT,
            type: 'Direct'
        });

        // 检查上级合伙人
        if (distributor.parent && distributor.parent.role_level === 3) {
            const remainder = profitPool - COMMISSION_CONFIG.LEADER_DIRECT;
            commissionLogs.push({
                user_id: distributor.parent.id,
                amount: remainder,
                type: 'Stock_Diff'
            });
        }
    }

    // Case 3: 合伙人销售（从云仓发货）
    else if (distributorRole === 3) {
        // 合伙人获得全部利润
        commissionLogs.push({
            user_id: distributor.id,
            amount: profitPool,
            type: 'Stock_Diff'
        });
    }

    return commissionLogs;
}

/**
 * 检查用户是否应该升级角色
 * @param {Object} user - 用户信息
 * @returns {number|null} 新角色等级，null表示不需要升级
 */
function checkRoleUpgrade(user) {
    // 会员 -> 团长：直推N人（从集中配置读取）
    if (user.role_level === ROLES.MEMBER && user.referee_count >= UPGRADE_RULES.MEMBER_TO_LEADER.referee_count) {
        return ROLES.LEADER;
    }

    // 团长 -> 代理商：累计销售N单 或 充值¥N
    if (user.role_level === ROLES.LEADER && user.order_count >= UPGRADE_RULES.LEADER_TO_AGENT.order_count) {
        return ROLES.AGENT;
    }

    return null;
}

/**
 * ★ Phase 3：同级直推机制
 *
 * 场景：下线用户正常升级到与上线相同级别后触发
 * 效果：上线得到一笔「同级直推奖金」，立即到账余额
 *
 * 奖金配置（元）：
 *   会员升至会员  → 上线 +20 元
 *   团长升至团长  → 上线 +50 元
 *   代理商升至代理商 → 上线 +100 元
 *
 * @param {object} upline    上线用户 { id, role_level }
 * @param {object} newPeer   升级用户 { id, role_level（升级后）}
 * @param {object} [t]       外部事务（可选，不传则自建事务）
 */
async function handleSameLevelReferral(upline, newPeer, t = null) {
    const SAME_LEVEL_BONUS = {
        1: 20,   // 会员 -> 会员
        2: 50,   // 团长 -> 团长
        3: 100   // 代理商 -> 代理商
    };

    const bonus = SAME_LEVEL_BONUS[newPeer.role_level];
    // 上线必须存在且为同级，才触发奖励
    if (!bonus || !upline || upline.role_level !== newPeer.role_level) return;

    try {
        const { User, CommissionLog, sequelize } = require('../models');
        const ownTx = !t;
        if (ownTx) t = await sequelize.transaction();

        const freshUpline = await User.findByPk(upline.id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!freshUpline) {
            if (ownTx) await t.rollback();
            return;
        }

        await freshUpline.increment('balance', { by: bonus, transaction: t });
        await CommissionLog.create({
            user_id: upline.id,
            order_id: null,
            amount: bonus,
            type: 'Peer_Direct',
            status: 'settled',
            settled_at: new Date(),
            remark: `同级直推奖金：下线用户(ID:${newPeer.id})升级至${newPeer.role_level}级`
        }, { transaction: t });

        if (ownTx) await t.commit();
        console.log(`[Phase3-同级直推] 用户${upline.id} 得 ¥${bonus}，触发人: 用户${newPeer.id}`);
    } catch (err) {
        console.error('[Phase3-同级直推] 奖金发放失败:', err.message);
    }
}

module.exports = {
    COMMISSION_CONFIG,
    calculateCommission,
    checkRoleUpgrade,
    handleSameLevelReferral
};
