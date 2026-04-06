/**
 * 创建 activity_spot_stock 表（限时专享「已售/名额」计数）
 * 缺失时小程序「限时专享」会报错：Table 's2b2c_db.activity_spot_stock' doesn't exist
 *
 * 用法（任选一种，依赖 backend/.env 里 DB_*）：
 *   cd /opt/zz/backend && node migrations/apply_activity_spot_stock.js
 *   或：cd /opt/zz/backend/migrations && node apply_activity_spot_stock.js
 *
 * Linux 不要使用 Windows 路径；若在 migrations 目录执行单文件，现已通过 database.js 固定加载 ../.env。
 *
 * 等价 SQL 见：migrations/20260321_activity_spot_stock.sql
 */
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: envPath });

if (!fs.existsSync(envPath)) {
    console.error(`\n❌ 找不到 ${envPath}`);
    console.error('   请从 .env.example 复制为 .env 并填写 DB_HOST / DB_USER / DB_PASSWORD / DB_NAME\n');
    process.exit(1);
}
if (process.env.DB_PASSWORD === undefined || process.env.DB_PASSWORD === '') {
    console.error('\n❌ DB_PASSWORD 未设置或为空');
    console.error('   MySQL 会以「无密码」连接，报错类似：Access denied for user ... (using password: NO)');
    console.error(`   请编辑：${envPath}`);
    console.error('   增加一行：DB_PASSWORD=你的数据库密码（不要加引号，等号两边不要空格）\n');
    process.exit(1);
}

const { sequelize } = require('../config/database');

async function run() {
    console.log('\n🚀 migrations: activity_spot_stock（CREATE TABLE IF NOT EXISTS）\n');
    try {
        await sequelize.authenticate();
        console.log('  ✓ 已连接数据库:', process.env.DB_NAME || 's2b2c_db');
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS \`activity_spot_stock\` (
              \`card_id\` VARCHAR(64) NOT NULL,
              \`offer_id\` VARCHAR(64) NOT NULL,
              \`sold\` INT NOT NULL DEFAULT 0,
              \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (\`card_id\`, \`offer_id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            COMMENT='限时活动专享商品已售计数'
        `);
        console.log('  ✅ 表 activity_spot_stock 已就绪（新建或已存在）');
        console.log('\n🎉 完成 — 请重新打开小程序「限时专享」页验证\n');
    } catch (e) {
        console.error('❌ 失败:', e.message);
        process.exitCode = 1;
    } finally {
        try {
            await sequelize.close();
        } catch (_) { /* ignore */ }
    }
}

if (require.main === module) {
    run();
}

module.exports = { run };
