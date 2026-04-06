const { sequelize } = require('../config/database');
const models = require('../models');
const { Review, PortalAccount, AgentWalletAccount, AgentWalletLog, ContentBoard, ContentBoardItem, ContentBoardProduct, PageLayout } = models;
const { migrateLegacyDataToBoards } = require('./BoardService');
const { ensureDefaultPageLayouts } = require('./PageLayoutService');
const OrderJobService = require('./OrderJobService');
const UserCleanupService = require('./UserCleanupService');
const constants = require('../config/constants');
const { executeWithLock } = require('../utils/taskLock');
const logger = require('../utils/logger');

function validateCriticalConfig() {
    const criticalChecks = [];
    const isProduction = process.env.NODE_ENV === 'production';

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('INSECURE-DEFAULT') || process.env.JWT_SECRET.length < 32) {
        if (isProduction) {
            criticalChecks.push('JWT_SECRET 未设置、使用了不安全的默认值或长度不足32字符');
        } else {
            logger.warn('STARTUP', 'JWT_SECRET 未设置或不安全，建议在 .env 文件中配置强密钥（至少32字符）');
        }
    }

    if (!process.env.ADMIN_JWT_SECRET || process.env.ADMIN_JWT_SECRET.includes('INSECURE-DEFAULT') || process.env.ADMIN_JWT_SECRET.length < 32) {
        if (isProduction) {
            criticalChecks.push('ADMIN_JWT_SECRET 未设置、使用了不安全的默认值或长度不足32字符');
        } else {
            logger.warn('STARTUP', 'ADMIN_JWT_SECRET 未设置或不安全，建议在 .env 文件中配置强密钥（至少32字符）');
        }
    }

    const storageProvider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
    if (storageProvider === 'tencent') {
        if (!process.env.TENCENT_SECRET_ID || !process.env.TENCENT_SECRET_KEY || !process.env.TENCENT_COS_BUCKET) {
            criticalChecks.push('STORAGE_PROVIDER=tencent 时，TENCENT_SECRET_ID / TENCENT_SECRET_KEY / TENCENT_COS_BUCKET 不能为空');
        }
        if (!process.env.TENCENT_COS_CUSTOM_DOMAIN) {
            logger.warn('STARTUP', '未配置 TENCENT_COS_CUSTOM_DOMAIN，图片将回退 COS 源站直链，可能导致小程序加载慢或超时');
        }
    }

    if (!process.env.WECHAT_APPID || !process.env.WECHAT_SECRET) {
        criticalChecks.push('WECHAT_APPID / WECHAT_SECRET 未配置');
    }

    const dbPwd = process.env.DB_PASSWORD || '';
    const dbPwdBadValues = ['your_mysql_password', 'password', '123456', '请填入你的MySQL数据库密码', ''];
    if (dbPwdBadValues.includes(dbPwd) || dbPwd.length < 6) {
        if (isProduction) {
            criticalChecks.push('DB_PASSWORD 未设置或使用了占位符默认值，请在 .env 中填入真实数据库密码');
        } else {
            logger.warn('STARTUP', 'DB_PASSWORD 未设置或使用默认值');
        }
    }

    return {
        criticalChecks,
        isProduction,
        storageProvider
    };
}

async function ensureDatabaseSchema() {
    const [existingTables] = await sequelize.query(
        "SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'"
    );
    const tableCount = existingTables[0].cnt;

    if (tableCount < 5) {
        console.log('检测到全新数据库，正在自动建表...');
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await sequelize.sync({ force: false });
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('✅ 所有数据表已创建完成');
        return;
    }

    if (process.env.NODE_ENV === 'development') {
        console.log('开发环境跳过 sequelize.sync({ alter: true })，避免重复索引污染');
    }

    const lightweightModels = [
        Review,
        PortalAccount,
        AgentWalletAccount,
        AgentWalletLog,
        ContentBoard,
        ContentBoardItem,
        ContentBoardProduct,
        PageLayout
    ];

    for (const model of lightweightModels) {
        try {
            await model.sync();
        } catch (error) {
            // 已存在或轻量同步失败时忽略，避免阻塞启动
        }
    }
}

async function warmupBusinessData() {
    try {
        await migrateLegacyDataToBoards();
    } catch (error) {
        console.warn('[startup] 榜单迁移初始化失败:', error.message);
    }

    try {
        await ensureDefaultPageLayouts();
    } catch (error) {
        console.warn('[startup] 页面编排初始化失败:', error.message);
    }
}

function scheduleLockedJob(name, handler, intervalMs, timeoutMs, message) {
    setInterval(async () => {
        await executeWithLock(name, handler, { timeout: timeoutMs }).catch((error) => {
            console.error(message, error);
        });
    }, intervalMs);
}

