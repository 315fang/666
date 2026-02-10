const { Refund, Order, User, Product } = require('../../../models');
const { Op } = require('sequelize');

// 获取售后列表
const getRefunds = async (req, res) => {
    try {
        const { status, type, page = 1, limit = 20 } = req.query;
        const where = {};

        if (status) where.status = status;
        if (type) where.type = type;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Refund.findAndCountAll({
            where,
            include: [
                { model: User, as: 'user', attributes: ['id', 'nickname'] },
                {
                    model: Order,
                    as: 'order',
                    attributes: ['id', 'order_no', 'total_amount'],
                    include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images'] }]
                }
            ],
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
        const { id } = req.params;
        const refund = await Refund.findByPk(id, {
            include: [
                { model: User, as: 'user' },
                { model: Order, as: 'order', include: [{ model: Product, as: 'product' }] }
            ]
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

// 审核通过
const approveRefund = async (req, res) => {
    try {
        const { id } = req.params;
        const { remark } = req.body;
        const adminId = req.admin.id;

        const refund = await Refund.findByPk(id);
        if (!refund) {
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        if (refund.status !== 'pending') {
            return res.status(400).json({ code: -1, message: '状态不正确' });
        }

        refund.status = 'approved';
        refund.admin_id = adminId;
        refund.admin_remark = remark;
        refund.processed_at = new Date();
        await refund.save();

        res.json({ code: 0, message: '审核通过' });
    } catch (error) {
        console.error('审核失败:', error);
        res.status(500).json({ code: -1, message: '审核失败' });
    }
};

// 拒绝售后
const rejectRefund = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.admin.id;

        const refund = await Refund.findByPk(id);
        if (!refund) {
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        if (refund.status !== 'pending') {
            return res.status(400).json({ code: -1, message: '状态不正确' });
        }

        refund.status = 'rejected';
        refund.admin_id = adminId;
        refund.reject_reason = reason;
        refund.processed_at = new Date();
        await refund.save();

        res.json({ code: 0, message: '已拒绝' });
    } catch (error) {
        console.error('拒绝失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

// 完成退款
const completeRefund = async (req, res) => {
    try {
        const { id } = req.params;

        const refund = await Refund.findByPk(id, {
            include: [{ model: Order, as: 'order' }]
        });

        if (!refund) {
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        if (refund.status !== 'approved') {
            return res.status(400).json({ code: -1, message: '请先审核通过' });
        }

        // 更新订单状态
        await Order.update({ status: 'refunded' }, { where: { id: refund.order_id } });

        refund.status = 'completed';
        refund.completed_at = new Date();
        await refund.save();

        res.json({ code: 0, message: '退款完成' });
    } catch (error) {
        console.error('完成退款失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

module.exports = {
    getRefunds,
    getRefundById,
    approveRefund,
    rejectRefund,
    completeRefund
};
