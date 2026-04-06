/**
 * 在服务器上执行：为 portal_accounts 增加 last_portal_init_issue_at
 * 用于小程序「申领门户初始密码」24 小时限流（多进程/重启后仍生效）。
 *
 * 用法（在 backend 目录、配置好 .env 数据库后）:
 *   node scripts/add-portal-last-init-issue-at.js
 *
 * 或 npm run db:portal-init-column
 */
const { sequelize } = require('../models');

async function columnExists(table, column) {
    const [rows] = await sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        { replacements: [table, column] }
    );
    return rows.length > 0;
}

async function run() {
    await sequelize.authenticate();
    const table = 'portal_accounts';
    const column = 'last_portal_init_issue_at';

    const exists = await columnExists(table, column);
    if (exists) {
        console.log(`⏭️  ${table}.${column} 已存在，跳过`);
        await sequelize.close();
        process.exit(0);
    }

    await sequelize.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` DATETIME NULL DEFAULT NULL
         COMMENT '小程序申领门户初始密码时间（24h限流）'`
    );
    console.log(`✅ 已添加 ${table}.${column}`);
    await sequelize.close();
    process.exit(0);
}

run().catch(async (err) => {
    console.error(err);
    try {
        await sequelize.close();
    } catch (_) {}
    process.exit(1);
});
