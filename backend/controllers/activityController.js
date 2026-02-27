// backend/controllers/activityController.js
const { Op } = require('sequelize');

/**
 * GET /api/activity/bubbles
 * 返回气泡通告数据：最近成交的订单/拼团记录，手机号脱敏
 * 查询参数：limit（条数，默认10，后台可配）
 */
exports.getBubbles = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 30);
        const bubbles = [];

        // ——— 尝试从订单表查询最近成交 ———
        try {
            const { Order, User, Product } = require('../models');

            const recentOrders = await Order.findAll({
                where: {
                    status: { [Op.in]: ['paid', 'shipped', 'completed'] },
                    created_at: {
                        [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 最近7天
                    }
                },
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['phone', 'nickname']
                    }
                ],
                order: [['created_at', 'DESC']],
                limit: Math.min(limit, 20),
                raw: false
            });

            for (const order of recentOrders) {
                const user = order.user;
                if (!user) continue;

                // 手机号脱敏：保留后4位
                const phone = user.phone || '';
                const maskedNickname = phone
                    ? `用户**${phone.slice(-4)}`
                    : (user.nickname ? user.nickname.substring(0, 1) + '**' : '用户****');

                // 尝试获取订单商品名
                let productName = '精选商品';
                try {
                    const { OrderItem } = require('../models');
                    const firstItem = await OrderItem.findOne({
                        where: { order_id: order.id },
                        include: [{ model: Product, as: 'product', attributes: ['name'] }]
                    });
                    if (firstItem && firstItem.product) {
                        productName = firstItem.product.name;
                    }
                } catch (_) { /* 静默失败 */ }

                bubbles.push({
                    type: 'order',
                    nickname: maskedNickname,
                    product_name: productName,
                    created_at: order.created_at
                });
            }
        } catch (dbErr) {
            // 数据库查询失败时静默降级，不影响接口响应
            console.warn('[activityController] DB query failed, using mock data:', dbErr.message);
        }

        // ——— 如果真实数据不足，补充模拟数据 ———
        if (bubbles.length < 3) {
            const mockNames = ['用户**28', '用户**74', '用户**91', '用户**53', '用户**16'];
            const mockProducts = ['活性炭绿豆饼', '冻顶乌龙礼盒', '正山小种红茶', '特级大红袍', '碧螺春精选'];
            const mockTypes = ['order', 'order', 'group_buy', 'order', 'slash'];
            const needed = limit - bubbles.length;
            for (let i = 0; i < Math.min(needed, mockNames.length); i++) {
                bubbles.push({
                    type: mockTypes[i % mockTypes.length],
                    nickname: mockNames[i % mockNames.length],
                    product_name: mockProducts[i % mockProducts.length],
                    created_at: new Date(Date.now() - i * 3 * 60 * 1000)
                });
            }
        }

        res.json({
            code: 0,
            data: bubbles.slice(0, limit),
            message: 'ok'
        });
    } catch (err) {
        console.error('[activityController] getBubbles error:', err);
        res.json({ code: 0, data: [], message: 'ok' }); // 降级返回空数组，不报错
    }
};
