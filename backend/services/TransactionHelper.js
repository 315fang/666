/**
 * TransactionHelper — 事务工具
 * 提供：事务提交后异步回调执行器
 */

const { error: logError } = require('../utils/logger');

/**
 * 在事务提交后异步执行任务（若事务不支持 afterCommit 则立即执行）
 * @param {Object} transaction - Sequelize 事务对象
 * @param {Function} task - 异步任务函数
 */
const runAfterCommit = (transaction, task) => {
    const exec = () => {
        setImmediate(async () => {
            try {
                await task();
            } catch (e) {
                logError('TX', 'afterCommit task failed', { error: e.message });
            }
        });
    };
    if (transaction && typeof transaction.afterCommit === 'function') {
        transaction.afterCommit(exec);
    } else {
        exec();
    }
};

module.exports = { runAfterCommit };
