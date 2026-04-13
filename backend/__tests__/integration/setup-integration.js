/**
 * 集成测试全局 Setup
 * 加载 .env.test → 连接数据库 → sync 建表
 */
const path = require('path');

// 在 require 任何业务模块之前加载测试环境变量
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });
// 覆盖 constants 中依赖 process.env 的关键值（dotenv 在 constants require 之前执行即可）

const { sequelize } = require('../../models');
const { cleanupTestData } = require('./testHelpers');

module.exports = async function globalSetup() {
    console.log('[Integration Setup] Connecting to test database...');
    await sequelize.authenticate();
    console.log('[Integration Setup] Database connected. Syncing schema...');
    await sequelize.sync({ alter: true });
    console.log('[Integration Setup] Schema synced.');
    await cleanupTestData(sequelize);
    console.log('[Integration Setup] Cleanup done. Ready for tests.');
};
