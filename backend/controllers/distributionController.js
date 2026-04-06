const { User, CommissionLog, Order, Product, sequelize } = require('../models');
const { Op } = require('sequelize');
const MemberTierService = require('../services/MemberTierService');
const AgentWalletService = require('../services/AgentWalletService');
const { getWxaCodeUnlimited } = require('../utils/wechat');

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

        // 获取动态等级名称
        const roleName = await MemberTierService.getRoleName(user.role_level);
        const growthProgress = await MemberTierService.getGrowthProgress(user.growth_value || 0);

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
            if (item.status !== 'cancelled') {
                totalEarnings += amount;
            }
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

        // 查找团队中的代理商货款账户信息（递归向上查找）
        let agentGoodsFundInfo = null;
        let currentUser = user;
        let maxDepth = 10; // 防止无限循环

        while (maxDepth > 0 && currentUser) {
            if (currentUser.role_level >= 3) {
                // 找到代理商
                const walletAccount = await AgentWalletService.getAccount(currentUser.id);
                agentGoodsFundInfo = {
                    agent_id: currentUser.id,
                    agent_nickname: currentUser.nickname,
                    goods_fund_balance: parseFloat(walletAccount.balance || 0).toFixed(2)
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
                    growth_value: parseFloat(user.growth_value || 0),
                    discount_rate: parseFloat(user.discount_rate || 1),
                    growth_progress: growthProgress,
                    invite_code: user.invite_code,
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
                    agentGoodsFund: agentGoodsFundInfo
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
        const { level = '', keyword = '', role_level = '', page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const directMembers = await User.findAll({
            where: { parent_id: user.id },
            attributes: ['id'],
            raw: true
        });
        const directIds = directMembers.map(item => item.id);
        const normalizedLevel = level === '1' ? 'direct' : level === '2' ? 'indirect' : level;

        let whereCondition = {};
        if (normalizedLevel === 'direct') {
            whereCondition.parent_id = user.id;
        } else if (normalizedLevel === 'indirect') {
            if (directIds.length === 0) {
                return res.json({
                    code: 0,
                    data: { list: [], pagination: { total: 0, page: 1, limit: parseInt(limit), totalPages: 0 } }
                });
            }
            whereCondition.parent_id = { [Op.in]: directIds };
        } else if (directIds.length > 0) {
            whereCondition[Op.or] = [
                { parent_id: user.id },
                { parent_id: { [Op.in]: directIds } }
            ];
        } else {
            whereCondition.parent_id = user.id;
        }

        if (role_level !== undefined && role_level !== '') {
            whereCondition.role_level = parseInt(role_level);
        }
        if (keyword) {
            whereCondition[Op.and] = [
                ...(whereCondition[Op.and] || []),
                {
                    [Op.or]: [
                        { nickname: { [Op.like]: `%${keyword}%` } },
                        { phone: { [Op.like]: `%${keyword}%` } },
                        { member_no: { [Op.like]: `%${keyword}%` } }
                    ]
                }
            ];
        }

        const { count, rows } = await User.findAndCountAll({
            where: whereCondition,
            attributes: ['id', 'nickname', 'avatar_url', 'role_level', 'order_count', 'total_sales', 'created_at', 'member_no', 'parent_id', 'phone'],
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
            member_no: member.member_no,
            level: member.parent_id === user.id ? 1 : 2,
            joined_at: member.created_at,
            created_at: member.created_at
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

/**
 * 无限量小程序码：scene 与小程序首页解析约定一致（i=6位邀请码），新用户扫码打开小程序注册时自动绑定上级
 * GET /api/distribution/wxacode-invite  → image/png
 */
async function getInviteWxaCode(req, res, next) {
    try {
        const user = await User.findByPk(req.user.id, { attributes: ['id', 'invite_code'] });
        if (!user || !user.invite_code) {
            return res.status(400).json({
                code: -1,
                message: '暂无邀请码，请在管理后台分配邀请码后再试'
            });
        }
        const scene = `i=${user.invite_code}`;
        const png = await getWxaCodeUnlimited({
            scene,
            page: 'pages/index/index',
            width: 430
        });
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'private, max-age=120');
        return res.send(png);
    } catch (err) {
        console.error('[getInviteWxaCode]', err.message);
        return res.status(502).json({
            code: -1,
            message: err.message || '小程序码生成失败，请检查服务端微信配置与小程序是否已发布'
        });
    }
}

module.exports = {
    getDistributionStats,
    getWorkbenchStats,
    getTeamMembers,
    getPromotionOrders,
    getInviteWxaCode
};
