const { Refund, Order, Product, CommissionLog, sequelize } = require('../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../models/notificationUtil');
const constants = require('../config/constants');

const ADMIN_USER_ID = constants.ADMIN.USER_ID;

// 生成售后单号
const generateRefundNo = () => {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `RF${timestamp}${random}`;
};

// 申请售后
const applyRefund = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;
        const { order_id, type, reason, description, images, amount, refund_quantity } = req.body;

        if (!order_id || !reason) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '订单ID和原因必填' });
        }

        // 检查订单，并对订单行加锁，防止并发提交导致重复退款
        const order = await Order.findOne({
            where: { id: order_id, buyer_id: userId },
            lock: t.LOCK.UPDATE,
            transaction: t
        });

        if (!order) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        if (!['paid', 'shipped', 'completed'].includes(order.status)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '当前订单状态不支持售后' });
        }

        // ★ 采购订单不支持普通售后（需要走单独的采购退货流程）
        if (order.fulfillment_type === 'Restock') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '采购订单请联系客服处理退货' });
        }

        // ★ 退款金额校验：不能超过订单实际支付金额
        const refundAmount = parseFloat(amount) || parseFloat(order.total_amount);
        if (refundAmount <= 0) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '退款金额必须大于0' });
        }
        if (refundAmount > parseFloat(order.total_amount)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: `退款金额不能超过订单金额 ¥${parseFloat(order.total_amount).toFixed(2)}` });
        }

        // ★★★ 累计退款金额校验：防止多次部分退款超过订单总金额
        const refundedAmount = await Refund.sum('amount', {
            where: { order_id, status: 'completed' },
            transaction: t
        }) || 0;
        const maxRefundable = parseFloat(order.total_amount) - refundedAmount;
        if (refundAmount > maxRefundable) {
            await t.rollback();
            return res.status(400).json({
                code: -1,
                message: `累计退款不能超过订单金额，已退 ¥${refundedAmount.toFixed(2)}，最多可退 ¥${maxRefundable.toFixed(2)}`
            });
        }

        // ★ 退货数量校验
        const refundType = type || 'refund_only';
        let actualRefundQty = 0;

        if (refundType === 'return_refund') {
            // 退货退款：必须填退货数量，且不能超过订单数量
            actualRefundQty = parseInt(refund_quantity) || 0;
            if (actualRefundQty <= 0) {
                await t.rollback();
                return res.status(400).json({ code: -1, message: '退货退款请填写退货数量' });
            }
            if (actualRefundQty > order.quantity) {
                await t.rollback();
                return res.status(400).json({ code: -1, message: `退货数量不能超过订单数量(${order.quantity}件)` });
            }
        } else {
            // 仅退款：不退货，退货数量强制为 0，不恢复库存
            actualRefundQty = 0;
        }

        // ★ 已完成订单：限制确认收货后N天内可申请售后
        if (order.status === 'completed' && order.completed_at) {
            // ★ 售后期限从集中配置读取，与佣金冻结期保持一致，防止时间错配导致坏账
            const maxRefundDays = constants.REFUND?.MAX_REFUND_DAYS || constants.COMMISSION.FREEZE_DAYS; // 默认与佣金冻结期一致
            const deadline = new Date(order.completed_at);
            deadline.setDate(deadline.getDate() + maxRefundDays);
            if (new Date() > deadline) {
                await t.rollback();
                return res.status(400).json({ code: -1, message: `已超过售后期限（确认收货后${maxRefundDays}天内可申请）` });
            }
        }

        // 检查是否已有进行中的售后
        const existingRefund = await Refund.findOne({
            where: {
                order_id,
                status: { [Op.in]: ['pending', 'approved', 'processing'] }
            },
            transaction: t
        });

        if (existingRefund) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '该订单已有进行中的售后申请' });
        }

        const refund = await Refund.create({
            refund_no: generateRefundNo(),
            order_id,
            user_id: userId,
            type: refundType,
            reason,
            description,
            images,
            amount: refundAmount,
            refund_quantity: actualRefundQty,
            status: 'pending'
        }, { transaction: t });

        await t.commit(); // 提交事务

        // 通知用户
        await sendNotification(
            userId,
            '退款申请已提交',
            `您的退款申请 ¥${refundAmount.toFixed(2)} 已提交，请等待审核。`,
            'refund',
            String(refund.id)
        );

        // 通知管理员
        await sendNotification(
            ADMIN_USER_ID,
            '新退款申请',
            `用户申请退款 ¥${refundAmount.toFixed(2)}，订单号 ${order.order_no}，请及时审核。`,
            'refund_admin',
            String(refund.id)
        );

        res.json({ code: 0, data: refund, message: '售后申请已提交' });
    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('申请售后失败:', error);
        res.status(500).json({ code: -1, message: '申请失败' });
    }
};

// 获取售后列表
const getRefunds = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, page = 1, limit = 20 } = req.query;

        const where = { user_id: userId };
        if (status) where.status = status;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Refund.findAndCountAll({
            where,
            include: [{
                model: Order,
                as: 'order',
                attributes: ['id', 'order_no', 'total_amount'],
                include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images'] }]
            }],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
            }
        });
    } catch (error) {
        console.error('获取售后列表失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 获取售后详情
const getRefundById = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const refund = await Refund.findOne({
            where: { id, user_id: userId },
            include: [{
                model: Order,
                as: 'order',
                include: [{ model: Product, as: 'product' }]
            }]
        });

        if (!refund) {
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        res.json({ code: 0, data: refund });
    } catch (error) {
        console.error('获取售后详情失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 取消售后申请
const cancelRefund = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;
        const { id } = req.params;

        // ★ 使用事务 + 行锁，防止用户疯狂连点导致重复取消
        const refund = await Refund.findOne({
            where: { id, user_id: userId },
            lock: t.LOCK.UPDATE,
            transaction: t
        });

        if (!refund) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        if (refund.status !== 'pending') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '当前状态不支持取消' });
        }

        refund.status = 'cancelled';
        await refund.save({ transaction: t });
        await t.commit();

        res.json({ code: 0, message: '已取消' });
    } catch (error) {
        await t.rollback();
        console.error('取消售后失败:', error);
        res.status(500).json({ code: -1, message: '取消失败' });
    }
};

module.exports = {
    applyRefund,
    getRefunds,
    getRefundById,
    cancelRefund
};
