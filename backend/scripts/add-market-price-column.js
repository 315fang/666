const { sequelize } = require('../models');

async function columnExists(table, column) {
    const [rows] = await sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
        { replacements: [table, column] }
    );
    return rows.length > 0;
}

async function run() {
    const exists = await columnExists('products', 'market_price');
    if (exists) {
        console.log('⏭️ products.market_price 已存在，跳过');
        process.exit(0);
    }

    await sequelize.query(
        "ALTER TABLE `products` ADD COLUMN `market_price` DECIMAL(10,2) NULL DEFAULT NULL COMMENT '市场价/原价（划线价）'"
    );
    console.log('✅ 已添加 products.market_price');
    process.exit(0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
