/**
 * 订单与佣金后台定时任务服务
 * 剥离自原 orderController.js
 */

const { Order, Product, SKU, User, CommissionLog, Refund, sequelize } = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const { checkRoleUpgrade } = require('../utils/commission');
const { Op } = require('sequelize');
const constants = require('../config/constants');
const { logCommission, error: logError } = require('../utils/logger');

class OrderJobService {

    /**
     * 结算已审批通过的佣金（定时任务调用）
     * 只结算 approved（审批通过）状态的佣金
     */
    static async settleCommissions() {
        try {
            const now = new Date();
            const approvedLogs = await CommissionLog.findAll({
                where: {
                    status: 'approved',
                    available_at: {
                        [Op.ne]: null,
                        [Op.lte]: now
                    }
                }
            });

            let settledCount = 0;
            for (const log of approvedLogs) {
                const t = await sequelize.transaction();
                try {
                    const freshLog = await CommissionLog.findByPk(log.id, { transaction: t, lock: t.LOCK.UPDATE });
                    if (!freshLog || freshLog.status !== 'approved') {
                        await t.rollback();
                        continue;
                    }

                    freshLog.status = 'settled';
                    freshLog.settled_at = new Date();
                    await freshLog.save({ transaction: t });

                    // 欠款优先抵扣
                    const commissionAmount = parseFloat(freshLog.amount);
                    const commUser = await User.findByPk(freshLog.user_id, { transaction: t, lock: t.LOCK.UPDATE });
                    if (commUser) {
                        const currentDebt = parseFloat(commUser.debt_amount) || 0;
                        if (currentDebt > 0) {
                            if (currentDebt >= commissionAmount) {
                                await commUser.decrement('debt_amount', { by: commissionAmount, transaction: t });
                                freshLog.remark = (freshLog.remark || '') + ` [全额抵扣欠款¥${commissionAmount.toFixed(2)}]`;
                                await freshLog.save({ transaction: t });
                            } else {
                                const remaining = parseFloat((commissionAmount - currentDebt).toFixed(2));
                                await commUser.update({ debt_amount: 0 }, { transaction: t });
                                await commUser.increment('balance', { by: remaining, transaction: t });
                                freshLog.remark = (freshLog.remark || '') + ` [抵扣欠款¥${currentDebt.toFixed(2)}, 入账¥${remaining}]`;
                                await freshLog.save({ transaction: t });
                            }
                        } else {
                            await commUser.increment('balance', { by: commissionAmount, transaction: t });
                        }

                        // 结算时通知用户
                        await sendNotification(
                            commUser.id,
                            '佣金到账通知',
                            `您有一笔佣金 ¥${commissionAmount.toFixed(2)} 已结算到账，可前往钱包查看。`,
                            'commission',
                            log.order_id
                        );
                    }
                    await t.commit();
                    settledCount++;
                } catch (err) {
                    await t.rollback();
                    console.error(`佣金结算失败(ID:${log.id}):`, err);
                }
            }

            if (settledCount > 0) {
                logCommission('佣金结算完成', {
                    settledCount,
                    totalAmount: approvedLogs.reduce((sum, log) => sum + parseFloat(log.amount), 0)
                });
                console.log(`[定时任务] 佣金结算完成：${settledCount} 条记录`);
            }
            return settledCount;
        } catch (error) {
            logError('COMMISSION', '佣金结算查询失败', {
                error: error.message,
                stack: error.stack
            });
            console.error('佣金结算查询失败:', error);
            return 0;
        }
    }

