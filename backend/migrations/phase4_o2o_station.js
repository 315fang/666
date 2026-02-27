// backend/migrations/phase4_o2o_station.js
/**
 * Phase 4 数据库迁移（幂等）
 * 新增：service_stations, station_claims 表
 * 修改：orders 表 + commission_logs ENUM 新增 'Regional' 类型
 */
const { sequelize } = require('../config/database');
const { QueryInterface, DataTypes } = require('sequelize');

async function runMigration() {
    const qi = sequelize.getQueryInterface();
    console.log('\n🚀 开始 Phase 4 数据库迁移...\n');

    try {
        await sequelize.authenticate();
        console.log('✅ 数据库连接成功');

        // ── 1. service_stations ──
        await qi.createTable('service_stations', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            name: { type: DataTypes.STRING(100), allowNull: false },
            province: { type: DataTypes.STRING(50), allowNull: false },
            city: { type: DataTypes.STRING(50), allowNull: false },
            district: { type: DataTypes.STRING(50), allowNull: true },
            address: { type: DataTypes.STRING(200), allowNull: true },
            longitude: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
            latitude: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
            claimant_id: { type: DataTypes.INTEGER, allowNull: true },
            commission_rate: { type: DataTypes.DECIMAL(4, 3), defaultValue: 0.05 },
            is_pickup_point: { type: DataTypes.TINYINT, defaultValue: 0 },
            pickup_contact: { type: DataTypes.STRING(100), allowNull: true },
            total_orders: { type: DataTypes.INTEGER, defaultValue: 0 },
            total_commission: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
            status: { type: DataTypes.ENUM('pending', 'active', 'inactive'), defaultValue: 'pending' },
            remark: { type: DataTypes.TEXT, allowNull: true },
            created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
        }).then(() => console.log('✅ service_stations 表创建成功'))
            .catch((e) => { if (e.message.includes('already exists')) console.log('⏭️  service_stations 已存在，跳过'); else throw e; });

        // ── 2. station_claims ──
        await qi.createTable('station_claims', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            station_id: { type: DataTypes.INTEGER, allowNull: false },
            applicant_id: { type: DataTypes.INTEGER, allowNull: false },
            real_name: { type: DataTypes.STRING(50), allowNull: false },
            phone: { type: DataTypes.STRING(20), allowNull: false },
            id_card: { type: DataTypes.STRING(20), allowNull: true },
            intro: { type: DataTypes.TEXT, allowNull: true },
            status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' },
            review_note: { type: DataTypes.TEXT, allowNull: true },
            reviewed_at: { type: DataTypes.DATE, allowNull: true },
            created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
        }).then(() => console.log('✅ station_claims 表创建成功'))
            .catch((e) => { if (e.message.includes('already exists')) console.log('⏭️  station_claims 已存在，跳过'); else throw e; });

        // ── 3. orders 表：新增自提字段 ──
        const orderCols = await qi.describeTable('orders');
        const colsToAdd = [
            { name: 'delivery_type', col: { type: DataTypes.ENUM('express', 'pickup'), defaultValue: 'express', after: 'member_discount_rate' } },
            { name: 'pickup_station_id', col: { type: DataTypes.INTEGER, allowNull: true } },
            { name: 'pickup_code', col: { type: DataTypes.STRING(16), allowNull: true } },
            { name: 'pickup_qr_token', col: { type: DataTypes.STRING(64), allowNull: true } },
            { name: 'verified_at', col: { type: DataTypes.DATE, allowNull: true } }
        ];
        for (const { name, col } of colsToAdd) {
            if (!orderCols[name]) {
                await qi.addColumn('orders', name, col);
                console.log(`✅ orders.${name} 列添加成功`);
            } else {
                console.log(`⏭️  orders.${name} 已存在，跳过`);
            }
        }

        // ── 4. commission_logs ENUM 扩展 ──
        try {
            await sequelize.query(`
                ALTER TABLE commission_logs
                MODIFY COLUMN type ENUM(
                    'Direct', 'Indirect', 'Stock_Diff', 'Override',
                    'Peer_Direct', 'Regional'
                ) NOT NULL
            `);
            console.log('✅ commission_logs.type 扩展 Regional 成功');
        } catch (e) {
            console.warn('⚠️  commission_logs ENUM 扩展失败（非致命）:', e.message);
        }

        console.log('\n🎉 Phase 4 数据库迁移完成！\n');
    } catch (err) {
        console.error('\n❌ 迁移失败:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

runMigration();
