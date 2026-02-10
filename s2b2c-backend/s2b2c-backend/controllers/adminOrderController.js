const { Order, User, Product, Address } = require('../../../models');
const { Op } = require('sequelize');

// 获取订单列表
const getOrders = async (req, res) => {
    try {
        const { status, order_no, buyer_keyword, start_date, end_date, page = 1, limit = 20 } = req.query;
        const where = {};

        if (status) where.status = status;
        if (order_no) where.order_no = { [Op.like]: `%${order_no}%` };
        if (start_date && end_date) {
            where.createdAt = { [Op.between]: [new Date(start_date), new Date(end_date)] };
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'nickname', 'openid'] },
                { model: Product, as: 'product', attributes: ['id', 'name', 'images'] }
            ],
            order: [['createdAt', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // 计算今日销售额（仪表盘统计）
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [todaySalesResult, pendingShipCount] = await Promise.all([
            Order.sum('total_amount', {
                where: {
                    status: { [Op.in]: ['paid', 'shipped', 'completed'] },
                    createdAt: { [Op.between]: [today, tomorrow] }
                }
            }),
            Order.count({ where: { status: 'paid' } })
        ]);

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit) },
                todaySales: todaySalesResult || 0,
                pendingShip: pendingShipCount || 0
            }
        });
    } catch (error) {
        console.error('获取订单列表失败:', error);
        res.status(500).json({ code: -1, message: '获取订单列表失败: ' + error.message });
    }
};

// 获取订单详情
const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findByPk(id, {
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'nickname', 'openid', 'role_level'] },
                { model: User, as: 'distributor', attributes: ['id', 'nickname'] },
                { model: Product, as: 'product' }
            ]
        });

        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        res.json({ code: 0, data: order });
    } catch (error) {
        console.error('获取订单详情失败:', error);
        res.status(500).json({ code: -1, message: '获取订单详情失败: ' + error.message });
    }
};

// 更新订单状态
const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remark } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        order.status = status;
        if (status === 'completed') order.completed_at = new Date();
        await order.save();

        res.json({ code: 0, message: '状态更新成功' });
    } catch (error) {
        console.error('更新订单状态失败:', error);
        res.status(500).json({ code: -1, message: '更新失败: ' + error.message });
    }
};

// 发货
const shipOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { tracking_company, tracking_no } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        if (order.status !== 'paid') {
            return res.status(400).json({ code: -1, message: '订单状态不正确' });
        }

        order.status = 'shipped';
        order.shipped_at = new Date();
        // 可扩展：存储物流信息到单独字段
        await order.save();

        res.json({ code: 0, message: '发货成功' });
    } catch (error) {
        console.error('发货失败:', error);
        res.status(500).json({ code: -1, message: '发货失败: ' + error.message });
    }
};

module.exports = {
    getOrders,
    getOrderById,
    updateOrderStatus,
    shipOrder
};
