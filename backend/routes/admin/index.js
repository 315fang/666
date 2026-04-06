const express = require('express');
const router = express.Router();
const multer = require('multer');  // ★ 文件上传中间件
const { adminAuth, checkPermission } = require('../../middleware/adminAuth');
const adminAuthController = require('./controllers/adminAuthController');
const adminProductController = require('./controllers/adminProductController');
const adminOrderController = require('./controllers/adminOrderController');
const adminUserController = require('./controllers/adminUserController');
const contentRoutes = require('./content');
const financeRoutes = require('./finance');
const organizationRoutes = require('./organization');
const systemRoutes = require('./system');

// ★ 配置 multer（内存存储，后续传到对象存储）
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }  // 10MB
});

// ========== 认证（无需登录） ==========
router.post('/login', adminAuthController.login);

// ========== 以下接口需要登录 ==========
router.use(adminAuth);

// 获取当前管理员信息
router.get('/profile', adminAuthController.getProfile);
router.put('/password', adminAuthController.changePassword);

// ========== 商品管理 ==========
router.get('/products', checkPermission('products'), adminProductController.getProducts);
router.get('/products/:id', checkPermission('products'), adminProductController.getProductById);
router.post('/products', checkPermission('products'), adminProductController.createProduct);
router.put('/products/:id', checkPermission('products'), adminProductController.updateProduct);
router.put('/products/:id/status', checkPermission('products'), adminProductController.updateProductStatus);
router.delete('/products/:id', checkPermission('products'), adminProductController.deleteProduct);
// ★ 批量设置商品佣金
const adminProductBatchController = require('./controllers/adminProductBatchController');
router.post('/products/batch-commission', checkPermission('products'), adminProductBatchController.batchSetCommission);

router.get('/categories', checkPermission('products'), adminProductController.getCategories);
router.post('/categories', checkPermission('products'), adminProductController.createCategory);
router.put('/categories/:id', checkPermission('products'), adminProductController.updateCategory);
router.delete('/categories/:id', checkPermission('products'), adminProductController.deleteCategory);

// ========== 订单管理 ==========
router.get('/orders', checkPermission('orders'), adminOrderController.getOrders);
router.get('/orders/export', checkPermission('orders'), adminOrderController.exportOrders);  // ★新增
router.get('/orders/:id', checkPermission('orders'), adminOrderController.getOrderById);
router.put('/orders/:id/status', checkPermission('orders'), adminOrderController.updateOrderStatus);
router.put('/orders/:id/ship', checkPermission('orders'), adminOrderController.shipOrder);
router.put('/orders/:id/shipping-info', checkPermission('orders'), adminOrderController.updateShippingInfo);
router.put('/orders/:id/amount', checkPermission('order_amount_adjust'), adminOrderController.adjustOrderAmount);  // ★新增
router.put('/orders/:id/remark', checkPermission('orders'), adminOrderController.addOrderRemark);  // ★新增
router.put('/orders/:id/transfer-agent', checkPermission('orders'), adminOrderController.transferOrderAgent);  // ★新增
router.put('/orders/:id/force-complete', checkPermission('order_force_complete'), adminOrderController.forceCompleteOrder);  // ★新增
router.put('/orders/:id/force-cancel', checkPermission('order_force_cancel'), adminOrderController.forceCancelOrder);  // ★新增
router.post('/orders/batch-ship', checkPermission('orders'), adminOrderController.batchShipOrders);  // ★新增

