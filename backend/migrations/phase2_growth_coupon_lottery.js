// backend/migrations/phase2_growth_coupon_lottery.js
/**
 * Phase 2 数据库迁移：
 * 1. users 表：添加 growth_value，discount_rate 字段
 * 2. orders 表：添加 coupon_id，coupon_discount，points_used，points_discount，member_discount_rate 字段
 * 3. 创建 lottery_prizes 表
 * 4. 创建 lottery_records 表
 * 5. 创建 coupons 表
 * 6. 创建 user_coupons 表
 *
 * 运行方式：node migrations/phase2_growth_coupon_lottery.js
 */

const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
    const qi = sequelize.getQueryInterface();

    console.log('🚀 开始 Phase 2 数据库迁移...\n');

    // ── 1. users 表 ──
    try {
        await qi.addColumn('users', 'growth_value', {
            type: DataTypes.DECIMAL(12, 2),
            defaultValue: 0.00,
            comment: '消费成长值（只增不减）'
        });
        console.log('  ✅ users.growth_value 添加成功');
    } catch (e) {
        if (e.message.includes('Duplicate column')) console.log('  ⏭️  users.growth_value 已存在，跳过');
        else throw e;
    }

    try {
        await qi.addColumn('users', 'discount_rate', {
            type: DataTypes.DECIMAL(4, 2),
            defaultValue: 1.00,
            comment: '由成长值阶梯自动更新的折扣比例'
        });
        console.log('  ✅ users.discount_rate 添加成功');
    } catch (e) {
        if (e.message.includes('Duplicate column')) console.log('  ⏭️  users.discount_rate 已存在，跳过');
        else throw e;
    }

    // ── 2. orders 表 ──
    const orderFields = [
        ['coupon_id', { type: DataTypes.INTEGER, allowNull: true }],
        ['coupon_discount', { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 }],
        ['points_used', { type: DataTypes.INTEGER, defaultValue: 0 }],
        ['points_discount', { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 }],
        ['member_discount_rate', { type: DataTypes.DECIMAL(4, 2), defaultValue: 1.00 }]
    ];
    for (const [col, def] of orderFields) {
        try {
            await qi.addColumn('orders', col, def);
            console.log(`  ✅ orders.${col} 添加成功`);
        } catch (e) {
            if (e.message.includes('Duplicate column')) console.log(`  ⏭️  orders.${col} 已存在，跳过`);
            else throw e;
        }
    }

    // ── 3. lottery_prizes 表 ──
    try {
        await qi.createTable('lottery_prizes', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            name: { type: DataTypes.STRING(100), allowNull: false },
            image_url: { type: DataTypes.STRING(255), allowNull: true },
            cost_points: { type: DataTypes.INTEGER, defaultValue: 100 },
            probability: { type: DataTypes.DECIMAL(5, 2), defaultValue: 10.00 },
            stock: { type: DataTypes.INTEGER, defaultValue: -1 },
            type: { type: DataTypes.ENUM('physical', 'points', 'coupon', 'miss'), defaultValue: 'miss' },
            prize_value: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
            sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
            is_active: { type: DataTypes.TINYINT, defaultValue: 1 },
            created_at: { type: DataTypes.DATE, allowNull: false },
            updated_at: { type: DataTypes.DATE, allowNull: false }
        });
        console.log('  ✅ lottery_prizes 表创建成功');

        // 插入默认奖品池（8格转盘）
        await sequelize.query(`
            INSERT INTO lottery_prizes (name, cost_points, probability, type, prize_value, sort_order, is_active, created_at, updated_at) VALUES
            ('谢谢参与', 50, 40.00, 'miss', 0, 1, 1, NOW(), NOW()),
            ('积分×10', 50, 25.00, 'points', 10, 2, 1, NOW(), NOW()),
            ('积分×20', 50, 15.00, 'points', 20, 3, 1, NOW(), NOW()),
            ('积分×50', 50, 8.00, 'points', 50, 4, 1, NOW(), NOW()),
            ('5元优惠券', 50, 6.00, 'coupon', 5, 5, 1, NOW(), NOW()),
            ('10元优惠券', 50, 3.00, 'coupon', 10, 6, 1, NOW(), NOW()),
            ('积分×100', 50, 2.50, 'points', 100, 7, 1, NOW(), NOW()),
            ('神秘大奖', 50, 0.50, 'physical', 0, 8, 1, NOW(), NOW())
        `);
        console.log('  ✅ 默认奖品池（8格）插入成功');
    } catch (e) {
        if (e.message.includes('already exists')) console.log('  ⏭️  lottery_prizes 已存在，跳过');
        else throw e;
    }

    // ── 4. lottery_records 表 ──
    try {
        await qi.createTable('lottery_records', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            prize_id: { type: DataTypes.INTEGER, allowNull: false },
            prize_name: { type: DataTypes.STRING(100) },
            prize_type: { type: DataTypes.STRING(20) },
            cost_points: { type: DataTypes.INTEGER, allowNull: false },
            status: { type: DataTypes.ENUM('pending', 'claimed', 'expired'), defaultValue: 'pending' },
            claimed_at: { type: DataTypes.DATE, allowNull: true },
            remark: { type: DataTypes.STRING(255), allowNull: true },
            created_at: { type: DataTypes.DATE, allowNull: false },
            updated_at: { type: DataTypes.DATE, allowNull: false }
        });
        console.log('  ✅ lottery_records 表创建成功');
    } catch (e) {
        if (e.message.includes('already exists')) console.log('  ⏭️  lottery_records 已存在，跳过');
        else throw e;
    }

    // ── 5. coupons 表 ──
    try {
        await qi.createTable('coupons', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            name: { type: DataTypes.STRING(100), allowNull: false },
            type: { type: DataTypes.ENUM('fixed', 'percent'), defaultValue: 'fixed' },
            value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
            min_purchase: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
            scope: { type: DataTypes.ENUM('all', 'product', 'category'), defaultValue: 'all' },
            scope_ids: { type: DataTypes.JSON, allowNull: true },
            valid_days: { type: DataTypes.INTEGER, defaultValue: 30 },
            stock: { type: DataTypes.INTEGER, defaultValue: -1 },
            target_level: { type: DataTypes.INTEGER, allowNull: true },
            target_region: { type: DataTypes.STRING(100), allowNull: true },
            is_active: { type: DataTypes.TINYINT, defaultValue: 1 },
            description: { type: DataTypes.STRING(255), allowNull: true },
            created_at: { type: DataTypes.DATE, allowNull: false },
            updated_at: { type: DataTypes.DATE, allowNull: false }
        });
        console.log('  ✅ coupons 表创建成功');
    } catch (e) {
        if (e.message.includes('already exists')) console.log('  ⏭️  coupons 已存在，跳过');
        else throw e;
    }

    // ── 6. user_coupons 表 ──
    try {
        await qi.createTable('user_coupons', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            coupon_id: { type: DataTypes.INTEGER, allowNull: false },
            coupon_name: { type: DataTypes.STRING(100) },
            coupon_type: { type: DataTypes.STRING(20) },
            coupon_value: { type: DataTypes.DECIMAL(10, 2) },
            min_purchase: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
            scope: { type: DataTypes.STRING(20), defaultValue: 'all' },
            scope_ids: { type: DataTypes.JSON, allowNull: true },
            status: { type: DataTypes.ENUM('unused', 'used', 'expired'), defaultValue: 'unused' },
            expire_at: { type: DataTypes.DATE, allowNull: false },
            used_at: { type: DataTypes.DATE, allowNull: true },
            used_order_id: { type: DataTypes.INTEGER, allowNull: true },
            created_at: { type: DataTypes.DATE, allowNull: false },
            updated_at: { type: DataTypes.DATE, allowNull: false }
        });
        console.log('  ✅ user_coupons 表创建成功');
    } catch (e) {
        if (e.message.includes('already exists')) console.log('  ⏭️  user_coupons 已存在，跳过');
        else throw e;
    }

    console.log('\n🎉 Phase 2 迁移完成！');
}

up().then(() => process.exit(0)).catch(err => {
    console.error('❌ 迁移失败:', err.message);
    process.exit(1);
});
