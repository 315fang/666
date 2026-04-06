const { GroupActivity, Product, sequelize } = require('../../../models');
const { Op } = require('sequelize');

const buildGroupActivityTitle = (activity) => {
    const base = activity.product?.name || `拼团活动 #${activity.id}`;
    const members = activity.min_members || activity.required_members || 2;
    return `${base} ${members}人团`;
};

const serializeGroupActivity = (activity) => {
    const plain = activity.get ? activity.get({ plain: true }) : { ...activity };
    return {
        ...plain,
        name: buildGroupActivityTitle(plain),
        required_members: plain.min_members,
        sort_order: plain.sort_order || 0
    };
};

const normalizeMembers = (body = {}, fallback = {}) => {
    const minMembersRaw = body.min_members ?? body.required_members ?? fallback.min_members ?? fallback.required_members ?? 2;
    const maxMembersRaw = body.max_members ?? fallback.max_members ?? minMembersRaw;
    const minMembers = Math.max(2, parseInt(minMembersRaw, 10) || 2);
    const maxMembers = Math.max(minMembers, parseInt(maxMembersRaw, 10) || minMembers);
    return { min_members: minMembers, max_members: maxMembers };
};

const normalizeGroupActivityPayload = (body = {}, fallback = {}) => {
    const members = normalizeMembers(body, fallback);
    const payload = {
        ...members
    };

    if (body.product_id !== undefined) payload.product_id = parseInt(body.product_id, 10) || null;
    if (body.sku_id !== undefined) payload.sku_id = body.sku_id ? parseInt(body.sku_id, 10) : null;
    if (body.group_price !== undefined) payload.group_price = body.group_price;
    if (body.original_price !== undefined) payload.original_price = body.original_price || null;
    if (body.expire_hours !== undefined) payload.expire_hours = Math.max(1, parseInt(body.expire_hours, 10) || 24);
    if (body.stock_limit !== undefined) payload.stock_limit = Math.max(0, parseInt(body.stock_limit, 10) || 0);
    if (body.sold_count !== undefined) payload.sold_count = Math.max(0, parseInt(body.sold_count, 10) || 0);
    if (body.start_at !== undefined) payload.start_at = body.start_at || null;
    if (body.end_at !== undefined) payload.end_at = body.end_at || null;
    if (body.status !== undefined) payload.status = parseInt(body.status, 10) === 0 ? 0 : 1;

    return payload;
};

// 获取拼团活动列表
const getGroupActivities = async (req, res) => {
    try {
        const { status, keyword, page = 1, limit = 20 } = req.query;
        const where = {};

        if (status !== undefined && status !== '') where.status = parseInt(status);
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const include = [
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'images', 'retail_price'],
                required: !!keyword,
                where: keyword ? { name: { [Op.like]: `%${keyword}%` } } : undefined
            }
        ];

        const { count, rows } = await GroupActivity.findAndCountAll({
            where,
            include,
            distinct: true,
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows.map(serializeGroupActivity),
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
        res.json({ code: 0, data: serializeGroupActivity(activity) });
    } catch (error) {
        console.error('获取活动详情失败:', error);
        res.status(500).json({ code: -1, message: '获取详情失败' });
    }
};

// 创建拼团活动
const createGroupActivity = async (req, res) => {
    try {
        const payload = normalizeGroupActivityPayload(req.body);

        if (!payload.product_id || !payload.group_price || !payload.min_members) {
            return res.status(400).json({ code: -1, message: '商品、拼团价、成团人数必填' });
        }
        if (payload.original_price && parseFloat(payload.group_price) >= parseFloat(payload.original_price)) {
            return res.status(400).json({ code: -1, message: '拼团价必须低于原价' });
        }

        const linkedProduct = await Product.findByPk(payload.product_id, {
            attributes: ['id', 'status', 'enable_group_buy']
        });
        if (!linkedProduct || Number(linkedProduct.status) !== 1) {
            return res.status(400).json({ code: -1, message: '商品不存在或已下架' });
        }
        if (Number(linkedProduct.enable_group_buy) !== 1) {
            return res.status(400).json({
                code: -1,
                message: '请先在「商品管理 → 营销设置」中为该商品开启「参与拼团」，再创建拼团活动'
            });
        }

        const activity = await GroupActivity.create({
            ...payload,
            sold_count: payload.sold_count ?? 0,
            status: payload.status ?? 1
        });

        const detail = await GroupActivity.findByPk(activity.id, {
            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images', 'retail_price'] }]
        });

        res.json({ code: 0, data: serializeGroupActivity(detail || activity), message: '活动创建成功' });
    } catch (error) {
        console.error('创建拼团活动失败:', error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

// 更新拼团活动
const updateGroupActivity = async (req, res) => {
    try {
        const { id } = req.params;

        const activity = await GroupActivity.findByPk(id);
        if (!activity) {
            return res.status(404).json({ code: -1, message: '活动不存在' });
        }

        const updates = normalizeGroupActivityPayload(req.body, activity);
        const nextProductId = updates.product_id !== undefined ? updates.product_id : activity.product_id;
        if (nextProductId) {
            const linkedProduct = await Product.findByPk(nextProductId, {
                attributes: ['id', 'status', 'enable_group_buy']
            });
            if (!linkedProduct || Number(linkedProduct.status) !== 1) {
                return res.status(400).json({ code: -1, message: '商品不存在或已下架' });
            }
            if (Number(linkedProduct.enable_group_buy) !== 1) {
                return res.status(400).json({
                    code: -1,
                    message: '请先在商品营销设置中开启「参与拼团」'
                });
            }
        }
        await activity.update(updates);
        const detail = await GroupActivity.findByPk(id, {
            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images', 'retail_price'] }]
        });
        res.json({ code: 0, data: serializeGroupActivity(detail || activity), message: '更新成功' });
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