// ========== 用户管理 ==========
router.get('/users', checkPermission('users'), adminUserController.getUsers);
router.get('/users/:id', checkPermission('users'), adminUserController.getUserById);
router.get('/users/:id/team-summary', checkPermission('users'), adminUserController.getUserTeamSummary);
router.get('/users/:id/team', checkPermission('users'), adminUserController.getUserTeam);
router.get('/users/:id/history', checkPermission('users'), adminUserController.getUserHistory);  // ★新增
router.put('/users/:id/role', checkPermission('user_role_manage'), adminUserController.updateUserRole);
router.put('/users/:id/stock', checkPermission('users'), adminUserController.updateUserStock);
router.put('/users/:id/member-no', checkPermission('users'), adminUserController.updateUserMemberNo);
router.put('/users/:id/invite-code', checkPermission('users'), adminUserController.updateUserInviteCode);
router.put('/users/:id/balance', checkPermission('user_balance_adjust'), adminUserController.adjustUserBalance);  // ★新增
router.put('/users/:id/parent', checkPermission('user_parent_manage'), adminUserController.changeUserParent);  // ★新增
router.put('/users/:id/status', checkPermission('user_status_manage'), adminUserController.updateUserStatus);  // ★新增
router.put('/users/:id/purchase-level', checkPermission('user_role_manage'), adminUserController.updateUserPurchaseLevel);
router.put('/users/:id/remark', checkPermission('users'), adminUserController.updateUserRemark);  // ★新增
router.put('/users/:id/commerce', checkPermission('users'), adminUserController.updateUserCommerce);
router.post('/users/batch-role', checkPermission('users'), adminUserController.batchUpdateRole);  // ★新增

router.use('/', contentRoutes);

router.use('/', financeRoutes);
router.use('/', organizationRoutes);

// ========== 测试工具（受配置开关控制，生产环境自动关闭） ==========
const constants = require('../../config/constants');
if (constants.DEBUG.ENABLE_TEST_ROUTES) {
    const testController = require('./controllers/testController');
    router.post('/test/create-user', testController.createTestUser);
    router.post('/test/create-order', testController.createTestOrder);
    router.get('/test/users/:id', testController.getTestUser);
    router.get('/test/users', testController.getTestUsers);
    router.delete('/test/clear', testController.clearTestData);
    console.log('⚠️  测试路由已启用 (/admin/api/test/*)');
}

router.use('/', systemRoutes);

const adminThemeRoutes = require('./themes');
router.use('/themes', adminThemeRoutes);

// ========== 操作日志 ==========
const adminLogController = require('./controllers/adminLogController');
// 与前端路由 meta.permission: logs 对齐；settings_manage 可兼管运维查看日志
router.get('/logs', checkPermission('logs', 'settings_manage'), adminLogController.getLogs);
router.get('/logs/stats', checkPermission('logs', 'settings_manage'), adminLogController.getLogStats);
router.get('/logs/export', checkPermission('logs', 'settings_manage'), adminLogController.exportLogs);

// ========== 文件上传与存储配置（★新增） ==========
const adminUploadController = require('./controllers/adminUploadController');
router.post('/upload', upload.single('file'), adminUploadController.upload);  // 单文件上传
router.post('/upload/multiple', upload.array('files', 10), adminUploadController.uploadMultiple);  // 多文件上传（最多10个）
router.get('/storage/config', checkPermission('settings_manage'), adminUploadController.getStorageConfig);  // 获取存储配置
router.put('/storage/config', checkPermission('settings_manage'), adminUploadController.updateStorageConfig);  // 更新存储配置
router.post('/storage/test', checkPermission('settings_manage'), adminUploadController.testStorageConfig);  // 测试存储配置
router.get('/storage/signature', adminUploadController.getUploadSignature);  // 获取上传签名（前端直传用）

// ========== 轻量调试入口（替代 AIOps，仅管理员可访问）==========
// GET /admin/api/debug/logs     - 读最新错误日志
// GET /admin/api/debug/process  - Node 进程内存/运行时状态
// GET /admin/api/debug/anomalies - 近期异常订单速览
// GET /admin/api/debug/db-ping  - 数据库连接延迟测试
const debugRoutes = require('./debug');
router.use('/debug', checkPermission('super_admin'), debugRoutes);

// ========== 环境配置检查（.env只读）（★新增） ==========
const envCheckRoutes = require('./env-check');
router.use('/', envCheckRoutes);

// ========== 群发信息管理（★新增） ==========
const massMessageRoutes = require('./mass-message');
router.use('/', massMessageRoutes);

// ========== 后台物流查询 ==========
router.get('/logistics/order/:id', checkPermission('orders'), adminOrderController.getAdminOrderLogistics);

// ========== 注销（使当前 Token 立即失效） ==========
router.post('/logout', adminAuthController.logout);

module.exports = router;
