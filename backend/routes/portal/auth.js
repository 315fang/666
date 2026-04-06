const express = require('express');
const router = express.Router();
const portalAuthController = require('../../controllers/portalAuthController');
const { authenticatePortal } = require('../../middleware/portalAuth');

router.post('/login', portalAuthController.login);
router.get('/profile', authenticatePortal, portalAuthController.getProfile);
router.post('/change-initial-password', authenticatePortal, portalAuthController.changeInitialPassword);

module.exports = router;
