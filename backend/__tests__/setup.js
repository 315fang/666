/**
 * Jest 全局测试 Setup
 * 在每个测试文件运行前执行
 */

// 设置 TEST 环境变量（避免真实数据库连接）
process.env.NODE_ENV = 'test';

// 静默 Sequelize 日志（避免测试输出噪音）
jest.mock('../models', () => {
    const actualModels = jest.requireActual('../models');
    // 如果需要可以在这里覆盖某些模型
    return actualModels;
});

// 全局超时
jest.setTimeout(10000);
