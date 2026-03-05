const { GroupActivity, Product, sequelize } = require('../../../models');
const { Op } = require('sequelize');

// 获取拼团活动列表
const getGroupActivities = async (req, res) => {
    try {
        const { status, keyword, page = 1, limit = 20 } = req.query;
        const where = {};

        if (status !== undefined && status !== '') where.status = parseInt(status);
        if (keyword) {
            where.name = { [Op.like]: `%${keyword}%` };
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await GroupActivity.findAndCountAll({
            where,
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'images', 'retail_price'] }
            ],
            order: [['created_at', 'DESC']],
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
        console.error('获取拼团活动列表失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 获取单个拼团活动详情
const getGroupActivityById = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await GroupActivity.findByPk(id, {
            include: [{ model: Product, as: 'product' }]
        });

        if (!activity) {
            return res.status(404).json({ code: -1, message: '活动不存在' });
        }
        res.json({ code: 0, data: activity });
    } catch (error) {
        console.error('获取活动详情失败:', error);
        res.status(500).json({ code: -1, message: '获取详情失败' });
    }
};

// 创建拼团活动
const createGroupActivity = async (req, res) => {
    try {
        const { product_id, sku_id, name, group_price, required_members, expire_hours, stock_limit, start_at, end_at, sort_order, status } = req.body;

        if (!product_id || !name || !group_price || !required_members) {
            return res.status(400).json({ code: -1, message: '必填字段缺失' });
        }

        const activity = await GroupActivity.create({
            product_id,
            sku_id: sku_id || null,
            name,
            group_price,
            required_members,
            expire_hours: expire_hours || 24,
            stock_limit: stock_limit || 0,
            sold_count: 0,
            start_at: start_at || null,
            end_at: end_at || null,
            sort_order: sort_order || 0,
            status: status !== undefined ? status : 1
        });

        res.json({ code: 0, data: activity, message: '活动创建成功' });
    } catch (error) {
        console.error('创建拼团活动失败:', error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

// 更新拼团活动
const updateGroupActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const activity = await GroupActivity.findByPk(id);
        if (!activity) {
            return res.status(404).json({ code: -1, message: '活动不存在' });
        }

        await activity.update(updates);
        res.json({ code: 0, data: activity, message: '更新成功' });
    } catch (error) {
        console.error('更新拼团活动失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

// 删除活动
const deleteGroupActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await GroupActivity.findByPk(id);
        if (!activity) {
            return res.status(404).json({ code: -1, message: '活动不存在' });
        }
        await activity.destroy();
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除拼团活动失败:', error);
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

module.exports = {
    getGroupActivities,
    getGroupActivityById,
    createGroupActivity,
    updateGroupActivity,
    deleteGroupActivity
};
