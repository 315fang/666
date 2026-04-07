const express = require('express');
const router = express.Router();
const multer = require('multer');  // ★ 文件上传中间件
const { adminAuth, checkPermission } = require('../../middleware/adminAuth');
const adminAuthController = require('./controllers/adminAuthController');
const adminProductController = require('./controllers/adminProductController');
const adminOrderController = require('./controllers/adminOrderController');
const adminUserController = require('./controllers/adminUserController');
const adminContentController = require('./controllers/adminContentController');
const adminReviewController = require('./controllers/adminReviewController');
const adminWithdrawalController = require('./controllers/adminWithdrawalController');
const adminRefundController = require('./controllers/adminRefundController');
const adminDealerController = require('./controllers/adminDealerController');
const adminBranchAgentController = require('./controllers/adminBranchAgentController');

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

// ========== 内容管理 ==========
router.get('/banners', checkPermission('content'), adminContentController.getBanners);
router.post('/banners', checkPermission('content'), adminContentController.createBanner);
router.put('/banners/:id', checkPermission('content'), adminContentController.updateBanner);
router.delete('/banners/:id', checkPermission('content'), adminContentController.deleteBanner);
router.get('/contents', checkPermission('content'), adminContentController.getContents);
router.post('/contents', checkPermission('content'), adminContentController.createContent);
router.put('/contents/:id', checkPermission('content'), adminContentController.updateContent);
router.delete('/contents/:id', checkPermission('content'), adminContentController.deleteContent);
router.get('/reviews', checkPermission('content'), adminReviewController.getReviews);
router.put('/reviews/:id', checkPermission('content'), adminReviewController.updateReview);

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
// 分支代理（学校/区域/市/省）
router.get('/branch-agent-policy', checkPermission('dealers'), adminBranchAgentController.getPolicy);
router.put('/branch-agent-policy', checkPermission('dealers'), adminBranchAgentController.updatePolicy);
router.get('/branch-agents/stations', checkPermission('dealers'), adminBranchAgentController.getStations);
router.post('/branch-agents/stations', checkPermission('dealers'), adminBranchAgentController.createStation);
router.put('/branch-agents/stations/:id', checkPermission('dealers'), adminBranchAgentController.updateStation);
router.get('/branch-agents/claims', checkPermission('dealers'), adminBranchAgentController.getClaims);
router.put('/branch-agents/claims/:id/review', checkPermission('dealers'), adminBranchAgentController.reviewClaim);

// ========== 自提门店（service_stations 展示与营业信息） ==========
const adminPickupStationController = require('./controllers/adminPickupStationController');
router.get('/pickup-stations', checkPermission('pickup_stations'), adminPickupStationController.listPickupStations);
router.get('/pickup-stations/:id', checkPermission('pickup_stations'), adminPickupStationController.getPickupStation);
router.post('/pickup-stations', checkPermission('pickup_stations'), adminPickupStationController.createPickupStation);
router.put('/pickup-stations/:id', checkPermission('pickup_stations'), adminPickupStationController.updatePickupStation);

// ========== 素材库管理 ==========
const adminMaterialController = require('./controllers/adminMaterialController');
// 侧栏 permission 为 materials；与图文 content 分离，二者任一即可
router.get('/material-groups', checkPermission('content', 'materials'), adminMaterialController.getGroups);
router.post('/material-groups', checkPermission('content', 'materials'), adminMaterialController.createGroup);
router.put('/material-groups/:id', checkPermission('content', 'materials'), adminMaterialController.updateGroup);
router.delete('/material-groups/:id', checkPermission('content', 'materials'), adminMaterialController.deleteGroup);
router.post('/material-groups/move', checkPermission('content', 'materials'), adminMaterialController.moveMaterials);
router.get('/materials', checkPermission('content', 'materials'), adminMaterialController.getMaterials);
router.get('/materials/:id', checkPermission('content', 'materials'), adminMaterialController.getMaterialById);
router.post('/materials', checkPermission('content', 'materials'), adminMaterialController.createMaterial);
router.put('/materials/:id', checkPermission('content', 'materials'), adminMaterialController.updateMaterial);
router.delete('/materials/:id', checkPermission('content', 'materials'), adminMaterialController.deleteMaterial);

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
const adminDashboardController = require('./controllers/adminDashboardController');
router.get('/dashboard/notifications', checkPermission('dashboard', 'statistics'), adminDashboardController.getDashboardNotifications);

