require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./config/database');
const logger = require('./utils/logger');
const { getPaymentHealth } = require('./utils/paymentHealth');
const CacheService = require('./services/CacheService');
const StartupService = require('./services/StartupService');

const PORT = process.env.PORT || 3001;

async function startServer() {
    try {
        const { criticalChecks, isProduction, storageProvider } = StartupService.validateCriticalConfig();

        if (isProduction && criticalChecks.length > 0) {
            criticalChecks.forEach(msg => console.error(`  ✗ ${msg}`));
            console.error('请在 .env 文件中正确配置以上变量后重新启动。\n');
            process.exit(1);
        }

        if (!isProduction && criticalChecks.length > 0) {
            console.error('\n⚠️  配置问题（非生产环境，允许继续）:');
            criticalChecks.forEach(msg => console.error(`  • ${msg}`));
            console.error('');
        }

        // 测试数据库连接
        console.log('正在连接数据库...');
        const connected = await testConnection();

        if (!connected) {
            console.error('数据库连接失败，服务器启动中止');
            process.exit(1);
        }

        await StartupService.ensureDatabaseSchema();
        await StartupService.warmupBusinessData();
        await CacheService.connect();
        console.log(`[启动] 通用缓存已就绪: ${CacheService.useMemory ? '内存模式' : 'Redis模式'}`);
        console.log(`[启动] 定时任务锁: ${process.env.TASK_LOCK_BACKEND || 'memory'} | 管理员 Token 黑名单: ${process.env.ADMIN_TOKEN_BLACKLIST_STORE || 'memory'}`);

        const { settleInterval, certRefreshHours } = StartupService.registerScheduledJobs();
        StartupService.runStartupJobs();

        // 预热微信平台证书缓存（会自动下载并写入 PEM）
        const { getPlatformCertAuto } = require('./utils/wechat');
        getPlatformCertAuto().catch(err => {
            console.warn('[启动] 预热微信平台证书失败（不影响启动）:', err.message);
        });

        // 启动服务器
        app.listen(PORT, () => {
            StartupService.printStartupBanner({
                port: PORT,
                storageProvider,
                settleInterval,
                certRefreshHours
            });
        });

        getPaymentHealth().then((health) => {
            const statusLabel = health.status === 'ok' ? '正常' : health.status === 'warning' ? '警告' : '异常';
            console.log(`[启动自检] 微信支付状态: ${statusLabel} - ${health.summary}`);
            health.checks
                .filter((item) => item.status !== 'ok')
                .forEach((item) => {
                    const prefix = item.status === 'error' ? '✗' : '•';
                    console.log(`[启动自检] ${prefix} ${item.label}: ${item.message}`);
                });
        }).catch((error) => {
            console.warn('[启动自检] 微信支付状态检查失败:', error.message);
        });
    } catch (error) {
        console.error('服务器启动失败:', error);
        process.exit(1);
    }
}

startServer();
