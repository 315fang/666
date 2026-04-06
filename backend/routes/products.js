const express = require('express');
const router = express.Router();
const { getProducts, getProductById, getProductSKUs } = require('../controllers/productController');
const { Review, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const { optionalAuth } = require('../middleware/auth');

// GET /api/products - 获取商品列表
router.get('/products', optionalAuth, getProducts);

// 兼容旧路径：GET /api/products/products - 获取商品列表
router.get('/products/products', optionalAuth, getProducts);

// GET /api/products/:id - 获取商品详情
router.get('/products/:id', optionalAuth, getProductById);

// GET /api/products/:id/skus - 获取商品SKU
router.get('/products/:id/skus', optionalAuth, getProductSKUs);

// GET /api/products/:id/reviews - 获取商品评价
router.get('/products/:id/reviews', async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10, featured, has_image } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
        const offset = (pageNum - 1) * limitNum;
        const where = { product_id: id, status: 1 };
        if (featured === '1' || featured === 'true') {
            where.is_featured = 1;
        }
        const queryOptions = {
            where,
            include: [{ model: User, as: 'user', attributes: ['nickname', 'avatar_url'] }],
            order: [['is_featured', 'DESC'], ['created_at', 'DESC']],
            offset,
            limit: limitNum
        };
        if (has_image === '1' || has_image === 'true') {
            queryOptions.where = {
                ...where,
                images: { [Op.ne]: null },
                [Op.and]: sequelize.literal('JSON_LENGTH(images) > 0')
            };
        }
        const { count, rows } = await Review.findAndCountAll(queryOptions);
        const list = rows.map((row) => {
            const plain = row.get ? row.get({ plain: true }) : row;
            const images = Array.isArray(plain.images) ? plain.images.filter(Boolean) : [];
            return {
                ...plain,
                images
            };
        });
        res.json({
            code: 0,
            data: {
                list,
                total: count,
                pagination: {
                    total: count,
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(count / limitNum),
                    has_more: offset + list.length < count
                }
            }
        });
    } catch (error) {
        console.error('获取商品评价失败:', error);
        res.json({
            code: 0,
            data: {
                list: [],
                total: 0,
                pagination: { total: 0, page: 1, limit: 10, totalPages: 0, has_more: false }
            }
        });
    }
});

module.exports = router;
