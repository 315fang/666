const express = require('express');
const router = express.Router();
const { createOrder, payOrder, getOrders } = require('../controllers/orderController');
const { authenticate } = require('../middleware/auth');
const { validateCreateOrder, validateIdParam, validatePagination } = require('../middleware/validate');

// POST /api/orders - 创建订单
router.post('/orders', authenticate, validateCreateOrder, createOrder);

// POST /api/orders/:id/pay - 支付订单
router.post('/orders/:id/pay', authenticate, validateIdParam, payOrder);

// GET /api/orders - 获取订单列表
router.get('/orders', authenticate, validatePagination, getOrders);

module.exports = router;