    /**
     * 售后期结束后处理佣金和升级（定时任务调用）
     */
    static async processRefundDeadlineExpired() {
        try {
            const now = new Date();

            // 查找售后期已结束的冻结佣金
            const expiredFrozenLogs = await CommissionLog.findAll({
                where: {
                    status: 'frozen',
                    refund_deadline: {
                        [Op.ne]: null,
                        [Op.lte]: now
                    }
                }
            });

            let processedCount = 0;
            const processedOrderIds = new Set(); // 记录已处理的订单ID

            for (const log of expiredFrozenLogs) {
                const t = await sequelize.transaction();
                try {
                    const freshLog = await CommissionLog.findByPk(log.id, { transaction: t, lock: t.LOCK.UPDATE });
                    if (!freshLog || freshLog.status !== 'frozen') {
                        await t.rollback();
                        continue;
                    }

                    // 检查该订单是否有进行中的退款申请
                    const pendingRefund = await Refund.findOne({
                        where: {
                            order_id: freshLog.order_id,
                            status: { [Op.in]: ['pending', 'approved', 'processing'] }
                        },
                        transaction: t
                    });

                    if (pendingRefund) {
                        // 有进行中的退款，暂不处理，等退款完成后再决定
                        await t.rollback();
                        continue;
                    }

                    // 无退款申请，转为待审批
                    freshLog.status = 'pending_approval';
                    freshLog.remark = (freshLog.remark || '') + ' [售后期结束，待管理员审批]';
                    await freshLog.save({ transaction: t });

                    // 记录订单ID，稍后统一处理升级
                    processedOrderIds.add(freshLog.order_id);

                    await t.commit();
                    processedCount++;
                } catch (err) {
                    await t.rollback();
                    console.error(`处理售后期结束失败(佣金ID:${log.id}):`, err);
                }
            }

            // 处理订单完成后的有效订单统计和升级检查
            for (const orderId of processedOrderIds) {
                await OrderJobService.processOrderCompletion(orderId);
            }

            if (processedCount > 0) {
                console.log(`[定时任务] 售后期结束处理完成：${processedCount} 条佣金转为待审批`);
            }
            return processedCount;
        } catch (error) {
            console.error('处理售后期结束查询失败:', error);
            return 0;
        }
    }

    /**
     * 处理单个订单完成后的逻辑（升级检查）
     */
    static async processOrderCompletion(orderId) {
        const t = await sequelize.transaction();
        try {
            const order = await Order.findByPk(orderId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!order || order.status !== 'completed') {
                await t.rollback();
                return;
            }

            // ★ 幂等保护：避免同一订单被重复计入有效订单统计
            // TODO: 建议在 Order 表添加 completion_processed TINYINT(1) DEFAULT 0 字段
            //       用数据库字段做幂等标记，比用 remark 字符串可靠（remark 管理员可编辑）
            //       迁移 SQL: ALTER TABLE Orders ADD completion_processed TINYINT(1) DEFAULT 0;
            //       启用后将下面 remark 检查改为: if (order.completion_processed) {
            if (order.remark && order.remark.includes('[已计入有效订单]')) {
                await t.rollback();
                return;
            }

            const buyer = await User.findByPk(order.buyer_id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!buyer) {
                await t.rollback();
                return;
            }

            const orderAmount = parseFloat(order.actual_price || order.total_amount || 0);

            // 售后期结束，此订单确认为"有效订单"，计入升级统计
            await buyer.increment('order_count', { transaction: t });
            order.remark = (order.remark || '') + ' [已计入有效订单]';
            await order.save({ transaction: t });

            // 刷新 buyer 数据
            await buyer.reload({ transaction: t });

            // 检查买家是否应该升级
            const buyerNewRole = checkRoleUpgrade(buyer);
            if (buyerNewRole && buyerNewRole > buyer.role_level) {
                const roleNames = { 2: '团长', 3: '代理商' };
                const oldRole = buyer.role_level;
                buyer.role_level = buyerNewRole;
                await buyer.save({ transaction: t });

                // 如果升级为代理商，处理独立逻辑
                if (buyerNewRole >= 3) {
                    await OrderJobService.handleAgentPromotion(buyer, t);
                }

                await sendNotification(
                    buyer.id,
                    '身份升级',
                    `恭喜！您的有效订单已达标，系统已将您升级为${roleNames[buyerNewRole] || '更高等级'}，享受更多权益！`,
                    'upgrade'
                );
            }

            // 检查上级是否应该升级
            if (buyer.parent_id) {
                const parent = await User.findByPk(buyer.parent_id, { transaction: t, lock: t.LOCK.UPDATE });
                if (parent) {
                    await parent.increment('order_count', { transaction: t });
                    if (!Number.isNaN(orderAmount) && orderAmount > 0) {
                        await parent.increment('total_sales', { by: orderAmount, transaction: t });
                    }
                    await parent.reload({ transaction: t });

                    const parentNewRole = checkRoleUpgrade(parent);
                    if (parentNewRole && parentNewRole > parent.role_level) {
                        const roleNames = { 2: '团长', 3: '代理商' };
                        parent.role_level = parentNewRole;
                        await parent.save({ transaction: t });

                        if (parentNewRole >= 3) {
                            await OrderJobService.handleAgentPromotion(parent, t);
                        }

                        await sendNotification(
                            parent.id,
                            '身份升级',
                            `恭喜！您的团队业绩达标，系统已将您升级为${roleNames[parentNewRole] || '更高等级'}！`,
                            'upgrade'
                        );
                    }
                }
            }

            await t.commit();
        } catch (error) {
            await t.rollback();
            console.error(`处理订单完成失败(订单ID:${orderId}):`, error);
        }
    }

