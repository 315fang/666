/**
 * 为 products 表增加 visible_in_mall（商城是否展示）
 * - 已有数据默认 1 = 商城可见
 * - 可重复执行：若列已存在则跳过
 *
 * 用法（在 backend 目录，需 .env 数据库配置）：
 *   node migrations/apply_visible_in_mall_column.js
 *
 * 勿在 shell 里直接执行 .sql 文件（会被当成 bash 脚本报错）。
 * 若坚持用 SQL，请： mysql -u用户 -p 库名 < migrations/20260322_add_visible_in_mall_to_products.sql
 */
const { sequelize } = require('../config/database');

async function columnExists(qi, table, column) {
    try {
        const desc = await qi.describeTable(table);
        return Object.prototype.hasOwnProperty.call(desc, column);
    } catch {
        return false;
    }
}

async function run() {
    const qi = sequelize.getQueryInterface();
    console.log('\n🚀 migrations: visible_in_mall on products\n');
    try {
        await sequelize.authenticate();
        if (await columnExists(qi, 'products', 'visible_in_mall')) {
            console.log('  ⏭️  列 visible_in_mall 已存在，跳过');
            await sequelize.close();
            return;
        }
        await sequelize.query(`
            ALTER TABLE \`products\`
            ADD COLUMN \`visible_in_mall\` TINYINT(1) NOT NULL DEFAULT 1
            COMMENT '1=商城可见 0=商城不可见（限时活动等仍可选用）'
            AFTER \`supports_pickup\`
        `);
        console.log('  ✅ 已添加列 visible_in_mall（默认 1，老数据均为商城可见）');
        console.log('\n🎉 完成\n');
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
