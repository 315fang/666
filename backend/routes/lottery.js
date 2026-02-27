// backend/routes/lottery.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/lotteryController');

router.use(authenticate);

router.get('/prizes', ctrl.getPrizes);     // 奖品池展示
router.post('/draw', ctrl.draw);           // 执行抽奖
router.get('/records', ctrl.getRecords);   // 我的中奖记录

module.exports = router;
