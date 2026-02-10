const express = require('express');
const router = express.Router();
const {
    getPartnerData,
    partnerRecharge,
    getPartnerCertificate
} = require('../controllers/partnerController');
const { authenticate } = require('../middleware/auth');

// GET /api/partner - 获取合伙人数据
router.get('/partner', authenticate, getPartnerData);

// POST /api/partner/recharge - 合伙人补货充值
router.post('/partner/recharge', authenticate, partnerRecharge);

// GET /api/partner/cert - 获取合伙人证书数据
router.get('/partner/cert', authenticate, getPartnerCertificate);

module.exports = router;
