const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

async function columnExists(queryInterface, table, column) {
    try {
        const description = await queryInterface.describeTable(table);
        return !!description[column];
    } catch {
        return false;
    }
}

async function ensureColumn(queryInterface, table, column, definition, successMessage) {
    if (await columnExists(queryInterface, table, column)) {
        console.log(`  - ${table}.${column} 已存在，跳过`);
        return false;
    }

    await queryInterface.addColumn(table, column, definition);
    console.log(`  + ${successMessage}`);
    return true;
}

async function backfillGroupProductsEnableFlag() {
    const [result] = await sequelize.query(`
        UPDATE products p
        INNER JOIN group_activities ga ON ga.product_id = p.id
        SET p.enable_group_buy = 1
        WHERE p.enable_group_buy <> 1 OR p.enable_group_buy IS NULL
    `);

    const affectedRows = typeof result?.affectedRows === 'number' ? result.affectedRows : 0;
    console.log(`  + 已回填 ${affectedRows} 个拼团商品 enable_group_buy=1`);
}

async function runMigration() {
    const queryInterface = sequelize.getQueryInterface();

    console.log('\n🚀 修复 products 营销字段缺口\n');

    try {
        await sequelize.authenticate();

        await ensureColumn(
            queryInterface,
            'products',
            'enable_coupon',
            {
                type: DataTypes.TINYINT,
                allowNull: false,
                defaultValue: 1,
                comment: '是否允许使用优惠券'
            },
            '已添加 products.enable_coupon'
        );

        await ensureColumn(
            queryInterface,
            'products',
            'supports_pickup',
            {
                type: DataTypes.TINYINT,
                allowNull: false,
                defaultValue: 0,
                comment: '是否支持到店自提 0否 1是'
            },
            '已添加 products.supports_pickup'
        );

        const addedEnableGroupBuy = await ensureColumn(
            queryInterface,
            'products',
            'enable_group_buy',
            {
                type: DataTypes.TINYINT,
                allowNull: false,
                defaultValue: 0,
                comment: '是否参与拼团（需在拼团活动中关联）'
            },
            '已添加 products.enable_group_buy'
        );

        await ensureColumn(
            queryInterface,
            'products',
            'visible_in_mall',
            {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
                comment: '是否在商城列表/搜索/热门等展示'
            },
            '已添加 products.visible_in_mall'
        );

        if (addedEnableGroupBuy || await columnExists(queryInterface, 'products', 'enable_group_buy')) {
            await backfillGroupProductsEnableFlag();
        }

        console.log('\n🎉 products 营销字段修复完成\n');
    } catch (error) {
        console.error('\n❌ 修复失败:', error.message);
        throw error;
    }
}

if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { runMigration };
