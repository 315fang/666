const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

// GET /api/user/profile - 获取用户详细信息
router.get('/user/profile', authenticate, userController.getUserProfile);

// PUT /api/user/profile - 修改昵称/头像
router.put('/user/profile', authenticate, userController.updateProfile);

router.get('/role', authenticate, userController.getUserRole);
router.post('/bind-parent', authenticate, userController.bindParent);
router.get('/notifications', authenticate, userController.getNotifications);
router.put('/notifications/:id/read', authenticate, userController.markNotificationRead);

module.exports = router;
