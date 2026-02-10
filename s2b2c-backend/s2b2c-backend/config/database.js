const { Sequelize } = require('sequelize');
require('dotenv').config();

// 创建Sequelize实例
const sequelize = new Sequelize(
    process.env.DB_NAME || 's2b2c_db',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        timezone: '+08:00', // 东八区
        define: {
            timestamps: true,
            underscored: true, // 使用蛇形命名
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        }
    }
);

// 测试数据库连接
async function testConnection() {
    try {
        await sequelize.authenticate();
        console.log('✓ 数据库连接成功');
        return true;
    } catch (error) {
        console.error('✗ 数据库连接失败:', error.message);
        return false;
    }
}

module.exports = {
    sequelize,
    testConnection
};
