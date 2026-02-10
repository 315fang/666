/**
 * 增强的管理后台统计控制器
 * 提供更丰富的数据分析和报表功能
 */

const { User, Order, CommissionLog, Product, sequelize } = require('../../../models');
const { Op } = require('sequelize');

/**
 * 获取综合统计概览
 */
const getDashboardOverview = async (req, res) => {
    try {
        const { period = 'today' } = req.query;

        // 计算时间范围
        const timeRange = getTimeRange(period);

        // 并行获取所有统计数据
        const [
            salesStats,
            userStats,
            commissionStats,
            orderStats,
            productStats,
            trends
        ] = await Promise.all([
            getSalesStatistics(timeRange),
            getUserStatistics(timeRange),
            getCommissionStatistics(timeRange),
            getOrderStatistics(timeRange),
            getProductStatistics(timeRange),
            getTrendData(period)
        ]);

        res.json({
            code: 0,
            data: {
                period,
                timeRange,
                sales: salesStats,
                users: userStats,
                commissions: commissionStats,
                orders: orderStats,
                products: productStats,
                trends
            }
        });
    } catch (error) {
        console.error('获取统计概览失败:', error);
        res.status(500).json({ code: -1, message: '获取失败', error: error.message });
    }
};

/**
 * 获取销售统计
 */
const getSalesStatistics = async (timeRange) => {
    const { start, end } = timeRange;

    // 当前期间销售额
    const currentSales = await Order.sum('total_amount', {
        where: {
            status: { [Op.in]: ['paid', 'shipped', 'completed'] },
            created_at: { [Op.between]: [start, end] }
        }
    }) || 0;

    // 上一期间销售额（用于计算增长率）
    const periodLength = end - start;
    const previousStart = new Date(start.getTime() - periodLength);
    const previousEnd = start;

    const previousSales = await Order.sum('total_amount', {
        where: {
            status: { [Op.in]: ['paid', 'shipped', 'completed'] },
            created_at: { [Op.between]: [previousStart, previousEnd] }
        }
    }) || 0;

    // 计算增长率
    const growthRate = previousSales > 0
        ? ((currentSales - previousSales) / previousSales * 100).toFixed(2)
        : 100;

    // 平台利润（总销售额 - 总佣金）
    const totalCommissions = await CommissionLog.sum('amount', {
        where: {
            status: { [Op.in]: ['frozen', 'pending_approval', 'approved', 'settled'] },
            created_at: { [Op.between]: [start, end] }
        }
    }) || 0;

    const platformProfit = currentSales - totalCommissions;

    return {
        currentSales: parseFloat(currentSales.toFixed(2)),
        previousSales: parseFloat(previousSales.toFixed(2)),
        growthRate: parseFloat(growthRate),
        totalCommissions: parseFloat(totalCommissions.toFixed(2)),
        platformProfit: parseFloat(platformProfit.toFixed(2)),
        profitMargin: currentSales > 0 ? ((platformProfit / currentSales) * 100).toFixed(2) : 0
    };
};

/**
 * 获取用户统计
 */
