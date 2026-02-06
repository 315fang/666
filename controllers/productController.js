const { Product, Category, SKU, Material } = require('../models');
const { Op } = require('sequelize');

/**
 * 获取商品列表
 */
async function getProducts(req, res, next) {
    try {
        const { category_id, keyword, page = 1, limit = 20 } = req.query;
        const where = { status: 1 };

        if (category_id) where.category_id = category_id;
        if (keyword) {
            where.name = { [Op.like]: `%${keyword}%` };
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Product.findAndCountAll({
            where,
            include: [
                { model: Category, as: 'category', attributes: ['id', 'name'] }
            ],
            order: [['createdAt', 'DESC']],
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
        next(error);
    }
}

/**
 * 获取商品详情（含SKU和素材）
 */
async function getProductById(req, res, next) {
    try {
        const { id } = req.params;

        const product = await Product.findByPk(id, {
            include: [
                { model: Category, as: 'category' },
                { model: SKU, as: 'skus', where: { status: 1 }, required: false },
                { model: Material, as: 'materials', where: { status: 1 }, required: false, limit: 10 }
            ]
        });

        if (!product || product.status !== 1) {
            return res.status(404).json({
                code: -1,
                message: '商品不存在或已下架'
            });
        }

        res.json({
            code: 0,
            data: product
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取商品SKU列表
 */
async function getProductSKUs(req, res, next) {
    try {
        const { id } = req.params;

        const skus = await SKU.findAll({
            where: { product_id: id, status: 1 },
            order: [['id', 'ASC']]
        });

        res.json({
            code: 0,
            data: skus
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getProducts,
    getProductById,
    getProductSKUs
};

