// backend/routes/logistics.js
const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const ctrl = require('../controllers/logisticsController');

// 通过订单ID查询（需要登录，验证订单归属）
router.get('/order/:order_id', authenticate, ctrl.getByOrder);

// 通过运单号直接查询（公开，用于分享场景）
router.get('/:tracking_no', ctrl.getByTrackingNo);

// 强制刷新（需要登录，防止滥用）
router.post('/:tracking_no/refresh', authenticate, ctrl.forceRefresh);

module.exports = router;
