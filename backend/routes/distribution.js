const express = require('express');
const router = express.Router();
const {
    getDistributionStats,
    getWorkbenchStats,
    getTeamMembers,
    getTeamMemberDetail,
    getPromotionOrders,
    getInviteWxaCode
} = require('../controllers/distributionController');
const { authenticate } = require('../middleware/auth');

// GET /api/stats/distribution - 获取分销统计数据（原路径兼容）
router.get('/stats/distribution', authenticate, getDistributionStats);

// GET /api/distribution/overview - 个人中心用的简要分销数据
router.get('/distribution/overview', authenticate, getDistributionStats);

// GET /api/stats/workbench - 获取工作台统计数据
router.get('/stats/workbench', authenticate, getWorkbenchStats);

// GET /api/distribution/team - 获取团队成员列表
router.get('/distribution/team', authenticate, getTeamMembers);

// GET /api/distribution/team/:id - 获取团队成员详情
router.get('/distribution/team/:id', authenticate, getTeamMemberDetail);

// GET /api/distribution/stats - 团队页面的统计
router.get('/distribution/stats', authenticate, getDistributionStats);

// GET /api/distribution/wxacode-invite — 带邀请 scene 的无限量小程序码（PNG）
router.get('/distribution/wxacode-invite', authenticate, getInviteWxaCode);

// GET /api/team - 兼容旧路径
router.get('/team', authenticate, getTeamMembers);

// GET /api/promotion/orders - 获取推广订单
router.get('/promotion/orders', authenticate, getPromotionOrders);

module.exports = router;

