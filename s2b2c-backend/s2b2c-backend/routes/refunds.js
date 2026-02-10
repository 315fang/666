const express = require('express');
const router = express.Router();
const {
    applyRefund,
    getRefunds,
    getRefundById,
    cancelRefund
} = require('../controllers/refundController');
const { authenticate } = require('../middleware/auth');

// 所有售后接口需要登录
router.use(authenticate);

// POST /api/refunds - 申请售后
router.post('/', applyRefund);

// GET /api/refunds - 获取售后列表
router.get('/', getRefunds);

// GET /api/refunds/:id - 获取售后详情
router.get('/:id', getRefundById);

// PUT /api/refunds/:id/cancel - 取消售后申请
router.put('/:id/cancel', cancelRefund);

module.exports = router;