// ========== 数据统计（★新增） ==========
const adminStatisticsController = require('./controllers/adminStatisticsController');
router.get('/statistics/overview', checkPermission('statistics', 'dashboard'), adminStatisticsController.getDashboardOverview);
router.get('/statistics/sales-trend', checkPermission('statistics'), adminStatisticsController.getSalesTrend);
router.get('/statistics/product-ranking', checkPermission('statistics'), adminStatisticsController.getProductRanking);
router.get('/statistics/user-trend', checkPermission('statistics'), adminStatisticsController.getUserTrend);
router.get('/statistics/low-stock', checkPermission('statistics'), adminStatisticsController.getLowStockProducts);
router.get('/statistics/agent-ranking', checkPermission('statistics'), adminStatisticsController.getAgentRanking);
router.get('/statistics/distribution-report', checkPermission('statistics'), adminStatisticsController.getDistributionReport);

// ========== 系统设置（★新增） ==========
const adminSettingsController = require('./controllers/adminSettingsController');
router.get('/settings', checkPermission('settings_manage'), adminSettingsController.getSettings);
router.put('/settings', checkPermission('settings_manage'), adminSettingsController.updateSettings);
router.get('/system/status', checkPermission('dashboard'), adminSettingsController.getSystemStatus);
router.get('/payment-health', checkPermission('settings_manage'), adminSettingsController.getAdminPaymentHealth);
// 功能开关
router.get('/feature-toggles', checkPermission('settings_manage'), adminSettingsController.getFeatureToggles);
router.post('/feature-toggles', checkPermission('settings_manage'), adminSettingsController.updateFeatureToggles);
router.get('/mini-program-config', checkPermission('settings_manage'), adminSettingsController.getMiniProgramConfig);
router.put('/mini-program-config', checkPermission('settings_manage'), adminSettingsController.updateMiniProgramConfig);
// 运营控制台聚合数据
router.get('/operations/dashboard', checkPermission('dashboard'), adminSettingsController.getOperationsDashboard);
// 会员等级/成长值配置
router.get('/member-tier-config', checkPermission('settings_manage'), adminSettingsController.getMemberTierConfig);
router.put('/member-tier-config', checkPermission('settings_manage'), adminSettingsController.updateMemberTierConfig);

// ========== 弹窗广告配置 ==========
router.get('/popup-ad-config', checkPermission('settings_manage'), adminDashboardController.getPopupAdConfig);
router.put('/popup-ad-config', checkPermission('settings_manage'), adminDashboardController.updatePopupAdConfig);

// ========== 规则公告配置（★新增） ==========
router.get('/rules', checkPermission('settings_manage'), adminDashboardController.getRulesConfig);
router.put('/rules', checkPermission('settings_manage'), adminDashboardController.updateRulesConfig);

const adminThemeRoutes = require('./themes');
router.use('/themes', adminThemeRoutes);

// ========== 拼团管理 (★新增) ==========
const adminGroupBuyController = require('./controllers/adminGroupBuyController');
router.get('/group-buys', checkPermission('products'), adminGroupBuyController.getGroupActivities);
router.get('/group-buys/:id', checkPermission('products'), adminGroupBuyController.getGroupActivityById);
router.post('/group-buys', checkPermission('products'), adminGroupBuyController.createGroupActivity);
router.put('/group-buys/:id', checkPermission('products'), adminGroupBuyController.updateGroupActivity);
router.delete('/group-buys/:id', checkPermission('products'), adminGroupBuyController.deleteGroupActivity);

// ========== 砍价/抽奖/节日活动管理 ==========
const adminActivityController = require('./controllers/adminActivityController');
router.get('/activity-options', checkPermission('content'), adminActivityController.getActivityOptions);
// 砍价活动
router.get('/slash-activities', checkPermission('products'), adminActivityController.getSlashActivities);
router.get('/slash-activities/:id', checkPermission('products'), adminActivityController.getSlashActivityById);
router.post('/slash-activities', checkPermission('products'), adminActivityController.createSlashActivity);
router.put('/slash-activities/:id', checkPermission('products'), adminActivityController.updateSlashActivity);
router.delete('/slash-activities/:id', checkPermission('products'), adminActivityController.deleteSlashActivity);
// 抽奖奖品
router.get('/lottery-prizes', checkPermission('products'), adminActivityController.getLotteryPrizes);
router.post('/lottery-prizes', checkPermission('products'), adminActivityController.createLotteryPrize);
router.put('/lottery-prizes/:id', checkPermission('products'), adminActivityController.updateLotteryPrize);
router.delete('/lottery-prizes/:id', checkPermission('products'), adminActivityController.deleteLotteryPrize);
// 节日活动配置
router.get('/festival-config', checkPermission('content'), adminActivityController.getFestivalConfig);
router.put('/festival-config', checkPermission('content'), adminActivityController.updateFestivalConfig);
// 全局活动UI配置
router.get('/global-ui-config', checkPermission('content'), adminActivityController.getGlobalUiConfig);
router.put('/global-ui-config', checkPermission('content'), adminActivityController.updateGlobalUiConfig);
// 活动链接配置（Banner / 常驻活动 / 限时活动）
router.get('/activity-links', checkPermission('content'), adminActivityController.getActivityLinks);
router.put('/activity-links', checkPermission('content'), adminActivityController.updateActivityLinks);

