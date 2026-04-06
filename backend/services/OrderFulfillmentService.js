/** OrderFulfillmentService — 处理确认收货、发货与履约完成 */
const { Order, User, Product, CommissionLog, sequelize } = require('../models');
const constants = require('../config/constants');
const { error: logError } = require('../utils/logger');
const CommissionService = require('./CommissionService');
const { scheduleUploadShippingInfoAfterShip } = require('./WechatShippingInfoService');

class OrderFulfillmentService {

    static async rollbackWithError(transaction, message) {
        if (!transaction.finished) {
            await transaction.rollback();
        }
        throw new Error(message);
    }

    /** 完成已发货订单（设置售后期截止 + 更新佣金冻结期） */
    static async _completeShippedOrder(order, transaction, extraRemark = '') {
        order.status = 'completed';
        order.completed_at = new Date();

        const refundDays = constants.REFUND?.MAX_REFUND_DAYS || constants.COMMISSION.FREEZE_DAYS;
        const refundDeadline = new Date();
        refundDeadline.setDate(refundDeadline.getDate() + refundDays);
        order.settlement_at = refundDeadline;

        if (extraRemark) {
            order.remark = (order.remark || '') + extraRemark;
        }

        await order.save({ transaction });

        await CommissionLog.update(
            { refund_deadline: refundDeadline },
            { where: { order_id: order.id, status: 'frozen' }, transaction }
        );

        return { refundDeadline, refundDays };
    }

    /** 用户确认收货 */
    static async confirmOrder(req) {
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
            if (order.status !== 'shipped') {
                await this.rollbackWithError(t, '订单状态不正确');
            }

            const { refundDays } = await this._completeShippedOrder(order, t);

            await t.commit();

            return { message: `确认收货成功！售后期${refundDays}天后，佣金将进入审批流程。` };
        } catch (error) {
            if (!t.finished) {
                await t.rollback();
            }
            logError('ORDER', '确认收货失败', { error: error.message });
            throw new Error('确认收货失败');
        }
    }

    /** 后台强制完成订单 */
    static async forceCompleteOrderByAdmin(id, adminName, reason) {
        const t = await sequelize.transaction();
        try {
            const order = await Order.findByPk(id, {
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!order) {
                await this.rollbackWithError(t, '订单不存在');
            }
            if (order.status !== 'shipped') {
                await this.rollbackWithError(t, '仅已发货订单可以强制完成');
            }

            const { refundDays } = await this._completeShippedOrder(
                order,
                t,
                ` [管理员${adminName}强制完成 原因:${reason}]`
            );

            await t.commit();

            return { refundDays };
        } catch (error) {
            if (!t.finished) {
                await t.rollback();
            }
            logError('ORDER', '后台强制完成订单失败', { error: error.message });
            throw error;
        }
    }

    /** 代理商确认订单 */
    static async agentConfirmOrder(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const { id } = req.params;

            const order = await Order.findOne({
                where: { id, agent_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!order) {
                await this.rollbackWithError(t, '订单不存在或您无权操作');
            }
            if (order.status !== 'paid') {
                await this.rollbackWithError(t, '订单需为已支付状态');
            }

            order.status = 'agent_confirmed';
            order.agent_confirmed_at = new Date();
            await order.save({ transaction: t });
            await t.commit();

            return { data: order, message: '代理人已确认订单' };
        } catch (error) {
            if (!t.finished) {
                await t.rollback();
            }
            logError('ORDER', '代理人确认订单失败', { error: error.message });
            throw new Error('确认失败');
        }
    }

    /** 申请发货 */
    static async requestShipping(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const { id } = req.params;
            const { tracking_no } = req.body;

            const order = await Order.findOne({
                where: { id, agent_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!order) throw new Error('订单不存在或您无权操作');
            if (!['paid', 'agent_confirmed'].includes(order.status)) {
                throw new Error('订单状态不允许申请发货');
            }

            // 锁住代理商行防止并发
            await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });

            if (!order.agent_confirmed_at) {
                order.agent_confirmed_at = new Date();
            }

            order.status = 'shipping_requested';
            order.shipping_requested_at = new Date();
            order.tracking_no = tracking_no || null;
            order.fulfillment_partner_id = userId;
            await order.save({ transaction: t });
            await t.commit();

            return { data: order, message: '已申请发货，等待后台确认' };
        } catch (error) {
            if (!t.finished) {
                await t.rollback();
            }
            logError('ORDER', '申请发货失败', { error: error.message });
            throw new Error('申请失败');
        }
    }

    /** 发货（平台发/代理商发） */
    static async shipOrder(req) {
        const t = await sequelize.transaction();
        try {
            const { id } = req.params;
            const { fulfillment_type, tracking_no, logistics_company, tracking_company } = req.body;
            const companyCode = logistics_company || tracking_company || null;

            const order = await Order.findOne({
                where: { id },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!order) {
                await this.rollbackWithError(t, '订单不存在');
            }

            if (!['paid', 'agent_confirmed', 'shipping_requested'].includes(order.status)) {
                await this.rollbackWithError(t, '当前订单状态不允许发货');
            }

            // 安全修复：从订单推断发货类型而非信任前端参数
            let actualFulfillmentType = 'platform';
            if (order.fulfillment_type && ['Agent_Pending', 'Agent'].includes(order.fulfillment_type)) {
                actualFulfillmentType = 'agent';
            }
            if (!order.fulfillment_type && fulfillment_type === 'agent' && order.agent_id) {
                actualFulfillmentType = 'agent';
            }

            if (actualFulfillmentType === 'agent') {
                const agentId = order.agent_id;
                if (!agentId) {
                    await this.rollbackWithError(t, '该订单没有归属代理商');
                }

                const agent = await User.findByPk(agentId, { transaction: t, lock: t.LOCK.UPDATE });
                if (!agent || agent.role_level < 3) {
                    await this.rollbackWithError(t, '代理商信息异常');
                }

                order.fulfillment_type = 'Agent';
                order.fulfillment_partner_id = agentId;

                const buyer = await User.findByPk(order.buyer_id, { transaction: t });
                const orderProduct = await Product.findByPk(order.product_id, { transaction: t });

                if (orderProduct && buyer) {
                    await CommissionService.calculateGapAndFulfillmentCommissions({
                        order,
                        buyer,
                        product: orderProduct,
                        agentId,
                        transaction: t,
                        notifySource: '平台代发(代理商)'
                    });
                }
            } else {
                order.fulfillment_type = 'Company';
                order.middle_commission_total = 0;
            }

            order.status = 'shipped';
            order.shipped_at = new Date();
            order.tracking_no = tracking_no || null;
            if (companyCode) {
                order.logistics_company = String(companyCode).trim().slice(0, 20);
            }
            await order.save({ transaction: t });

            await t.commit();

            scheduleUploadShippingInfoAfterShip(order.id);

            return { data: order, message: '发货成功' };
        } catch (error) {
            if (!t.finished) {
                await t.rollback();
            }
            logError('ORDER', '发货失败', { error: error.message });
            throw new Error('发货失败');
        }
    }
}

module.exports = OrderFulfillmentService;
