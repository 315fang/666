// backend/services/CommissionAssistService.js
/**
 * 协助奖励服务（从 CommissionService.js 提取）
 *
 * 职责：代理商上级"协助奖励"的配置加载与分配
 *   - 场景：B路径代理商发货后，其上级代理商（role_level >= 3）可获得协助奖
 *   - 奖励金额按阶梯配置（累计发货单数越多，每单奖励越大）
 *   - 原逻辑在 CommissionService._loadAssistBonusConfig / _allocateAgentAssistBonus
 *
 * 调用方：CommissionService.calculateGapAndFulfillmentCommissions()
 */

'use strict';

const { CommissionLog, User, AppConfig } = require('../models');
const { Op } = require('sequelize');
const { error: logError } = require('../utils/logger');
const constants = require('../config/constants');

// 默认协助奖励阶梯（与 CommissionService 原始默认值保持一致）
const DEFAULT_ASSIST_CONFIG = {
    enabled: true,
    tiers: [
        { max_orders: 30,  bonus: 40 },
        { max_orders: 50,  bonus: 50 },
        { max_orders: 100, bonus: 60 }
    ]
};

class CommissionAssistService {
    /**
     * 加载协助奖励配置（带 AppConfig 覆盖支持）
     * @returns {Promise<{enabled: boolean, tiers: Array<{max_orders:number, bonus:number}>}>}
     */
    static async loadConfig() {
        try {
            const row = await AppConfig.findOne({
                where: { config_key: 'agent_system_assist_bonus', status: 1 }
            });
            if (row?.config_value) {
                const parsed = JSON.parse(row.config_value);
                const tiers = Array.isArray(parsed.tiers) && parsed.tiers.length > 0
                    ? parsed.tiers
                    : DEFAULT_ASSIST_CONFIG.tiers;
                return {
                    enabled: parsed.enabled !== false,
                    tiers
                };
            }
        } catch (e) {
            logError('ASSIST_BONUS', '读取协助奖励配置失败，降级使用默认值', { error: e.message });
        }
        return DEFAULT_ASSIST_CONFIG;
    }

    /**
     * 为发货代理商的上级分配协助奖励
     *
     * @param {Object}  options
     * @param {Object}  options.order               - 订单实例（含 id）
     * @param {Object}  options.shippingAgent        - 发货代理商用户实例
     * @param {Object}  options.buyer               - 购买者用户实例
     * @param {number}  options.distributablePool   - 可分佣利润池金额
     * @param {number}  options.middleCommissionTotal - 已分配的中间佣金总额
     * @param {Object}  options.transaction          - Sequelize 事务
     * @param {string}  options.notifySource         - 通知来源描述
     * @returns {Promise<number>} 实际分配的协助奖励金额（0 表示不分配）
     */
    static async allocate({
        order,
        shippingAgent,
        buyer,
        distributablePool,
        middleCommissionTotal,
        transaction: t,
        notifySource
    }) {
        const { sendNotification } = require('../models/notificationUtil');

        if (!shippingAgent?.parent_id) return 0;

        const cfg = await this.loadConfig();
        if (cfg.enabled === false) return 0;

        const assistAgent = await User.findByPk(shippingAgent.parent_id, { transaction: t });
        if (!assistAgent || Number(assistAgent.role_level || 0) < constants.ROLES.AGENT) return 0;

        // 自购自佣保护：发货代理商的上级 = 买家的归属代理商时，不给协助奖
        const shippedByOwnParent = buyer?.agent_id && Number(buyer.agent_id) === Number(assistAgent.id);
        if (shippedByOwnParent || assistAgent.id === shippingAgent.id) return 0;

        // 按协助奖历史单数确定本次奖励金额
        const assistCount = await CommissionLog.count({
            where: {
                user_id: assistAgent.id,
                type: { [Op.in]: ['agent_assist', 'b2_assist'] }  // 全小写，与 commission.js 修复后保持一致
            },
            transaction: t
        });

        const tiers = cfg.tiers
            .map(tier => ({ max_orders: Number(tier.max_orders || 0), bonus: Number(tier.bonus || 0) }))
            .filter(tier => tier.max_orders > 0 && tier.bonus > 0)
            .sort((a, b) => a.max_orders - b.max_orders);

        if (!tiers.length) return 0;

        const tier = tiers.find(item => assistCount < item.max_orders) || tiers[tiers.length - 1];
        const remainPool = Math.max(0, Number(distributablePool || 0) - Number(middleCommissionTotal || 0));
        const bonus = Math.round(Math.min(Number(tier.bonus || 0), remainPool) * 100) / 100;

        if (bonus <= 0) return 0;

        await CommissionLog.create({
            order_id: order.id,
            user_id: assistAgent.id,
            amount: bonus,
            type: 'agent_assist',
            status: 'frozen',
            available_at: null,
            refund_deadline: null,
            remark: `上级代理协助奖（协助下级代理#${shippingAgent.id}发货，累计第${assistCount + 1}单，${notifySource}）`
        }, { transaction: t });

        await sendNotification(
            assistAgent.id,
            '协助奖到账提醒',
            `您下级代理产生了一笔${notifySource}订单，您获得协助奖 ¥${bonus.toFixed(2)}（需售后期结束+审批后结算）。`,
            'commission',
            order.id
        ).catch(() => {});

        return bonus;
    }
}

module.exports = CommissionAssistService;