// ========== 优惠券管理 (★新增) ==========
const adminCouponController = require('./controllers/adminCouponController');
router.get('/coupons', checkPermission('products'), adminCouponController.getCoupons);
router.get('/coupons/:id', checkPermission('products'), adminCouponController.getCouponById);
router.post('/coupons', checkPermission('products'), adminCouponController.createCoupon);
router.put('/coupons/:id', checkPermission('products'), adminCouponController.updateCoupon);
router.delete('/coupons/:id', checkPermission('products'), adminCouponController.deleteCoupon);
router.post('/coupons/:id/issue', checkPermission('products'), adminCouponController.issueCoupon);
router.get('/coupon-auto-rules', checkPermission('products'), adminCouponController.getAutoRules);
router.put('/coupon-auto-rules', checkPermission('products'), adminCouponController.saveAutoRules);

// ========== 首页装修 (★新增) ==========
const adminHomeSectionController = require('./controllers/adminHomeSectionController');
router.get('/home-sections', checkPermission('content'), adminHomeSectionController.getHomeSections);
router.get('/home-sections/schemas', checkPermission('content'), adminHomeSectionController.getSectionSchemas);
router.post('/home-sections', checkPermission('content'), adminHomeSectionController.createHomeSection);
router.put('/home-sections/:id', checkPermission('content'), adminHomeSectionController.updateHomeSection);
router.put('/home-sections/:id/toggle', checkPermission('content'), adminHomeSectionController.toggleSectionVisible);
router.delete('/home-sections/:id', checkPermission('content'), adminHomeSectionController.deleteHomeSection);
router.post('/home-sections/sort', checkPermission('content'), adminHomeSectionController.updateSortOrder);

// ========== 榜单化图文管理 ==========
const adminBoardController = require('./controllers/adminBoardController');
router.get('/boards', checkPermission('content'), adminBoardController.listBoards);
router.get('/boards/:id', checkPermission('content'), adminBoardController.getBoardDetail);
router.post('/boards', checkPermission('content'), adminBoardController.createBoard);
router.put('/boards/:id', checkPermission('content'), adminBoardController.updateBoard);
router.delete('/boards/:id', checkPermission('content'), adminBoardController.deleteBoard);
router.post('/boards/sort', checkPermission('content'), adminBoardController.updateBoardSort);

router.get('/boards/:id/items', checkPermission('content'), adminBoardController.listBoardItems);
router.post('/boards/:id/items', checkPermission('content'), adminBoardController.createBoardItem);
router.put('/boards/:id/items/:itemId', checkPermission('content'), adminBoardController.updateBoardItem);
router.delete('/boards/:id/items/:itemId', checkPermission('content'), adminBoardController.deleteBoardItem);
router.post('/boards/:id/items/sort', checkPermission('content'), adminBoardController.updateBoardItemSort);

router.get('/boards/:id/products', checkPermission('content'), adminBoardController.listBoardProducts);
router.post('/boards/:id/products', checkPermission('content'), adminBoardController.addBoardProducts);
router.put('/boards/:id/products/:relationId', checkPermission('content'), adminBoardController.updateBoardProduct);
router.delete('/boards/:id/products/:relationId', checkPermission('content'), adminBoardController.deleteBoardProduct);
router.post('/boards/:id/products/sort', checkPermission('content'), adminBoardController.updateBoardProductSort);


// ========== 操作日志 ==========
const adminLogController = require('./controllers/adminLogController');
// 与前端路由 meta.permission: logs 对齐；settings_manage 可兼管运维查看日志
router.get('/logs', checkPermission('logs', 'settings_manage'), adminLogController.getLogs);
router.get('/logs/stats', checkPermission('logs', 'settings_manage'), adminLogController.getLogStats);
router.get('/logs/export', checkPermission('logs', 'settings_manage'), adminLogController.exportLogs);

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

// ========== 开屏动画配置（Phase 6） ==========
const splashController = require('../../controllers/splashController');
router.get('/splash', checkPermission('content'), splashController.getConfig);
router.put('/splash', checkPermission('content'), splashController.updateConfig);

// ========== 后台物流查询 ==========
router.get('/logistics/order/:id', checkPermission('orders'), adminOrderController.getAdminOrderLogistics);

// ========== 告警推送配置（★新增） ==========
const AlertService = require('../../services/AlertService');
const { SystemConfig } = require('../../models');

