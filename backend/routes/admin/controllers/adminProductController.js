const { Product, Category, SKU, AppConfig, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const AIService = require('../../../services/AIService');
const CacheService = require('../../../services/CacheService');
const { normalizeProductCommissionRate } = require('../../../utils/commissionRates');
const { ensureNoTemporaryAssetUrls } = require('../../../utils/assetUrlAudit');
const { deleteAssetIfUnreferenced } = require('../../../services/AssetReferenceService');

const getProductGrowthReward = async (productId) => {
    const cfg = await AppConfig.findOne({ where: { config_key: `product_growth_reward_${productId}`, status: 1 } });
    return cfg ? parseFloat(cfg.config_value || 0) : null;
};

const setProductGrowthReward = async (productId, reward) => {
    const value = Number(reward);
    if (!Number.isFinite(value)) return;
    await AppConfig.upsert({
        config_key: `product_growth_reward_${productId}`,
        config_value: String(Math.max(0, value)),
        config_type: 'number',
        category: 'PRODUCT',
        description: '商品成长值奖励（下单支付后累计）',
        is_public: false,
        status: 1
    });
};

const invalidateProductDetailCache = async (productId) => {
    if (!productId) return;
    try {
        await CacheService.deleteProduct(productId);
    } catch (error) {
        console.warn(`[Cache] 商品详情缓存清理失败(product:${productId}):`, error.message);
    }
};

// 获取商品列表
const getProducts = async (req, res) => {
    try {
        const { status, category_id, keyword, page = 1, limit = 20 } = req.query;
        const where = {};

        if (status !== undefined) where.status = parseInt(status);
        if (category_id) where.category_id = category_id;
        if (keyword) {
            where.name = { [Op.like]: `%${keyword}%` };
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Product.findAndCountAll({
            where,
            include: [
                { model: Category, as: 'category', attributes: ['id', 'name'] },
                { model: SKU, as: 'skus' }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        const list = await Promise.all(rows.map(async (row) => {
            const item = row.toJSON();
            item.growth_value_reward = await getProductGrowthReward(item.id);
            return item;
        }));

        res.json({
            code: 0,
            data: {
                list,
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
            }
        });
    } catch (error) {
        console.error('获取商品列表失败:', error);
        res.status(500).json({ code: -1, message: '获取商品列表失败' });
    }
};

// 获取商品详情
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findByPk(id, {
            include: [
                { model: Category, as: 'category' },
                { model: SKU, as: 'skus' }
            ]
        });

        if (!product) {
            return res.status(404).json({ code: -1, message: '商品不存在' });
        }

        const data = product.toJSON();
        data.growth_value_reward = await getProductGrowthReward(data.id);
        res.json({ code: 0, data });
    } catch (error) {
        console.error('获取商品详情失败:', error);
        res.status(500).json({ code: -1, message: '获取商品详情失败' });
    }
};

// 创建商品
const createProduct = async (req, res) => {
    try {
        const {
            name, description, images, detail_images, category_id,
            retail_price, member_price, wholesale_price, price_member, price_leader, price_agent, cost_price, stock, skus,
            enable_coupon, enable_group_buy, custom_commissions,
            commission_rate_1, commission_rate_2, commission_amount_1, commission_amount_2, manual_weight, growth_value_reward,
            market_price, discount_exempt, product_tag, status, supports_pickup, visible_in_mall
        } = req.body;

        if (!name || retail_price === undefined || retail_price === null) {
            return res.status(400).json({ code: -1, message: '名称和零售价必填' });
        }
        if (cost_price === undefined || cost_price === null || Number(cost_price) <= 0) {
            return res.status(400).json({ code: -1, message: '成本价必填且需大于0' });
        }

        ensureNoTemporaryAssetUrls(images || [], '商品主图');
        ensureNoTemporaryAssetUrls(detail_images || [], '商品详情图');

        const cr1 = normalizeProductCommissionRate(commission_rate_1);
        const cr2 = normalizeProductCommissionRate(commission_rate_2);

        const product = await Product.create({
            name, description,
            images: images || [],
            detail_images: detail_images || [],
            category_id: category_id || null,
            retail_price,
            market_price: market_price || null,
            member_price: member_price || price_member || null,
            wholesale_price: wholesale_price || null,
            price_member: price_member || member_price || null,
            price_leader: price_leader || null,
            price_agent: price_agent || null,
            cost_price: Number(cost_price),
            stock: stock || 0,
            enable_coupon: enable_coupon ? 1 : 0,
            enable_group_buy: enable_group_buy ? 1 : 0,
            custom_commissions: custom_commissions ? 1 : 0,
            discount_exempt: !!discount_exempt,
            product_tag: product_tag || 'normal',
            commission_rate_1: cr1,
            commission_rate_2: cr2,
            commission_amount_1: commission_amount_1 || 0,
            commission_amount_2: commission_amount_2 || 0,
            manual_weight: manual_weight || 0,
            status: Number(status) === 0 ? 0 : 1,
            supports_pickup: supports_pickup ? 1 : 0,
            visible_in_mall: !(visible_in_mall === false || visible_in_mall === 0 || visible_in_mall === '0')
        });

        // 创建SKU
        if (skus && skus.length > 0) {
            for (const sku of skus) {
                await SKU.create({ ...sku, product_id: product.id });
            }
        }

        if (growth_value_reward !== undefined) {
            await setProductGrowthReward(product.id, growth_value_reward);
        }

        const result = await Product.findByPk(product.id, {
            include: [{ model: SKU, as: 'skus' }]
        });
        const out = result.toJSON();
        out.growth_value_reward = await getProductGrowthReward(product.id);
        await invalidateProductDetailCache(product.id);

        // ★ 触发AI审查 (异步执行，不阻塞响应)
        AIService.reviewContent(`${product.name}\n${product.description}`, 'product')
            .then(reviewResult => {
                if (!reviewResult.approved) {
                    console.warn(`[AI Review] Product ${product.id} flagged: ${reviewResult.reason}`);
                    product.update({
                        ai_review_status: 'rejected',
                        ai_review_reason: reviewResult.reason,
                        status: 0 // 自动下架违规商品
                    });
                } else {
                    product.update({
                        ai_review_status: 'approved',
                        ai_review_reason: 'Passed'
                    });
                }
            })
            .catch(err => console.error('[AI Review] Error:', err));

        res.json({ code: 0, data: out, message: '创建成功' });
    } catch (error) {
        console.error('创建商品失败:', error);
        res.status(error.statusCode || 500).json({ code: -1, message: error.message || '创建商品失败' });
    }
};

// 更新商品
const updateProduct = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const updates = req.body;

        const product = await Product.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!product) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '商品不存在' });
        }

        // 统一处理可能存在 null 的数据
        if (updates.enable_coupon !== undefined) updates.enable_coupon = updates.enable_coupon ? 1 : 0;
        if (updates.enable_group_buy !== undefined) updates.enable_group_buy = updates.enable_group_buy ? 1 : 0;
        if (updates.custom_commissions !== undefined) updates.custom_commissions = updates.custom_commissions ? 1 : 0;
        if (updates.supports_pickup !== undefined) updates.supports_pickup = updates.supports_pickup ? 1 : 0;
        if (updates.visible_in_mall !== undefined) {
            const v = updates.visible_in_mall;
            updates.visible_in_mall = v === true || v === 1 || v === '1';
        }
        const growthValueReward = updates.growth_value_reward;
        delete updates.growth_value_reward;

        // 确保 price_member 和 member_price 逻辑兼容
        if (updates.price_member !== undefined && updates.member_price === undefined) {
            updates.member_price = updates.price_member;
        }

        const finalCostPrice = updates.cost_price !== undefined ? Number(updates.cost_price) : Number(product.cost_price);
        if (!Number.isFinite(finalCostPrice) || finalCostPrice <= 0) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '成本价必填且需大于0' });
        }
        updates.cost_price = finalCostPrice;

        if (updates.images !== undefined) {
            ensureNoTemporaryAssetUrls(updates.images || [], '商品主图');
        }
        if (updates.detail_images !== undefined) {
            ensureNoTemporaryAssetUrls(updates.detail_images || [], '商品详情图');
        }

        if (updates.commission_rate_1 !== undefined) {
            updates.commission_rate_1 = normalizeProductCommissionRate(updates.commission_rate_1);
        }
        if (updates.commission_rate_2 !== undefined) {
            updates.commission_rate_2 = normalizeProductCommissionRate(updates.commission_rate_2);
        }

        await product.update(updates, { transaction: t });

        // ★ 更新SKU — 在事务内执行删除+重建，防止部分失败导致商品无SKU
        if (updates.skus) {
            await SKU.destroy({ where: { product_id: id }, transaction: t });
            for (const sku of updates.skus) {
                await SKU.create({ ...sku, product_id: id }, { transaction: t });
            }
        }

        await t.commit();

        if (growthValueReward !== undefined) {
            await setProductGrowthReward(id, growthValueReward);
        }

        await invalidateProductDetailCache(id);

        const out = product.toJSON();
        out.growth_value_reward = await getProductGrowthReward(id);
        res.json({ code: 0, data: out, message: '更新成功' });
    } catch (error) {
        await t.rollback();
        console.error('更新商品失败:', error);
        res.status(error.statusCode || 500).json({ code: -1, message: error.message || '更新商品失败' });
    }
};

