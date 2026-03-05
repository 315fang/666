// backend/routes/splash.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/splashController');

// 小程序端：获取激活配置（无需登录）
router.get('/active', ctrl.getActive);

module.exports = router;
