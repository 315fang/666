/**
 * TransactionHelper 单元测试
 * 覆盖：runAfterCommit 事务提交后异步回调工具
 */
const { runAfterCommit } = require('../../services/TransactionHelper');

describe('TransactionHelper', () => {

    describe('runAfterCommit', () => {
        it('有 afterCommit 时应通过 afterCommit 注册任务', async () => {
            let executed = false;
            const mockTransaction = {
                afterCommit: (cb) => cb(), // 同步调用回调模拟
                finished: 'commit'
            };

            await runAfterCommit(mockTransaction, async () => {
                executed = true;
            });

            // 需要等待 setImmediate 完成
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(executed).toBe(true);
        });

        it('无 afterCommit 时应立即执行任务（setImmediate）', async () => {
            let executed = false;
            const mockTransaction = {}; // 无 afterCommit 方法

            runAfterCommit(mockTransaction, async () => {
                executed = true;
            });

            // 等待 setImmediate
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(executed).toBe(true);
        });

        it('任务抛出异常不应向上传播（静默捕获）', async () => {
            const mockTransaction = {};

            // 不应抛异常 — 返回 undefined（非 promise 也可接受）
            const result = runAfterCommit(mockTransaction, async () => {
                throw new Error('test error');
            });

            await new Promise(resolve => setTimeout(resolve, 10));
            expect(result).toBeUndefined();
        });

        it('transaction 为 null/undefined 时不应崩溃', async () => {
            let executed1 = false, executed2 = false;

            runAfterCommit(null, async () => { executed1 = true; });
            runAfterCommit(undefined, async () => { executed2 = true; });

            await new Promise(resolve => setTimeout(resolve, 10));
            expect(executed1).toBe(true);
            expect(executed2).toBe(true);
        });
    });
});
