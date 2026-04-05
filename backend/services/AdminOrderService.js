const { Order, User, Product, Address, SKU, CommissionLog, sequelize } = require('../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../models/notificationUtil');
const CommissionService = require('./CommissionService');
const { normalizeCompanyCode, getCompanyDisplayName } = require('./LogisticsService');
const { hasReservedStockMarker, removeReservedStockMarker } = require('../utils/orderStock');

async function restoreReservedAgentStock(order, transaction, reason = '') {
    if (!order || order.status !== 'shipping_requested' || !hasReservedStockMarker(order)) {
        return false;
    }

    const restoreAgentId = order.fulfillment_partner_id || order.agent_id;
    if (!restoreAgentId) {
        return false;
    }

    const agent = await User.findByPk(restoreAgentId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!agent) {
        return false;
    }

    await agent.increment('stock_count', { by: order.quantity, transaction });
    order.remark = removeReservedStockMarker(order.remark);
    if (reason) {
        order.remark = (order.remark ? `${order.remark} | ` : '') + reason;
    }
    return true;
}

class AdminOrderService {
    /**
     * 发货逻辑（代理商发货扣除库存并计算利润，平台发货直接改状态）
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
        const requestedFulfillmentType = String(fulfillment_type || type || '').toLowerCase();
        const t = await sequelize.transaction();
        try {
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

            let actualFulfillmentType = requestedFulfillmentType;
            if (order.status === 'shipping_requested' && order.agent_id) {
                actualFulfillmentType = 'agent';
            } else if (order.fulfillment_type && ['Agent_Pending', 'Agent'].includes(order.fulfillment_type)) {
                actualFulfillmentType = 'agent';
            }

            // 防撞单风险：如果代理商已进入发货流程，拦截平台发货
            if (actualFulfillmentType !== 'agent' && order.agent_id &&
                ['agent_confirmed', 'shipping_requested'].includes(order.status)) {
                await t.rollback();
                throw new Error(`该订单代理商(ID:${order.agent_id})已在处理中（状态: ${order.status}），如需平台发货请先将状态回退为 paid`);
            }

            // 代理商发货处理
            if (actualFulfillmentType === 'agent' && order.agent_id) {
                const agent = await User.findByPk(order.agent_id, { transaction: t, lock: t.LOCK.UPDATE });
                if (!agent || agent.role_level < 3) {
                    await t.rollback();
                    throw new Error('代理商信息异常');
                }

                // 检查是否在 requestShipping 阶段已预扣库存
                const alreadyDeducted = order.status === 'shipping_requested' && hasReservedStockMarker(order);

                if (!alreadyDeducted) {
                    if (agent.stock_count < order.quantity) {
                        await t.rollback();
                        throw new Error(`代理商云库存不足（当前${agent.stock_count}，需要${order.quantity}）`);
                    }
                    await agent.decrement('stock_count', { by: order.quantity, transaction: t });
                }

                // 修复库存双重扣除
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
                    order.platform_stock_deducted = 0;
                }

                if (alreadyDeducted) {
                    order.remark = removeReservedStockMarker(order.remark);
                }

                order.fulfillment_type = 'Agent';
                order.fulfillment_partner_id = order.agent_id;

                const buyer = await User.findByPk(order.buyer_id, { transaction: t });
                const orderProduct = await Product.findByPk(order.product_id, { transaction: t });
                if (orderProduct && buyer) {
                    await CommissionService.calculateGapAndFulfillmentCommissions({
                        order,
                        buyer,
                        product: orderProduct,
                        agentId: order.agent_id,
                        transaction: t,
                        notifySource: '后台确认代理商发货'
                    });
                }
            } else {
                order.fulfillment_type = 'Company';
                order.middle_commission_total = 0;
            }

            const finalTrackingNo = tracking_number || trackingNoAlt || order.tracking_no || '';
            const finalCompany = normalizeCompanyCode(tracking_company || logistics_company || order.logistics_company || '');
            const finalCompanyLabel = tracking_company || getCompanyDisplayName(finalCompany) || finalCompany;

            order.status = 'shipped';
            order.shipped_at = new Date();
            order.tracking_no = finalTrackingNo;
            order.logistics_company = finalCompany || null;
            if (finalCompanyLabel || finalTrackingNo) {
                const logisticsSummary = [finalCompanyLabel, finalTrackingNo].filter(Boolean).join(' ');
                order.remark = (order.remark ? order.remark + ' | ' : '') + `物流: ${logisticsSummary}`;
            }
            await order.save({ transaction: t });

            await t.commit();
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
            const order = await Order.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!order) {
                await t.rollback();
                throw new Error('订单不存在');
            }

            if (!['paid', 'agent_confirmed', 'shipping_requested'].includes(order.status)) {
                await t.rollback();
                throw new Error('仅待发货订单可以转移');
            }

            const oldAgentId = order.agent_id;
            const resetShippingFields = {
                status: 'paid',
                tracking_no: null,
                logistics_company: null,
                shipping_requested_at: null,
                fulfillment_partner_id: null,
                agent_confirmed_at: null
            };

            await restoreReservedAgentStock(
                order,
                t,
                `转单前已返还代理库存${order.quantity}件`
            );

            // 转为平台发货
            if (!newAgentId || newAgentId === 0) {
                await order.update({
                    ...resetShippingFields,
                    agent_id: null,
                    fulfillment_type: 'Company',
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
                ...resetShippingFields,
                agent_id: newAgent.id,
                fulfillment_type: 'Agent_Pending',
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

            if (['completed', 'cancelled', 'refunded'].includes(order.status)) {
                await t.rollback();
                throw new Error('该订单状态不允许取消');
            }

            await restoreReservedAgentStock(
                order,
                t,
                `管理员${adminName}取消订单返还代理库存${order.quantity}件`
            );

            // 恢复库存
            const product = await Product.findByPk(order.product_id, { transaction: t, lock: t.LOCK.UPDATE });
            if (product && order.status !== 'pending') {
                await product.increment('stock', { by: order.quantity, transaction: t });
            }
            if (order.sku_id && order.status !== 'pending') {
                const sku = await SKU.findByPk(order.sku_id, { transaction: t, lock: t.LOCK.UPDATE });
                if (sku) {
                    await sku.increment('stock', { by: order.quantity, transaction: t });
                }
            }

            // 撤销相关佣金
            await CommissionLog.update(
                { status: 'cancelled', remark: `[管理员${adminName}取消订单] ${reason}` },
                { where: { order_id: id, status: { [Op.in]: ['frozen', 'pending_approval'] } }, transaction: t }
            );

            await order.update({
                status: 'cancelled',
                remark: (order.remark || '') + ` [管理员${adminName}强制取消 原因:${reason}]`
            }, { transaction: t });

            await t.commit();

            await sendNotification(
                order.buyer_id,
                '订单取消通知',
                `您的订单 ${order.order_no} 已被取消，如有疑问请联系客服。`,
                'order',
                order.id
            );

            return true;
        } catch (error) {
            await t.rollback();
            throw error;
        }
    }
}

module.exports = new AdminOrderService();
