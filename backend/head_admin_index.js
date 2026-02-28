const express = require('express');
const router = express.Router();
const multer = require('multer');  // ★ 文件上传中间件
const { adminAuth, checkPermission } = require('../../middleware/adminAuth');
const adminAuthController = require('./controllers/adminAuthController');
const adminProductController = require('./controllers/adminProductController');
const adminOrderController = require('./controllers/adminOrderController');
const adminUserController = require('./controllers/adminUserController');
const adminContentController = require('./controllers/adminContentController');
const adminWithdrawalController = require('./controllers/adminWithdrawalController');
const adminRefundController = require('./controllers/adminRefundController');
const adminDealerController = require('./controllers/adminDealerController');
const { AppConfig } = require('../../models');

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
router.put('/orders/:id/amount', checkPermission('orders'), adminOrderController.adjustOrderAmount);  // ★新增
router.put('/orders/:id/remark', checkPermission('orders'), adminOrderController.addOrderRemark);  // ★新增
router.put('/orders/:id/transfer-agent', checkPermission('orders'), adminOrderController.transferOrderAgent);  // ★新增
router.put('/orders/:id/force-complete', checkPermission('orders'), adminOrderController.forceCompleteOrder);  // ★新增
router.put('/orders/:id/force-cancel', checkPermission('orders'), adminOrderController.forceCancelOrder);  // ★新增
router.post('/orders/batch-ship', checkPermission('orders'), adminOrderController.batchShipOrders);  // ★新增

// ========== 用户管理 ==========
router.get('/users', checkPermission('users'), adminUserController.getUsers);
router.get('/users/:id', checkPermission('users'), adminUserController.getUserById);
router.get('/users/:id/team', checkPermission('users'), adminUserController.getUserTeam);
router.get('/users/:id/history', checkPermission('users'), adminUserController.getUserHistory);  // ★新增
router.put('/users/:id/role', checkPermission('users'), adminUserController.updateUserRole);
router.put('/users/:id/stock', checkPermission('users'), adminUserController.updateUserStock);
router.put('/users/:id/invite-code', checkPermission('users'), adminUserController.updateUserInviteCode);
router.put('/users/:id/balance', checkPermission('users'), adminUserController.adjustUserBalance);  // ★新增
router.put('/users/:id/parent', checkPermission('users'), adminUserController.changeUserParent);  // ★新增
router.put('/users/:id/status', checkPermission('users'), adminUserController.updateUserStatus);  // ★新增
router.put('/users/:id/remark', checkPermission('users'), adminUserController.updateUserRemark);  // ★新增
router.post('/users/batch-role', checkPermission('users'), adminUserController.batchUpdateRole);  // ★新增

// ========== 内容管理 ==========
router.get('/banners', checkPermission('content'), adminContentController.getBanners);
router.post('/banners', checkPermission('content'), adminContentController.createBanner);
router.put('/banners/:id', checkPermission('content'), adminContentController.updateBanner);
router.delete('/banners/:id', checkPermission('content'), adminContentController.deleteBanner);
router.get('/contents', checkPermission('content'), adminContentController.getContents);
router.post('/contents', checkPermission('content'), adminContentController.createContent);
router.put('/contents/:id', checkPermission('content'), adminContentController.updateContent);

// ========== 提现管理 ==========
router.get('/withdrawals', checkPermission('withdrawals'), adminWithdrawalController.getWithdrawals);
router.put('/withdrawals/:id/approve', checkPermission('withdrawals'), adminWithdrawalController.approveWithdrawal);
router.put('/withdrawals/:id/reject', checkPermission('withdrawals'), adminWithdrawalController.rejectWithdrawal);
router.put('/withdrawals/:id/complete', checkPermission('withdrawals'), adminWithdrawalController.completeWithdrawal);

// ========== 售后管理 ==========
router.get('/refunds', checkPermission('refunds'), adminRefundController.getRefunds);
router.get('/refunds/:id', checkPermission('refunds'), adminRefundController.getRefundById);
router.put('/refunds/:id/approve', checkPermission('refunds'), adminRefundController.approveRefund);
router.put('/refunds/:id/reject', checkPermission('refunds'), adminRefundController.rejectRefund);
router.put('/refunds/:id/complete', checkPermission('refunds'), adminRefundController.completeRefund);

