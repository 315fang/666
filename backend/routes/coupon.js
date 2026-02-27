// backend/routes/coupon.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/couponController');

router.use(authenticate);

router.get('/mine', ctrl.getMyCoupons);            // 我的优惠券
router.get('/available', ctrl.getAvailableCoupons); // 结算页可用券

module.exports = router;
