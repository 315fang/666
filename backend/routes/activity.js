// backend/routes/activity.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/activityController');

// GET /api/activity/bubbles - 气泡通告数据（公开接口，无需登录）
router.get('/bubbles', ctrl.getBubbles);

// GET /api/activity/festival-config - 节日活动配置（公开接口）
router.get('/festival-config', (req, res) => {
    res.json({
        code: 0,
        data: {
            active: false,
            festival_name: '',
            start_time: null,
            end_time: null,
            banner_image: '',
            description: ''
        }
    });
});

module.exports = router;
