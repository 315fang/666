// backend/routes/activity.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/activityController');

// GET /api/activity/bubbles - 气泡通告数据（公开接口，无需登录）
router.get('/bubbles', ctrl.getBubbles);

module.exports = router;
