const express = require('express');
const router = express.Router();
const multer = require('multer');
const userController = require('../controllers/userController');
const favoriteController = require('../controllers/favoriteController');
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
router.post(
    '/user/upload',
    authenticate,
    upload.single('file'),
    (req, res, next) => {
        req.body = {
            ...(req.body || {}),
            skip_library: '1',
            folder: 'users/avatars'
        };
        next();
    },
    adminUploadController.upload
);

router.get('/role', authenticate, userController.getUserRole);
router.get('/user/member-tier-meta', authenticate, userController.getMemberTierMeta);
router.post('/user/portal/apply-initial-password', authenticate, userController.applyPortalInitialPassword);
// POST /api/bind-parent - 直接绑定上级（当前无前端入口，保留备用）
router.post('/bind-parent', authenticate, userController.bindParent);
router.post('/bind-phone', authenticate, userController.bindPhone);
router.get('/notifications', authenticate, userController.getNotifications);
router.put('/notifications/:id/read', authenticate, userController.markNotificationRead);

// ★ 用户偏好设置（AI盲盒定制）
router.get('/user/preferences', authenticate, userController.getPreferences);
router.get('/user/preferences/questions', authenticate, userController.getPreferencesQuestions);
router.post('/user/preferences/submit', authenticate, userController.savePreferences);

// 商品收藏（登录用户云端；status 须写在 list 之前，避免与将来动态段冲突）
router.get('/user/favorites/status', authenticate, favoriteController.status);
router.get('/user/favorites', authenticate, favoriteController.list);
router.post('/user/favorites', authenticate, favoriteController.add);
router.post('/user/favorites/sync', authenticate, favoriteController.sync);
router.post('/user/favorites/clear-all', authenticate, favoriteController.clearAll);
router.delete('/user/favorites/:productId', authenticate, favoriteController.remove);

module.exports = router;
