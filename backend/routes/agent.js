const express = require('express');
const router = express.Router();
const {
    getWorkbench,
    getAgentOrderList,
    agentShip,
    restockOrder,
    getStockLogs
} = require('../controllers/agentController');
const { authenticate } = require('../middleware/auth');

// 所有接口需要登录
router.use(authenticate);

// GET /api/agent/workbench - 代理商工作台数据
router.get('/workbench', getWorkbench);

// GET /api/agent/orders - 代理商待处理订单
router.get('/orders', getAgentOrderList);

// POST /api/agent/ship/:id - 代理商自行发货
router.post('/ship/:id', agentShip);

// POST /api/agent/restock - 代理商采购入仓
router.post('/restock', restockOrder);

// GET /api/agent/stock-logs - 库存变动日志
router.get('/stock-logs', getStockLogs);

module.exports = router;
