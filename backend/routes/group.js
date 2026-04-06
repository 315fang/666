const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const ctrl = require('../controllers/groupController');

// 查看活动列表（商品详情页调用，无需登录）
router.get('/activities', ctrl.getActivitiesByProduct);

// 查看团次详情（分享页，可选登录，登录后显示当前用户状态）
router.get('/orders/:group_no', optionalAuth, ctrl.getGroupOrderDetail);

// 内部定时任务入口 — 需要管理员身份
const { adminAuth } = require('../middleware/adminAuth');
router.post('/check-expire', adminAuth, ctrl.checkExpiredGroups);

// 以下需要登录
router.use(authenticate);

router.post('/orders', ctrl.startGroupOrder);               // 发起拼团
router.post('/orders/:group_no/join', ctrl.joinGroupOrder); // 参团
router.get('/my', ctrl.getMyGroups);                        // 我的拼团

module.exports = router;
