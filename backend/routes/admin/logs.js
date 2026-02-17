const express = require('express');
const router = express.Router();
const activityLogController = require('../../controllers/activityLogController');
const { authenticateAdmin } = require('../../middleware/auth');

/**
 * 活动日志路由
 * 需要管理员权限
 */

// 获取活动日志列表（支持分页、筛选）
router.get('/', authenticateAdmin, activityLogController.getActivityLogs);

// 获取日志统计信息
router.get('/statistics', authenticateAdmin, activityLogController.getLogStatistics);

// 导出日志（CSV/JSON）
router.get('/export', authenticateAdmin, activityLogController.exportLogs);

// 清理旧日志（管理功能）
router.delete('/cleanup', authenticateAdmin, activityLogController.cleanOldLogs);

module.exports = router;
