// backend/routes/station.js
const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const ctrl = require('../controllers/stationController');

// 公开：下单可选自提点（需在 /:id 之前）
router.get('/pickup-options', ctrl.getPickupOptions);
// 公开：模糊定位坐标 → 省市区（缩放到市区内门店，需 TENCENT_MAP_KEY）
router.get('/region-from-point', ctrl.getRegionFromPoint);

// 公开：站点列表和地图数据
router.get('/', ctrl.getStations);
router.get('/my-scope', authenticate, ctrl.getMyVerifyScope);
router.get('/my-claims', authenticate, ctrl.getMyClaims);  // 需在 :id 之前
router.get('/:id', ctrl.getStationDetail);

// 需登录：申请认领
router.post('/:id/claim', authenticate, ctrl.applyClaim);

module.exports = router;
