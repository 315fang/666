const express = require('express');
const router = express.Router();
const {
    getWalletInfo,
    getCommissionLogs,
    getWithdrawals,
    applyWithdrawal
} = require('../controllers/walletController');
const { authenticate } = require('../middleware/auth');

// 所有钱包接口需要登录
router.use(authenticate);

// GET /api/wallet - 获取钱包信息
router.get('/', getWalletInfo);

// GET /api/wallet/commissions - 获取佣金明细
router.get('/commissions', getCommissionLogs);

// GET /api/wallet/withdrawals - 获取提现记录
router.get('/withdrawals', getWithdrawals);

// POST /api/wallet/withdraw - 申请提现
router.post('/withdraw', applyWithdrawal);

module.exports = router;
