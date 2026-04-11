const express = require('express');
const { checkPermission } = require('../../middleware/adminAuth');
const { okAction, fail } = require('../../utils/adminResponse');
const adminDashboardController = require('./controllers/adminDashboardController');
const adminStatisticsController = require('./controllers/adminStatisticsController');
const adminSettingsController = require('./controllers/adminSettingsController');
const AlertService = require('../../services/AlertService');
const { SystemConfig } = require('../../models');
const upgradeController = require('../../controllers/upgradeController');
const adminAgentSystemController = require('./controllers/adminAgentSystemController');

const router = express.Router();

router.get('/dashboard/notifications', checkPermission('dashboard', 'statistics'), adminDashboardController.getDashboardNotifications);

router.get('/statistics/overview', checkPermission('statistics', 'dashboard'), adminStatisticsController.getDashboardOverview);
router.get('/statistics/sales-trend', checkPermission('statistics'), adminStatisticsController.getSalesTrend);
router.get('/statistics/product-ranking', checkPermission('statistics'), adminStatisticsController.getProductRanking);
router.get('/statistics/user-trend', checkPermission('statistics'), adminStatisticsController.getUserTrend);
router.get('/statistics/low-stock', checkPermission('statistics'), adminStatisticsController.getLowStockProducts);
router.get('/statistics/agent-ranking', checkPermission('statistics'), adminStatisticsController.getAgentRanking);
router.get('/statistics/distribution-report', checkPermission('statistics'), adminStatisticsController.getDistributionReport);

router.get('/settings', checkPermission('settings_manage'), adminSettingsController.getSettings);
router.put('/settings', checkPermission('settings_manage'), adminSettingsController.updateSettings);
router.get('/system/status', checkPermission('dashboard'), adminSettingsController.getSystemStatus);
router.get('/payment-health', checkPermission('settings_manage'), adminSettingsController.getAdminPaymentHealth);
router.get('/feature-toggles', checkPermission('settings_manage'), adminSettingsController.getFeatureToggles);
router.post('/feature-toggles', checkPermission('settings_manage'), adminSettingsController.updateFeatureToggles);
router.get('/mini-program-config', checkPermission('settings_manage'), adminSettingsController.getMiniProgramConfig);
router.put('/mini-program-config', checkPermission('settings_manage'), adminSettingsController.updateMiniProgramConfig);
router.get('/operations/dashboard', checkPermission('dashboard'), adminSettingsController.getOperationsDashboard);
router.get('/member-tier-config', checkPermission('settings_manage'), adminSettingsController.getMemberTierConfig);
router.put('/member-tier-config', checkPermission('settings_manage'), adminSettingsController.updateMemberTierConfig);

router.get('/popup-ad-config', checkPermission('settings_manage'), adminDashboardController.getPopupAdConfig);
router.put('/popup-ad-config', checkPermission('settings_manage'), adminDashboardController.updatePopupAdConfig);
router.get('/rules', checkPermission('settings_manage'), adminDashboardController.getRulesConfig);
router.put('/rules', checkPermission('settings_manage'), adminDashboardController.updateRulesConfig);

router.get('/alert-config', checkPermission('settings_manage'), async (req, res) => {
    try {
        const cfg = await AlertService.loadAlertConfig();
        res.json({ code: 0, data: cfg });
    } catch (e) {
        fail(res, 500, e.message);
    }
});

router.put('/alert-config', checkPermission('settings_manage'), async (req, res) => {
    try {
        const fields = [
            { key: 'alert_enabled', type: 'boolean' },
            { key: 'alert_webhook_type', type: 'string' },
            { key: 'alert_dingtalk_webhook', type: 'string' },
            { key: 'alert_wecom_webhook', type: 'string' },
            { key: 'alert_min_interval_minutes', type: 'number' }
        ];
        const body = req.body || {};

        await Promise.all(fields.map((field) => {
            if (body[field.key] === undefined) {
                return Promise.resolve();
            }

            return SystemConfig.upsert({
                config_key: field.key,
                config_value: String(body[field.key]),
                config_type: field.type,
                config_group: 'notification',
                description: field.key,
                is_editable: true
            });
        }));

        okAction(res, '告警配置已保存');
    } catch (e) {
        fail(res, 500, e.message);
    }
});

router.post('/alert-config/test', checkPermission('settings_manage'), async (req, res) => {
    try {
        const { type, url } = req.body || {};
        if (!type || !url) {
            return fail(res, 400, '缺少 type 或 url');
        }

        const result = await AlertService.testWebhook(type, url);
        if (!result.ok) {
            return fail(res, 400, result.message, result, 400);
        }
        return res.json({ code: 0, data: result, message: result.message });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.get('/upgrade-applications', checkPermission('users', 'dealers'), upgradeController.adminGetApplications);
router.put('/upgrade-applications/:id/review', checkPermission('users', 'dealers'), upgradeController.adminReviewApplication);

router.get('/agent-system/upgrade-rules', checkPermission('settings_manage'), adminAgentSystemController.getUpgradeRules);
router.put('/agent-system/upgrade-rules', checkPermission('settings_manage'), adminAgentSystemController.updateUpgradeRules);
router.get('/agent-system/commission-config', checkPermission('settings_manage'), adminAgentSystemController.getCommissionConfig);
router.put('/agent-system/commission-config', checkPermission('settings_manage'), adminAgentSystemController.updateCommissionConfig);
router.get('/agent-system/peer-bonus', checkPermission('settings_manage'), adminAgentSystemController.getPeerBonusConfig);
router.put('/agent-system/peer-bonus', checkPermission('settings_manage'), adminAgentSystemController.updatePeerBonusConfig);
router.get('/agent-system/assist-bonus', checkPermission('settings_manage'), adminAgentSystemController.getAssistBonusConfig);
router.put('/agent-system/assist-bonus', checkPermission('settings_manage'), adminAgentSystemController.updateAssistBonusConfig);
router.get('/agent-system/fund-pool', checkPermission('settings_manage'), adminAgentSystemController.getFundPoolConfig);
router.put('/agent-system/fund-pool', checkPermission('settings_manage'), adminAgentSystemController.updateFundPoolConfig);
router.get('/agent-system/dividend-rules', checkPermission('settings_manage'), adminAgentSystemController.getDividendRules);
router.put('/agent-system/dividend-rules', checkPermission('settings_manage'), adminAgentSystemController.updateDividendRules);
router.get('/agent-system/exit-rules', checkPermission('settings_manage'), adminAgentSystemController.getExitRules);
router.put('/agent-system/exit-rules', checkPermission('settings_manage'), adminAgentSystemController.updateExitRules);
router.get('/agent-system/recharge-config', checkPermission('settings_manage'), adminAgentSystemController.getRechargeConfig);
router.put('/agent-system/recharge-config', checkPermission('settings_manage'), adminAgentSystemController.updateRechargeConfig);
router.get('/agent-system/dividend/preview', checkPermission('settings_manage'), adminAgentSystemController.getDividendPreview);
router.post('/agent-system/dividend/execute', checkPermission('super_admin'), adminAgentSystemController.executeDividend);
router.get('/agent-system/exit-applications', checkPermission('users'), adminAgentSystemController.getExitApplications);
router.post('/agent-system/exit-applications/:userId', checkPermission('super_admin'), adminAgentSystemController.createExitApplication);
router.put('/agent-system/exit-applications/:id/review', checkPermission('super_admin'), adminAgentSystemController.reviewExitApplication);

module.exports = router;
