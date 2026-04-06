const express = require('express');
const { checkPermission } = require('../../middleware/adminAuth');
const adminWithdrawalController = require('./controllers/adminWithdrawalController');
const adminRefundController = require('./controllers/adminRefundController');
const adminCommissionController = require('./controllers/adminCommissionController');

const router = express.Router();

router.get('/withdrawals', checkPermission('withdrawals'), adminWithdrawalController.getWithdrawals);
router.put('/withdrawals/:id/approve', checkPermission('withdrawals'), adminWithdrawalController.approveWithdrawal);
router.put('/withdrawals/:id/reject', checkPermission('withdrawals'), adminWithdrawalController.rejectWithdrawal);
router.put('/withdrawals/:id/complete', checkPermission('withdrawals'), adminWithdrawalController.completeWithdrawal);

router.get('/refunds', checkPermission('refunds'), adminRefundController.getRefunds);
router.get('/refunds/:id', checkPermission('refunds'), adminRefundController.getRefundById);
router.put('/refunds/:id/approve', checkPermission('refunds'), adminRefundController.approveRefund);
router.put('/refunds/:id/reject', checkPermission('refunds'), adminRefundController.rejectRefund);
router.put('/refunds/:id/complete', checkPermission('refunds'), adminRefundController.completeRefund);

router.get('/commissions', checkPermission('commissions'), adminCommissionController.getCommissionLogs);
router.get('/commissions/pending', checkPermission('commissions'), adminCommissionController.getPendingApprovals);
router.get('/commissions/:id', checkPermission('commissions'), adminCommissionController.getCommissionById);
router.put('/commissions/:id/approve', checkPermission('commissions'), adminCommissionController.approveCommission);
router.put('/commissions/:id/reject', checkPermission('commissions'), adminCommissionController.rejectCommission);
router.post('/commissions/batch-approve', checkPermission('commissions'), adminCommissionController.batchApproveCommissions);
router.post('/commissions/batch-reject', checkPermission('commissions'), adminCommissionController.batchRejectCommissions);

module.exports = router;
