/**
 * 模型-数据库字段漂移检测
 * 检查所有 Sequelize 模型定义的字段是否都存在于数据库中
 */
const { sequelize, ...models } = require('../models');

async function getDbColumns(tableName) {
    const [rows] = await sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
        { replacements: [tableName] }
    );
    return new Set(rows.map(r => r.COLUMN_NAME));
}

async function run() {
    const issues = [];

    for (const [modelName, model] of Object.entries(models)) {
        if (!model || typeof model.rawAttributes !== 'object') continue;

        const tableName = model.getTableName ? model.getTableName() : null;
        if (!tableName) continue;

        let dbCols;
        try {
            dbCols = await getDbColumns(tableName);
        } catch (e) {
            issues.push(`❌ 表 ${tableName} 不存在或查询失败: ${e.message}`);
            continue;
        }

        if (dbCols.size === 0) {
            issues.push(`❌ 表 ${tableName} 不存在（0列）`);
            continue;
        }

        const modelCols = Object.keys(model.rawAttributes)
            .map(k => model.rawAttributes[k].field || k)
            .filter(f => !['created_at', 'updated_at', 'createdAt', 'updatedAt'].includes(f));

        const missing = modelCols.filter(c => !dbCols.has(c));
        if (missing.length > 0) {
            issues.push(`⚠️  ${modelName}(${tableName}) 缺列: ${missing.join(', ')}`);
        } else {
            console.log(`✅ ${modelName}(${tableName})`);
        }
    }

    if (issues.length === 0) {
        console.log('\n🎉 所有模型字段均与数据库一致，无漂移！');
    } else {
        console.log('\n===== 发现以下问题 =====');
        issues.forEach(i => console.log(i));
    }

    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
