const { Product, Category, SKU, Material } = require('../models');
const { Op } = require('sequelize');
const PricingService = require('../services/PricingService');
const CacheService = require('../services/CacheService');
const MemberTierService = require('../services/MemberTierService');
const { MALL_LIST_WHERE } = require('../utils/productMallVisibility');

/**
 * 获取商品列表
 */
async function getProducts(req, res, next) {
    try {
        const { category_id, keyword, page = 1, limit = 20, sort } = req.query;
        const where = { status: 1, ...MALL_LIST_WHERE };

        if (category_id) where.category_id = category_id;
        if (keyword) {
            const escaped = keyword.replace(/[%_\\]/g, ch => '\\' + ch);
            where.name = { [Op.like]: `%${escaped}%` };
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        let order = [['created_at', 'DESC']];
        if (sort === 'hot') order = [['heat_score', 'DESC'], ['purchase_count', 'DESC'], ['created_at', 'DESC']];
        else if (sort === 'sales') order = [['purchase_count', 'DESC'], ['created_at', 'DESC']];
        else if (sort === 'price_asc') order = [['retail_price', 'ASC']];
        else if (sort === 'price_desc') order = [['retail_price', 'DESC']];

        const { count, rows } = await Product.findAndCountAll({
            where,
            include: [
                { model: Category, as: 'category', attributes: ['id', 'name'] }
            ],
            order,
            offset,
            limit: parseInt(limit)
        });

        // 获取用户角色/拿货等级，计算动态价格
        const roleLevel = req.user ? req.user.role_level : 0;
        const purchaseLevel = req.user
            ? await MemberTierService.getPurchaseLevelByCode(req.user.purchase_level_code)
            : null;

        // 应付单价（含会员/全场折，与下单一致）
        const productsWithPrice = await Promise.all(
            rows.map(async (product) => {
                const plainProduct = product.toJSON();
                plainProduct.displayPrice = await PricingService.calculatePayableUnitPrice(
                    plainProduct,
                    null,
                    roleLevel,
                    purchaseLevel
                );
                return plainProduct;
            })
        );

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
            const purchaseLevel = req.user
                ? await MemberTierService.getPurchaseLevelByCode(req.user.purchase_level_code)
                : null;
            cached.displayPrice = await PricingService.calculatePayableUnitPrice(
                cached,
                null,
                roleLevel,
                purchaseLevel
            );
            if (cached.skus && cached.skus.length > 0) {
                cached.skus = await Promise.all(
                    cached.skus.map(async (sku) => ({
                        ...sku,
                        displayPrice: await PricingService.calculatePayableUnitPrice(
                            cached,
                            sku,
                            roleLevel,
                            purchaseLevel
                        )
                    }))
                );
            }

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
        const purchaseLevel = req.user
            ? await MemberTierService.getPurchaseLevelByCode(req.user.purchase_level_code)
            : null;
        plainProduct.displayPrice = await PricingService.calculatePayableUnitPrice(
            plainProduct,
            null,
            roleLevel,
            purchaseLevel
        );

        if (plainProduct.skus && plainProduct.skus.length > 0) {
            plainProduct.skus = await Promise.all(
                plainProduct.skus.map(async (sku) => ({
                    ...sku,
                    displayPrice: await PricingService.calculatePayableUnitPrice(
                        plainProduct,
                        sku,
                        roleLevel,
                        purchaseLevel
                    )
                }))
            );
        }

        // 缓存商品信息（30分钟）
        await CacheService.cacheProduct(id, plainProduct, CacheService.TTL.LONG);

        // ★ Phase 5：异步增加浏览次数（不阻塞响应）
        setImmediate(() => {
            Product.increment('view_count', { where: { id }, by: 1 }).catch(() => { });
        });

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
