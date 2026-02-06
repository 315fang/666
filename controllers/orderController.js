const { Order, Product, User, Cart, CommissionLog } = require('../models');
const { Op } = require('sequelize');

// 生成订单号
const generateOrderNo = () => {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `ORD${timestamp}${random}`;
};

// 创建订单
const createOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            product_id,
            sku_id,
            quantity = 1,
            address_id,
            from_cart = false,  // 是否来自购物车
            cart_ids = []       // 购物车商品IDs
        } = req.body;

        let orderItems = [];

        if (from_cart && cart_ids.length > 0) {
            // 从购物车创建订单
            const cartItems = await Cart.findAll({
                where: {
                    id: { [Op.in]: cart_ids },
                    user_id: userId,
                    selected: true
                },
                include: [{
                    model: Product,
                    as: 'product'
                }]
            });

            if (cartItems.length === 0) {
                return res.status(400).json({ code: -1, message: '未选择有效商品' });
            }

            orderItems = cartItems.map(item => ({
                product_id: item.product_id,
                sku_id: item.sku_id,
                quantity: item.quantity,
                product: item.product
            }));
        } else {
            // 直接购买
            if (!product_id) {
                return res.status(400).json({ code: -1, message: '商品ID不能为空' });
            }

            const product = await Product.findByPk(product_id);
            if (!product || product.status !== 1) {
                return res.status(400).json({ code: -1, message: '商品不存在或已下架' });
            }

            orderItems = [{
                product_id,
                sku_id,
                quantity,
                product
            }];
        }

        // 获取用户信息（分销关系）
        const user = await User.findByPk(userId);

        // 创建订单（简化：每个商品一个订单）
        const orders = [];
        for (const item of orderItems) {
            // 根据用户角色确定价格
            let price = item.product.retail_price;
            if (user.role_level >= 1) {
                price = item.product.member_price || item.product.retail_price;
            }
            if (user.role_level >= 3) {
                price = item.product.wholesale_price || item.product.member_price || item.product.retail_price;
            }

            const totalAmount = parseFloat(price) * item.quantity;

            const order = await Order.create({
                order_no: generateOrderNo(),
                buyer_id: userId,
                distributor_id: user.parent_id || null,
                distributor_role: user.role_level,
                product_id: item.product_id,
                quantity: item.quantity,
                total_amount: totalAmount,
                actual_price: price,
                status: 'pending'
            });

            orders.push(order);
        }

        // 如果是从购物车下单，清除已下单的购物车商品
        if (from_cart && cart_ids.length > 0) {
            await Cart.destroy({
                where: { id: { [Op.in]: cart_ids }, user_id: userId }
            });
        }

        res.json({
            code: 0,
            data: orders.length === 1 ? orders[0] : orders,
            message: '订单创建成功'
        });
    } catch (error) {
        console.error('创建订单失败:', error);
        res.status(500).json({ code: -1, message: '创建订单失败' });
    }
};

// 支付订单（模拟）
const payOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const order = await Order.findOne({
            where: { id, buyer_id: userId }
        });

        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        if (order.status !== 'pending') {
            return res.status(400).json({ code: -1, message: '订单状态不正确' });
        }

        // 更新订单状态
        order.status = 'paid';
        order.paid_at = new Date();
        await order.save();

        // 生成佣金记录（如果有分销商）
        if (order.distributor_id) {
            // 一级分销佣金（示例：10%）
            const commissionRate = 0.10;
            const commissionAmount = parseFloat(order.total_amount) * commissionRate;

            await CommissionLog.create({
                order_id: order.id,
                user_id: order.distributor_id,
                amount: commissionAmount,
                type: 'level1',
                status: 'frozen',
                remark: `订单 ${order.order_no} 一级分销佣金`
            });
        }

        // 更新用户累计信息
        const buyer = await User.findByPk(userId);
        await buyer.increment('order_count');
        await buyer.increment('total_sales', { by: parseFloat(order.total_amount) });

        res.json({
            code: 0,
            data: order,
            message: '支付成功'
        });
    } catch (error) {
        console.error('支付订单失败:', error);
        res.status(500).json({ code: -1, message: '支付失败' });
    }
};

// 获取订单列表
const getOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, page = 1, limit = 20 } = req.query;

        const where = { buyer_id: userId };
        if (status) where.status = status;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [{
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'images', 'retail_price']
            }],
            order: [['createdAt', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(count / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('获取订单列表失败:', error);
        res.status(500).json({ code: -1, message: '获取订单列表失败' });
    }
};

module.exports = {
    createOrder,
    payOrder,
    getOrders
};
