/** @type {import('jest').Config} */
module.exports = {
    testMatch: ['**/__tests__/integration/**/*.test.js'],
    testEnvironment: 'node',
    testTimeout: 30000,
    verbose: true,
    forceExit: true,
    detectOpenHandles: true,
    // 串行执行，避免共享数据库竞态
    maxWorkers: 1,
    setupFilesAfterFramework: [],
    testPathIgnorePatterns: ['/node_modules/'],
};
