// backend/routes/station.js
const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const ctrl = require('../controllers/stationController');

// 公开：站点列表和地图数据
router.get('/', ctrl.getStations);
router.get('/my-claims', authenticate, ctrl.getMyClaims);  // 需在 :id 之前
router.get('/:id', ctrl.getStationDetail);

// 需登录：申请认领
router.post('/:id/claim', authenticate, ctrl.applyClaim);

module.exports = router;
