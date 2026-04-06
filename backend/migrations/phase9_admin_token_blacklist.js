/**
 * Phase 9：管理员 Token 黑名单表（多实例部署 + ADMIN_TOKEN_BLACKLIST_STORE=mysql）
 *
 * 运行：node migrations/phase9_admin_token_blacklist.js（在 backend 目录下）
 */
const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

async function runMigration() {
    const qi = sequelize.getQueryInterface();
    console.log('\n🚀 Phase 9：admin_token_blacklist 表...\n');

    try {
        await sequelize.authenticate();

        const [existing] = await sequelize.query(
            `SELECT TABLE_NAME FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_token_blacklist'`
        );

        if (!existing || !existing.length) {
            await qi.createTable('admin_token_blacklist', {
                jti: {
                    type: DataTypes.STRING(128),
                    allowNull: false,
                    primaryKey: true,
                    comment: 'JWT jti'
                },
                expires_at: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    comment: '过期时间（与 JWT exp 对齐）'
                }
            });
            console.log('✅ admin_token_blacklist 已创建');
        } else {
            console.log('⏭️  admin_token_blacklist 已存在，跳过');
        }

        console.log('\n🎉 Phase 9 完成。多机时可在 .env 设置 ADMIN_TOKEN_BLACKLIST_STORE=mysql\n');
    } catch (err) {
        console.error('\n❌ 迁移失败:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

runMigration();
