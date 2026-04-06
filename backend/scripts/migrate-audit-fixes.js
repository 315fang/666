/**
 * 业务逻辑审计修复 - 数据库迁移脚本
 * 
 * 变更清单:
 *   1. orders 表新增 payment_method 列（区分微信/货款支付）
 *   2. agent_wallet_logs 表 change_type ENUM 新增 recharge_pending
 *   3. agent_wallet_logs 表 account_id 改为允许 NULL
 *   4. commission_logs 表 order_id 改为允许 NULL
 */
require('dotenv').config();
const { sequelize } = require('../models');

async function columnExists(table, column) {
    const [rows] = await sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${column}'`
    );
    return rows.length > 0;
}

async function getColumnNullable(table, column) {
    const [rows] = await sequelize.query(
        `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${column}'`
    );
    return rows.length > 0 ? rows[0].IS_NULLABLE : null;
}

async function getEnumValues(table, column) {
    const [rows] = await sequelize.query(
        `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${column}'`
    );
    if (rows.length === 0) return [];
    const match = rows[0].COLUMN_TYPE.match(/enum\((.+)\)/i);
    if (!match) return [];
    return match[1].split(',').map(v => v.replace(/'/g, '').trim());
}

(async () => {
    let success = 0;
    let skipped = 0;
    let failed = 0;

    try {
        console.log('=== 业务审计修复 - 数据库迁移 ===\n');

        // 1. orders.payment_method
        if (!(await columnExists('orders', 'payment_method'))) {
            await sequelize.query("ALTER TABLE orders ADD COLUMN payment_method VARCHAR(20) DEFAULT NULL COMMENT '支付方式: wechat/wallet'");
            console.log('✓ [1/4] orders.payment_method 列添加成功');
            success++;
        } else {
            console.log('- [1/4] orders.payment_method 已存在，跳过');
            skipped++;
        }

        // 2. agent_wallet_logs.change_type 新增 recharge_pending
        const currentEnums = await getEnumValues('agent_wallet_logs', 'change_type');
        if (!currentEnums.includes('recharge_pending')) {
            await sequelize.query(
                "ALTER TABLE agent_wallet_logs MODIFY COLUMN change_type ENUM('recharge','recharge_pending','deduct','refund','adjust') NOT NULL"
            );
            console.log('✓ [2/4] agent_wallet_logs.change_type ENUM 已更新（新增 recharge_pending）');
            success++;
        } else {
            console.log('- [2/4] agent_wallet_logs.change_type 已包含 recharge_pending，跳过');
            skipped++;
        }

        // 3. agent_wallet_logs.account_id 允许 NULL
        const accountIdNullable = await getColumnNullable('agent_wallet_logs', 'account_id');
        if (accountIdNullable === 'NO') {
            await sequelize.query("ALTER TABLE agent_wallet_logs MODIFY COLUMN account_id INT NULL");
            console.log('✓ [3/4] agent_wallet_logs.account_id 已改为允许 NULL');
            success++;
        } else {
            console.log('- [3/4] agent_wallet_logs.account_id 已允许 NULL，跳过');
            skipped++;
        }

        // 4. commission_logs.order_id 允许 NULL
        const orderIdNullable = await getColumnNullable('commission_logs', 'order_id');
        if (orderIdNullable === 'NO') {
            await sequelize.query("ALTER TABLE commission_logs MODIFY COLUMN order_id INT NULL COMMENT '订单ID（奖金类可为空）'");
            console.log('✓ [4/4] commission_logs.order_id 已改为允许 NULL');
            success++;
        } else {
            console.log('- [4/4] commission_logs.order_id 已允许 NULL，跳过');
            skipped++;
        }

        console.log(`\n=== 迁移完成：${success} 项变更，${skipped} 项跳过，${failed} 项失败 ===`);
        process.exit(0);
    } catch (e) {
        console.error('\n❌ 迁移失败:', e.message);
        process.exit(1);
    }
})();
