const { User, Order, CommissionLog, Dealer } = require('../../../models');
const { Op } = require('sequelize');

// 获取用户列表
const getUsers = async (req, res) => {
    try {
        const { role_level, keyword, page = 1, limit = 20 } = req.query;
        const where = {};

        if (role_level !== undefined) where.role_level = parseInt(role_level);
        if (keyword) {
            where[Op.or] = [
                { nickname: { [Op.like]: `%${keyword}%` } },
                { openid: { [Op.like]: `%${keyword}%` } }
            ];
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await User.findAndCountAll({
            where,
            attributes: ['id', 'openid', 'nickname', 'avatar_url', 'role_level', 'balance', 'order_count', 'total_sales', 'createdAt'],
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
        console.error('获取用户列表失败:', error);
        res.status(500).json({ code: -1, message: '获取用户列表失败' });
    }
};

// 获取用户详情
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByPk(id, {
            include: [
                { model: User, as: 'parent', attributes: ['id', 'nickname'] },
                { model: Dealer, as: 'dealer' }
            ]
        });

        if (!user) {
            return res.status(404).json({ code: -1, message: '用户不存在' });
        }

        // 统计信息
        const orderCount = await Order.count({ where: { buyer_id: id } });
        const teamCount = await User.count({ where: { parent_id: id } });
        const totalCommission = await CommissionLog.sum('amount', { where: { user_id: id } }) || 0;

        res.json({
            code: 0,
            data: {
                ...user.toJSON(),
                stats: { orderCount, teamCount, totalCommission }
            }
        });
    } catch (error) {
        console.error('获取用户详情失败:', error);
        res.status(500).json({ code: -1, message: '获取用户详情失败' });
    }
};

// 更新用户角色
const updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role_level } = req.body;

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ code: -1, message: '用户不存在' });
        }

        user.role_level = role_level;
        await user.save();

        res.json({ code: 0, message: '角色更新成功' });
    } catch (error) {
        console.error('更新用户角色失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

// 获取用户团队
const getUserTeam = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await User.findAndCountAll({
            where: { parent_id: id },
            attributes: ['id', 'nickname', 'avatar_url', 'role_level', 'order_count', 'total_sales', 'createdAt'],
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
        console.error('获取用户团队失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

module.exports = {
    getUsers,
    getUserById,
    updateUserRole,
    getUserTeam
};
