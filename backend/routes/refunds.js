const express = require('express');
const router = express.Router();
const {
    applyRefund,
    getRefunds,
    getRefundById,
    cancelRefund,
    submitReturnShipping
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

// PUT /api/refunds/:id/return-shipping - 用户提交退货物流
router.put('/:id/return-shipping', submitReturnShipping);

module.exports = router;
