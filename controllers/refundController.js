const { Refund, Order, Product } = require('../models');
const { Op } = require('sequelize');

// 生成售后单号
const generateRefundNo = () => {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `RF${timestamp}${random}`;
};

// 申请售后
const applyRefund = async (req, res) => {
    try {
        const userId = req.user.id;
        const { order_id, type, reason, description, images, amount } = req.body;

        if (!order_id || !reason) {
            return res.status(400).json({ code: -1, message: '订单ID和原因必填' });
        }

        // 检查订单
        const order = await Order.findOne({
            where: { id: order_id, buyer_id: userId }
        });

        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        if (!['paid', 'shipped', 'completed'].includes(order.status)) {
            return res.status(400).json({ code: -1, message: '当前订单状态不支持售后' });
        }

        // 检查是否已有进行中的售后
        const existingRefund = await Refund.findOne({
            where: {
                order_id,
                status: { [Op.in]: ['pending', 'approved', 'processing'] }
            }
        });

        if (existingRefund) {
            return res.status(400).json({ code: -1, message: '该订单已有进行中的售后申请' });
        }

        const refund = await Refund.create({
            refund_no: generateRefundNo(),
            order_id,
            user_id: userId,
            type: type || 'refund_only',
            reason,
            description,
            images,
            amount: amount || order.total_amount,
            status: 'pending'
        });

        res.json({ code: 0, data: refund, message: '售后申请已提交' });
    } catch (error) {
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
            order: [['createdAt', 'DESC']],
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
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const refund = await Refund.findOne({
            where: { id, user_id: userId }
        });

        if (!refund) {
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        if (refund.status !== 'pending') {
            return res.status(400).json({ code: -1, message: '当前状态不支持取消' });
        }

        refund.status = 'cancelled';
        await refund.save();

        res.json({ code: 0, message: '已取消' });
    } catch (error) {
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
