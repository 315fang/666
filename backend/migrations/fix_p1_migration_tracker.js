// backend/migrations/fix_p1_migration_tracker.js
/**
 * P1 修复：建立迁移执行追踪表 schema_migrations
 *
 * 背景：当前 23 个迁移文件（phaseX + YYYYMMDD）无统一执行记录，
 *   无法判断哪些已在生产库执行，哪些尚未执行。
 *
 * 策略：
 *  1. 创建 schema_migrations 表（如已存在则跳过）
 *  2. 将当前已知应该已执行的迁移文件名补录到表中（标记为 applied）
 *
 * 执行方式：node migrations/fix_p1_migration_tracker.js
 */

const { sequelize } = require('../config/database');
const path = require('path');
const fs = require('fs');

// 已知的迁移文件（按执行顺序排列）
// ★ 请根据实际情况调整 applied_at 日期
const KNOWN_MIGRATIONS = [
    { name: 'phase2_growth_coupon_lottery.js',            applied_at: '2026-02-10' },
    { name: 'phase3_slash_group.js',                      applied_at: '2026-02-11' },
    { name: '20260211_add_cost_price_to_products.sql',    applied_at: '2026-02-11' },
    { name: 'phase4_o2o_station.js',                      applied_at: '2026-02-12' },
    { name: '20260212_add_audit_and_reservation_tables.sql', applied_at: '2026-02-12' },
    { name: 'phase5_logistics_heat.js',                   applied_at: '2026-02-23' },
    { name: '20260223_add_points_and_group_tables.sql',   applied_at: '2026-02-23' },
    { name: 'phase6_user_participate_distribution.js',    applied_at: '2026-02-25' },
    { name: 'phase7_service_station_pickup_fields.js',    applied_at: '2026-02-26' },
    { name: 'phase8_product_supports_pickup.js',          applied_at: '2026-02-27' },
    { name: 'phase9_admin_token_blacklist.js',            applied_at: '2026-02-28' },
    { name: 'phase9_users_parent_id_index.js',            applied_at: '2026-02-28' },
    { name: 'phase10_user_product_favorites.js',          applied_at: '2026-03-01' },
    { name: 'phase11_station_staff.js',                   applied_at: '2026-03-02' },
    { name: 'phase12_product_supply_prices.js',           applied_at: '2026-03-03' },
    { name: '009_create_ai_ops_tables.sql',               applied_at: '2026-03-05' },
    { name: '010_create_ai_config.sql',                   applied_at: '2026-03-05' },
    { name: '010_create_mass_message_tables.sql',         applied_at: '2026-03-05' },
    { name: 'apply_activity_spot_stock.js',               applied_at: '2026-03-21' },
    { name: '20260321_activity_spot_stock.sql',            applied_at: '2026-03-21' },
    { name: '20260321_order_completion_processed.sql',    applied_at: '2026-03-21' },
    { name: 'apply_visible_in_mall_column.js',            applied_at: '2026-03-22' },
    { name: '20260322_add_visible_in_mall_to_products.sql', applied_at: '2026-03-22' },
    // P0/P1 修复迁移
    { name: 'fix_p0_commission_type_varchar.js',          applied_at: null },  // 待执行
    { name: 'fix_p1_deprecate_member_price.js',           applied_at: null },  // 待执行
];

async function runMigration() {
    console.log('\n🚀 P1 Fix: 创建 schema_migrations 迁移追踪表\n');
    try {
        await sequelize.authenticate();

        // 1. 建表
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
                \`id\`         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                \`name\`       VARCHAR(200) NOT NULL UNIQUE COMMENT '迁移文件名',
                \`applied_at\` DATE NULL COMMENT '执行日期（NULL=尚未执行）',
                \`status\`     ENUM('applied', 'pending', 'failed') DEFAULT 'pending' COMMENT '状态',
                \`notes\`      VARCHAR(500) NULL COMMENT '备注',
                \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX \`idx_status\` (\`status\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='迁移执行追踪表'
        `);
        console.log('✅ schema_migrations 表已创建（或已存在）');

        // 2. 补录历史迁移记录
        let inserted = 0;
        let skipped = 0;
        for (const m of KNOWN_MIGRATIONS) {
            try {
                await sequelize.query(`
                    INSERT IGNORE INTO \`schema_migrations\` (name, applied_at, status)
                    VALUES (?, ?, ?)
                `, {
                    replacements: [
                        m.name,
                        m.applied_at || null,
                        m.applied_at ? 'applied' : 'pending'
                    ]
                });
                inserted++;
            } catch (e) {
                skipped++;
            }
        }
        console.log(`✅ 已补录 ${inserted} 条迁移记录，跳过 ${skipped} 条（已存在）`);

        // 3. 输出待执行迁移
        const [pending] = await sequelize.query(`
            SELECT name FROM schema_migrations WHERE status = 'pending' ORDER BY created_at
        `);
        if (pending.length > 0) {
            console.log('\n📋 待执行的迁移（status=pending）：');
            pending.forEach(p => console.log(`   ⏳ ${p.name}`));
        } else {
            console.log('✅ 无待执行迁移');
        }

        console.log('\n🎉 P1 Fix 完成！之后每次新增迁移文件，运行后请手动 INSERT 记录到 schema_migrations。\n');
    } catch (e) {
        console.error('❌ 失败:', e.message);
        throw e;
    } finally {
        await sequelize.close();
    }
}

if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { runMigration };
