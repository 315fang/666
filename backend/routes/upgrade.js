const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/upgradeController');

router.use(authenticate);
router.post('/apply', ctrl.applyUpgrade);
router.post('/prepay', ctrl.prepayUpgrade);
router.get('/my', ctrl.getMyUpgradeApplications);

module.exports = router;