    /**
     * 处理用户升级为代理商后的独立逻辑
     */
    static async handleAgentPromotion(newAgent, transaction) {
        newAgent.agent_id = newAgent.id;
        await newAgent.save({ transaction });
        console.log(`[升级处理] 用户 ${newAgent.id} 升级为代理商，已独立（下级归属不变）`);
    }

    /**
     * 代理商订单超时自动转平台发货（定时任务调用）
     */
    static async autoTransferAgentOrders() {
        try {
            const timeoutHours = constants.ORDER.AGENT_TIMEOUT_HOURS;
            const expireTime = new Date();
            expireTime.setHours(expireTime.getHours() - timeoutHours);

            // 查找超时的代理商待发货订单
            const expiredOrders = await Order.findAll({
                where: {
                    fulfillment_type: 'Agent_Pending',
                    status: 'paid',
                    paid_at: { [Op.lt]: expireTime }
                }
            });

            if (expiredOrders.length === 0) return 0;

            let transferredCount = 0;
            for (const order of expiredOrders) {
                const t = await sequelize.transaction();
                try {
                    const freshOrder = await Order.findByPk(order.id, { transaction: t, lock: t.LOCK.UPDATE });
                    if (!freshOrder || freshOrder.fulfillment_type !== 'Agent_Pending' || freshOrder.status !== 'paid') {
                        await t.commit();
                        continue;
                    }

                    freshOrder.fulfillment_type = 'Company';
                    freshOrder.remark = (freshOrder.remark || '') + ` [系统自动转平台发货，原代理商超时${timeoutHours}小时未处理]`;
                    await freshOrder.save({ transaction: t });

                    await sendNotification(
                        freshOrder.buyer_id,
                        '订单发货方式变更',
                        `您的订单将由平台直接发货，请耐心等待。`,
                        'order',
                        freshOrder.id
                    );

                    if (freshOrder.agent_id) {
                        await sendNotification(
                            freshOrder.agent_id,
                            '订单已自动转移',
                            `订单 ${freshOrder.order_no} 因超时未处理已自动转为平台发货。`,
                            'order',
                            freshOrder.id
                        );
                    }

                    await t.commit();
                    transferredCount++;
                } catch (err) {
                    await t.rollback();
                    console.error(`转移订单失败(${order.id}):`, err);
                }
            }

            if (transferredCount > 0) {
                console.log(`[定时任务] 代理商订单超时转平台: ${transferredCount} 单`);
            }
            return transferredCount;
        } catch (error) {
            console.error('代理商订单超时检查失败:', error);
            return 0;
        }
    }

