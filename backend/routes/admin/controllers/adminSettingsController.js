/**
 * 后台系统设置控制器
 * 
 * 提供动态配置业务参数的功能
 * 支持将配置持久化到 app_configs 表
 */
const { AppConfig, Product, Order, User, CommissionLog, Withdrawal, Refund, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const constants = require('../../../config/constants');
const MemberTierService = require('../../../services/MemberTierService');
const { FEATURE_DEFS, getFeatureToggleKey, buildFeatureToggleList } = require('../../../utils/featureToggles');
const {
    loadMiniProgramConfig,
    saveMiniProgramConfig
} = require('../../../utils/miniprogramConfig');
const { getPaymentHealth } = require('../../../utils/paymentHealth');
const { clearRuntimeBusinessConfigCache } = require('../../../utils/runtimeBusinessConfig');

/**
 * 获取功能开关状态
 */
const getFeatureToggles = async (req, res) => {
    try {
        const keys = FEATURE_DEFS.map((feature) => getFeatureToggleKey(feature.key));
        const configs = await AppConfig.findAll({
            where: { category: 'feature_toggle', config_key: { [Op.in]: keys } }
        });
        const result = buildFeatureToggleList(configs);
        res.json({ code: 0, data: result });
    } catch (error) {
        console.error('获取功能开关失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 批量更新功能开关
 * body: { toggles: { logistics: true, activity: false, ... } }
 */
const updateFeatureToggles = async (req, res) => {
    try {
        const { toggles } = req.body;
        if (!toggles || typeof toggles !== 'object') {
            return res.status(400).json({ code: -1, message: '参数不完整' });
        }
        const ops = Object.entries(toggles).map(([key, val]) =>
            AppConfig.upsert({
                config_key: getFeatureToggleKey(key),
                config_value: String(!!val),
                config_type: 'boolean',
                category: 'feature_toggle',
                description: FEATURE_DEFS.find(f => f.key === key)?.label || key,
                is_public: true,
                status: 1
            })
        );
        await Promise.all(ops);
        res.json({ code: 0, message: '功能开关已更新' });
    } catch (error) {
        console.error('更新功能开关失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

const getMiniProgramConfig = async (req, res) => {
    try {
        const data = await loadMiniProgramConfig(AppConfig);
        res.json({ code: 0, data });
    } catch (error) {
        const sqlMsg = error?.parent?.sqlMessage || error?.original?.sqlMessage;
        console.error('获取小程序配置失败:', sqlMsg || error.message, {
            method: req.method,
            path: req.originalUrl || req.url,
            stack: error.stack
        });
        res.status(500).json({
            code: -1,
            message: '获取失败' + (sqlMsg || error.message ? `: ${sqlMsg || error.message}` : '')
        });
    }
};

const updateMiniProgramConfig = async (req, res) => {
    try {
        const payload = req.body || {};
        const data = await saveMiniProgramConfig(AppConfig, payload);
        clearHomepageCache();
        clearRuntimeBusinessConfigCache();
        res.json({ code: 0, data, message: '小程序配置已更新' });
    } catch (error) {
        console.error('更新小程序配置失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

/**
 * 获取会员等级与成长值配置
 */
const getMemberTierConfig = async (req, res) => {
    try {
        const [
            member_levels,
            growth_tiers,
            growth_rules,
            commerce_policy,
            purchase_levels,
            point_levels,
            point_rules
        ] = await Promise.all([
            MemberTierService.getMemberLevels(),
            MemberTierService.getGrowthTiers(),
            MemberTierService.getGrowthRules(),
            MemberTierService.getCommercePolicy(),
            MemberTierService.getPurchaseLevels(),
            MemberTierService.getPointLevels(),
            MemberTierService.getPointRules()
        ]);
        res.json({
            code: 0,
            data: {
                member_levels,
                growth_tiers,
                growth_rules,
                commerce_policy,
                purchase_levels,
                point_levels,
                point_rules
            }
        });
    } catch (error) {
        console.error('获取会员等级配置失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 更新会员等级与成长值配置
 * body: { member_levels?: [], growth_tiers?: [] }
 */
const updateMemberTierConfig = async (req, res) => {
    try {
        const {
            member_levels,
            growth_tiers,
            growth_rules,
            commerce_policy,
            purchase_levels,
            point_levels,
            point_rules
        } = req.body || {};
        if (
            !member_levels
            && !growth_tiers
            && !growth_rules
            && !commerce_policy
            && !purchase_levels
            && !point_levels
            && !point_rules
        ) {
            return res.status(400).json({ code: -1, message: '参数不完整' });
        }
        await MemberTierService.saveTierConfigs({
            memberLevels: member_levels,
            growthTiers: growth_tiers,
            growthRules: growth_rules,
            commercePolicy: commerce_policy,
            purchaseLevels: purchase_levels,
            pointLevels: point_levels,
            pointRules: point_rules
        });
        res.json({ code: 0, message: '会员等级配置已更新' });
    } catch (error) {
        console.error('更新会员等级配置失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

/**
 * 运营控制台聚合数据
 * 返回：今日概况 + 商品榜单 + 库存预警 + 待处理事项
 */
const getOperationsDashboard = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            todayOrders, todaySalesRow, totalUsers, pendingShip,
            pendingWithdrawals, pendingRefunds, pendingCommissions,
            lowStockProducts, hotProducts, recentOrders
        ] = await Promise.all([
            // 今日订单
            Order.count({ where: { created_at: { [Op.gte]: today } } }),
            // 今日销售额
            Order.findOne({
                attributes: [[sequelize.fn('SUM', sequelize.col('actual_price')), 'total']],
                where: { status: { [Op.in]: ['paid', 'shipped', 'completed'] }, paid_at: { [Op.gte]: today } },
                raw: true
            }),
            // 总用户
            User.count({ where: { status: 1 } }),
            // 待发货
            Order.count({ where: { status: 'paid' } }),
            // 待审核提现
            Withdrawal.count({ where: { status: 'pending' } }),
            // 待处理售后
            Refund.count({ where: { status: 'pending' } }),
            // 待审批佣金
            CommissionLog.count({ where: { status: 'pending_approval' } }),
            // 库存预警（库存 < 10）
            Product.findAll({
                where: { status: 1, stock: { [Op.lt]: 10 } },
                attributes: ['id', 'name', 'stock', 'images'],
                order: [['stock', 'ASC']],
                limit: 8
            }),
            // 热度榜 Top 8
            Product.findAll({
                where: { status: 1 },
                attributes: ['id', 'name', 'heat_score', 'purchase_count', 'view_count', 'retail_price', 'images'],
                order: [['heat_score', 'DESC'], ['purchase_count', 'DESC']],
                limit: 8
            }),
            // 最近 6 条订单
            Order.findAll({
                attributes: ['id', 'order_no', 'total_amount', 'actual_price', 'status', 'created_at'],
                order: [['created_at', 'DESC']],
                limit: 6
            })
        ]);

        res.json({
            code: 0,
            data: {
                kpi: {
                    today_orders: todayOrders,
                    today_sales: parseFloat(todaySalesRow?.total || 0).toFixed(2),
                    total_users: totalUsers,
                    pending_ship: pendingShip
                },
                pending: {
                    withdrawals: pendingWithdrawals,
                    refunds: pendingRefunds,
                    commissions: pendingCommissions
                },
                low_stock: lowStockProducts,
                hot_products: hotProducts,
                recent_orders: recentOrders
            }
        });
    } catch (error) {
        console.error('获取运营数据失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};
const { clearHomepageCache } = require('../../../controllers/configController');

/**
 * 获取所有系统设置
 */
const getSettings = async (req, res) => {
    try {
        // 1. 获取所有配置
        const configs = await AppConfig.findAll({
            where: { status: 1 }
        });

        // 2. 将配置转换为对象结构
        const dbSettings = {};
        configs.forEach(config => {
            if (!dbSettings[config.category]) {
                dbSettings[config.category] = {};
            }

            let value = config.config_value;
            // 类型转换
            if (config.config_type === 'number') value = parseFloat(value);
            if (config.config_type === 'boolean') value = (value === 'true');
            if (config.config_type === 'json') {
                try { value = JSON.parse(value); } catch (e) { }
            }

            dbSettings[config.category][config.config_key] = value;
        });

        const sys = dbSettings.SYSTEM || {};
        const purgeDaysRaw = sys.USER_IDLE_GUEST_PURGE_DAYS;
        const purgeDays = Number.isFinite(parseInt(purgeDaysRaw, 10))
            ? parseInt(purgeDaysRaw, 10)
            : constants.USER.IDLE_GUEST_PURGE_DAYS;
        const defaultAv =
            (sys.USER_DEFAULT_AVATAR_URL && String(sys.USER_DEFAULT_AVATAR_URL).trim())
            || constants.USER.DEFAULT_AVATAR_URL;

        // 3. 与默认常量合并 (DB配置优先)
        const settings = {
            ORDER: { ...constants.ORDER, ...(dbSettings.ORDER || {}) },
            COMMISSION: { ...constants.COMMISSION, ...(dbSettings.COMMISSION || {}) },
            WITHDRAWAL: { ...constants.WITHDRAWAL, ...(dbSettings.WITHDRAWAL || {}) },
            REFUND: { ...constants.REFUND, ...(dbSettings.REFUND || {}) },
            USER: {
                IDLE_GUEST_PURGE_DAYS: purgeDays,
                DEFAULT_AVATAR_URL: defaultAv
            },
            UPGRADE_RULES: {
                MEMBER_TO_LEADER_REFEREE: constants.UPGRADE_RULES.MEMBER_TO_LEADER.referee_count,
                LEADER_TO_AGENT_ORDERS: constants.UPGRADE_RULES.LEADER_TO_AGENT.order_count,
                LEADER_TO_AGENT_RECHARGE: constants.UPGRADE_RULES.LEADER_TO_AGENT.recharge_amount,
                ...(dbSettings.UPGRADE_RULES || {})
            },
            STOCK: {
                LOW_THRESHOLD: 10,
                ...(dbSettings.STOCK || {})
            }
        };

        res.json({
            code: 0,
            data: settings
        });
    } catch (error) {
        console.error('获取系统设置失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 更新系统设置 (持久化到数据库)
 */
const updateSettings = async (req, res) => {
    try {
        let { category, settings } = req.body;
        // 兼容旧版前端：直接提交平铺对象
        if (!settings && req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
            const flat = { ...req.body };
            delete flat.category;
            delete flat.settings;
            if (Object.keys(flat).length > 0) {
                settings = flat;
                category = category || 'SYSTEM';
            }
        }
        if (!category || !settings || typeof settings !== 'object') {
            return res.status(400).json({ code: -1, message: '参数不完整' });
        }

        // 遍历设置项并更新/创建
        const operations = [];
        for (const [key, value] of Object.entries(settings)) {
            // 确定数据类型
            let type = 'string';
            if (typeof value === 'number') type = 'number';
            if (typeof value === 'boolean') type = 'boolean';
            if (typeof value === 'object') type = 'json';

            let stringValue = value;
            if (type === 'json') stringValue = JSON.stringify(value);
            else stringValue = String(value);

            const isPublicCategory = ['homepage', 'popup_ad', 'settings'].includes(category);
            operations.push(AppConfig.upsert({
                config_key: key,
                config_value: stringValue,
                config_type: type,
                category: category,
                is_public: isPublicCategory,
                status: 1
            }));
        }

        await Promise.all(operations);

        // ★ 配置项可能涉及首页 Feature Cards，因此清除缓存
        clearHomepageCache();
        clearRuntimeBusinessConfigCache();

        res.json({
            code: 0,
            message: '配置已更新'
        });
    } catch (error) {
        console.error('更新系统设置失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

/**
 * 获取系统状态（增强版）
 * 整合进程、内存、操作系统、数据库连接状态
 */
const getSystemStatus = async (req, res) => {
    const mem = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);

    // 检测数据库连通性
    let dbStatus = 'ok';
    let dbLatencyMs = null;
    try {
        const { sequelize } = require('../../../models');
        const t0 = Date.now();
        await sequelize.authenticate();
        dbLatencyMs = Date.now() - t0;
    } catch (e) {
        dbStatus = 'error';
    }

    const os = require('os');
    const overall = dbStatus === 'ok' ? 'online' : 'degraded';

    res.json({
        code: 0,
        data: {
            status: overall,
            timestamp: new Date().toISOString(),
            process: {
                node_version: process.version,
                pid: process.pid,
                uptime_seconds: uptimeSec,
                uptime_human: `${h}h ${m}m`
            },
            memory: {
                heap_used_mb:  +(mem.heapUsed  / 1024 / 1024).toFixed(1),
                heap_total_mb: +(mem.heapTotal / 1024 / 1024).toFixed(1),
                heap_percent:  Math.round(mem.heapUsed / mem.heapTotal * 100),
                rss_mb:        +(mem.rss / 1024 / 1024).toFixed(1)
            },
            os: {
                platform:     os.platform(),
                free_mem_mb:  +(os.freemem()  / 1024 / 1024).toFixed(0),
                total_mem_mb: +(os.totalmem() / 1024 / 1024).toFixed(0),
                load_avg:     os.loadavg().map(v => +v.toFixed(2))
            },
            services: {
                database: { status: dbStatus, latency_ms: dbLatencyMs }
            }
        }
    });
};

const getAdminPaymentHealth = async (req, res) => {
    try {
        const refreshCertificate = String(req.query.refresh || '0') === '1';
        const data = await getPaymentHealth({ refreshCertificate });
        res.json({ code: 0, data });
    } catch (error) {
        console.error('获取支付健康状态失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

module.exports = {
    getSettings,
    updateSettings,
    getSystemStatus,
    getAdminPaymentHealth,
    getFeatureToggles,
    updateFeatureToggles,
    getMiniProgramConfig,
    updateMiniProgramConfig,
    getOperationsDashboard,
    getMemberTierConfig,
    updateMemberTierConfig
};
