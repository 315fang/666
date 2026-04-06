/**
 * 定时任务互斥：防止同一任务重叠执行
 *
 * - memory（默认）：进程内 Map
 * - mysql：MySQL GET_LOCK / RELEASE_LOCK，跨多实例互斥（同一数据库）
 *
 * 环境变量：TASK_LOCK_BACKEND=memory | mysql
 */

const locks = new Map();

const taskStats = new Map();

function getSequelize() {
    return require('../config/database').sequelize;
}

function _recordRun(taskName, success, error = null) {
    const existing = taskStats.get(taskName) || {
        runCount: 0,
        errorCount: 0,
        lastRunAt: null,
        lastSuccessAt: null,
        lastError: null
    };
    existing.runCount += 1;
    existing.lastRunAt = new Date().toISOString();
    if (success) {
        existing.lastSuccessAt = existing.lastRunAt;
    } else {
        existing.errorCount += 1;
        existing.lastError = error ? String(error).slice(0, 200) : '未知错误';
    }
    taskStats.set(taskName, existing);
}

function getTaskStats() {
    const result = {};
    for (const [name, stats] of taskStats.entries()) {
        result[name] = { ...stats };
    }
    return result;
}

function acquireLock(taskName, timeout = 5 * 60 * 1000) {
    const now = Date.now();
    const existingLock = locks.get(taskName);

    if (existingLock && existingLock.expiresAt > now) {
        return false;
    }

    locks.set(taskName, {
        acquiredAt: now,
        expiresAt: now + timeout
    });

    return true;
}

function releaseLock(taskName) {
    locks.delete(taskName);
}

function isLocked(taskName) {
    const lock = locks.get(taskName);
    if (!lock) return false;

    const now = Date.now();
    if (lock.expiresAt <= now) {
        locks.delete(taskName);
        return false;
    }

    return true;
}

/**
 * MySQL 用户锁名称（最长 64 字符）
 */
function mysqlUserLockName(taskName) {
    const base = `zz_${String(taskName).replace(/[^a-zA-Z0-9_]/g, '_')}`;
    return base.slice(0, 64);
}

async function executeWithMemoryLock(taskName, taskFn, options = {}) {
    const {
        timeout = 5 * 60 * 1000,
        skipIfLocked = true
    } = options;

    const acquired = acquireLock(taskName, timeout);

    if (!acquired) {
        if (skipIfLocked) {
            console.log(`[TaskLock] 任务 "${taskName}" 已在运行中，跳过此次执行`);
            return null;
        }
        throw new Error(`任务 "${taskName}" 已被锁定`);
    }

    try {
        console.log(`[TaskLock] 获取锁: ${taskName}`);
        const result = await taskFn();
        _recordRun(taskName, true);
        return result;
    } catch (error) {
        console.error(`[TaskLock] 任务 "${taskName}" 执行失败:`, error);
        _recordRun(taskName, false, error.message);
        throw error;
    } finally {
        releaseLock(taskName);
        console.log(`[TaskLock] 释放锁: ${taskName}`);
    }
}

async function executeWithMysqlLock(taskName, taskFn, options = {}) {
    const {
        timeout = 5 * 60 * 1000,
        skipIfLocked = true
    } = options;

    const sequelize = getSequelize();
    if (sequelize.getDialect() !== 'mysql') {
        console.warn('[TaskLock] TASK_LOCK_BACKEND=mysql 需要 MySQL，已回退 memory');
        return executeWithMemoryLock(taskName, taskFn, options);
    }

    const lockName = mysqlUserLockName(taskName);
    const lockWaitSec = Math.min(300, Math.max(1, Math.ceil(timeout / 1000)));

    return sequelize.transaction(async (t) => {
        const [rows] = await sequelize.query(
            'SELECT GET_LOCK(:lockName, :waitSec) AS got',
            { replacements: { lockName, waitSec: lockWaitSec }, transaction: t }
        );
        const got = rows[0]?.got;
        const ok = got === 1 || got === '1';
        if (!ok) {
            if (skipIfLocked) {
                console.log(`[TaskLock] MySQL 锁未获取 "${taskName}"，跳过此次执行`);
                return null;
            }
            throw new Error(`任务 "${taskName}" 已被锁定`);
        }

        try {
            console.log(`[TaskLock] MySQL 锁已获取: ${taskName}`);
            const result = await taskFn();
            _recordRun(taskName, true);
            return result;
        } catch (error) {
            console.error(`[TaskLock] 任务 "${taskName}" 执行失败:`, error);
            _recordRun(taskName, false, error.message);
            throw error;
        } finally {
            try {
                await sequelize.query('SELECT RELEASE_LOCK(:lockName) AS rel', {
                    replacements: { lockName },
                    transaction: t
                });
            } catch (e) {
                console.error(`[TaskLock] RELEASE_LOCK 失败 (${taskName}):`, e.message);
            }
            console.log(`[TaskLock] MySQL 锁已释放: ${taskName}`);
        }
    });
}

/**
 * @param {string} taskName
 * @param {Function} taskFn
 * @param {{ timeout?: number, skipIfLocked?: boolean }} [options]
 */
async function executeWithLock(taskName, taskFn, options = {}) {
    const backend = String(process.env.TASK_LOCK_BACKEND || 'memory').toLowerCase();
    if (backend === 'mysql') {
        return executeWithMysqlLock(taskName, taskFn, options);
    }
    return executeWithMemoryLock(taskName, taskFn, options);
}

function cleanupExpiredLocks() {
    const now = Date.now();
    for (const [taskName, lock] of locks.entries()) {
        if (lock.expiresAt <= now) {
            locks.delete(taskName);
        }
    }
}

setInterval(cleanupExpiredLocks, 60 * 1000);

module.exports = {
    acquireLock,
    releaseLock,
    isLocked,
    executeWithLock,
    cleanupExpiredLocks,
    getTaskStats
};