// ========== 佣金管理（★新增） ==========
const adminCommissionController = require('./controllers/adminCommissionController');
router.get('/commissions', checkPermission('commissions'), adminCommissionController.getCommissionLogs);
router.get('/commissions/pending', checkPermission('commissions'), adminCommissionController.getPendingApprovals);
router.get('/commissions/:id', checkPermission('commissions'), adminCommissionController.getCommissionById);
router.put('/commissions/:id/approve', checkPermission('commissions'), adminCommissionController.approveCommission);
router.put('/commissions/:id/reject', checkPermission('commissions'), adminCommissionController.rejectCommission);
router.post('/commissions/batch-approve', checkPermission('commissions'), adminCommissionController.batchApproveCommissions);
router.post('/commissions/batch-reject', checkPermission('commissions'), adminCommissionController.batchRejectCommissions);

// ========== 经销商管理 ==========
router.get('/dealers', checkPermission('dealers'), adminDealerController.getDealers);
router.get('/dealers/:id', checkPermission('dealers'), adminDealerController.getDealerById);
router.put('/dealers/:id/approve', checkPermission('dealers'), adminDealerController.approveDealer);
router.put('/dealers/:id/reject', checkPermission('dealers'), adminDealerController.rejectDealer);
router.put('/dealers/:id/level', checkPermission('dealers'), adminDealerController.updateDealerLevel);

// ========== 素材管理 ==========
const adminMaterialController = require('./controllers/adminMaterialController');
router.get('/materials', checkPermission('content'), adminMaterialController.getMaterials);
router.get('/materials/:id', checkPermission('content'), adminMaterialController.getMaterialById);
router.post('/materials', checkPermission('content'), adminMaterialController.createMaterial);
router.put('/materials/:id', checkPermission('content'), adminMaterialController.updateMaterial);
router.delete('/materials/:id', checkPermission('content'), adminMaterialController.deleteMaterial);

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

