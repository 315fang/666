/**
 * 佣金计算工具
 * 基于 Project Master Specification 第3.1节的佣金分配算法
 */
const { ROLES, UPGRADE_RULES } = require('../config/constants');

/**
 * 佣金配置（仅用于同级直推奖金和升级规则，旧版固定金额分配逻辑已废弃）
 */
const COMMISSION_CONFIG = {
    // 会员直推佣金
    MEMBER_DIRECT: 60,
    // 团长直推佣金
    LEADER_DIRECT: 90,
    // 团长团队佣金（从下级会员的推荐中获得）
    LEADER_TEAM: 30
};
/**
 * 检查用户是否应该升级角色
 * @param {Object} user - 用户信息
 * @returns {number|null} 新角色等级，null表示不需要升级
 */
function checkRoleUpgrade(user, refereesByLevel) {
    // C1 → C2：直推N个C1级别下线 + 销售满N元（C1推2个C1自动升C2）
    if (user.role_level === ROLES.MEMBER) {
        const rule = UPGRADE_RULES.MEMBER_TO_LEADER;
        const qualifiedReferees = refereesByLevel
            ? (refereesByLevel[rule.referee_min_level] || 0)
            : user.referee_count;
        const salesOk = !rule.min_sales_amount || (parseFloat(user.total_sales || 0) >= rule.min_sales_amount);
        if (qualifiedReferees >= rule.referee_count && salesOk) {
            return ROLES.LEADER;
        }
    }

    // C2 → B1：推荐N个C2级别下线 或 充值满N元
    if (user.role_level === ROLES.LEADER) {
        const rule = UPGRADE_RULES.LEADER_TO_AGENT;
        const qualifiedReferees = refereesByLevel
            ? (refereesByLevel[rule.referee_min_level] || 0)
            : 0;
        if (qualifiedReferees >= rule.referee_count_at_level || parseFloat(user.total_sales || 0) >= rule.recharge_amount) {
            return ROLES.AGENT;
        }
    }

    // B1 → B2：推荐N个B1级别下线 或 充值满N元
    if (user.role_level === ROLES.AGENT && ROLES.PARTNER) {
        const rule = UPGRADE_RULES.AGENT_TO_PARTNER;
        if (rule) {
            const qualifiedReferees = refereesByLevel
                ? (refereesByLevel[rule.referee_min_level] || 0)
                : 0;
            if (qualifiedReferees >= rule.referee_count_at_level || parseFloat(user.total_sales || 0) >= rule.recharge_amount) {
                return ROLES.PARTNER;
            }
        }
    }

    // B2 → B3：充值满N元
    if (user.role_level === (ROLES.PARTNER || 4) && ROLES.REGIONAL) {
        const rule = UPGRADE_RULES.PARTNER_TO_REGIONAL;
        if (rule && parseFloat(user.total_sales || 0) >= rule.recharge_amount) {
            return ROLES.REGIONAL;
        }
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
    const DEFAULT_PEER = {
        enabled: true,
        level_1: 20,
        level_2: 50,
        level_3: 100,
        level_4: 2000,
        level_5: 5000
    };
    let peerCfg = { ...DEFAULT_PEER };
    try {
        const { AppConfig } = require('../models');
        const row = await AppConfig.findOne({ where: { config_key: 'agent_system_peer_bonus', status: 1 } });
        if (row && row.config_value) {
            peerCfg = { ...DEFAULT_PEER, ...JSON.parse(row.config_value) };
        }
    } catch (_) { /* 使用默认 */ }

    if (peerCfg.enabled === false) return;

    const bonusKey = `level_${newPeer.role_level}`;
    const bonus = Number(peerCfg[bonusKey]);
    // 上线必须存在且为同级，才触发奖励（金额固定为「元」，与全局百分比分佣无关）
    if (!Number.isFinite(bonus) || bonus <= 0 || !upline || upline.role_level !== newPeer.role_level) return;

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
            type: 'peer_direct',  // 固定值，与 CommissionService 写入风格对齐（全小写）
            status: 'settled',
            settled_at: new Date(),
            remark: `同级直推奖金：下线用户(ID:${newPeer.id})升级至${newPeer.role_level}级`
        }, { transaction: t });

        if (ownTx) await t.commit();
        console.log(`[Phase3-同级直推] 用户${upline.id} 得 ¥${bonus}，触发人: 用户${newPeer.id}`);

        // 异步发放产品奖励（B1/B2/B3 平级奖含产品）
        if (newPeer.role_level >= 3) {
            const ProductRewardService = require('../services/ProductRewardService');
            ProductRewardService.issueProductReward(upline.id, newPeer.role_level, newPeer.id).catch(() => {});
        }
    } catch (err) {
        console.error('[Phase3-同级直推] 奖金发放失败:', err.message);
    }
}

/**
 * B2 协助 B1 开单奖励（阶梯式）
 * 商业计划书4.0：B2 协助旗下 B1 开单，每单奖励40-60元（按开单数阶梯递增）
 *
 * @param {object} b2User  B2 用户 { id, role_level }
 * @param {object} b1User  B1 用户 { id, role_level }
 * @param {number} orderId 触发的订单ID
 * @param {object} [t]     外部事务
 */
async function handleB2AssistBonus(b2User, b1User, orderId, t = null) {
    if (!b2User || b2User.role_level < (ROLES.PARTNER || 4)) return;
    if (!b1User || b1User.role_level !== ROLES.AGENT) return;

    // 阶梯从后台配置读取（agent_system_assist_bonus），默认 1-30/31-50/51-100
    const DEFAULT_TIERS = [
        { max_orders: 30, bonus: 40 },
        { max_orders: 50, bonus: 50 },
        { max_orders: 100, bonus: 60 }
    ];

    try {
        const { User, CommissionLog, AppConfig, sequelize } = require('../models');
        const { Op } = require('sequelize');
        const ownTx = !t;
        if (ownTx) t = await sequelize.transaction();

        let tiers = DEFAULT_TIERS;
        try {
            const cfg = await AppConfig.findOne({ where: { config_key: 'agent_system_assist_bonus', status: 1 } });
            if (cfg && cfg.config_value) {
                const parsed = JSON.parse(cfg.config_value);
                if (parsed.enabled === false) { if (ownTx) await t.rollback(); return; }
                if (Array.isArray(parsed.tiers) && parsed.tiers.length > 0) tiers = parsed.tiers;
            }
        } catch (_) {}

        const assistCount = await CommissionLog.count({
            where: { user_id: b2User.id, type: 'b2_assist' },
            transaction: t
        });

        const tier = tiers.find(tier => assistCount < tier.max_orders) || tiers[tiers.length - 1];
        const bonus = tier.bonus;

        await User.increment('balance', { by: bonus, where: { id: b2User.id }, transaction: t });
        await CommissionLog.create({
            user_id: b2User.id,
            order_id: orderId,
            amount: bonus,
            type: 'b2_assist',   // 固定值，与 CommissionService 写入风格对齐（全小写）
            status: 'settled',
            settled_at: new Date(),
            remark: `B2协助B1(ID:${b1User.id})开单奖励 ¥${bonus}（累计第${assistCount + 1}单）`
        }, { transaction: t });

        if (ownTx) await t.commit();
        console.log(`[B2协助奖] 用户${b2User.id} 得 ¥${bonus}，协助B1用户${b1User.id}，订单${orderId}`);
    } catch (err) {
        console.error('[B2协助奖] 发放失败:', err.message);
    }
}

module.exports = {
    COMMISSION_CONFIG,
    checkRoleUpgrade,
    handleSameLevelReferral,
    handleB2AssistBonus
};
