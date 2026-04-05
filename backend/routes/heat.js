// backend/routes/heat.js
/**
 * 热度管理路由（仅后台）
 * 后台路由均通过 /admin/api/heat 挂载
 */
const express = require('express');
const router = express.Router();
const { authenticateAdmin: requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/adminHeatController');

// 后台管理（需要 Admin 权限）
router.get('/', requireAdmin, ctrl.getHeatRanking);                     // 热度榜管理列表
router.post('/refresh', requireAdmin, ctrl.refreshAllHeat);             // 批量刷新热度
router.post('/product/:id', requireAdmin, ctrl.setManualWeight);        // 设置商品手动权重

module.exports = router;
