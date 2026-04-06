// backend/routes/admin/controllers/adminDashboardController.js
// 后台 Dashboard 相关接口：通知、弹窗广告配置、规则公告配置
const { AppConfig, Notification, Withdrawal, Refund, CommissionLog, Order } = require('../../../models');
const { clearPagePayloadCache } = require('../../../services/PageLayoutService');

// ─── 后台通知（首页快捷通知） ────────────────────────────────────────

const getDashboardNotifications = async (req, res) => {
    try {
        const adminNotifications = await Notification.findAll({
            where: { user_id: 0 },
            order: [['created_at', 'DESC']],
            limit: 7
        });

        const [pendingWithdrawals, pendingRefunds, pendingCommissions, pendingShip] = await Promise.all([
            Withdrawal.count({ where: { status: 'pending' } }),
            Refund.count({ where: { status: 'pending' } }),
            CommissionLog.count({ where: { status: 'pending_approval' } }),
            Order.count({ where: { status: 'paid' } })
        ]);

        res.json({
            code: 0,
            data: {
                notifications: adminNotifications,
                pendingCounts: {
                    withdrawals: pendingWithdrawals,
                    refunds: pendingRefunds,
                    commissions: pendingCommissions,
                    pendingShip
                }
            }
        });
    } catch (error) {
        console.error('获取后台通知失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// ─── 弹窗广告配置 ────────────────────────────────────────────────────

const POPUP_AD_DEFAULTS = {
    enabled: false,
    frequency: 'once_daily',
    image_url: '',
    link_type: 'none',
    link_value: '',
    button_text: '',
    product_id: null
};

const getPopupAdConfig = async (req, res) => {
    try {
        const row = await AppConfig.findOne({
            where: { category: 'popup_ad', config_key: 'popup_ad_config', status: 1 }
        });
        const data = row?.config_value
            ? { ...POPUP_AD_DEFAULTS, ...JSON.parse(row.config_value) }
            : { ...POPUP_AD_DEFAULTS };
        res.json({ code: 0, data });
    } catch (e) {
        console.error('获取弹窗广告配置失败:', e);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

const updatePopupAdConfig = async (req, res) => {
    try {
        const body = req.body || {};
        const config = {
            enabled: !!body.enabled,
            frequency: ['every_time', 'once_daily', 'once_session'].includes(body.frequency)
                ? body.frequency
                : 'once_daily',
            image_url:   body.image_url   || '',
            link_type:   body.link_type   || 'none',
            link_value:  body.link_value  || '',
            button_text: body.button_text || '',
            product_id:  body.product_id  ? Number(body.product_id) : null
        };
        await AppConfig.upsert({
            config_key:   'popup_ad_config',
            config_value: JSON.stringify(config),
            config_type:  'json',
            category:     'popup_ad',
            description:  '首页弹窗广告配置',
            is_public:    true,
            status:       1
        });
        res.json({ code: 0, message: '保存成功' });
    } catch (e) {
        console.error('更新弹窗广告配置失败:', e);
        res.status(500).json({ code: -1, message: '保存失败' });
    }
};

// ─── 规则公告配置 ────────────────────────────────────────────────────

const getRulesConfig = async (req, res) => {
    try {
        const configs = await AppConfig.findAll({
            where: { category: 'notice', status: 1 },
            attributes: ['config_key', 'config_value', 'config_type', 'category']
        });

        const formatted = {};
        configs.forEach(config => {
            let value = config.config_value;
            if (config.config_type === 'number')  value = parseFloat(value);
            if (config.config_type === 'boolean') value = (value === 'true');
            if (config.config_type === 'json') {
                try { value = JSON.parse(value); } catch (_) {}
            }
            formatted[config.config_key] = value;
        });

        res.json({ code: 0, data: formatted });
    } catch (error) {
        console.error('获取规则配置失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

const updateRulesConfig = async (req, res) => {
    try {
        const { settings } = req.body;
        if (!settings) {
            return res.status(400).json({ code: -1, message: '参数不完整' });
        }

        const operations = Object.entries(settings).map(([key, value]) => {
            let type = 'string';
            if (typeof value === 'number') type = 'number';
            if (typeof value === 'boolean') type = 'boolean';
            if (typeof value === 'object') type = 'json';

            const stringValue = type === 'json' ? JSON.stringify(value) : String(value);

            return AppConfig.upsert({
                config_key:   key,
                config_value: stringValue,
                config_type:  type,
                category:     'notice',
                description:  '发货与佣金规则说明',
                is_public:    true,
                status:       1
            });
        });

        await Promise.all(operations);
        clearPagePayloadCache('user');
        res.json({ code: 0, message: '配置已更新' });
    } catch (error) {
        console.error('更新规则配置失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

module.exports = {
    getDashboardNotifications,
    getPopupAdConfig,
    updatePopupAdConfig,
    getRulesConfig,
    updateRulesConfig
};
