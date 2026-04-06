/**
 * 用户商品收藏（登录会员云端存储）
 */
const { sequelize } = require('../config/database');
const { QueryInterface, DataTypes } = require('sequelize');

async function tableExists(qi, name) {
    try {
        await qi.describeTable(name);
        return true;
    } catch {
        return false;
    }
}

async function runMigration() {
    const qi = sequelize.getQueryInterface();
    console.log('\n🚀 Phase10: user_product_favorites\n');
    try {
        await sequelize.authenticate();
        if (await tableExists(qi, 'user_product_favorites')) {
            console.log('  ⏭️  表已存在');
        } else {
            await qi.createTable('user_product_favorites', {
                id: {
                    type: DataTypes.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                user_id: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    comment: '用户ID'
                },
                product_id: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    comment: '商品ID'
                },
                created_at: {
                    type: DataTypes.DATE,
                    allowNull: false
                },
                updated_at: {
                    type: DataTypes.DATE,
                    allowNull: false
                }
            });
            await qi.addIndex('user_product_favorites', ['user_id', 'product_id'], {
                unique: true,
                name: 'uniq_user_product_favorite'
            });
            await qi.addIndex('user_product_favorites', ['user_id'], { name: 'idx_upf_user_id' });
            await qi.addIndex('user_product_favorites', ['product_id'], { name: 'idx_upf_product_id' });
            console.log('  ✅ 已创建 user_product_favorites');
        }
        console.log('\n🎉 Phase10 完成\n');
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
