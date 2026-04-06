/** OrderCancellationService — 处理待付款订单取消、库存恢复与权益回滚 */
const { Order, Product, SKU, UserCoupon, sequelize } = require('../models');
const { Op } = require('sequelize');
const { error: logError } = require('../utils/logger');
const PointService = require('./PointService');
const LimitedSpotService = require('./LimitedSpotService');
const { shouldRestoreCoupon } = require('../utils/orderGuards');

class OrderCancellationService {

    static async rollbackWithError(transaction, message) {
        if (!transaction.finished) {
            await transaction.rollback();
        }
        throw new Error(message);
    }

    /**
     * 取消待付款订单
     * - 恢复库存（主订单+子订单总量）
     * - 回滚优惠券与积分
     * - 标记砍价/拼团/限时活动状态
     */
    static async cancelOrder(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const { id } = req.params;

            const order = await Order.findOne({
                where: { id, buyer_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!order) {
                await this.rollbackWithError(t, '订单不存在');
            }

            // 允许从子订单入口取消：统一按主订单维度取消整组
            const rootOrder = order.parent_order_id
                ? await Order.findOne({
                    where: { id: order.parent_order_id, buyer_id: userId },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                })
                : order;

            if (!rootOrder) {
                await this.rollbackWithError(t, '主订单不存在');
            }

            if (rootOrder.status !== 'pending') {
                await this.rollbackWithError(t, '仅待付款订单可取消');
            }

            // 查找子订单（拆单场景）
            const childOrders = await Order.findAll({
                where: { parent_order_id: rootOrder.id, status: 'pending' },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            // 库存恢复总量 = 主订单数量 + 所有子订单数量
            const totalRestoreQty = rootOrder.quantity + childOrders.reduce((sum, c) => sum + c.quantity, 0);

            const product = await Product.findByPk(rootOrder.product_id, { transaction: t });
            if (product) {
                await product.increment('stock', { by: totalRestoreQty, transaction: t });
            }
            if (rootOrder.sku_id) {
                const sku = await SKU.findByPk(rootOrder.sku_id, { transaction: t });
                if (sku) {
                    await sku.increment('stock', { by: totalRestoreQty, transaction: t });
                }
            }

            // 取消订单组
            rootOrder.status = 'cancelled';
            await rootOrder.save({ transaction: t });

            for (const child of childOrders) {
                child.status = 'cancelled';
                await child.save({ transaction: t });
            }

            // 回滚优惠券与积分
            const orderGroup = [rootOrder, ...childOrders];
            const couponId = orderGroup.map(o => o.coupon_id).find(Boolean);
            if (couponId) {
                const uc = await UserCoupon.findOne({
                    where: { id: couponId, user_id: userId },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });
                const otherActiveOrderCount = await Order.count({
                    where: {
                        buyer_id: userId,
                        coupon_id: couponId,
                        id: { [Op.notIn]: orderGroup.map(o => o.id) },
                        status: { [Op.notIn]: ['cancelled', 'refunded'] }
                    },
                    transaction: t
                });

                if (uc && uc.status === 'used' && shouldRestoreCoupon({ otherActiveOrderCount })) {
                    uc.status = 'unused';
                    uc.used_at = null;
                    uc.used_order_id = null;
                    await uc.save({ transaction: t });
                }
            }

            const pointsToRestore = orderGroup.reduce((sum, o) => sum + (parseInt(o.points_used, 10) || 0), 0);
            if (pointsToRestore > 0) {
                await PointService.addPoints(
                    userId,
                    pointsToRestore,
                    'refund',
                    `order_cancel_${rootOrder.id}`,
                    '取消订单退回积分',
                    t
                );
            }

            await LimitedSpotService.onOrderPendingCancelled(rootOrder, userId, t);

            await t.commit();
            return { message: '订单已取消' };
        } catch (error) {
            await t.rollback();
            logError('ORDER', '取消订单失败', { error: error.message });
            throw new Error('取消订单失败');
        }
    }
}

module.exports = OrderCancellationService;
