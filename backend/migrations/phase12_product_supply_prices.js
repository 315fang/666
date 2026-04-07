const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

async function addColumnIfMissing(qi, table, columnName, definition) {
    const columns = await qi.describeTable(table);
    if (columns[columnName]) {
        console.log(`⏭️  ${table}.${columnName} 已存在，跳过`);
        return;
    }
    await qi.addColumn(table, columnName, definition);
    console.log(`✅ 已补充字段 ${table}.${columnName}`);
}

async function runMigration() {
    const qi = sequelize.getQueryInterface();
    console.log('\n🚀 Phase12: products 代理发货成本价字段\n');
    try {
        await sequelize.authenticate();
        await addColumnIfMissing(qi, 'products', 'supply_price_b1', {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            comment: 'B1 推广合伙人代理发货成本价'
        });
        await addColumnIfMissing(qi, 'products', 'supply_price_b2', {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            comment: 'B2 运营合伙人代理发货成本价'
        });
        await addColumnIfMissing(qi, 'products', 'supply_price_b3', {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            comment: 'B3 区域合伙人代理发货成本价'
        });
        console.log('\n🎉 Phase12 完成\n');
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
