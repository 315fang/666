// backend/routes/pickup.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/pickupController');

router.use(authenticate);

// 用户：查看自提凭证（二维码+数字码）
router.get('/my/:order_id', ctrl.getPickupInfo);

// 工作人员核销（station claimant 使用）
router.post('/verify-code', ctrl.verifyByCode);   // 输入16位数字码
router.post('/verify-qr', ctrl.verifyByQr);       // 扫二维码

module.exports = router;
