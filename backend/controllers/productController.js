const { Product, Category, SKU, Material } = require('../models');
const { Op } = require('sequelize');
const PricingService = require('../services/PricingService');
const CacheService = require('../services/CacheService');

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
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // 获取用户角色，计算动态价格
        const roleLevel = req.user ? req.user.role_level : 0;

        // 为每个商品添加动态价格
        const productsWithPrice = rows.map(product => {
            const plainProduct = product.toJSON();
            plainProduct.displayPrice = PricingService.calculateDisplayPrice(
                plainProduct,
                null,
                roleLevel
            );
            return plainProduct;
        });

        res.json({
            code: 0,
            data: {
                list: productsWithPrice,
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

        // 尝试从缓存获取
        const cached = await CacheService.getProduct(id);
        if (cached) {
            // 即使有缓存，也要根据当前用户角色计算价格
            const roleLevel = req.user ? req.user.role_level : 0;
            cached.displayPrice = PricingService.calculateDisplayPrice(
                cached,
                null,
                roleLevel
            );

            return res.json({
                code: 0,
                data: cached,
                source: 'cache'
            });
        }

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

        const plainProduct = product.toJSON();

        // 计算动态价格
        const roleLevel = req.user ? req.user.role_level : 0;
        plainProduct.displayPrice = PricingService.calculateDisplayPrice(
            plainProduct,
            null,
            roleLevel
        );

        // 为每个SKU也计算动态价格
        if (plainProduct.skus && plainProduct.skus.length > 0) {
            plainProduct.skus = plainProduct.skus.map(sku => ({
                ...sku,
                displayPrice: PricingService.calculateDisplayPrice(plainProduct, sku, roleLevel)
            }));
        }

        // 缓存商品信息（30分钟）
        await CacheService.cacheProduct(id, plainProduct, CacheService.TTL.LONG);

        res.json({
            code: 0,
            data: plainProduct,
            source: 'database'
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

