require('dotenv').config();
const app = require('./app');
const { sequelize, testConnection } = require('./config/database');

const PORT = process.env.PORT || 3000;

/**
 * 验证必要的环境变量是否已配置
 */
function validateEnv() {
    const required = [
        'JWT_SECRET',
        'ADMIN_JWT_SECRET'
    ];

    // 生产环境需要更多配置
    if (process.env.NODE_ENV === 'production') {
        required.push('DB_PASSWORD', 'WECHAT_APPID', 'WECHAT_SECRET');
    }

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        console.error(`✗ 缺少必要的环境变量: ${missing.join(', ')}`);
        console.error('  请检查 .env 文件配置');
        process.exit(1);
    }
    console.log('✓ 环境变量检查通过');
}

async function startServer() {
    try {
        // 验证环境变量
        validateEnv();

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

        // 启动服务器
        app.listen(PORT, () => {
            console.log(`\n========================================`);
            console.log(`  S2B2C Backend Server`);
            console.log(`  环境: ${process.env.NODE_ENV || 'development'}`);
            console.log(`  端口: ${PORT}`);
            console.log(`  URL: http://localhost:${PORT}`);
            console.log(`========================================\n`);
        });
    } catch (error) {
        console.error('服务器启动失败:', error);
        process.exit(1);
    }
}

startServer();
