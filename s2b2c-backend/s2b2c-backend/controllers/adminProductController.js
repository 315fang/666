const { Product, Category, SKU } = require('../../../models');
const { Op } = require('sequelize');

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

        res.json({ code: 0, data: product });
    } catch (error) {
        console.error('获取商品详情失败:', error);
        res.status(500).json({ code: -1, message: '获取商品详情失败' });
    }
};

// 创建商品
const createProduct = async (req, res) => {
    try {
        const { name, description, images, category_id, retail_price, member_price, wholesale_price, stock, skus } = req.body;

        if (!name || !retail_price) {
            return res.status(400).json({ code: -1, message: '名称和零售价必填' });
        }

        const product = await Product.create({
            name, description, images, category_id,
            retail_price, member_price, wholesale_price, stock,
            status: 1
        });

        // 创建SKU
        if (skus && skus.length > 0) {
            for (const sku of skus) {
                await SKU.create({ ...sku, product_id: product.id });
            }
        }

        const result = await Product.findByPk(product.id, {
            include: [{ model: SKU, as: 'skus' }]
        });

        res.json({ code: 0, data: result, message: '创建成功' });
    } catch (error) {
        console.error('创建商品失败:', error);
        res.status(500).json({ code: -1, message: '创建商品失败' });
    }
};

// 更新商品
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const product = await Product.findByPk(id);
        if (!product) {
            return res.status(404).json({ code: -1, message: '商品不存在' });
        }

        await product.update(updates);

        // 更新SKU（如果有）
        if (updates.skus) {
            await SKU.destroy({ where: { product_id: id } });
            for (const sku of updates.skus) {
                await SKU.create({ ...sku, product_id: id });
            }
        }

        res.json({ code: 0, data: product, message: '更新成功' });
    } catch (error) {
        console.error('更新商品失败:', error);
        res.status(500).json({ code: -1, message: '更新商品失败' });
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

module.exports = {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    updateProductStatus,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
