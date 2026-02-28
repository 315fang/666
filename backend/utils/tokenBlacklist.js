/**
 * Token 黑名单服务（内存版）
 * 
 * 用途：管理员注销后，使 Token 立即失效，防止 Token 被盗用后复用。
 * 
 * 机制：
 * - 将已注销的 jti（JWT Token ID）存入 Map，并记录过期时间
 * - 过期后自动清理，不占用无限内存
 * - 无需 Redis 依赖，适合单机部署；如需多机部署可替换为 Redis 实现
 * 
 * 使用方式：
 * - 注销时调用 tokenBlacklist.add(jti, exp)
 * - 验证时调用 tokenBlacklist.isBlocked(jti)
 */

class TokenBlacklist {
    constructor() {
        /** @type {Map<string, number>} jti -> expireAt 毫秒时间戳 */
        this._store = new Map();

        // 每小时清理一次过期条目
        this._cleanupInterval = setInterval(() => this._cleanup(), 60 * 60 * 1000);

        // 防止定时器阻止进程退出
        if (this._cleanupInterval.unref) {
            this._cleanupInterval.unref();
        }
    }

    /**
     * 将 Token 加入黑名单
     * @param {string} jti - JWT Token ID（建议在 JWT payload 中包含 jti 字段）
     * @param {number} exp - JWT 过期时间（Unix 时间戳，秒）
     */
    add(jti, exp) {
        if (!jti) return;
        const expireAt = (exp || 0) * 1000; // 转为毫秒
        this._store.set(jti, expireAt);
    }

    /**
     * 判断 Token 是否在黑名单中
     * @param {string} jti
     * @returns {boolean}
     */
    isBlocked(jti) {
        if (!jti) return false;
        const expireAt = this._store.get(jti);
        if (expireAt === undefined) return false;
        // 如果已过期，顺便清理
        if (Date.now() > expireAt) {
            this._store.delete(jti);
            return false;
        }
        return true;
    }

    /**
     * 清理所有已过期的黑名单条目
     */
    _cleanup() {
        const now = Date.now();
        for (const [jti, expireAt] of this._store) {
            if (now > expireAt) {
                this._store.delete(jti);
            }
        }
    }

    /** 当前黑名单中的 Token 数量（调试用） */
    get size() {
        return this._store.size;
    }
}

// 单例：全局共享同一个黑名单实例
module.exports = new TokenBlacklist();
