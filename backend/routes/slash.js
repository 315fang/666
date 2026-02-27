// backend/routes/slash.js
const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const ctrl = require('../controllers/slashController');

// 活动列表（无需登录）
router.get('/activities', ctrl.getActivities);

// 砍价详情（可选登录，登录后显示hasHelped）
router.get('/:slash_no', optionalAuth, ctrl.getDetail);

// 以下需要登录
router.use(authenticate);
router.post('/start', ctrl.startSlash);           // 发起砍价
router.post('/:slash_no/help', ctrl.helpSlash);   // 帮砍一刀
router.get('/my/list', ctrl.getMy);               // 我的砍价记录

module.exports = router;
