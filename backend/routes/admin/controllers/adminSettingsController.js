/**
 * 后台系统设置控制器
 * 
 * 提供动态配置业务参数的功能
 * 支持将配置持久化到 app_configs 表
 */
const { AppConfig } = require('../../../models');
const constants = require('../../../config/constants');
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

        // 3. 与默认常量合并 (DB配置优先)
        const settings = {
            ORDER: { ...constants.ORDER, ...(dbSettings.ORDER || {}) },
            COMMISSION: { ...constants.COMMISSION, ...(dbSettings.COMMISSION || {}) },
            WITHDRAWAL: { ...constants.WITHDRAWAL, ...(dbSettings.WITHDRAWAL || {}) },
            REFUND: { ...constants.REFUND, ...(dbSettings.REFUND || {}) },
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
        const { category, settings } = req.body;

        if (!category || !settings) {
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

            operations.push(AppConfig.upsert({
                config_key: key,
                config_value: stringValue,
                config_type: type,
                category: category,
                is_public: false, // 默认后端配置不公开给前端
                status: 1
            }));
        }

        await Promise.all(operations);

        // ★ 配置项可能涉及首页 Feature Cards，因此清除缓存
        clearHomepageCache();

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

module.exports = {
    getSettings,
    updateSettings,
    getSystemStatus
};
