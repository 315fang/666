const express = require('express');
const { checkPermission } = require('../../middleware/adminAuth');
const adminDealerController = require('./controllers/adminDealerController');
const adminBranchAgentController = require('./controllers/adminBranchAgentController');
const adminPickupStationController = require('./controllers/adminPickupStationController');
const adminAccountController = require('./controllers/adminAccountController');
const adminNSystemController = require('./controllers/adminNSystemController');

const router = express.Router();

router.get('/dealers', checkPermission('dealers'), adminDealerController.getDealers);
router.get('/dealers/:id', checkPermission('dealers'), adminDealerController.getDealerById);
router.put('/dealers/:id/approve', checkPermission('dealers'), adminDealerController.approveDealer);
router.put('/dealers/:id/reject', checkPermission('dealers'), adminDealerController.rejectDealer);
router.put('/dealers/:id/level', checkPermission('dealers'), adminDealerController.updateDealerLevel);
router.get('/branch-agent-policy', checkPermission('dealers'), adminBranchAgentController.getPolicy);
router.put('/branch-agent-policy', checkPermission('dealers'), adminBranchAgentController.updatePolicy);
router.get('/branch-agents/stations', checkPermission('dealers'), adminBranchAgentController.getStations);
router.post('/branch-agents/stations', checkPermission('dealers'), adminBranchAgentController.createStation);
router.put('/branch-agents/stations/:id', checkPermission('dealers'), adminBranchAgentController.updateStation);
router.get('/branch-agents/claims', checkPermission('dealers'), adminBranchAgentController.getClaims);
router.put('/branch-agents/claims/:id/review', checkPermission('dealers'), adminBranchAgentController.reviewClaim);

router.get('/pickup-stations', checkPermission('pickup_stations'), adminPickupStationController.listPickupStations);
router.get('/pickup-stations/:id', checkPermission('pickup_stations'), adminPickupStationController.getPickupStation);
router.post('/pickup-stations', checkPermission('pickup_stations'), adminPickupStationController.createPickupStation);
router.put('/pickup-stations/:id', checkPermission('pickup_stations'), adminPickupStationController.updatePickupStation);

router.get('/admins', checkPermission('admins'), adminAccountController.getAdmins);
router.post('/admins', checkPermission('admins'), adminAccountController.createAdmin);
router.put('/admins/:id', checkPermission('admins'), adminAccountController.updateAdmin);
router.put('/admins/:id/password', checkPermission('admins'), adminAccountController.resetAdminPassword);
router.delete('/admins/:id', checkPermission('admins'), adminAccountController.deleteAdmin);
router.get('/admins/roles', adminAccountController.getRolePermissions);

router.get('/n-system/leaders', checkPermission('dealers'), adminNSystemController.getLeaders);
router.get('/n-system/leaders/:id/members', checkPermission('dealers'), adminNSystemController.getLeaderMembers);
router.get('/n-system/members', checkPermission('dealers'), adminNSystemController.getMembers);

module.exports = router;
