// backend/migrations/phase8_product_supports_pickup.js
/**
 * 商品是否支持到店自提（幂等）
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

async function runMigration() {
    const qi = sequelize.getQueryInterface();
    console.log('\n🚀 Phase8: products.supports_pickup\n');
    try {
        await sequelize.authenticate();
        if (await columnExists(qi, 'products', 'supports_pickup')) {
            console.log('  ⏭️  products.supports_pickup 已存在');
        } else {
            await qi.addColumn('products', 'supports_pickup', {
                type: DataTypes.TINYINT,
                allowNull: false,
                defaultValue: 0,
                comment: '是否支持到店自提 0否 1是'
            });
            console.log('  ✅ 已添加 products.supports_pickup');
        }
        console.log('\n🎉 Phase8 完成\n');
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
