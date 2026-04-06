// backend/migrations/phase6_user_participate_distribution.js
/**
 * users 表增加 participate_distribution（是否展示商务中心/拉取分销数据）
 * 幂等：已存在列则跳过
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
    console.log('\n🚀 Phase6: users.participate_distribution\n');
    try {
        await sequelize.authenticate();
        if (await columnExists(qi, 'users', 'participate_distribution')) {
            console.log('⏭️  列已存在，跳过');
            return;
        }
        await qi.addColumn('users', 'participate_distribution', {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
            comment: '是否参与分销展示: 0-否 1-是（商务中心入口）'
        });
        console.log('✅ 已添加 participate_distribution');
        await sequelize.query(
            'UPDATE users SET participate_distribution = 1 WHERE role_level >= 1',
            { raw: true }
        );
        console.log('✅ 已为 role_level>=1 用户默认开启商务中心（历史数据兼容）');
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
