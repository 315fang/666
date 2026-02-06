const express = require('express');
const router = express.Router();
const { adminAuth, checkPermission } = require('../../middleware/adminAuth');
const adminAuthController = require('./controllers/adminAuthController');
const adminProductController = require('./controllers/adminProductController');
const adminOrderController = require('./controllers/adminOrderController');
const adminUserController = require('./controllers/adminUserController');
const adminContentController = require('./controllers/adminContentController');
const adminWithdrawalController = require('./controllers/adminWithdrawalController');
const adminRefundController = require('./controllers/adminRefundController');

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
router.get('/categories', checkPermission('products'), adminProductController.getCategories);
router.post('/categories', checkPermission('products'), adminProductController.createCategory);
router.put('/categories/:id', checkPermission('products'), adminProductController.updateCategory);

// ========== 订单管理 ==========
router.get('/orders', checkPermission('orders'), adminOrderController.getOrders);
router.get('/orders/:id', checkPermission('orders'), adminOrderController.getOrderById);
router.put('/orders/:id/status', checkPermission('orders'), adminOrderController.updateOrderStatus);
router.put('/orders/:id/ship', checkPermission('orders'), adminOrderController.shipOrder);

// ========== 用户管理 ==========
router.get('/users', checkPermission('users'), adminUserController.getUsers);
router.get('/users/:id', checkPermission('users'), adminUserController.getUserById);
router.put('/users/:id/role', checkPermission('users'), adminUserController.updateUserRole);
router.get('/users/:id/team', checkPermission('users'), adminUserController.getUserTeam);

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

module.exports = router;
