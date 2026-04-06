// backend/routes/activity.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/activityController');

// GET /api/activity/bubbles - 气泡通告数据（公开接口，无需登录）
router.get('/bubbles', ctrl.getBubbles);

// GET /api/activity/festival-config - 节日活动配置（公开接口）
router.get('/festival-config', ctrl.getFestivalConfig);
// GET /api/activity/global-ui-config - 全局UI配置（公开接口）
router.get('/global-ui-config', ctrl.getGlobalUiConfig);
// GET /api/activity/links - 活动链接配置（公开接口：Banner/常驻/限时）
router.get('/links', ctrl.getActivityLinksPublic);
// GET /api/activity/limited-spot/detail - 限时活动专享商品
router.get('/limited-spot/detail', ctrl.getLimitedSpotDetail);

module.exports = router;
