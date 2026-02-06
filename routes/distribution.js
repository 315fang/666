const express = require('express');
const router = express.Router();
const {
    getDistributionStats,
    getWorkbenchStats,
    getTeamMembers,
    getPromotionOrders
} = require('../controllers/distributionController');
const { authenticate } = require('../middleware/auth');

// GET /api/stats/distribution - 获取分销统计数据
router.get('/stats/distribution', authenticate, getDistributionStats);

// GET /api/stats/workbench - 获取工作台统计数据
router.get('/stats/workbench', authenticate, getWorkbenchStats);

// GET /api/team - 获取团队成员列表
router.get('/team', authenticate, getTeamMembers);

// GET /api/promotion/orders - 获取推广订单
router.get('/promotion/orders', authenticate, getPromotionOrders);

module.exports = router;

