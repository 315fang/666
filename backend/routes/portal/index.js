const express = require('express');
const router = express.Router();
const { authenticatePortal } = require('../../middleware/portalAuth');
const { User, Order, CommissionLog, PortalAccount } = require('../../models');
const { Op } = require('sequelize');
const agentController = require('../../controllers/agentController');
const distributionController = require('../../controllers/distributionController');
const walletController = require('../../controllers/walletController');
const orderController = require('../../controllers/orderController');
const CommissionService = require('../../services/CommissionService');
const stationController = require('../../controllers/stationController');
const pickupController = require('../../controllers/pickupController');

router.use(authenticatePortal);
router.use((req, res, next) => {
    req.user = req.portalUser;
    req.openid = req.portalUser?.openid;
    next();
});

router.get('/dashboard/summary', async (req, res) => {
    try {
        const user = req.portalUser;
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const [teamCount, orderCount, commission, account] = await Promise.all([
            User.count({ where: { parent_id: user.id } }),
            Order.count({ where: { buyer_id: user.id, created_at: { [Op.gte]: monthStart } } }),
            CommissionLog.sum('amount', {
                where: {
                    user_id: user.id,
                    created_at: { [Op.gte]: monthStart },
                    status: { [Op.in]: ['frozen', 'pending_approval', 'approved', 'settled'] }
                }
            }),
            PortalAccount.findOne({ where: { user_id: user.id } })
        ]);

        res.json({
            code: 0,
            data: {
                team_count: teamCount,
                month_orders: orderCount,
                month_commission: parseFloat(commission || 0).toFixed(2),
                stock_count: user.stock_count || 0,
                debt_amount: parseFloat(user.debt_amount || 0).toFixed(2),
                wallet_balance: parseFloat(user.balance || 0).toFixed(2),
                must_change_password: !!account?.must_change_password
            }
        });
    } catch (error) {
        console.error('获取门户汇总失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
});

router.get('/agent/workbench', agentController.getWorkbench);
router.get('/agent/orders', agentController.getAgentOrderList);
router.post('/agent/ship/:id', agentController.agentShip);
router.post('/agent/restock', agentController.restockOrder);
router.get('/agent/stock-logs', agentController.getStockLogs);

router.get('/distribution/stats', distributionController.getDistributionStats);
router.get('/distribution/team', distributionController.getTeamMembers);
router.get('/distribution/team/:id', distributionController.getTeamMemberDetail);

router.get('/wallet', walletController.getWalletInfo);
router.get('/wallet/info', walletController.getWalletInfo);
router.get('/wallet/commissions', walletController.getCommissionLogs);
router.get('/wallet/withdrawals', walletController.getWithdrawals);
router.post('/wallet/withdraw', walletController.applyWithdrawal);

router.get('/commissions/my-stats', async (req, res, next) => {
    try {
        const stats = await CommissionService.getUserCommissionStats(req.user.id);
        res.json({ code: 0, data: stats });
    } catch (error) {
        next(error);
    }
});

router.post('/orders/:id/agent-confirm', orderController.agentConfirmOrder);

router.get('/branch/my-claims', stationController.getMyClaims);
router.post('/branch/stations/:id/claim', stationController.applyClaim);
router.post('/pickup/verify-code', pickupController.verifyByCode);
router.post('/pickup/verify-qr', pickupController.verifyByQr);

module.exports = router;
