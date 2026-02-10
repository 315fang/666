const express = require('express');
const router = express.Router();
const {
    applyDealer,
    getDealerInfo,
    getDealerStats,
    getDealerTeam,
    getDealerOrders
} = require('../controllers/dealerController');
const { authenticate } = require('../middleware/auth');

// 所有接口需要登录
router.use(authenticate);

// POST /api/dealer/apply - 申请成为经销商
router.post('/apply', applyDealer);

// GET /api/dealer/info - 获取经销商信息
router.get('/info', getDealerInfo);

// GET /api/dealer/stats - 经销商统计数据
router.get('/stats', getDealerStats);

// GET /api/dealer/team - 团队成员
router.get('/team', getDealerTeam);

// GET /api/dealer/orders - 团队订单
router.get('/orders', getDealerOrders);

module.exports = router;
