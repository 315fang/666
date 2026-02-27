require('dotenv').config();
const { sequelize } = require('../models');

async function cleanTestData() {
    try {
        console.log('🔗 连接数据库...');
        await sequelize.authenticate();
        console.log('✅ 数据库连接成功');

        console.log('⚠️ 准备清理测试数据...');

        // 禁用外键约束，以防清除数据时报错
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

        // 需要清理的业务/运营数据表 (不包含商品、分类、Banner、Admin账号、系统配置)
        const tablesToClean = [
            'Users',
            'Orders',
            'Refunds',
            'Carts',
            'Addresses',
            'Withdrawals',
            'CommissionLogs',
            'CommissionSettlements',
            'StockReservations',
            'StockTransactions',
            'ActivityLogs',
            'AIAlerts',
            'AIFixSessions',
            'Dealers',
            'MassMessages',
            'UserMassMessages',
            'UserTags',
            'UserTagRelations',
            'Questionnaires',
            'QuestionnaireResponses',
            'QuestionnaireSubmissions',
            'QuestionnaireTemplates',
            'QuickEntries',
            'Notifications'
        ];

        for (const table of tablesToClean) {
            try {
                // 检查表是否存在
                const [results] = await sequelize.query(`SHOW TABLES LIKE '${table}'`);
                if (results.length > 0) {
                    console.log(`🧹 正在清理表: ${table} ...`);
                    await sequelize.query(`TRUNCATE TABLE ${table}`);
                    console.log(`✔️ 表 ${table} 已清空`);
                } else {
                    console.log(`ℹ️ 表 ${table} 不存在，跳过`);
                }
            } catch (err) {
                console.error(`❌ 清理表 ${table} 时出错:`, err.message);
            }
        }

        // 重新开启外键约束
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('----------------------------------------------------');
        console.log('🎉 测试业务数据清理完成！系统已处于【生产就绪 (Production Ready)】状态。');
        console.log('ℹ️ 注意: 管理员账号 (Admin)、商品目录 (Product/Category/SKU)、系统配置等内容已被保留。');
        console.log('----------------------------------------------------');

    } catch (error) {
        console.error('❌ 数据清理失败:', error);
    } finally {
        await sequelize.close();
    }
}

cleanTestData();