// 更新商品状态（上下架）
const updateProductStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const product = await Product.findByPk(id);
        if (!product) {
            return res.status(404).json({ code: -1, message: '商品不存在' });
        }

        product.status = status;
        await product.save();
        await invalidateProductDetailCache(id);

        res.json({ code: 0, message: status === 1 ? '已上架' : '已下架' });
    } catch (error) {
        console.error('更新商品状态失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

// 获取类目列表
const getCategories = async (req, res) => {
    try {
        const categories = await Category.findAll({
            order: [['sort_order', 'DESC'], ['id', 'ASC']]
        });

        res.json({ code: 0, data: categories });
    } catch (error) {
        console.error('获取类目失败:', error);
        res.status(500).json({ code: -1, message: '获取类目失败' });
    }
};

// 创建类目
const createCategory = async (req, res) => {
    try {
        const { name, parent_id, icon, sort_order } = req.body;

        if (!name) {
            return res.status(400).json({ code: -1, message: '名称必填' });
        }

        const category = await Category.create({ name, parent_id, icon, sort_order, status: 1 });

        res.json({ code: 0, data: category, message: '创建成功' });
    } catch (error) {
        console.error('创建类目失败:', error);
        res.status(500).json({ code: -1, message: '创建类目失败' });
    }
};

// 更新类目
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const category = await Category.findByPk(id);
        if (!category) {
            return res.status(404).json({ code: -1, message: '类目不存在' });
        }

        await category.update(updates);

        res.json({ code: 0, data: category, message: '更新成功' });
    } catch (error) {
        console.error('更新类目失败:', error);
        res.status(500).json({ code: -1, message: '更新类目失败' });
    }
};

