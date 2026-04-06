/**
 * 产品奖励服务 — 商业计划书4.0
 *
 * 用于平级奖中的产品奖励部分：
 *   - B1推B1 平级奖420元 = 现金100元 + 2套产品奖励(价值320元)
 *   - B2推B2 平级奖4400元 = 现金2000元 + 15套产品奖励
 *
 * 产品奖励以"赠品订单"形式生成，标记为免费订单，走正常发货流程。
 */
const { Op } = require('sequelize');
const { warn: logWarn, info: logInfo, error: logError } = require('../utils/logger');
const { secureRandomHex } = require('../utils/secureRandom');

const PRODUCT_REWARD_CONFIG = {
    3: { sets: 2, remark: 'B1平级奖产品奖励（2套）' },
    4: { sets: 15, remark: 'B2平级奖产品奖励（15套）' },
    5: { sets: 20, remark: 'B3平级奖产品奖励（预留）' }
};

class ProductRewardService {

    /**
     * 发放产品奖励（创建赠品订单）
     *
     * @param {number} userId 获奖用户ID
     * @param {number} roleLevel 触发奖励的角色等级
     * @param {number} triggeredByUserId 被推荐人ID（触发者）
     * @returns {object|null} 赠品订单信息
     */
    static async issueProductReward(userId, roleLevel, triggeredByUserId) {
        const config = PRODUCT_REWARD_CONFIG[roleLevel];
        if (!config || config.sets <= 0) return null;

        try {
            const { User, Product, Order, Notification, sequelize } = require('../models');
            const t = await sequelize.transaction();

            try {
                const user = await User.findByPk(userId, { transaction: t });
                if (!user) {
                    await t.rollback();
                    return null;
                }

                const rewardProduct = await Product.findOne({
                    where: { status: 1 },
                    order: [['retail_price', 'DESC']],
                    transaction: t
                });

                if (!rewardProduct) {
                    await t.rollback();
                    logWarn('PRODUCT_REWARD', '无可用商品，跳过产品奖励');
                    return null;
                }

                const now = new Date();
                const date = now.toISOString().slice(0, 10).replace(/-/g, '');
                const rand = secureRandomHex(3); // 6位随机十六进制 ≈ 5位十进制随机性
                const orderNo = `RW${date}${rand}`;

                const order = await Order.create({
                    order_no: orderNo,
                    buyer_id: userId,
                    product_id: rewardProduct.id,
                    quantity: config.sets,
                    total_amount: 0,
                    actual_price: 0,
                    status: 'paid',
                    paid_at: now,
                    fulfillment_type: 'Company',
                    remark: `${config.remark} | 触发人:${triggeredByUserId}`
                }, { transaction: t });

                await Notification.create({
                    user_id: userId,
                    title: '恭喜获得产品奖励',
                    content: `您获得了${config.sets}套产品奖励，订单号 ${orderNo}，请等待发货。`,
                    type: 'reward',
                    related_id: String(order.id)
                }, { transaction: t });

                await t.commit();
                logInfo('PRODUCT_REWARD', `用户${userId} 获${config.sets}套产品，订单${orderNo}`);
                return { orderId: order.id, orderNo, sets: config.sets };
            } catch (err) {
                if (!t.finished) await t.rollback();
                throw err;
            }
        } catch (err) {
            logError('PRODUCT_REWARD', '发放失败', { error: err.message });
            return null;
        }
    }
}

module.exports = ProductRewardService;
