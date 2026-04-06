const express = require('express');
const { checkPermission } = require('../../middleware/adminAuth');
const adminContentController = require('./controllers/adminContentController');
const adminReviewController = require('./controllers/adminReviewController');
const adminMaterialController = require('./controllers/adminMaterialController');
const adminGroupBuyController = require('./controllers/adminGroupBuyController');
const adminActivityController = require('./controllers/adminActivityController');
const adminCouponController = require('./controllers/adminCouponController');
const adminHomeSectionController = require('./controllers/adminHomeSectionController');
const adminBoardController = require('./controllers/adminBoardController');
const splashController = require('../../controllers/splashController');

const router = express.Router();

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

router.get('/group-buys', checkPermission('products'), adminGroupBuyController.getGroupActivities);
router.get('/group-buys/:id', checkPermission('products'), adminGroupBuyController.getGroupActivityById);
router.post('/group-buys', checkPermission('products'), adminGroupBuyController.createGroupActivity);
router.put('/group-buys/:id', checkPermission('products'), adminGroupBuyController.updateGroupActivity);
router.delete('/group-buys/:id', checkPermission('products'), adminGroupBuyController.deleteGroupActivity);

router.get('/activity-options', checkPermission('content'), adminActivityController.getActivityOptions);
router.get('/slash-activities', checkPermission('products'), adminActivityController.getSlashActivities);
router.get('/slash-activities/:id', checkPermission('products'), adminActivityController.getSlashActivityById);
router.post('/slash-activities', checkPermission('products'), adminActivityController.createSlashActivity);
router.put('/slash-activities/:id', checkPermission('products'), adminActivityController.updateSlashActivity);
router.delete('/slash-activities/:id', checkPermission('products'), adminActivityController.deleteSlashActivity);
router.get('/lottery-prizes', checkPermission('products'), adminActivityController.getLotteryPrizes);
router.post('/lottery-prizes', checkPermission('products'), adminActivityController.createLotteryPrize);
router.put('/lottery-prizes/:id', checkPermission('products'), adminActivityController.updateLotteryPrize);
router.delete('/lottery-prizes/:id', checkPermission('products'), adminActivityController.deleteLotteryPrize);
router.get('/festival-config', checkPermission('content'), adminActivityController.getFestivalConfig);
router.put('/festival-config', checkPermission('content'), adminActivityController.updateFestivalConfig);
router.get('/global-ui-config', checkPermission('content'), adminActivityController.getGlobalUiConfig);
router.put('/global-ui-config', checkPermission('content'), adminActivityController.updateGlobalUiConfig);
router.get('/activity-links', checkPermission('content'), adminActivityController.getActivityLinks);
router.put('/activity-links', checkPermission('content'), adminActivityController.updateActivityLinks);

router.get('/coupons', checkPermission('products'), adminCouponController.getCoupons);
router.get('/coupons/:id', checkPermission('products'), adminCouponController.getCouponById);
router.post('/coupons', checkPermission('products'), adminCouponController.createCoupon);
router.put('/coupons/:id', checkPermission('products'), adminCouponController.updateCoupon);
router.delete('/coupons/:id', checkPermission('products'), adminCouponController.deleteCoupon);
router.post('/coupons/:id/issue', checkPermission('products'), adminCouponController.issueCoupon);
router.get('/coupon-auto-rules', checkPermission('products'), adminCouponController.getAutoRules);
router.put('/coupon-auto-rules', checkPermission('products'), adminCouponController.saveAutoRules);

router.get('/home-sections', checkPermission('content'), adminHomeSectionController.getHomeSections);
router.get('/home-sections/schemas', checkPermission('content'), adminHomeSectionController.getSectionSchemas);
router.post('/home-sections', checkPermission('content'), adminHomeSectionController.createHomeSection);
router.put('/home-sections/:id', checkPermission('content'), adminHomeSectionController.updateHomeSection);
router.put('/home-sections/:id/toggle', checkPermission('content'), adminHomeSectionController.toggleSectionVisible);
router.delete('/home-sections/:id', checkPermission('content'), adminHomeSectionController.deleteHomeSection);
router.post('/home-sections/sort', checkPermission('content'), adminHomeSectionController.updateSortOrder);

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

router.get('/splash', checkPermission('content'), splashController.getConfig);
router.put('/splash', checkPermission('content'), splashController.updateConfig);

module.exports = router;
