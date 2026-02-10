/**
 * 后台系统设置控制器
 * 
 * 提供动态配置业务参数的功能
 * 注意：部分核心参数仍需通过 constants.js 或环境变量配置
 */
const { sequelize } = require('../../../models');

// 使用内存缓存系统配置，后续可改为数据库存储
let systemSettings = {
    // 订单配置
    ORDER: {
        AUTO_CANCEL_MINUTES: 30,
        AUTO_CONFIRM_DAYS: 15,
        AGENT_TIMEOUT_HOURS: 24
    },
    // 佣金配置
    COMMISSION: {
        FREEZE_DAYS: 15
    },
    // 提现配置
    WITHDRAWAL: {
        MIN_AMOUNT: 10,
        MAX_SINGLE_AMOUNT: 50000,
        MAX_DAILY_COUNT: 3,
        FEE_RATE: 0
    },
    // 售后配置
    REFUND: {
        MAX_REFUND_DAYS: 15
    },
    // 升级条件
    UPGRADE_RULES: {
        MEMBER_TO_LEADER_REFEREE: 2,
        LEADER_TO_AGENT_ORDERS: 10,
        LEADER_TO_AGENT_RECHARGE: 3000
    },
    // 库存预警
    STOCK: {
        LOW_THRESHOLD: 10
    }
};

/**
 * 获取所有系统设置
 */
const getSettings = async (req, res) => {
    try {
        const constants = require('../../../config/constants');

        // 合并文件配置和动态配置
        const settings = {
            ORDER: {
                AUTO_CANCEL_MINUTES: constants.ORDER.AUTO_CANCEL_MINUTES,
                AUTO_CONFIRM_DAYS: constants.ORDER.AUTO_CONFIRM_DAYS,
                AGENT_TIMEOUT_HOURS: constants.ORDER.AGENT_TIMEOUT_HOURS
            },
            COMMISSION: {
                FREEZE_DAYS: constants.COMMISSION.FREEZE_DAYS
            },
            WITHDRAWAL: {
                MIN_AMOUNT: constants.WITHDRAWAL.MIN_AMOUNT,
                MAX_SINGLE_AMOUNT: constants.WITHDRAWAL.MAX_SINGLE_AMOUNT,
                MAX_DAILY_COUNT: constants.WITHDRAWAL.MAX_DAILY_COUNT,
                FEE_RATE: constants.WITHDRAWAL.FEE_RATE
            },
            REFUND: {
                MAX_REFUND_DAYS: constants.REFUND.MAX_REFUND_DAYS
            },
            UPGRADE_RULES: {
                MEMBER_TO_LEADER_REFEREE: constants.UPGRADE_RULES.MEMBER_TO_LEADER.referee_count,
                LEADER_TO_AGENT_ORDERS: constants.UPGRADE_RULES.LEADER_TO_AGENT.order_count,
                LEADER_TO_AGENT_RECHARGE: constants.UPGRADE_RULES.LEADER_TO_AGENT.recharge_amount
            },
            STOCK: systemSettings.STOCK
        };

        res.json({
            code: 0,
            data: settings,
            message: '注意：当前配置来自 constants.js 文件，修改需要重启服务生效'
        });
    } catch (error) {
        console.error('获取系统设置失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 更新系统设置（仅更新内存中的配置，重启后失效）
 * 生产环境建议将配置持久化到数据库
 */
const updateSettings = async (req, res) => {
    try {
        const { category, key, value } = req.body;

        if (!category || !key || value === undefined) {
            return res.status(400).json({ code: -1, message: '参数不完整' });
        }

        if (!systemSettings[category]) {
            return res.status(400).json({ code: -1, message: '无效的配置类别' });
        }

        // 更新内存配置
        systemSettings[category][key] = value;

        res.json({
            code: 0,
            message: `设置已更新（仅内存生效，重启后需重新配置）。如需永久生效，请修改 .env 文件`,
            data: { [category]: systemSettings[category] }
        });
    } catch (error) {
        console.error('更新系统设置失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

/**
 * 获取系统状态
 */
const getSystemStatus = async (req, res) => {
    try {
        // 数据库连接检查
        let dbStatus = 'unknown';
        try {
            await sequelize.authenticate();
            dbStatus = 'connected';
        } catch (e) {
            dbStatus = 'disconnected';
        }

        // 系统信息
        const systemInfo = {
            nodeVersion: process.version,
            platform: process.platform,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            env: process.env.NODE_ENV || 'development'
        };

        // 服务状态
        const serviceStatus = {
            database: dbStatus,
            api: 'running'
        };

        res.json({
            code: 0,
            data: {
                system: systemInfo,
                services: serviceStatus,
                startTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
            }
        });
    } catch (error) {
        console.error('获取系统状态失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

module.exports = {
    getSettings,
    updateSettings,
    getSystemStatus
};
