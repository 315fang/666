const express = require('express');
const router = express.Router();
const { getProducts, getProductById, getProductSKUs } = require('../controllers/productController');
const { optionalAuth } = require('../middleware/auth');

// GET /api/products - 获取商品列表
router.get('/products', optionalAuth, getProducts);

// GET /api/products/:id - 获取商品详情
router.get('/products/:id', optionalAuth, getProductById);

// GET /api/products/:id/skus - 获取商品SKU
router.get('/products/:id/skus', optionalAuth, getProductSKUs);

// GET /api/products/:id/reviews - 获取商品评价（占位，待扩展）
router.get('/products/:id/reviews', (req, res) => {
    res.json({ code: 0, data: { list: [], total: 0 } });
});

module.exports = router;
