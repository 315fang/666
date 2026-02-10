/**
 * Task locking utility using in-memory locks
 * Prevents background tasks from overlapping across intervals
 *
 * Note: For multi-instance deployments, use database advisory locks
 * or a distributed lock service like Redis
 */

const locks = new Map();

/**
 * Acquire a lock for a task
 * @param {string} taskName - Name of the task
 * @param {number} timeout - Lock timeout in ms (default: 5 minutes)
 * @returns {boolean} true if lock acquired, false if already locked
 */
function acquireLock(taskName, timeout = 5 * 60 * 1000) {
    const now = Date.now();
    const existingLock = locks.get(taskName);

    // Check if lock exists and hasn't expired
    if (existingLock && existingLock.expiresAt > now) {
        return false;
    }

    // Acquire or renew the lock
    locks.set(taskName, {
        acquiredAt: now,
        expiresAt: now + timeout
    });

    return true;
}

/**
 * Release a lock for a task
 * @param {string} taskName - Name of the task
 */
function releaseLock(taskName) {
    locks.delete(taskName);
}

/**
 * Check if a task is currently locked
 * @param {string} taskName - Name of the task
 * @returns {boolean} true if locked, false otherwise
 */
function isLocked(taskName) {
    const lock = locks.get(taskName);
    if (!lock) return false;

    const now = Date.now();
    if (lock.expiresAt <= now) {
        // Lock expired, remove it
        locks.delete(taskName);
        return false;
    }

    return true;
}

/**
 * Execute a task with automatic locking
 * @param {string} taskName - Name of the task
 * @param {Function} taskFn - Async function to execute
 * @param {Object} options - Options
 * @param {number} options.timeout - Lock timeout in ms
 * @param {boolean} options.skipIfLocked - Skip execution if locked (default: true)
 * @returns {Promise<any>} Result of taskFn or null if skipped
 */
async function executeWithLock(taskName, taskFn, options = {}) {
    const {
        timeout = 5 * 60 * 1000,
        skipIfLocked = true
    } = options;

    // Try to acquire lock
    const acquired = acquireLock(taskName, timeout);

    if (!acquired) {
        if (skipIfLocked) {
            console.log(`[TaskLock] 任务 "${taskName}" 已在运行中，跳过此次执行`);
            return null;
        }
        // Wait for lock to be released (not recommended for long tasks)
        throw new Error(`任务 "${taskName}" 已被锁定`);
    }

    try {
        console.log(`[TaskLock] 获取锁: ${taskName}`);
        const result = await taskFn();
        return result;
    } catch (error) {
        console.error(`[TaskLock] 任务 "${taskName}" 执行失败:`, error);
        throw error;
    } finally {
        releaseLock(taskName);
        console.log(`[TaskLock] 释放锁: ${taskName}`);
    }
}

/**
 * Clean up expired locks (should be called periodically)
 */
function cleanupExpiredLocks() {
    const now = Date.now();
    for (const [taskName, lock] of locks.entries()) {
        if (lock.expiresAt <= now) {
            locks.delete(taskName);
        }
    }
}

// Clean up expired locks every minute
setInterval(cleanupExpiredLocks, 60 * 1000);

module.exports = {
    acquireLock,
    releaseLock,
    isLocked,
    executeWithLock,
    cleanupExpiredLocks
};
