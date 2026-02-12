const express = require('express');
const router = express.Router();
const multer = require('multer');
const userController = require('../controllers/userController');
const adminUploadController = require('./admin/controllers/adminUploadController');
const { authenticate } = require('../middleware/auth');

// 配置 multer
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// GET /api/user/profile - 获取用户详细信息
router.get('/user/profile', authenticate, userController.getUserProfile);

// PUT /api/user/profile - 修改昵称/头像
router.put('/user/profile', authenticate, userController.updateProfile);

// POST /api/user/upload - 用户上传头像
router.post('/user/upload', authenticate, upload.single('file'), adminUploadController.upload);

router.get('/role', authenticate, userController.getUserRole);
router.post('/bind-parent', authenticate, userController.bindParent);
router.get('/notifications', authenticate, userController.getNotifications);
router.put('/notifications/:id/read', authenticate, userController.markNotificationRead);

module.exports = router;
