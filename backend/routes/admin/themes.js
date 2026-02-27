const express = require('express');
const router = express.Router();
const themeController = require('../../controllers/themeController');
const { authenticateAdmin } = require('../../middleware/auth');

/**
 * 主题管理路由
 * 需要管理员权限
 */

// 获取所有主题列表
router.get('/', authenticateAdmin, themeController.getThemes);

// 获取当前激活主题
router.get('/active', themeController.getActiveTheme);

// 切换主题（核心功能）
router.post('/switch', authenticateAdmin, themeController.switchTheme);

// 创建新主题
router.post('/', authenticateAdmin, themeController.createTheme);

// 更新主题配置
router.put('/:id', authenticateAdmin, themeController.updateTheme);

// 删除主题
router.delete('/:id', authenticateAdmin, themeController.deleteTheme);

// 自动切换主题（由定时任务调用，需管理员权限）
router.post('/auto-switch', authenticateAdmin, themeController.autoSwitchTheme);

module.exports = router;