function registerScheduledJobs() {
    const settleInterval = constants.COMMISSION.SETTLE_INTERVAL_MS;

    scheduleLockedJob(
        'settleCommissions',
        async () => {
            const count = await OrderJobService.settleCommissions();
            if (count > 0) {
                console.log(`[定时任务] 佣金结算完成: ${count} 条记录`);
            }
        },
        settleInterval,
        10 * 60 * 1000,
        '[定时任务] 佣金结算异常:'
    );

    scheduleLockedJob(
        'autoCancelOrders',
        async () => OrderJobService.autoCancelExpiredOrders(),
        60 * 1000,
        2 * 60 * 1000,
        '[定时任务] 自动取消订单异常:'
    );

    scheduleLockedJob(
        'autoConfirmOrders',
        async () => OrderJobService.autoConfirmOrders(),
        60 * 60 * 1000,
        10 * 60 * 1000,
        '[定时任务] 自动确认收货异常:'
    );

    scheduleLockedJob(
        'purgeIdleGuestUsers',
        async () => UserCleanupService.purgeIdleGuestUsers(),
        24 * 60 * 60 * 1000,
        5 * 60 * 1000,
        '[定时任务] 闲置游客清理异常:'
    );

    scheduleLockedJob(
        'processRefundDeadline',
        async () => OrderJobService.processRefundDeadlineExpired(),
        10 * 60 * 1000,
        10 * 60 * 1000,
        '[定时任务] 售后期结束处理异常:'
    );

    scheduleLockedJob(
        'autoTransferAgentOrders',
        async () => OrderJobService.autoTransferAgentOrders(),
        30 * 60 * 1000,
        10 * 60 * 1000,
        '[定时任务] 代理商订单超时转平台异常:'
    );

    const { processExpiredGroups } = require('../controllers/groupController');
    scheduleLockedJob(
        'checkExpiredGroups',
        async () => processExpiredGroups(),
        5 * 60 * 1000,
        3 * 60 * 1000,
        '[定时任务] 拼团超时处理异常:'
    );

    const certRefreshHours = Math.max(1, parseInt(process.env.WECHAT_PAY_CERT_REFRESH_INTERVAL_HOURS || '24', 10));
    const certRefreshIntervalMs = certRefreshHours * 60 * 60 * 1000;
    const { refreshPlatformCert } = require('../utils/wechat');
    setInterval(async () => {
        try {
            await refreshPlatformCert();
            console.log('[定时任务] 微信平台证书已刷新');
        } catch (error) {
            console.error('[定时任务] 微信平台证书刷新失败:', error.message);
        }
    }, certRefreshIntervalMs);

    const AlertService = require('./AlertService');
    scheduleLockedJob(
        'businessAlertCheck',
        async () => {
            const cfg = await AlertService.loadAlertConfig();
            if (!cfg.alert_enabled) return;

            const { Order, Refund, Withdrawal } = require('../models');
            const { Op } = require('sequelize');
            const issues = [];

            const longPending = await Order.count({
                where: {
                    status: 'pending',
                    created_at: { [Op.lt]: new Date(Date.now() - 2 * 60 * 60 * 1000) }
                }
            });
            if (longPending > 5) issues.push(`超时未支付订单：${longPending} 单（>2h）`);

            const pendingRefunds = await Refund.count({ where: { status: 'pending' } });
            if (pendingRefunds > 10) issues.push(`待审核退款积压：${pendingRefunds} 单`);

            const pendingWithdrawals = await Withdrawal.count({ where: { status: 'pending' } });
            if (pendingWithdrawals > 20) issues.push(`待审核提现积压：${pendingWithdrawals} 笔`);

            if (issues.length > 0) {
                const content = issues.map((item) => `- ${item}`).join('\n');
                await AlertService.send('业务异常告警', content, 'warning', 'business_anomaly');
            }
        },
        5 * 60 * 1000,
        5 * 60 * 1000,
        '[定时任务] 告警检测异常:'
    );

    return { settleInterval, certRefreshHours };
}

function runStartupJobs() {
    executeWithLock('settleCommissions', async () => {
        const count = await OrderJobService.settleCommissions();
        if (count > 0) {
            console.log(`[启动结算] 佣金结算完成: ${count} 条记录`);
        }
    }).catch(() => {});
    executeWithLock('autoCancelOrders', OrderJobService.autoCancelExpiredOrders).catch(() => {});
    executeWithLock('autoConfirmOrders', OrderJobService.autoConfirmOrders).catch(() => {});
    executeWithLock('processRefundDeadline', OrderJobService.processRefundDeadlineExpired).catch(() => {});
    executeWithLock('autoTransferAgentOrders', OrderJobService.autoTransferAgentOrders).catch(() => {});
    executeWithLock('purgeIdleGuestUsers', UserCleanupService.purgeIdleGuestUsers).catch(() => {});
}

function printStartupBanner({ port, storageProvider, settleInterval, certRefreshHours }) {
    console.log(`\n========================================`);
    console.log(`  S2B2C Backend Server`);
    console.log(`  环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  端口: ${port}`);
    console.log(`  URL: http://localhost:${port}`);
    console.log(`  存储服务: ${storageProvider}`);
    if (storageProvider === 'tencent') {
        console.log(`  CDN域名: ${process.env.TENCENT_COS_CUSTOM_DOMAIN || '(未配置，回退COS源站)'}`);
    }
    console.log(`  佣金结算间隔: ${settleInterval / 1000}s`);
    console.log(`  佣金冻结天数: T+${constants.COMMISSION.FREEZE_DAYS}`);
    console.log(`  调试路由: ${constants.DEBUG.ENABLE_DEBUG_ROUTES ? '开启' : '关闭'}`);
    console.log(`  测试接口: ${constants.DEBUG.ENABLE_TEST_ROUTES ? '开启' : '关闭'}`);
    console.log(`  微信证书自动刷新间隔: ${certRefreshHours}h`);
    console.log(`========================================\n`);
}

module.exports = {
    validateCriticalConfig,
    ensureDatabaseSchema,
    warmupBusinessData,
    registerScheduledJobs,
    runStartupJobs,
    printStartupBanner
};
