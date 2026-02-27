const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/pointController');

// 所有积分接口需要登录
router.use(authenticate);

router.get('/account', ctrl.getAccount);       // 我的积分账户+等级
router.get('/balance', ctrl.getAccount);       // 别名：余额查询（首页用）
router.get('/logs', ctrl.getLogs);             // 积分流水
router.post('/checkin', ctrl.checkin);         // 每日签到（原接口）
router.post('/sign-in', ctrl.checkin);         // 别名：签到（前端用）
router.get('/sign-in/status', ctrl.getCheckinStatus); // 今日是否已签到
router.get('/tasks', ctrl.getTasks);           // 任务中心
router.get('/levels', ctrl.getLevels);         // 等级特权说明

module.exports = router;