const getUserStatistics = async (timeRange) => {
    const { start, end } = timeRange;

    // 新增用户
    const newUsers = await User.count({
        where: {
            created_at: { [Op.between]: [start, end] }
        }
    });

    // 各角色分布
    const roleDistribution = await User.findAll({
        attributes: [
            'role_level',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['role_level'],
        raw: true
    });

    const roles = {
        guest: 0,
        member: 0,
        leader: 0,
        agent: 0
    };

    roleDistribution.forEach(role => {
        const count = parseInt(role.count);
        switch (role.role_level) {
            case 0: roles.guest = count; break;
            case 1: roles.member = count; break;
            case 2: roles.leader = count; break;
            case 3: roles.agent = count; break;
        }
    });

    // 活跃用户（本期有订单的用户）
    const activeUsers = await Order.count({
        distinct: true,
        col: 'buyer_id',
        where: {
            created_at: { [Op.between]: [start, end] }
        }
    });

    return {
        newUsers,
        activeUsers,
        totalUsers: roles.guest + roles.member + roles.leader + roles.agent,
        roleDistribution: roles
    };
};

/**
 * 获取佣金统计
 */
const getCommissionStatistics = async (timeRange) => {
    const { start, end } = timeRange;

    // 按状态统计
    const statusStats = await CommissionLog.findAll({
        attributes: [
            'status',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            [sequelize.fn('SUM', sequelize.col('amount')), 'total']
        ],
        where: {
            created_at: { [Op.between]: [start, end] }
        },
        group: ['status'],
        raw: true
    });

    const stats = {
        frozen: { count: 0, total: 0 },
        pending_approval: { count: 0, total: 0 },
        approved: { count: 0, total: 0 },
        settled: { count: 0, total: 0 },
        cancelled: { count: 0, total: 0 }
    };

    statusStats.forEach(stat => {
        if (stats[stat.status]) {
            stats[stat.status] = {
                count: parseInt(stat.count),
                total: parseFloat(stat.total || 0).toFixed(2)
            };
        }
    });

    // 待审批数量（全局，不限时间）
    const pendingApprovalCount = await CommissionLog.count({
        where: { status: 'pending_approval' }
    });

    return {
        periodStats: stats,
        pendingApprovalCount // 管理员最关心的数字
    };
};

/**
 * 获取订单统计
 */
const getOrderStatistics = async (timeRange) => {
    const { start, end } = timeRange;

    // 按状态统计
    const statusStats = await Order.findAll({
        attributes: [
            'status',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: {
            created_at: { [Op.between]: [start, end] }
        },
        group: ['status'],
        raw: true
    });

    const stats = {};
    statusStats.forEach(stat => {
        stats[stat.status] = parseInt(stat.count);
    });

    // 平均订单金额
    const avgOrderAmount = await Order.findOne({
        attributes: [[sequelize.fn('AVG', sequelize.col('total_amount')), 'avg']],
        where: {
            status: { [Op.in]: ['paid', 'shipped', 'completed'] },
            created_at: { [Op.between]: [start, end] }
        },
        raw: true
    });

    return {
        statusDistribution: stats,
        avgOrderAmount: parseFloat(avgOrderAmount?.avg || 0).toFixed(2)
    };
};

/**
 * 获取商品统计
 */
const getProductStatistics = async (timeRange) => {
    // 库存告警商品
    const lowStockProducts = await Product.count({
        where: {
            stock: { [Op.lte]: sequelize.col('min_stock') },
            status: 1
        }
    });

    // 热销商品 TOP 10
    const topProducts = await sequelize.query(`
        SELECT
            p.id,
            p.name,
            p.retail_price,
            COUNT(oi.id) as order_count,
            SUM(oi.quantity) as total_quantity,
            SUM(oi.total) as total_sales
        FROM products p
        INNER JOIN order_items oi ON p.id = oi.product_id
        INNER JOIN orders o ON oi.order_id = o.id
        WHERE o.status IN ('paid', 'shipped', 'completed')
            AND o.created_at BETWEEN :start AND :end
        GROUP BY p.id
        ORDER BY total_sales DESC
        LIMIT 10
    `, {
        replacements: { start: timeRange.start, end: timeRange.end },
        type: sequelize.QueryTypes.SELECT
    });

    return {
        lowStockCount: lowStockProducts,
        topProducts: topProducts.map(p => ({
            id: p.id,
            name: p.name,
            price: parseFloat(p.retail_price),
            orderCount: parseInt(p.order_count),
            quantity: parseInt(p.total_quantity),
            sales: parseFloat(p.total_sales).toFixed(2)
        }))
    };
};

/**
 * 获取趋势数据
 */
const getTrendData = async (period) => {
    // 根据period决定粒度
    let dateFormat, dateField;
    const now = new Date();
    let start;

    switch (period) {
        case 'today':
            dateFormat = '%Y-%m-%d %H:00:00';
            dateField = 'hour';
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'week':
            dateFormat = '%Y-%m-%d';
            dateField = 'date';
            start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            dateFormat = '%Y-%m-%d';
            dateField = 'date';
            start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            dateFormat = '%Y-%m-%d';
            dateField = 'date';
            start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // 销售趋势
    const salesTrend = await sequelize.query(`
        SELECT
            DATE_FORMAT(created_at, :dateFormat) as period,
            COUNT(id) as order_count,
            SUM(total_amount) as sales
        FROM orders
        WHERE status IN ('paid', 'shipped', 'completed')
            AND created_at >= :start
        GROUP BY period
        ORDER BY period
    `, {
        replacements: { dateFormat, start },
        type: sequelize.QueryTypes.SELECT
    });

    return {
        sales: salesTrend.map(t => ({
            period: t.period,
            orderCount: parseInt(t.order_count),
            sales: parseFloat(t.sales).toFixed(2)
        }))
    };
};

/**
 * 获取时间范围
 */
const getTimeRange = (period) => {
    const now = new Date();
    let start, end = now;

    switch (period) {
        case 'today':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'week':
            start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        case 'year':
            start = new Date(now.getFullYear(), 0, 1);
            break;
        default:
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    return { start, end };
};

/**
 * 获取代理商排行榜
 */
const getAgentRanking = async (req, res) => {
    try {
        const { period = 'month', limit = 20 } = req.query;
        const timeRange = getTimeRange(period);

        const ranking = await sequelize.query(`
            SELECT
                u.id,
                u.nickname,
                u.avatar_url,
                u.role_level,
                COUNT(DISTINCT o.id) as order_count,
                SUM(o.total_amount) as total_sales,
                COUNT(DISTINCT u2.id) as team_size,
                SUM(cl.amount) as total_commission
            FROM users u
            LEFT JOIN orders o ON u.id = o.buyer_id
                AND o.status IN ('paid', 'shipped', 'completed')
                AND o.created_at BETWEEN :start AND :end
            LEFT JOIN users u2 ON u.id = u2.parent_id
            LEFT JOIN commission_logs cl ON u.id = cl.user_id
                AND cl.status IN ('frozen', 'pending_approval', 'approved', 'settled')
                AND cl.created_at BETWEEN :start AND :end
            WHERE u.role_level >= 2
            GROUP BY u.id
            ORDER BY total_sales DESC
            LIMIT :limit
        `, {
            replacements: {
                start: timeRange.start,
                end: timeRange.end,
                limit: parseInt(limit)
            },
            type: sequelize.QueryTypes.SELECT
        });

        res.json({
            code: 0,
            data: {
                period,
                ranking: ranking.map((agent, index) => ({
                    rank: index + 1,
                    userId: agent.id,
                    nickname: agent.nickname,
                    avatarUrl: agent.avatar_url,
                    roleLevel: agent.role_level,
                    orderCount: parseInt(agent.order_count) || 0,
                    totalSales: parseFloat(agent.total_sales || 0).toFixed(2),
                    teamSize: parseInt(agent.team_size) || 0,
                    totalCommission: parseFloat(agent.total_commission || 0).toFixed(2)
                }))
            }
        });
    } catch (error) {
        console.error('获取代理商排行榜失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

module.exports = {
    getDashboardOverview,
    getAgentRanking
};