    /**
     * 自动取消超时未支付订单（定时任务调用）
     */
    static async autoCancelExpiredOrders() {
        try {
            const expireMinutes = constants.ORDER.AUTO_CANCEL_MINUTES;
            const expireTime = new Date();
            expireTime.setMinutes(expireTime.getMinutes() - expireMinutes);

            const expiredOrders = await Order.findAll({
                where: {
                    status: 'pending',
                    created_at: { [Op.lt]: expireTime },
                    parent_order_id: null
                }
            });

            let cancelledCount = 0;
            for (const order of expiredOrders) {
                const t = await sequelize.transaction();
                try {
                    const freshOrder = await Order.findByPk(order.id, { transaction: t, lock: t.LOCK.UPDATE });
                    if (!freshOrder || freshOrder.status !== 'pending') {
                        await t.rollback();
                        continue;
                    }

                    const childOrders = await Order.findAll({
                        where: { parent_order_id: freshOrder.id, status: 'pending' },
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    });
                    const totalRestoreQty = freshOrder.quantity + childOrders.reduce((sum, c) => sum + c.quantity, 0);

                    const product = await Product.findByPk(freshOrder.product_id, { transaction: t });
                    if (product) {
                        await product.increment('stock', { by: totalRestoreQty, transaction: t });
                    }
                    if (freshOrder.sku_id) {
                        const sku = await SKU.findByPk(freshOrder.sku_id, { transaction: t });
                        if (sku) {
                            await sku.increment('stock', { by: totalRestoreQty, transaction: t });
                        }
                    }

                    freshOrder.status = 'cancelled';
                    freshOrder.remark = (freshOrder.remark || '') + ` [系统自动取消：超过${expireMinutes}分钟未支付]`;
                    await freshOrder.save({ transaction: t });

                    for (const child of childOrders) {
                        child.status = 'cancelled';
                        child.remark = (child.remark || '') + ` [系统自动取消：主订单超时]`;
                        await child.save({ transaction: t });
                    }

                    await t.commit();
                    cancelledCount++;
                } catch (err) {
                    await t.rollback();
                    console.error(`自动取消订单失败(ID:${order.id}):`, err);
                }
            }

            if (cancelledCount > 0) {
                console.log(`[定时任务] 自动取消过期订单: ${cancelledCount} 笔`);
            }
            return cancelledCount;
        } catch (error) {
            console.error('自动取消过期订单查询失败:', error);
            return 0;
        }
    }

    /**
     * 自动确认收货（定时任务调用）
     */
    static async autoConfirmOrders() {
        try {
            const confirmDays = constants.ORDER.AUTO_CONFIRM_DAYS;
            const expireTime = new Date();
            expireTime.setDate(expireTime.getDate() - confirmDays);

            const expiredOrders = await Order.findAll({
                where: {
                    status: 'shipped',
                    shipped_at: { [Op.lt]: expireTime }
                }
            });

            let confirmedCount = 0;
            for (const order of expiredOrders) {
                const t = await sequelize.transaction();
                try {
                    const freshOrder = await Order.findByPk(order.id, { transaction: t, lock: t.LOCK.UPDATE });
                    if (!freshOrder || freshOrder.status !== 'shipped') {
                        await t.rollback();
                        continue;
                    }

                    freshOrder.status = 'completed';
                    freshOrder.completed_at = new Date();
                    const refundDeadline = new Date();
                    refundDeadline.setDate(refundDeadline.getDate() + constants.COMMISSION.FREEZE_DAYS);
                    freshOrder.settlement_at = refundDeadline;
                    freshOrder.remark = (freshOrder.remark || '') + ` [系统自动确认收货：发货${confirmDays}天后]`;
                    await freshOrder.save({ transaction: t });

                    await CommissionLog.update(
                        { refund_deadline: refundDeadline },
                        { where: { order_id: freshOrder.id, status: 'frozen' }, transaction: t }
                    );

                    await t.commit();
                    confirmedCount++;
                } catch (err) {
                    await t.rollback();
                    console.error(`自动确认收货失败(ID:${order.id}):`, err);
                }
            }

            if (confirmedCount > 0) {
                console.log(`[定时任务] 自动确认收货: ${confirmedCount} 笔`);
            }
            return confirmedCount;
        } catch (error) {
            console.error('自动确认收货查询失败:', error);
            return 0;
        }
    }
}

module.exports = OrderJobService;
