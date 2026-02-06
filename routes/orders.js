const express = require('express');
const router = express.Router();
const { createOrder, payOrder, getOrders } = require('../controllers/orderController');
const { authenticate } = require('../middleware/auth');

// POST /api/orders - 创建订单
router.post('/orders', authenticate, createOrder);

// POST /api/orders/:id/pay - 支付订单
router.post('/orders/:id/pay', authenticate, payOrder);

// GET /api/orders - 获取订单列表
router.get('/orders', authenticate, getOrders);

module.exports = router;
