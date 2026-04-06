// backend/migrations/phase9_users_parent_id_index.js
/**
 * users.parent_id 索引：加速按上级查子节点（团队 BFS）
 * 幂等：先查 information_schema / SHOW INDEX
 */
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

async function indexExists(table, indexName) {
    try {
        const dialect = sequelize.getDialect();
        if (dialect === 'mysql') {
            const rows = await sequelize.query(
                `SELECT 1 FROM information_schema.statistics 
                 WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
                { replacements: [table, indexName], type: QueryTypes.SELECT }
            );
            return rows && rows.length > 0;
        }
        if (dialect === 'sqlite') {
            const rows = await sequelize.query(`PRAGMA index_list('${table}')`, { type: QueryTypes.SELECT });
            return Array.isArray(rows) && rows.some((r) => r.name === indexName);
        }
    } catch (_) {
        return false;
    }
    return false;
}

async function runMigration() {
    console.log('\n🚀 Phase9: users.parent_id 索引\n');
    try {
        await sequelize.authenticate();
        const idx = 'idx_users_parent_id';
        if (await indexExists('users', idx)) {
            console.log(`  ⏭️  索引 ${idx} 已存在`);
        } else {
            await sequelize.query(`CREATE INDEX ${idx} ON users (parent_id)`);
            console.log(`  ✅ 已创建 ${idx}`);
        }
        console.log('\n🎉 Phase9 完成\n');
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
