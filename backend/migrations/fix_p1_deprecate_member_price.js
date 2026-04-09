// backend/migrations/fix_p1_deprecate_member_price.js
/**
 * P1 修复：将 products.member_price 数据迁移到 products.price_member
 *
 * 背景：
 *  - Product 模型有两个含义相同的会员价字段：member_price（旧）和 price_member（新）
 *  - PricingService / CommissionService 统一读取 price_member
 *  - 如果管理后台从旧接口写入了 member_price，前端取价会静默失败
 *
 * 策略：
 *  - 对 price_member 为 NULL 但 member_price 有值的行，将 member_price 值复制到 price_member
 *  - 不删除 member_price 列（保留兼容性，但模型注释已标记废弃）
 *
 * 执行方式：node migrations/fix_p1_deprecate_member_price.js
 */

const { sequelize } = require('../config/database');

async function runMigration() {
    console.log('\n🚀 P1 Fix: products.member_price → price_member 数据迁移\n');
    try {
        await sequelize.authenticate();

        // 1. 检查列是否存在
        const [[colCheck]] = await sequelize.query(`
            SELECT COUNT(*) as cnt
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'products'
              AND COLUMN_NAME IN ('member_price', 'price_member')
            GROUP BY TABLE_NAME
        `);
        if (Number(colCheck?.cnt) < 2) {
            console.warn('⚠️  字段检查失败，请确认 products 表有 member_price 和 price_member 两列');
            return;
        }

        // 2. 统计需要迁移的行数
        const [[countRow]] = await sequelize.query(`
            SELECT COUNT(*) as cnt FROM products
            WHERE price_member IS NULL AND member_price IS NOT NULL AND member_price > 0
        `);
        console.log(`📋 需要迁移的记录数: ${countRow.cnt}`);

        if (Number(countRow.cnt) === 0) {
            console.log('✅ 无需迁移，price_member 已有值或 member_price 无数据');
            return;
        }

        // 3. 执行迁移
        const [result] = await sequelize.query(`
            UPDATE products
            SET price_member = member_price
            WHERE price_member IS NULL AND member_price IS NOT NULL AND member_price > 0
        `);
        console.log(`✅ 已迁移 ${result.affectedRows} 条记录（member_price → price_member）`);

        // 4. 列出迁移的商品（供人工核查）
        const [migrated] = await sequelize.query(`
            SELECT id, name, member_price, price_member
            FROM products
            WHERE member_price IS NOT NULL AND member_price > 0
              AND ABS(price_member - member_price) < 0.01
            LIMIT 20
        `);
        if (migrated.length > 0) {
            console.log('\n📋 已迁移的商品样本（前20条）：');
            migrated.forEach(p => {
                console.log(`   ID:${p.id} "${p.name}"  member_price=${p.member_price} → price_member=${p.price_member}`);
            });
        }

        console.log('\n🎉 P1 Fix 完成！\n');
        console.log('📌 后续操作提示：');
        console.log('   1. 确认前端取价正常后，可从 Product.js 中移除 member_price 字段定义');
        console.log('   2. 并执行: ALTER TABLE products DROP COLUMN member_price;');
    } catch (e) {
        console.error('❌ 迁移失败:', e.message);
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