// 读取告警配置
router.get('/alert-config', checkPermission('settings'), async (req, res) => {
    try {
        const cfg = await AlertService.loadAlertConfig();
        res.json({ code: 0, data: cfg });
    } catch (e) {
        res.status(500).json({ code: 500, message: e.message });
    }
});

// 保存告警配置（批量 upsert notification 分组）
router.put('/alert-config', checkPermission('settings'), async (req, res) => {
    try {
        const fields = [
            { key: 'alert_enabled',              type: 'boolean' },
            { key: 'alert_webhook_type',          type: 'string'  },
            { key: 'alert_dingtalk_webhook',      type: 'string'  },
            { key: 'alert_wecom_webhook',         type: 'string'  },
            { key: 'alert_min_interval_minutes',  type: 'number'  }
        ];
        const body = req.body || {};
        await Promise.all(fields.map(f => {
            if (body[f.key] === undefined) return Promise.resolve();
            return SystemConfig.upsert({
                config_key:   f.key,
                config_value: String(body[f.key]),
                config_type:  f.type,
                config_group: 'notification',
                description:  f.key,
                is_editable:  true
            });
        }));
        res.json({ code: 0, message: '告警配置已保存' });
    } catch (e) {
        res.status(500).json({ code: 500, message: e.message });
    }
});

// 测试 Webhook
router.post('/alert-config/test', checkPermission('settings'), async (req, res) => {
    try {
        const { type, url } = req.body || {};
        if (!type || !url) return res.status(400).json({ code: 400, message: '缺少 type 或 url' });
        const result = await AlertService.testWebhook(type, url);
        res.json({ code: result.ok ? 0 : 1, data: result, message: result.message });
    } catch (e) {
        res.status(500).json({ code: 500, message: e.message });
    }
});

// ========== 注销（使当前 Token 立即失效） ==========
router.post('/logout', adminAuthController.logout);

// ========== 升级审核 ==========
const upgradeController = require('../../controllers/upgradeController');
router.get('/upgrade-applications', checkPermission('users'), upgradeController.adminGetApplications);
router.put('/upgrade-applications/:id/review', checkPermission('users'), upgradeController.adminReviewApplication);

// ========== 代理体系管理 ==========
const adminAgentSystemController = require('./controllers/adminAgentSystemController');
router.get('/agent-system/upgrade-rules', checkPermission('settings'), adminAgentSystemController.getUpgradeRules);
router.put('/agent-system/upgrade-rules', checkPermission('settings'), adminAgentSystemController.updateUpgradeRules);
router.get('/agent-system/commission-config', checkPermission('settings'), adminAgentSystemController.getCommissionConfig);
router.put('/agent-system/commission-config', checkPermission('settings'), adminAgentSystemController.updateCommissionConfig);
router.get('/agent-system/peer-bonus', checkPermission('settings'), adminAgentSystemController.getPeerBonusConfig);
router.put('/agent-system/peer-bonus', checkPermission('settings'), adminAgentSystemController.updatePeerBonusConfig);
router.get('/agent-system/assist-bonus', checkPermission('settings'), adminAgentSystemController.getAssistBonusConfig);
router.put('/agent-system/assist-bonus', checkPermission('settings'), adminAgentSystemController.updateAssistBonusConfig);
router.get('/agent-system/fund-pool', checkPermission('settings'), adminAgentSystemController.getFundPoolConfig);
router.put('/agent-system/fund-pool', checkPermission('settings'), adminAgentSystemController.updateFundPoolConfig);
router.get('/agent-system/dividend-rules', checkPermission('settings'), adminAgentSystemController.getDividendRules);
router.put('/agent-system/dividend-rules', checkPermission('settings'), adminAgentSystemController.updateDividendRules);
router.get('/agent-system/exit-rules', checkPermission('settings'), adminAgentSystemController.getExitRules);
router.put('/agent-system/exit-rules', checkPermission('settings'), adminAgentSystemController.updateExitRules);
router.get('/agent-system/recharge-config', checkPermission('settings'), adminAgentSystemController.getRechargeConfig);
router.put('/agent-system/recharge-config', checkPermission('settings'), adminAgentSystemController.updateRechargeConfig);
router.get('/agent-system/dividend/preview', checkPermission('settings'), adminAgentSystemController.getDividendPreview);
router.post('/agent-system/dividend/execute', checkPermission('super_admin'), adminAgentSystemController.executeDividend);
router.get('/agent-system/exit-applications', checkPermission('users'), adminAgentSystemController.getExitApplications);
router.post('/agent-system/exit-applications/:userId', checkPermission('super_admin'), adminAgentSystemController.createExitApplication);
router.put('/agent-system/exit-applications/:id/review', checkPermission('super_admin'), adminAgentSystemController.reviewExitApplication);

module.exports = router;
