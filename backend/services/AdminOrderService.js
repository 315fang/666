const { Order, User, Product, Address, SKU, CommissionLog, sequelize } = require('../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../models/notificationUtil');

class AdminOrderService {
    /**
     * 发货逻辑（代理商发货扣除库存并计算利润，平台发货直接改状态）
     */
    async shipOrder(id, shipData) {
        const { tracking_company, tracking_number, tracking_no: trackingNoAlt, logistics_company, fulfillment_type } = shipData;
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

            // 防撞单风险：如果代理商已进入发货流程，拦截平台发货
            if (fulfillment_type !== 'agent' && order.agent_id &&
                ['agent_confirmed', 'shipping_requested'].includes(order.status)) {
                await t.rollback();
                throw new Error(`该订单代理商(ID:${order.agent_id})已在处理中（状态: ${order.status}），如需平台发货请先将状态回退为 paid`);
            }

            // 代理商发货处理
            if (fulfillment_type === 'agent' && order.agent_id) {
                const agent = await User.findByPk(order.agent_id, { transaction: t, lock: t.LOCK.UPDATE });
                if (!agent || agent.role_level < 3) {
                    await t.rollback();
                    throw new Error('代理商信息异常');
                }

                // 检查是否在 requestShipping 阶段已预扣库存
                const alreadyDeducted = order.status === 'shipping_requested' && order.remark && order.remark.includes('[库存已预扣]');

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
                }

                order.fulfillment_type = 'Agent';
                order.fulfillment_partner_id = order.agent_id;

                // 计算代理商发货利润
                const orderProduct2 = await Product.findByPk(order.product_id, { transaction: t });
                if (orderProduct2) {
                    const agentCostPrice = order.locked_agent_cost
                        ? parseFloat(order.locked_agent_cost)
                        : parseFloat(orderProduct2.price_agent || orderProduct2.price_leader || orderProduct2.price_member || orderProduct2.retail_price);
                    const agentCost = agentCostPrice * order.quantity;
                    const buyerPaid = parseFloat(order.actual_price);
                    const middleCommission = parseFloat(order.middle_commission_total) || 0;
                    const agentProfit = buyerPaid - agentCost - middleCommission;

                    if (agentProfit > 0 && order.buyer_id !== order.agent_id) {
                        await CommissionLog.create({
                            order_id: order.id,
                            user_id: order.agent_id,
                            amount: agentProfit,
                            type: 'agent_fulfillment',
                            status: 'frozen',
                            available_at: null,
                            remark: `代理商发货利润 (锁定进货价${agentCostPrice}×${order.quantity}=${agentCost}, 中间佣金${middleCommission.toFixed(2)})`
                        }, { transaction: t });

                        await sendNotification(
                            order.agent_id,
                            '发货收益提醒',
                            `您的团队产生了一笔发货订单，发货利润 ¥${agentProfit.toFixed(2)}（确认收货后T+7结算）。`,
                            'commission',
                            order.id
                        );
                    } else if (agentProfit <= 0) {
                        console.error(`⚠️ [利润异常] 订单 ${order.order_no || order.id} 代理商(ID:${order.agent_id})发货利润为 ¥${agentProfit.toFixed(2)}，请人工核查！`);
                        await sendNotification(
                            0, // Admin
                            '⚠️ 发货利润异常',
                            `订单ID:${order.id} 代理商发货利润为 ¥${agentProfit.toFixed(2)}（<=0），买家实付=${buyerPaid}，进货成本=${agentCost}，中间佣金=${middleCommission}。请人工核查！`,
                            'system_alert',
                            order.id
                        );
                    }
                }
            } else {
                order.fulfillment_type = 'Company';
            }

            const finalTrackingNo = tracking_number || trackingNoAlt || '';
            const finalCompany = tracking_company || logistics_company || '';

            order.status = 'shipped';
            order.shipped_at = new Date();
            order.tracking_no = finalTrackingNo;
            if (finalCompany) {
                order.remark = (order.remark ? order.remark + ' | ' : '') + `物流: ${finalCompany} ${finalTrackingNo}`;
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

            if (['completed', 'cancelled', 'refunded'].includes(order.status)) {
                await t.rollback();
                throw new Error('该订单状态不允许取消');
            }

            // 恢复库存
            const product = await Product.findByPk(order.product_id, { transaction: t });
            if (product && order.status !== 'pending') {
                await product.increment('stock', { by: order.quantity, transaction: t });
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
