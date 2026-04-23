// backend/migrations/phase10_product_default_sku.js
const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

const MIGRATION_NAME = 'phase10_product_default_sku.js';

async function columnExists(queryInterface, table, column) {
    try {
        const description = await queryInterface.describeTable(table);
        return !!description[column];
    } catch {
        return false;
    }
}

async function indexExists(indexes, targetName) {
    return Array.isArray(indexes) && indexes.some((item) => item && item.name === targetName);
}

async function recordSchemaMigration() {
    try {
        const [tables] = await sequelize.query('SHOW TABLES LIKE \'schema_migrations\'');
        if (!Array.isArray(tables) || tables.length === 0) return;
        const appliedAt = new Date().toISOString().slice(0, 10);
        await sequelize.query(`
            INSERT INTO \`schema_migrations\` (\`name\`, \`applied_at\`, \`status\`, \`notes\`)
            VALUES (?, ?, 'applied', 'products.default_sku_id')
            ON DUPLICATE KEY UPDATE
                \`applied_at\` = VALUES(\`applied_at\`),
                \`status\` = VALUES(\`status\`),
                \`notes\` = VALUES(\`notes\`)
        `, {
            replacements: [MIGRATION_NAME, appliedAt]
        });
    } catch (error) {
        console.warn('[migration] schema_migrations 记录失败:', error.message);
    }
}

async function runMigration() {
    const queryInterface = sequelize.getQueryInterface();
    console.log('\n🚀 Phase10: products.default_sku_id\n');

    try {
        await sequelize.authenticate();

        if (await columnExists(queryInterface, 'products', 'default_sku_id')) {
            console.log('  ⏭️  products.default_sku_id 已存在');
        } else {
            await queryInterface.addColumn('products', 'default_sku_id', {
                type: DataTypes.INTEGER,
                allowNull: true,
                comment: '默认SKU ID（小程序规格展示与预选真相源）'
            });
            console.log('  ✅ 已添加 products.default_sku_id');
        }

        const indexes = await queryInterface.showIndex('products');
        if (await indexExists(indexes, 'idx_products_default_sku_id')) {
            console.log('  ⏭️  idx_products_default_sku_id 已存在');
        } else {
            await queryInterface.addIndex('products', ['default_sku_id'], {
                name: 'idx_products_default_sku_id'
            });
            console.log('  ✅ 已添加 idx_products_default_sku_id');
        }

        await recordSchemaMigration();
        console.log('\n🎉 Phase10 完成\n');
    } catch (error) {
        console.error('❌ 迁移失败:', error.message);
        throw error;
    }
}

if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { runMigration };
