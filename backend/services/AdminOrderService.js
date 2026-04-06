const { Order, User, Product, Address, SKU, CommissionLog, AppConfig, sequelize } = require('../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../models/notificationUtil');
const { refundOrder } = require('../utils/wechat');
const { loadMiniProgramConfig } = require('../utils/miniprogramConfig');
const { scheduleUploadShippingInfoAfterShip } = require('./WechatShippingInfoService');
const CommissionService = require('./CommissionService');
const AgentWalletService = require('./AgentWalletService');
const { error: logError, info: logInfo } = require('../utils/logger');

class AdminOrderService {
    /**
     * 发货逻辑（代理商发货扣货款并计算利润，平台发货直接改状态）
     */
    async shipOrder(id, shipData) {
        const {
            tracking_company,
            tracking_number,
            tracking_no: trackingNoAlt,
            logistics_company,
            fulfillment_type,
            type
        } = shipData;
        const t = await sequelize.transaction();
        try {
            const publicConfig = await loadMiniProgramConfig(AppConfig);
            const logisticsConfig = publicConfig.logistics_config || {};
            const order = await Order.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!order) {
                await t.rollback();
                throw new Error('订单不存在');
            }

            // 允许 paid / agent_confirmed / shipping_requested 状态发货
            const allowedStatuses = ['paid', 'agent_confirmed', 'shipping_requested'];
            if (!allowedStatuses.includes(order.status)) {
                await t.rollback();
                throw new Error(`当前订单状态(${order.status})不可发货`);
            }

            const requestedType = String(fulfillment_type || type || '').trim().toLowerCase();
            let normalizedFulfillmentType = requestedType;
            if (requestedType === 'agent_pending') {
                normalizedFulfillmentType = 'agent';
            } else if (requestedType === 'company') {
                normalizedFulfillmentType = 'company';
            } else if (requestedType === 'agent') {
                normalizedFulfillmentType = 'agent';
            }

            if (!normalizedFulfillmentType) {
                const currentType = String(order.fulfillment_type || '').trim().toLowerCase();
                normalizedFulfillmentType = (
                    currentType === 'agent' ||
                    currentType === 'agent_pending' ||
                    ['agent_confirmed', 'shipping_requested'].includes(order.status)
                ) ? 'agent' : 'company';
            }

            // 防撞单风险：如果代理商已进入发货流程，拦截平台发货
            if (normalizedFulfillmentType !== 'agent' && order.agent_id &&
                ['agent_confirmed', 'shipping_requested'].includes(order.status)) {
                await t.rollback();
                throw new Error(`该订单代理商(ID:${order.agent_id})已在处理中（状态: ${order.status}），如需平台发货请先将状态回退为 paid`);
            }

            // 代理商发货处理
            if (normalizedFulfillmentType === 'agent' && order.agent_id) {
                const agent = await User.findByPk(order.agent_id, { transaction: t, lock: t.LOCK.UPDATE });
                if (!agent || agent.role_level < 3) {
                    await t.rollback();
                    throw new Error('代理商信息异常');
                }

                // 修复平台库存与代理履约并行时的双重占用（保留原回补逻辑）
                const platformDeducted = parseInt(order.platform_stock_deducted) !== 0;
                if (platformDeducted) {
                    const orderProduct = await Product.findByPk(order.product_id, { transaction: t });
                    if (orderProduct) {
                        await orderProduct.increment('stock', { by: order.quantity, transaction: t });
                    }
                    if (order.sku_id) {
                        const orderSku = await SKU.findByPk(order.sku_id, { transaction: t });
                        if (orderSku) {
                            await orderSku.increment('stock', { by: order.quantity, transaction: t });
                        }
                    }
                }

                order.fulfillment_type = 'Agent';
                order.fulfillment_partner_id = order.agent_id;

                // 统一佣金计算：级差 + 代理商发货利润
                const orderProduct2 = await Product.findByPk(order.product_id, { transaction: t });
                const buyer = await User.findByPk(order.buyer_id, { transaction: t });
                if (orderProduct2 && buyer) {
                    await CommissionService.calculateGapAndFulfillmentCommissions({
                        order,
                        buyer,
                        product: orderProduct2,
                        agentId: order.agent_id,
                        transaction: t,
                        notifySource: '后台代发(代理商)'
                    });
                }
            } else {
                order.fulfillment_type = 'Company';
            }

            const isPickup = order.delivery_type === 'pickup';
            const finalTrackingNo = tracking_number || trackingNoAlt || '';
            const finalCompany = tracking_company || logistics_company || '';

            if (!isPickup && logisticsConfig.shipping_tracking_no_required !== false && !finalTrackingNo) {
                await t.rollback();
                throw new Error('当前发货模式要求填写物流单号');
            }
            if (!isPickup && logisticsConfig.shipping_company_name_required && !finalCompany) {
                await t.rollback();
                throw new Error('当前发货模式要求填写承运方名称');
            }

            order.status = 'shipped';
            order.shipped_at = new Date();
            order.tracking_no = finalTrackingNo;
            order.logistics_company = finalCompany || null;
            if (finalCompany) {
                order.remark = (order.remark ? order.remark + ' | ' : '') + `物流: ${finalCompany} ${finalTrackingNo}`;
            }
            await order.save({ transaction: t });

            await t.commit();
            scheduleUploadShippingInfoAfterShip(order.id);
            return { tracking_no: finalTrackingNo, logistics_company: finalCompany };
        } catch (error) {
            await t.rollback();
            throw error;
        }
    }

    /**
     * 转移订单归属代理商
     */
    async transferOrderAgent(id, newAgentId, reason, adminName) {
        const t = await sequelize.transaction();
        try {
            const order = await Order.findByPk(id, { transaction: t });
            if (!order) {
                await t.rollback();
                throw new Error('订单不存在');
            }

            if (!['paid', 'agent_confirmed', 'shipping_requested'].includes(order.status)) {
                await t.rollback();
                throw new Error('仅待发货订单可以转移');
            }

            const oldAgentId = order.agent_id;

            // 转为平台发货
            if (!newAgentId || newAgentId === 0) {
                await order.update({
                    agent_id: null,
                    fulfillment_type: 'Company',
                    status: 'paid',
                    remark: (order.remark || '') + ` [管理员${adminName}转平台发货 原因:${reason || '-'}]`
                }, { transaction: t });

                await t.commit();
                return { old_agent_id: oldAgentId, new_agent_id: null };
            }

            // 转给新代理商
            const newAgent = await User.findByPk(newAgentId, { transaction: t });
            if (!newAgent || newAgent.role_level < 3) {
                await t.rollback();
                throw new Error('目标用户不存在或不是代理商');
            }

            await order.update({
                agent_id: newAgent.id,
                fulfillment_type: 'Agent_Pending',
                status: 'paid',
                remark: (order.remark || '') + ` [管理员${adminName}转代理商${newAgent.nickname}(${newAgent.id}) 原因:${reason || '-'}]`
            }, { transaction: t });

            await t.commit();

            await sendNotification(
                newAgent.id,
                '新订单分配',
                `管理员转移给您一笔订单 ${order.order_no}，请及时处理发货。`,
                'order',
                order.id
            );

            return { old_agent_id: oldAgentId, new_agent_id: newAgent.id };
        } catch (error) {
            await t.rollback();
            throw error;
        }
    }

    /**
     * 强制取消订单（退款+恢复库存）
     */
    async forceCancelOrder(id, reason, adminName) {
        const t = await sequelize.transaction();
        try {
            const order = await Order.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!order) {
                await t.rollback();
                throw new Error('订单不存在');
            }

            const paidStatuses = ['paid', 'agent_confirmed', 'shipping_requested', 'shipped'];
            const terminalStatuses = ['completed', 'cancelled', 'refunded'];
            const rootOrder = order.parent_order_id
                ? await Order.findByPk(order.parent_order_id, { transaction: t, lock: t.LOCK.UPDATE })
                : order;

            if (!rootOrder) {
                await t.rollback();
                throw new Error('主订单不存在');
            }

            const childOrders = await Order.findAll({
                where: { parent_order_id: rootOrder.id },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            const orderGroup = [rootOrder, ...childOrders.filter(item => item.id !== rootOrder.id)];
            if (orderGroup.some(item => terminalStatuses.includes(item.status))) {
                await t.rollback();
                throw new Error('该订单组存在已完成/已取消/已退款订单，请人工处理');
            }

            const orderIds = orderGroup.map(item => item.id);
            const totalRestoreQty = orderGroup.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

            if (totalRestoreQty > 0) {
                const product = await Product.findByPk(rootOrder.product_id, { transaction: t });
                if (product) {
                    await product.increment('stock', { by: totalRestoreQty, transaction: t });
                }
                if (rootOrder.sku_id) {
                    const { SKU: SkuModel } = require('../models');
                    const sku = await SkuModel.findByPk(rootOrder.sku_id, { transaction: t });
                    if (sku) {
                        await sku.increment('stock', { by: totalRestoreQty, transaction: t });
                    }
                }
            }

            const refundTargets = orderGroup
                .filter(item => paidStatuses.includes(item.status) && item.paid_at && parseFloat(item.actual_price) > 0)
                .map(item => ({
                    id: item.id,
                    order_no: item.order_no,
                    buyer_id: item.buyer_id,
                    payment_method: item.payment_method,
                    actual_price: parseFloat(item.actual_price || 0),
                    remark: item.remark || '',
                    originalStatus: item.status
                }));
            const walletRefundTargets = refundTargets.filter(item => item.payment_method === 'wallet');
            const wechatRefundTargets = refundTargets.filter(item => item.payment_method !== 'wallet');
            const notificationTargets = orderGroup.map(item => ({
                id: item.id,
                order_no: item.order_no,
                buyer_id: item.buyer_id,
                originalStatus: item.status
            }));

            await CommissionLog.update(
                { status: 'cancelled', remark: `[管理员${adminName}取消订单组] ${reason}` },
                { where: { order_id: { [Op.in]: orderIds }, status: { [Op.in]: ['frozen', 'pending_approval'] } }, transaction: t }
            );

            for (const item of orderGroup) {
                await item.update({
                    status: 'cancelled',
                    remark: (item.remark || '') + ` [管理员${adminName}强制取消 原因:${reason}]`
                }, { transaction: t });
            }

            for (const refundTarget of walletRefundTargets) {
                const refundYuan = refundTarget.actual_price;
                await AgentWalletService.recharge({
                    userId: refundTarget.buyer_id,
                    amount: refundYuan,
                    refType: 'admin_cancel_refund',
                    refId: refundTarget.order_no,
                    remark: `管理员取消退款 ${refundTarget.order_no} ¥${refundYuan}`,
                    transaction: t
                });
            }

            await t.commit();

            for (const refundTarget of wechatRefundTargets) {
                const refundNo = `REFUND-ADMIN-${refundTarget.id}-${Date.now()}`;
                try {
                    await refundOrder({
                        orderNo: refundTarget.order_no,
                        refundNo,
                        refundFee: Math.round(refundTarget.actual_price * 100),
                        totalFee: Math.round(refundTarget.actual_price * 100),
                        reason: `管理员取消：${reason || '无'}`
                    });
                    logInfo('ADMIN_ORDER', `[退款] 管理员取消订单 ${refundTarget.order_no} 微信退款申请成功`, { amount: refundTarget.actual_price });
                } catch (refundErr) {
                    logError('ADMIN_ORDER', `[退款] 管理员取消订单 ${refundTarget.order_no} 退款失败（需人工处理）`, { error: refundErr.message });
                    await Order.update(
                        {
                            remark: refundTarget.remark + ` [⚠️退款API失败，需人工退款: ${refundErr.message}]`
                        },
                        { where: { id: refundTarget.id } }
                    );
                }
            }

            try {
                await Promise.all(notificationTargets.map(item => sendNotification(
                    item.buyer_id,
                    '订单取消通知',
                    `您的订单 ${item.order_no} 已被取消${paidStatuses.includes(item.originalStatus) ? '，退款将在1-3个工作日内原路返回。' : '，如有疑问请联系客服。'}`,
                    'order',
                    item.id
                )));
            } catch (notifyErr) {
                logError('ADMIN_ORDER', '订单取消通知发送失败', { error: notifyErr.message });
            }

            return true;
        } catch (error) {
            if (!t.finished) {
                await t.rollback();
            }
            throw error;
        }
    }
}

module.exports = new AdminOrderService();
