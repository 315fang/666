/** @type {import('jest').Config} */
module.exports = {
    // 测试文件匹配模式
    testMatch: ['**/__tests__/**/*.test.js'],

    // 测试环境
    testEnvironment: 'node',

    // 超时时间（某些异步测试需要更长时间）
    testTimeout: 10000,

    // 覆盖率配置
    collectCoverageFrom: [
        'services/*.js',
        'utils/*.js',
        '!**/node_modules/**',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'text-summary'],
    coverageThreshold: {
        global: {
            branches: 30,
            functions: 50,
            lines: 50,
            statements: 50,
        },
    },

    // 模块路径别名
    moduleNameMapper: {
        '^../models$': '<rootDir>/models/index.js',
        '^../config/(.*)$': '<rootDir>/config/$1',
        '^../utils/(.*)$': '<rootDir>/utils/$1',
        '^./(.*)Service$': '<rootDir>/services/$1Service.js',
    },

    // 测试文件运行前设置
    setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],

    // 忽略模式
    testPathIgnorePatterns: [
        '/node_modules/',
        '/migrations/',
        '/scripts/',
    ],

    // verbose 输出
    verbose: true,

    // 强制退出（防止数据库连接阻止进程退出）
    forceExit: true,
    detectOpenHandles: true,
};
