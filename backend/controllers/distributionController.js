const { User, CommissionLog, Order, Product, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * 获取分销统计数据
 */
/**
 * 获取分销统计数据
 */
async function getDistributionStats(req, res, next) {
    try {
        const user = req.user;

        // 获取邀请人信息
        let inviter = null;
        if (user.parent_id) {
            const parent = await User.findByPk(user.parent_id);
            if (parent) {
                inviter = {
                    nickname: parent.nickname,
                    avatar_url: parent.avatar_url
                };
            }
        }

        // 获取等级名称
        const roleNames = {
            0: '普通会员',
            1: '初级分销员',
            2: '中级分销员',
            3: '高级合伙人'
        };
        const roleName = roleNames[user.role_level] || '普通会员';

        // 直推成员数
        const directCount = await User.count({
            where: { parent_id: user.id }
        });

        // 间接成员数（二级）
        const directIds = await User.findAll({
            where: { parent_id: user.id },
            attributes: ['id'],
            raw: true
        });
        const indirectCount = directIds.length > 0 ? await User.count({
            where: { parent_id: { [Op.in]: directIds.map(d => d.id) } }
        }) : 0;

        // 佣金统计
        const commissionStats = await CommissionLog.findAll({
            where: { user_id: user.id },
            attributes: [
                'status',
                [sequelize.fn('SUM', sequelize.col('amount')), 'total']
            ],
            group: ['status'],
            raw: true
        });

        let totalEarnings = 0;
        let frozenAmount = 0;
        let availableAmount = 0;

        commissionStats.forEach(item => {
            const amount = parseFloat(item.total) || 0;
            totalEarnings += amount;
            if (item.status === 'frozen') frozenAmount += amount;
            if (item.status === 'settled' || item.status === 'available') availableAmount += amount;
        });

        // 本月新增团队成员
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const monthlyNewMembers = await User.count({
            where: {
                parent_id: user.id,
                created_at: { [Op.gte]: startOfMonth }
            }
        });

        // 查找团队中的代理商库存（递归向上查找）
        let agentStockInfo = null;
        let currentUser = user;
        let maxDepth = 10; // 防止无限循环

        while (maxDepth > 0 && currentUser) {
            if (currentUser.role_level >= 3) {
                // 找到代理商
                agentStockInfo = {
                    agent_id: currentUser.id,
                    agent_nickname: currentUser.nickname,
                    stock_count: currentUser.stock_count || 0
                };
                break;
            }

            // 向上查找parent
            if (currentUser.parent_id) {
                currentUser = await User.findByPk(currentUser.parent_id);
            } else {
                break;
            }
            maxDepth--;
        }

        res.json({
            code: 0,
            data: {
                userInfo: {
                    id: user.id,
                    nickname: user.nickname,
                    avatar_url: user.avatar_url,
                    role: user.role_level,
                    role_name: roleName,
                    invite_code: user.invite_code,
                    stock_count: user.stock_count || 0,
                    inviter: inviter
                },
                stats: {
                    totalEarnings: totalEarnings.toFixed(2),
                    availableAmount: availableAmount.toFixed(2),
                    frozenAmount: frozenAmount.toFixed(2)
                },
                team: {
                    directCount,
                    indirectCount,
                    totalCount: directCount + indirectCount,
                    monthlyNewMembers,
                    agentStock: agentStockInfo
                }
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取团队成员列表
 */
async function getTeamMembers(req, res, next) {
    try {
        const user = req.user;
        const { level = 'direct', page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let whereCondition = {};

        if (level === 'direct') {
            // 直推成员
            whereCondition.parent_id = user.id;
        } else if (level === 'indirect') {
            // 间接成员（二级）
            const directIds = await User.findAll({
                where: { parent_id: user.id },
                attributes: ['id'],
                raw: true
            });
            if (directIds.length === 0) {
                return res.json({
                    code: 0,
                    data: { list: [], pagination: { total: 0, page: 1, limit: parseInt(limit), totalPages: 0 } }
                });
            }
            whereCondition.parent_id = { [Op.in]: directIds.map(d => d.id) };
        }

        const { count, rows } = await User.findAndCountAll({
            where: whereCondition,
            attributes: ['id', 'nickname', 'avatar_url', 'role_level', 'order_count', 'total_sales', 'created_at'],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // 脱敏处理
        const maskedList = rows.map(member => ({
            id: member.id,
            nickname: member.nickname ? member.nickname.charAt(0) + '***' : '用户***',
            avatar_url: member.avatar_url,
            role_level: member.role_level,
            order_count: member.order_count,
            total_sales: member.total_sales,
            joined_at: member.created_at
        }));

        res.json({
            code: 0,
            data: {
                list: maskedList,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(count / parseInt(limit))
                }
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取推广订单（通过我的推广产生的订单）
 */
async function getPromotionOrders(req, res, next) {
    try {
        const user = req.user;
        const { type = 'all', status, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let whereCondition = {};

        if (type === 'direct') {
            // 直接推广订单（我直推的人下的单）
            whereCondition.distributor_id = user.id;
        } else if (type === 'indirect') {
            // 间接推广订单（我二级下的单）
            const directIds = await User.findAll({
                where: { parent_id: user.id },
                attributes: ['id'],
                raw: true
            });
            if (directIds.length === 0) {
                return res.json({
                    code: 0,
                    data: { list: [], pagination: { total: 0, page: 1, limit: parseInt(limit), totalPages: 0 } }
                });
            }
            // 二级推广订单：买家的上级是我的直推
            whereCondition[Op.or] = directIds.map(d => ({
                '$buyer.parent_id$': d.id
            }));
        } else {
            // 全部推广订单
            whereCondition.distributor_id = user.id;
        }

        if (status) {
            whereCondition.status = status;
        }

        const { count, rows } = await Order.findAndCountAll({
            where: whereCondition,
            include: [
                {
                    model: User,
                    as: 'buyer',
                    attributes: ['id', 'nickname']
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'images']
                }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // 脱敏处理
        const maskedList = rows.map(order => ({
            id: order.id,
            order_no: order.order_no,
            buyer_nickname: order.buyer?.nickname ? order.buyer.nickname.charAt(0) + '***' : '用户***',
            product_name: order.product?.name,
            product_image: order.product?.images?.[0],
            total_amount: order.total_amount,
            status: order.status,
            created_at: order.created_at
        }));

        res.json({
            code: 0,
            data: {
                list: maskedList,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(count / parseInt(limit))
                }
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取工作台统计数据（与分销统计相同）
 */
async function getWorkbenchStats(req, res, next) {
    return getDistributionStats(req, res, next);
}

module.exports = {
    getDistributionStats,
    getWorkbenchStats,
    getTeamMembers,
    getPromotionOrders
};

