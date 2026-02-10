const { Material, Product } = require('../models');
const { Op } = require('sequelize');

// 获取素材列表
const getMaterials = async (req, res) => {
    try {
        const {
            type,           // 素材类型: image/video/text/poster
            category,       // 素材分类: product/activity/brand
            product_id,
            keyword,
            page = 1,
            limit = 20
        } = req.query;

        const where = { status: 1 };

        if (type) where.type = type;
        if (category) where.category = category;
        if (product_id) where.product_id = product_id;
        if (keyword) {
            where[Op.or] = [
                { title: { [Op.like]: `%${keyword}%` } },
                { description: { [Op.like]: `%${keyword}%` } },
                { tags: { [Op.like]: `%${keyword}%` } }
            ];
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Material.findAndCountAll({
            where,
            include: [{
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'images'],
                required: false
            }],
            order: [['sort_order', 'DESC'], ['created_at', 'DESC']],
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
        console.error('获取素材列表失败:', error);
        res.status(500).json({ code: -1, message: '获取素材列表失败' });
    }
};

// 获取素材详情
const getMaterialById = async (req, res) => {
    try {
        const { id } = req.params;

        const material = await Material.findByPk(id, {
            include: [{
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'images', 'retail_price']
            }]
        });

        if (!material || material.status !== 1) {
            return res.status(404).json({ code: -1, message: '素材不存在' });
        }

        // 增加下载计数
        await material.increment('download_count');

        res.json({
            code: 0,
            data: material
        });
    } catch (error) {
        console.error('获取素材详情失败:', error);
        res.status(500).json({ code: -1, message: '获取素材详情失败' });
    }
};

// 按商品获取素材
const getMaterialsByProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const { type } = req.query;

        const where = {
            product_id: productId,
            status: 1
        };

        if (type) where.type = type;

        const materials = await Material.findAll({
            where,
            order: [['sort_order', 'DESC'], ['created_at', 'DESC']]
        });

        res.json({
            code: 0,
            data: materials
        });
    } catch (error) {
        console.error('获取商品素材失败:', error);
        res.status(500).json({ code: -1, message: '获取商品素材失败' });
    }
};

module.exports = {
    getMaterials,
    getMaterialById,
    getMaterialsByProduct
};
