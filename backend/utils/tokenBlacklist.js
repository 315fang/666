/**
 * 管理员 JWT 注销黑名单
 *
 * - memory（默认）：单机内存 Map，进程重启清空
 * - redis：依赖 CacheService 已连接 Redis（需安装 redis 包并配置连接），多实例共享
 * - mysql：表 admin_token_blacklist，多实例共享（先执行 migrations/phase9_admin_token_blacklist.js）
 *
 * 使用：await tokenBlacklist.add(jti, exp) / await tokenBlacklist.isBlocked(jti)
 */

const CacheService = require('../services/CacheService');

const REDIS_KEY_PREFIX = 'admin_jti_blk:';

class MemoryBlacklist {
    constructor() {
        /** @type {Map<string, number>} jti -> expireAt 毫秒 */
        this._store = new Map();
        this._cleanupInterval = setInterval(() => this._cleanup(), 60 * 60 * 1000);
        if (this._cleanupInterval.unref) {
            this._cleanupInterval.unref();
        }
    }

    add(jti, exp) {
        if (!jti) return;
        const expireAt = (exp || 0) * 1000;
        this._store.set(jti, expireAt);
    }

    isBlocked(jti) {
        if (!jti) return false;
        const expireAt = this._store.get(jti);
        if (expireAt === undefined) return false;
        if (Date.now() > expireAt) {
            this._store.delete(jti);
            return false;
        }
        return true;
    }

    _cleanup() {
        const now = Date.now();
        for (const [jti, expireAt] of this._store) {
            if (now > expireAt) this._store.delete(jti);
        }
    }
}

const memoryStore = new MemoryBlacklist();

let _redisFallbackWarned = false;

function getMode() {
    return String(process.env.ADMIN_TOKEN_BLACKLIST_STORE || 'memory').toLowerCase();
}

function getSequelize() {
    return require('../config/database').sequelize;
}

/**
 * @param {string} jti
 * @param {number} exp - JWT exp，Unix 秒
 */
async function add(jti, exp) {
    if (!jti) return;
    const mode = getMode();

    if (mode === 'redis') {
        if (CacheService.useMemory) {
            if (!_redisFallbackWarned) {
                console.warn('[tokenBlacklist] ADMIN_TOKEN_BLACKLIST_STORE=redis 但缓存为内存模式，黑名单降级为进程内 Map（多机不共享）');
                _redisFallbackWarned = true;
            }
            memoryStore.add(jti, exp);
            return;
        }
        const ttlSec = Math.max(60, Math.floor((exp || 0) - Date.now() / 1000));
        await CacheService.setCache(`${REDIS_KEY_PREFIX}${jti}`, 1, ttlSec);
        return;
    }

    if (mode === 'mysql') {
        const sequelize = getSequelize();
        const safeJti = String(jti).slice(0, 128);
        await sequelize.query(
            `INSERT INTO admin_token_blacklist (jti, expires_at)
             VALUES (:jti, FROM_UNIXTIME(:exp))
             ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)`,
            { replacements: { jti: safeJti, exp: exp || 0 } }
        );
        return;
    }

    memoryStore.add(jti, exp);
}

/**
 * @param {string} jti
 * @returns {Promise<boolean>}
 */
async function isBlocked(jti) {
    if (!jti) return false;
    const mode = getMode();

    if (mode === 'redis') {
        if (CacheService.useMemory) {
            return memoryStore.isBlocked(jti);
        }
        const hit = await CacheService.getCache(`${REDIS_KEY_PREFIX}${jti}`);
        return hit != null;
    }

    if (mode === 'mysql') {
        try {
            const sequelize = getSequelize();
            const safeJti = String(jti).slice(0, 128);
            const [rows] = await sequelize.query(
                `SELECT 1 AS ok FROM admin_token_blacklist WHERE jti = :jti AND expires_at > NOW() LIMIT 1`,
                { replacements: { jti: safeJti } }
            );
            return Array.isArray(rows) && rows.length > 0;
        } catch (e) {
            console.error('[tokenBlacklist] mysql 查询失败，降级为不拦截:', e.message);
            return false;
        }
    }

    return memoryStore.isBlocked(jti);
}

module.exports = {
    add,
    isBlocked
};
