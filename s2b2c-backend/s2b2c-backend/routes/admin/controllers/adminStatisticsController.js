/**
 * 后台数据统计控制器
 * 
 * 提供：
 * - 首页仪表盘数据
 * - 销售统计
 * - 用户统计
 * - 库存预警
 */
const { Order, User, Product, CommissionLog, Withdrawal, Refund, sequelize } = require('../../../models');
const { Op } = require('sequelize');

/**
 * 获取仪表盘概览数据
 */
const getDashboardOverview = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        // 并行查询所有统计数据
        const [
            todayOrders,
            todaySales,
            monthOrders,
            monthSales,
            totalOrders,
            totalSales,
            totalUsers,
            todayNewUsers,
            pendingOrders,
            shippingOrders,
            pendingRefunds,
            pendingWithdrawals,
            pendingCommissions,
            totalAgents,
            lowStockProducts
        ] = await Promise.all([
            // 今日订单数
            Order.count({
                where: {
                    status: { [Op.notIn]: ['pending', 'cancelled'] },
                    paid_at: { [Op.gte]: today }
                }
            }),
            // 今日销售额
            Order.sum('actual_price', {
                where: {
                    status: { [Op.notIn]: ['pending', 'cancelled'] },
                    paid_at: { [Op.gte]: today }
                }
            }),
            // 本月订单数
            Order.count({
                where: {
                    status: { [Op.notIn]: ['pending', 'cancelled'] },
                    paid_at: { [Op.gte]: startOfMonth }
                }
            }),
            // 本月销售额
            Order.sum('actual_price', {
                where: {
                    status: { [Op.notIn]: ['pending', 'cancelled'] },
                    paid_at: { [Op.gte]: startOfMonth }
                }
            }),
            // 累计订单数
            Order.count({
                where: { status: { [Op.notIn]: ['pending', 'cancelled'] } }
            }),
            // 累计销售额
            Order.sum('actual_price', {
                where: { status: { [Op.notIn]: ['pending', 'cancelled'] } }
            }),
            // 总用户数
            User.count(),
            // 今日新增用户
            User.count({
                where: { created_at: { [Op.gte]: today } }
            }),
            // 待发货订单
            Order.count({
                where: { status: { [Op.in]: ['paid', 'agent_confirmed', 'shipping_requested'] } }
            }),
            // 运送中订单
            Order.count({ where: { status: 'shipped' } }),
            // 待处理售后
            Refund.count({ where: { status: 'pending' } }),
            // 待处理提现
            Withdrawal.count({ where: { status: 'pending' } }),
            // 待审批佣金
            CommissionLog.count({ where: { status: 'pending_approval' } }),
            // 代理商数量
            User.count({ where: { role_level: { [Op.gte]: 3 } } }),
            // 低库存商品（库存<10）
            Product.count({ where: { stock: { [Op.lt]: 10 }, status: 1 } })
        ]);

        res.json({
            code: 0,
            data: {
                sales: {
                    today: todaySales || 0,
                    month: monthSales || 0,
                    total: totalSales || 0
                },
                orders: {
                    today: todayOrders,
                    month: monthOrders,
                    total: totalOrders
                },
                users: {
                    total: totalUsers,
                    todayNew: todayNewUsers,
                    agents: totalAgents
                },
                pending: {
                    orders: pendingOrders,
                    shipping: shippingOrders,
                    refunds: pendingRefunds,
                    withdrawals: pendingWithdrawals,
                    commissions: pendingCommissions
                },
                alerts: {
                    lowStockProducts
                }
            }
        });
    } catch (error) {
        console.error('获取仪表盘数据失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 获取销售趋势（最近7天/30天）
 */
const getSalesTrend = async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const daysNum = parseInt(days);

        const results = [];
        for (let i = daysNum - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);

            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const [sales, orders] = await Promise.all([
                Order.sum('actual_price', {
                    where: {
                        status: { [Op.notIn]: ['pending', 'cancelled'] },
                        paid_at: { [Op.gte]: date, [Op.lt]: nextDate }
                    }
                }),
                Order.count({
                    where: {
                        status: { [Op.notIn]: ['pending', 'cancelled'] },
                        paid_at: { [Op.gte]: date, [Op.lt]: nextDate }
                    }
                })
            ]);

            results.push({
                date: date.toISOString().slice(0, 10),
                sales: sales || 0,
                orders
            });
        }

        res.json({ code: 0, data: results });
    } catch (error) {
        console.error('获取销售趋势失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 获取商品销量排行
 */
const getProductRanking = async (req, res) => {
    try {
        const { limit = 10, days = 30 } = req.query;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const rankings = await Order.findAll({
            where: {
                status: { [Op.notIn]: ['pending', 'cancelled'] },
                paid_at: { [Op.gte]: startDate }
            },
            attributes: [
                'product_id',
                [sequelize.fn('SUM', sequelize.col('quantity')), 'total_quantity'],
                [sequelize.fn('SUM', sequelize.col('actual_price')), 'total_sales'],
                [sequelize.fn('COUNT', sequelize.col('Order.id')), 'order_count']
            ],
            include: [{
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'images', 'retail_price', 'stock']
            }],
            group: ['product_id'],
            order: [[sequelize.literal('total_sales'), 'DESC']],
            limit: parseInt(limit)
        });

        res.json({ code: 0, data: rankings });
    } catch (error) {
        console.error('获取商品排行失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 获取用户增长趋势（最近7天/30天）
 */
const getUserTrend = async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const daysNum = parseInt(days);

        const results = [];
        for (let i = daysNum - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);

            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const newUsers = await User.count({
                where: {
                    created_at: { [Op.gte]: date, [Op.lt]: nextDate }
                }
            });

            results.push({
                date: date.toISOString().slice(0, 10),
                newUsers
            });
        }

        res.json({ code: 0, data: results });
    } catch (error) {
        console.error('获取用户趋势失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 获取库存预警列表
 */
const getLowStockProducts = async (req, res) => {
    try {
        const { threshold = 10, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Product.findAndCountAll({
            where: {
                stock: { [Op.lt]: parseInt(threshold) },
                status: 1
            },
            order: [['stock', 'ASC']],
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
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('获取库存预警失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 获取代理商业绩排行
 */
const getAgentRanking = async (req, res) => {
    try {
        const { limit = 10, days = 30 } = req.query;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // 统计代理商发货利润
        const rankings = await CommissionLog.findAll({
            where: {
                type: 'agent_fulfillment',
                status: { [Op.in]: ['frozen', 'pending_approval', 'approved', 'settled'] },
                created_at: { [Op.gte]: startDate }
            },
            attributes: [
                'user_id',
                [sequelize.fn('SUM', sequelize.col('amount')), 'total_profit'],
                [sequelize.fn('COUNT', sequelize.col('CommissionLog.id')), 'order_count']
            ],
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'nickname', 'avatar_url', 'role_level', 'stock_count']
            }],
            group: ['user_id'],
            order: [[sequelize.literal('total_profit'), 'DESC']],
            limit: parseInt(limit)
        });

        res.json({ code: 0, data: rankings });
    } catch (error) {
        console.error('获取代理商排行失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 获取分销业绩报表
 */
const getDistributionReport = async (req, res) => {
    try {
        const { days = 30 } = req.query;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // 各类型佣金统计
        const commissionStats = await CommissionLog.findAll({
            where: {
                status: { [Op.in]: ['frozen', 'pending_approval', 'approved', 'settled'] },
                created_at: { [Op.gte]: startDate }
            },
            attributes: [
                'type',
                [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['type']
        });

        // 按状态统计
        const statusStats = await CommissionLog.findAll({
            where: {
                created_at: { [Op.gte]: startDate }
            },
            attributes: [
                'status',
                [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['status']
        });

        res.json({
            code: 0,
            data: {
                byType: commissionStats,
                byStatus: statusStats
            }
        });
    } catch (error) {
        console.error('获取分销报表失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

module.exports = {
    getDashboardOverview,
    getSalesTrend,
    getProductRanking,
    getUserTrend,
    getLowStockProducts,
    getAgentRanking,
    getDistributionReport
};
