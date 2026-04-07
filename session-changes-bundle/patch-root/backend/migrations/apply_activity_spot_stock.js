/**
 * 创建 activity_spot_stock 表（限时专享「已售/名额」计数）
 * 缺失时小程序「限时专享」会报错：Table 's2b2c_db.activity_spot_stock' doesn't exist
 *
 * 用法（在 backend 目录，依赖 .env 里 DB_* 与项目一致）：
 *   node migrations/apply_activity_spot_stock.js
 *
 * 等价 SQL 见：migrations/20260321_activity_spot_stock.sql
 */
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