// 删除类目
const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const category = await Category.findByPk(id);
        if (!category) {
            return res.status(404).json({ code: -1, message: '类目不存在' });
        }

        // 检查是否有子类目
        const childCount = await Category.count({ where: { parent_id: id } });
        if (childCount > 0) {
            return res.status(400).json({ code: -1, message: '该类目下有子类目，无法删除' });
        }

        // 检查是否有关联商品
        const productCount = await Product.count({ where: { category_id: id } });
        if (productCount > 0) {
            return res.status(400).json({ code: -1, message: '该类目下有商品，无法删除' });
        }

        await category.destroy();

        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除类目失败:', error);
        res.status(500).json({ code: -1, message: '删除类目失败' });
    }
};

/**
 * 删除商品（下架状态才允许删除）
 */
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findByPk(id);
        if (!product) return res.status(404).json({ code: -1, message: '商品不存在' });
        if (product.status === 1) return res.status(400).json({ code: -1, message: '请先下架商品再删除' });

        const imageUrls = [
            ...(Array.isArray(product.images) ? product.images : []),
            ...(Array.isArray(product.detail_images) ? product.detail_images : [])
        ];

        await product.destroy();
        for (const url of new Set(imageUrls.filter(Boolean))) {
            await deleteAssetIfUnreferenced(url);
        }
        await invalidateProductDetailCache(id);
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除商品失败:', error);
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

module.exports = {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    updateProductStatus,
    deleteProduct,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
