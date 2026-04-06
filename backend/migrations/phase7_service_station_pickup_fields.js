// backend/migrations/phase7_service_station_pickup_fields.js
/**
 * service_stations 扩展自提门店展示字段（幂等）
 */
const { sequelize } = require('../config/database');
const { QueryInterface, DataTypes } = require('sequelize');

async function columnExists(qi, table, column) {
    try {
        const desc = await qi.describeTable(table);
        return !!desc[column];
    } catch {
        return false;
    }
}

async function addCol(qi, name, def) {
    if (await columnExists(qi, 'service_stations', name)) {
        console.log(`  ⏭️  service_stations.${name} 已存在`);
        return;
    }
    await qi.addColumn('service_stations', name, def);
    console.log(`  ✅ 已添加 service_stations.${name}`);
}

async function runMigration() {
    const qi = sequelize.getQueryInterface();
    console.log('\n🚀 Phase7: service_stations 自提门店字段\n');
    try {
        await sequelize.authenticate();

        await addCol(qi, 'logo_url', {
            type: DataTypes.STRING(500),
            allowNull: true,
            comment: '门店LOGO URL'
        });
        await addCol(qi, 'contact_name', {
            type: DataTypes.STRING(50),
            allowNull: true,
            comment: '自提联系人'
        });
        await addCol(qi, 'contact_phone', {
            type: DataTypes.STRING(20),
            allowNull: true,
            comment: '自提联系电话'
        });
        await addCol(qi, 'business_days', {
            type: DataTypes.JSON,
            allowNull: true,
            comment: '营业周天 1-7 数组，如 [1,2,3,4,5]'
        });
        await addCol(qi, 'business_time_start', {
            type: DataTypes.STRING(12),
            allowNull: true,
            comment: '营业开始 HH:mm 或 HH:mm:ss'
        });
        await addCol(qi, 'business_time_end', {
            type: DataTypes.STRING(12),
            allowNull: true,
            comment: '营业结束'
        });
        await addCol(qi, 'intro', {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: '门店简介'
        });

        console.log('\n🎉 Phase7 完成\n');
    } catch (e) {
        console.error('❌ 迁移失败:', e.message);
        throw e;
    }
}

if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { runMigration };
