require('dotenv').config();
const app = require('./app');
const { sequelize, testConnection } = require('./config/database');
const { settleCommissions, autoCancelExpiredOrders, autoConfirmOrders, processRefundDeadlineExpired, autoTransferAgentOrders } = require('./controllers/orderController');
const constants = require('./config/constants');
const { executeWithLock } = require('./utils/taskLock');
const AIOpsService = require('./services/AIOpsService');

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // ★ 启动安全检查：所有环境都要验证关键配置
        const criticalChecks = [];
        const isProduction = process.env.NODE_ENV === 'production';

        // JWT密钥验证
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('INSECURE-DEFAULT') || process.env.JWT_SECRET.length < 32) {
            if (isProduction) {
                criticalChecks.push('JWT_SECRET 未设置、使用了不安全的默认值或长度不足32字符');
            } else {
                console.warn('⚠️  警告: JWT_SECRET 未设置或不安全，建议在 .env 文件中配置强密钥（至少32字符）');
            }
        }

        if (!process.env.ADMIN_JWT_SECRET || process.env.ADMIN_JWT_SECRET.includes('INSECURE-DEFAULT') || process.env.ADMIN_JWT_SECRET.length < 32) {
            if (isProduction) {
                criticalChecks.push('ADMIN_JWT_SECRET 未设置、使用了不安全的默认值或长度不足32字符');
            } else {
                console.warn('⚠️  警告: ADMIN_JWT_SECRET 未设置或不安全，建议在 .env 文件中配置强密钥（至少32字符）');
            }
        }

        // 微信配置验证（所有环境都需要）
        if (!process.env.WECHAT_APPID || !process.env.WECHAT_SECRET) {
            criticalChecks.push('WECHAT_APPID / WECHAT_SECRET 未配置');
        }

        // 数据库密码验证
        if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === 'your_mysql_password') {
            if (isProduction) {
                criticalChecks.push('DB_PASSWORD 未设置或使用了默认值');
            } else {
                console.warn('⚠️  警告: DB_PASSWORD 未设置或使用默认值');
            }
        }

        // 在生产环境，任何检查失败都要终止启动
        if (isProduction && criticalChecks.length > 0) {
            console.error('\n⛔ 生产环境安全检查失败:');
            criticalChecks.forEach(msg => console.error(`  ✗ ${msg}`));
            console.error('请在 .env 文件中正确配置以上变量后重新启动。\n');
            process.exit(1);
        }

        // 在非生产环境，输出警告但允许继续
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

        // 同步数据库模型（开发环境）
        if (process.env.NODE_ENV === 'development') {
            console.log('同步数据库模型...');
            await sequelize.sync({ alter: true });
            console.log('✓ 数据库模型同步完成');
        }

        // ★ 定时任务：佣金自动结算（间隔从集中配置读取）
        const settleInterval = constants.COMMISSION.SETTLE_INTERVAL_MS;
        setInterval(async () => {
            await executeWithLock('settleCommissions', async () => {
                const count = await settleCommissions();
                if (count > 0) {
                    console.log(`[定时任务] 佣金结算完成: ${count} 条记录`);
                }
            }, { timeout: 10 * 60 * 1000 }).catch(err => {
                console.error('[定时任务] 佣金结算异常:', err);
            });
        }, settleInterval);

        // ★ 定时任务：自动取消超时未支付订单（每分钟检查一次）
        setInterval(async () => {
            await executeWithLock('autoCancelOrders', async () => {
                await autoCancelExpiredOrders();
            }, { timeout: 2 * 60 * 1000 }).catch(err => {
                console.error('[定时任务] 自动取消订单异常:', err);
            });
        }, 60 * 1000);

        // ★ 定时任务：自动确认收货（每小时检查一次）
        setInterval(async () => {
            await executeWithLock('autoConfirmOrders', async () => {
                await autoConfirmOrders();
            }, { timeout: 10 * 60 * 1000 }).catch(err => {
                console.error('[定时任务] 自动确认收货异常:', err);
            });
        }, 60 * 60 * 1000);

        // ★ 定时任务：售后期结束处理（每10分钟检查一次）
        // 将冻结佣金转为待审批状态，同时处理升级逻辑
        setInterval(async () => {
            await executeWithLock('processRefundDeadline', async () => {
                await processRefundDeadlineExpired();
            }, { timeout: 10 * 60 * 1000 }).catch(err => {
                console.error('[定时任务] 售后期结束处理异常:', err);
            });
        }, 10 * 60 * 1000);

        // ★ 定时任务：代理商订单超时自动转平台（每30分钟检查一次）
        setInterval(async () => {
            await executeWithLock('autoTransferAgentOrders', async () => {
                await autoTransferAgentOrders();
            }, { timeout: 10 * 60 * 1000 }).catch(err => {
                console.error('[定时任务] 代理商订单超时转平台异常:', err);
            });
        }, 30 * 60 * 1000);

        // 启动时也执行一次（使用锁机制）
        executeWithLock('settleCommissions', async () => {
            const count = await settleCommissions();
            if (count > 0) console.log(`[启动结算] 佣金结算完成: ${count} 条记录`);
        }).catch(() => { });
        executeWithLock('autoCancelOrders', autoCancelExpiredOrders).catch(() => { });
        executeWithLock('autoConfirmOrders', autoConfirmOrders).catch(() => { });
        executeWithLock('processRefundDeadline', processRefundDeadlineExpired).catch(() => { });
        executeWithLock('autoTransferAgentOrders', autoTransferAgentOrders).catch(() => { });

        // ★ 初始化AI运维监控服务
        await AIOpsService.initialize();

        // 启动服务器
        app.listen(PORT, () => {
            console.log(`\n========================================`);
            console.log(`  S2B2C Backend Server`);
            console.log(`  环境: ${process.env.NODE_ENV || 'development'}`);
            console.log(`  端口: ${PORT}`);
            console.log(`  URL: http://localhost:${PORT}`);
            console.log(`  佣金结算间隔: ${settleInterval / 1000}s`);
            console.log(`  佣金冻结天数: T+${constants.COMMISSION.FREEZE_DAYS}`);
            console.log(`  调试路由: ${constants.DEBUG.ENABLE_DEBUG_ROUTES ? '开启' : '关闭'}`);
            console.log(`  测试接口: ${constants.DEBUG.ENABLE_TEST_ROUTES ? '开启' : '关闭'}`);
            console.log(`  AI运维监控: ${AIOpsService.isRunning ? '运行中' : '已禁用'}`);
            console.log(`========================================\n`);
        });
    } catch (error) {
        console.error('服务器启动失败:', error);
        process.exit(1);
    }
}

startServer();
