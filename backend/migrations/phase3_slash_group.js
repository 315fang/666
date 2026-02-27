// backend/migrations/phase3_slash_group.js
/**
 * Phase 3 数据库迁移（幂等）
 * 新增：slash_activities, slash_records, slash_helpers 表
 * 修改：commission_logs 增加 'Peer_Direct' 类型支持
 */
const { sequelize } = require('../config/database');
const { QueryInterface, DataTypes } = require('sequelize');

async function runMigration() {
    const qi = sequelize.getQueryInterface();
    console.log('\n🚀 开始 Phase 3 数据库迁移...\n');

    try {
        await sequelize.authenticate();
        console.log('✅ 数据库连接成功');

        // ── 1. slash_activities ──
        await qi.createTable('slash_activities', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            product_id: { type: DataTypes.INTEGER, allowNull: false },
            sku_id: { type: DataTypes.INTEGER, allowNull: true },
            original_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
            floor_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
            initial_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
            max_slash_per_helper: { type: DataTypes.DECIMAL(10, 2), defaultValue: 5.00 },
            min_slash_per_helper: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.10 },
            max_helpers: { type: DataTypes.INTEGER, defaultValue: 20 },
            expire_hours: { type: DataTypes.INTEGER, defaultValue: 48 },
            stock_limit: { type: DataTypes.INTEGER, defaultValue: 999 },
            sold_count: { type: DataTypes.INTEGER, defaultValue: 0 },
            status: { type: DataTypes.TINYINT, defaultValue: 1 },
            start_at: { type: DataTypes.DATE, allowNull: true },
            end_at: { type: DataTypes.DATE, allowNull: true },
            created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
        }).then(() => console.log('✅ slash_activities 表创建成功'))
            .catch((e) => { if (e.message.includes('already exists')) console.log('⏭️  slash_activities 已存在，跳过'); else throw e; });

        // ── 2. slash_records ──
        await qi.createTable('slash_records', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            slash_no: { type: DataTypes.STRING(32), unique: true, allowNull: false },
            activity_id: { type: DataTypes.INTEGER, allowNull: false },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            product_id: { type: DataTypes.INTEGER, allowNull: false },
            original_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
            floor_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
            current_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
            total_slashed: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
            helper_count: { type: DataTypes.INTEGER, defaultValue: 0 },
            status: { type: DataTypes.ENUM('active', 'success', 'expired', 'purchased'), defaultValue: 'active' },
            expire_at: { type: DataTypes.DATE, allowNull: false },
            success_at: { type: DataTypes.DATE, allowNull: true },
            order_id: { type: DataTypes.INTEGER, allowNull: true },
            created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
        }).then(() => console.log('✅ slash_records 表创建成功'))
            .catch((e) => { if (e.message.includes('already exists')) console.log('⏭️  slash_records 已存在，跳过'); else throw e; });

        // ── 3. slash_helpers ──
        await qi.createTable('slash_helpers', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            slash_record_id: { type: DataTypes.INTEGER, allowNull: false },
            helper_user_id: { type: DataTypes.INTEGER, allowNull: false },
            slash_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
            is_new_user: { type: DataTypes.TINYINT, defaultValue: 0 },
            created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
        }).then(() => console.log('✅ slash_helpers 表创建成功'))
            .catch((e) => { if (e.message.includes('already exists')) console.log('⏭️  slash_helpers 已存在，跳过'); else throw e; });

        // ── 4. commission_logs 类型扩展 (如有必要) ──
        // Peer_Direct 类型只是新增值，ENUM 会在首次写入时自动创建（MySQL 的 ENUM 扩展需要 ALTER）
        try {
            await sequelize.query(`
                ALTER TABLE commission_logs
                MODIFY COLUMN type ENUM(
                    'Direct', 'Indirect', 'Stock_Diff', 'Override',
                    'Peer_Direct'
                ) NOT NULL
            `);
            console.log('✅ commission_logs.type ENUM 扩展成功 (+Peer_Direct)');
        } catch (e) {
            if (e.message.includes('Duplicate')) {
                console.log('⏭️  commission_logs.type 已包含 Peer_Direct，跳过');
            } else {
                console.warn('⚠️  commission_logs ENUM 扩展失败（非致命）:', e.message);
            }
        }

        console.log('\n🎉 Phase 3 数据库迁移完成！\n');
    } catch (err) {
        console.error('\n❌ 迁移失败:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

runMigration();
