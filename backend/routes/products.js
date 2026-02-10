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

module.exports = router;
