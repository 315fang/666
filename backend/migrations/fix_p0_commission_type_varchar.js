// backend/migrations/fix_p0_commission_type_varchar.js
/**
 * P0 修复：将 commission_logs.type 从 ENUM 改为 VARCHAR(30)
 *
 * 背景：
 *  - phase3/phase4 迁移把该列改成了 ENUM('Direct','Indirect','Stock_Diff',...)
 *  - 但 CommissionService.js 实际写入的是全小写值：'direct','indirect','gap','agent_fulfillment'...
 *  - MySQL ENUM 大小写敏感，写入不在 ENUM 中的值会静默存入空字符串
 *  - CommissionLog.js 模型本来就是 DataTypes.STRING(30)，因此改回 VARCHAR 才是正确状态
 *
 * 执行方式：node migrations/fix_p0_commission_type_varchar.js
 */

const { sequelize } = require('../config/database');

async function runMigration() {
    console.log('\n🚀 P0 Fix: commission_logs.type ENUM → VARCHAR(30)\n');
    try {
        await sequelize.authenticate();
        console.log('✅ 数据库连接成功');

        // 1. 检查当前列类型
        const [rows] = await sequelize.query(`
            SELECT COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'commission_logs'
              AND COLUMN_NAME  = 'type'
        `);

        const current = rows[0];
        if (!current) {
            console.error('❌ 找不到 commission_logs.type 列，请检查数据库');
            process.exit(1);
        }

        console.log(`📋 当前列类型: ${current.COLUMN_TYPE}`);

        if (String(current.COLUMN_TYPE).toLowerCase().startsWith('varchar')) {
            console.log('⏭️  已经是 VARCHAR，无需修改');
            return;
        }

        // 2. 执行 ALTER TABLE（原有数据直接保留，ENUM 值会原样转成字符串）
        await sequelize.query(`
            ALTER TABLE \`commission_logs\`
            MODIFY COLUMN \`type\` VARCHAR(30) NULL
            COMMENT '佣金类型（全小写字符串，见 CommissionService.COMMISSION_TYPES）'
        `);
        console.log('✅ commission_logs.type 已改为 VARCHAR(30)');

        // 3. 验证
        const [after] = await sequelize.query(`
            SELECT COLUMN_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'commission_logs'
              AND COLUMN_NAME  = 'type'
        `);
        console.log(`✅ 变更后列类型: ${after[0]?.COLUMN_TYPE}`);

        // 4. 检查是否有大写值遗留在表里（phase3/4 时期可能写入的 'Direct'/'Indirect' 等）
        const [suspicious] = await sequelize.query(`
            SELECT type, COUNT(*) as cnt
            FROM \`commission_logs\`
            WHERE type REGEXP '^[A-Z]'
            GROUP BY type
        `);
        if (suspicious.length > 0) {
            console.warn('\n⚠️  发现大写开头的历史数据，可能是 ENUM 时期写入的旧值：');
            suspicious.forEach(r => console.warn(`   type="${r.type}"  count=${r.cnt}`));
            console.warn('   请运行以下语句修复（按实际业务判断是否需要）：');
            console.warn("   UPDATE commission_logs SET type='direct'   WHERE type='Direct';");
            console.warn("   UPDATE commission_logs SET type='indirect' WHERE type='Indirect';");
            console.warn("   UPDATE commission_logs SET type=NULL       WHERE type='Override' OR type='Regional' OR type='Peer_Direct';");
        } else {
            console.log('✅ 无大写开头的旧值，历史数据干净');
        }

        console.log('\n🎉 P0 Fix 完成！\n');
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
