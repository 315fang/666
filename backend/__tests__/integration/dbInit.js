/**
 * 共享的数据库初始化模块
 * 确保所有测试文件只做一次 schema sync，避免重复 ALTER 导致索引爆炸
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

let _synced = false;

async function ensureDbReady(sequelize) {
    await sequelize.authenticate();
    if (!_synced) {
        await sequelize.sync({ force: true });
        _synced = true;
    }
}

module.exports = { ensureDbReady };
