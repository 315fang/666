const { Material } = require('../../../models');
const { Op } = require('sequelize');

// 获取素材列表
const getMaterials = async (req, res) => {
    try {
        const { type, category, keyword, page = 1, limit = 20 } = req.query;
        const where = {};

        if (type) where.type = type;
        if (category) where.category = category;
        if (keyword) {
            where.title = { [Op.like]: `%${keyword}%` };
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Material.findAndCountAll({
            where,
            order: [['sort_order', 'DESC'], ['created_at', 'DESC']],
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
        console.error('获取素材列表失败:', error);
        res.status(500).json({ code: -1, message: '获取素材列表失败' });
    }
};

// 获取素材详情
const getMaterialById = async (req, res) => {
    try {
        const { id } = req.params;
        const material = await Material.findByPk(id);

        if (!material) {
            return res.status(404).json({ code: -1, message: '素材不存在' });
        }

        res.json({ code: 0, data: material });
    } catch (error) {
        console.error('获取素材详情失败:', error);
        res.status(500).json({ code: -1, message: '获取素材详情失败' });
    }
};

// 创建素材
const createMaterial = async (req, res) => {
    try {
        const { type, title, description, url, thumbnail_url, product_id, category, tags, sort_order } = req.body;

        if (!type || !title) {
            return res.status(400).json({ code: -1, message: '类型和标题必填' });
        }

        const material = await Material.create({
            type, title, description, url, thumbnail_url,
            product_id, category, tags, sort_order,
            status: 1
        });

        res.json({ code: 0, data: material, message: '创建成功' });
    } catch (error) {
        console.error('创建素材失败:', error);
        res.status(500).json({ code: -1, message: '创建素材失败' });
    }
};

// 更新素材
const updateMaterial = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const material = await Material.findByPk(id);
        if (!material) {
            return res.status(404).json({ code: -1, message: '素材不存在' });
        }

        await material.update(updates);

        res.json({ code: 0, data: material, message: '更新成功' });
    } catch (error) {
        console.error('更新素材失败:', error);
        res.status(500).json({ code: -1, message: '更新素材失败' });
    }
};

// 删除素材
const deleteMaterial = async (req, res) => {
    try {
        const { id } = req.params;

        const material = await Material.findByPk(id);
        if (!material) {
            return res.status(404).json({ code: -1, message: '素材不存在' });
        }

        await material.destroy();

        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除素材失败:', error);
        res.status(500).json({ code: -1, message: '删除素材失败' });
    }
};

module.exports = {
    getMaterials,
    getMaterialById,
    createMaterial,
    updateMaterial,
    deleteMaterial
};
