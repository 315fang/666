const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

// 获取公开配置
router.get('/configs', configController.getPublicConfigs);

// 获取快捷入口
router.get('/quick-entries', configController.getQuickEntries);

// 获取首页区块配置
router.get('/home-sections', configController.getHomeSections);

// 获取完整首页配置（优化版，一次请求获取所有）
router.get('/homepage-config', configController.getHomePageConfig);

module.exports = router;
