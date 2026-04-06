const express = require('express');
const router = express.Router();
const {
    getWorkbench,
    getAgentOrderList,
    agentShip,
    restockOrder,
    getStockLogs,
    getWalletInfo,
    getRechargeOrderDetail,
    rechargeWallet,
    prepayWalletRecharge,
    getWalletLogs,
    getPortalToken
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

// POST /api/agent/restock - 代理商货款充值（兼容旧路径）
router.post('/restock', restockOrder);

// GET /api/agent/stock-logs - 货款流水（兼容旧路径）
router.get('/stock-logs', getStockLogs);
// 货款账户
router.get('/wallet', getWalletInfo);
router.get('/wallet/recharge-orders/:id', getRechargeOrderDetail);
router.post('/wallet/recharge', rechargeWallet);
router.post('/wallet/prepay', prepayWalletRecharge);
router.get('/wallet/logs', getWalletLogs);
router.get('/wallet/recharge-config', async (req, res) => {
    try {
        const { AppConfig } = require('../models');
        const row = await AppConfig.findOne({ where: { config_key: 'agent_system_recharge_config', status: 1 } });
        const defaults = { preset_amounts: [100, 300, 500, 1000, 2000, 5000], bonus_enabled: false, bonus_tiers: [] };
        let data = defaults;
        if (row?.config_value) {
            try { data = { ...defaults, ...JSON.parse(row.config_value) }; } catch (_) {}
        }
        res.json({ code: 0, data });
    } catch (e) { res.status(500).json({ code: -1, message: e.message }); }
});
router.get('/portal-token', getPortalToken);

module.exports = router;