// ========== 后台通知（首页快捷通知） ==========
const { Notification, Withdrawal, Refund, CommissionLog, Order } = require('../../models');
router.get('/dashboard/notifications', async (req, res) => {
    try {
        // 获取最近7条系统通知（admin通知 user_id=0）
        const adminNotifications = await Notification.findAll({
            where: { user_id: 0 },
            order: [['created_at', 'DESC']],
            limit: 7
        });

        // 统计待处理数
        const pendingWithdrawals = await Withdrawal.count({ where: { status: 'pending' } });
        const pendingRefunds = await Refund.count({ where: { status: 'pending' } });
        const pendingCommissions = await CommissionLog.count({ where: { status: 'pending_approval' } });
        const pendingShip = await Order.count({ where: { status: 'paid' } });

        res.json({
            code: 0,
            data: {
                notifications: adminNotifications,
                pendingCounts: {
                    withdrawals: pendingWithdrawals,
                    refunds: pendingRefunds,
                    commissions: pendingCommissions,
                    pendingShip: pendingShip
                }
            }
        });
    } catch (error) {
        console.error('获取后台通知失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
});

// ========== 数据统计（★新增） ==========
const adminStatisticsController = require('./controllers/adminStatisticsController');
router.get('/statistics/overview', adminStatisticsController.getDashboardOverview);
router.get('/statistics/sales-trend', adminStatisticsController.getSalesTrend);
router.get('/statistics/product-ranking', adminStatisticsController.getProductRanking);
router.get('/statistics/user-trend', adminStatisticsController.getUserTrend);
router.get('/statistics/low-stock', adminStatisticsController.getLowStockProducts);
router.get('/statistics/agent-ranking', adminStatisticsController.getAgentRanking);
router.get('/statistics/distribution-report', adminStatisticsController.getDistributionReport);

// ========== 系统设置（★新增） ==========
const adminSettingsController = require('./controllers/adminSettingsController');
router.get('/settings', adminSettingsController.getSettings);
router.put('/settings', adminSettingsController.updateSettings);
router.get('/system/status', adminSettingsController.getSystemStatus);

// ========== 规则公告配置（★新增） ==========
router.get('/rules', async (req, res) => {
    try {
        const configs = await AppConfig.findAll({
            where: { category: 'notice', status: 1 },
            attributes: ['config_key', 'config_value', 'config_type', 'category']
        });

        const formatted = {};
        configs.forEach(config => {
            let value = config.config_value;
            if (config.config_type === 'number') value = parseFloat(value);
            if (config.config_type === 'boolean') value = (value === 'true');
            if (config.config_type === 'json') {
                try { value = JSON.parse(value); } catch (e) {}
            }
            formatted[config.config_key] = value;
        });

        res.json({ code: 0, data: formatted });
    } catch (error) {
        console.error('获取规则配置失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
});

router.put('/rules', async (req, res) => {
    try {
        const { settings } = req.body;
        if (!settings) {
            return res.status(400).json({ code: -1, message: '参数不完整' });
        }

        const operations = [];
        for (const [key, value] of Object.entries(settings)) {
            let type = 'string';
            if (typeof value === 'number') type = 'number';
            if (typeof value === 'boolean') type = 'boolean';
            if (typeof value === 'object') type = 'json';

            let stringValue = value;
            if (type === 'json') stringValue = JSON.stringify(value);
            else stringValue = String(value);

            operations.push(AppConfig.upsert({
                config_key: key,
                config_value: stringValue,
                config_type: type,
                category: 'notice',
                description: '发货与佣金规则说明',
                is_public: true,
                status: 1
            }));
        }

        await Promise.all(operations);

        res.json({ code: 0, message: '配置已更新' });
    } catch (error) {
        console.error('更新规则配置失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
});

const adminThemeRoutes = require('./themes');
router.use('/themes', adminThemeRoutes);

const adminAgentRoutes = require('./ai_agent');
router.use('/agent', adminAgentRoutes);

// ========== 首页装修 (★新增) ==========
const adminHomeSectionController = require('./controllers/adminHomeSectionController');
router.get('/home-sections', checkPermission('content'), adminHomeSectionController.getHomeSections);
router.put('/home-sections/:id', checkPermission('content'), adminHomeSectionController.updateHomeSection);
router.post('/home-sections/sort', checkPermission('content'), adminHomeSectionController.updateSortOrder);

// ========== 操作日志（★新增） ==========
const adminLogController = require('./controllers/adminLogController');
router.get('/logs', adminLogController.getLogs);
router.get('/logs/stats', adminLogController.getLogStats);
router.get('/logs/export', adminLogController.exportLogs);

// ========== 管理员账号管理（★新增） ==========
const adminAccountController = require('./controllers/adminAccountController');
router.get('/admins', checkPermission('admins'), adminAccountController.getAdmins);
router.post('/admins', checkPermission('admins'), adminAccountController.createAdmin);
router.put('/admins/:id', checkPermission('admins'), adminAccountController.updateAdmin);
router.put('/admins/:id/password', checkPermission('admins'), adminAccountController.resetAdminPassword);
router.delete('/admins/:id', checkPermission('admins'), adminAccountController.deleteAdmin);
router.get('/admins/roles', adminAccountController.getRolePermissions);  // 获取角色权限配置（所有管理员可访问）

// ========== 文件上传与存储配置（★新增） ==========
const adminUploadController = require('./controllers/adminUploadController');
router.post('/upload', upload.single('file'), adminUploadController.upload);  // 单文件上传
router.post('/upload/multiple', upload.array('files', 10), adminUploadController.uploadMultiple);  // 多文件上传（最多10个）
router.get('/storage/config', checkPermission('settings'), adminUploadController.getStorageConfig);  // 获取存储配置
router.put('/storage/config', checkPermission('settings'), adminUploadController.updateStorageConfig);  // 更新存储配置
router.post('/storage/test', checkPermission('settings'), adminUploadController.testStorageConfig);  // 测试存储配置
router.get('/storage/signature', adminUploadController.getUploadSignature);  // 获取上传签名（前端直传用）

// ========== AI运维监控中心（★新增） ==========
const aiOpsRoutes = require('./ai-ops');
router.use('/ai-ops', aiOpsRoutes);

// ========== AI配置管理（★新增） ==========
const aiConfigRoutes = require('./ai-config');
router.use('/ai', aiConfigRoutes);

// ========== 系统配置管理（数据库热更新）（★新增） ==========
const configRoutes = require('./config');
router.use('/', configRoutes);

// ========== 环境配置检查（.env只读）（★新增） ==========
const envCheckRoutes = require('./env-check');
router.use('/', envCheckRoutes);

// ========== 群发信息管理（★新增） ==========
const massMessageRoutes = require('./mass-message');
router.use('/', massMessageRoutes);

module.exports = router;

