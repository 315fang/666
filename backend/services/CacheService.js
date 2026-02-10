/**
 * Redis 缓存服务
 * 统一管理缓存操作，提供简洁的API
 */

const redis = require('redis');
const { promisify } = require('util');

class CacheService {
    constructor() {
        this.client = null;
        this.isConnected = false;

        // 缓存键前缀
        this.PREFIX = {
            USER: 'user:',
            PRODUCT: 'product:',
            CATEGORY: 'category:',
            ORDER: 'order:',
            CART: 'cart:',
            SESSION: 'session:',
            COMMISSION: 'commission:'
        };

        // 默认过期时间（秒）
        this.TTL = {
            SHORT: 60,           // 1分钟
            MEDIUM: 300,         // 5分钟
            LONG: 1800,          // 30分钟
            HOUR: 3600,          // 1小时
            DAY: 86400           // 24小时
        };
    }

    /**
     * 初始化 Redis 连接
     * @param {Object} config - Redis 配置
     */
    async connect(config = {}) {
        if (this.isConnected) {
            return;
        }

        const defaultConfig = {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            db: process.env.REDIS_DB || 0,
            retry_strategy: (options) => {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    console.error('Redis 连接被拒绝');
                    return new Error('Redis 服务器拒绝连接');
                }
                if (options.total_retry_time > 1000 * 60 * 60) {
                    return new Error('Redis 重试超时');
                }
                if (options.attempt > 10) {
                    return undefined;
                }
                // 重新连接间隔
                return Math.min(options.attempt * 100, 3000);
            }
        };

        try {
            this.client = redis.createClient({ ...defaultConfig, ...config });

            // Promisify Redis 方法
            this.get = promisify(this.client.get).bind(this.client);
            this.set = promisify(this.client.set).bind(this.client);
            this.del = promisify(this.client.del).bind(this.client);
            this.exists = promisify(this.client.exists).bind(this.client);
            this.expire = promisify(this.client.expire).bind(this.client);
            this.ttl = promisify(this.client.ttl).bind(this.client);
            this.keys = promisify(this.client.keys).bind(this.client);
            this.hget = promisify(this.client.hget).bind(this.client);
            this.hset = promisify(this.client.hset).bind(this.client);
            this.hdel = promisify(this.client.hdel).bind(this.client);
            this.hgetall = promisify(this.client.hgetall).bind(this.client);

            this.client.on('connect', () => {
                console.log('✓ Redis 连接成功');
                this.isConnected = true;
            });

            this.client.on('error', (err) => {
                console.error('✗ Redis 错误:', err.message);
                this.isConnected = false;
            });

            this.client.on('end', () => {
                console.log('Redis 连接已关闭');
                this.isConnected = false;
            });

        } catch (error) {
            console.error('Redis 初始化失败:', error.message);
            throw error;
        }
    }

    /**
     * 生成缓存键
     * @param {string} prefix - 键前缀
     * @param {string|number} id - ID
     * @returns {string} 完整的缓存键
     */
    _makeKey(prefix, id) {
        return `${prefix}${id}`;
    }

    /**
     * 获取缓存
     * @param {string} key - 缓存键
     * @returns {Promise<any>} 缓存值（自动解析JSON）
     */
    async getCache(key) {
        if (!this.isConnected) {
            return null;
        }

        try {
            const value = await this.get(key);
            if (!value) {
                return null;
            }
            return JSON.parse(value);
        } catch (error) {
            console.error(`获取缓存失败 [${key}]:`, error.message);
            return null;
        }
    }

    /**
     * 设置缓存
     * @param {string} key - 缓存键
     * @param {any} value - 缓存值（自动转JSON）
     * @param {number} ttl - 过期时间（秒），不传则永不过期
     * @returns {Promise<boolean>} 是否成功
     */
    async setCache(key, value, ttl = null) {
        if (!this.isConnected) {
            return false;
        }

        try {
            const serialized = JSON.stringify(value);
            if (ttl) {
                await this.set(key, serialized, 'EX', ttl);
            } else {
                await this.set(key, serialized);
            }
            return true;
        } catch (error) {
            console.error(`设置缓存失败 [${key}]:`, error.message);
            return false;
        }
    }

    /**
     * 删除缓存
     * @param {string} key - 缓存键
     * @returns {Promise<boolean>} 是否成功
     */
    async deleteCache(key) {
        if (!this.isConnected) {
            return false;
        }

        try {
            await this.del(key);
            return true;
        } catch (error) {
            console.error(`删除缓存失败 [${key}]:`, error.message);
            return false;
        }
    }

    /**
     * 批量删除缓存（支持通配符）
     * @param {string} pattern - 键模式（如 'user:*'）
     * @returns {Promise<number>} 删除的键数量
     */
    async deleteByPattern(pattern) {
        if (!this.isConnected) {
            return 0;
        }

        try {
            const keys = await this.keys(pattern);
            if (keys.length === 0) {
                return 0;
            }
            await this.del(...keys);
            return keys.length;
        } catch (error) {
            console.error(`批量删除缓存失败 [${pattern}]:`, error.message);
            return 0;
        }
    }

    /**
     * 检查缓存是否存在
     * @param {string} key - 缓存键
     * @returns {Promise<boolean>} 是否存在
     */
    async hasCache(key) {
        if (!this.isConnected) {
            return false;
        }

        try {
            const exists = await this.exists(key);
            return exists === 1;
        } catch (error) {
            console.error(`检查缓存失败 [${key}]:`, error.message);
            return false;
        }
    }

    /**
     * 缓存用户信息
     * @param {number} userId - 用户ID
     * @param {Object} userData - 用户数据
     * @param {number} ttl - 过期时间
     */
    async cacheUser(userId, userData, ttl = this.TTL.HOUR) {
        const key = this._makeKey(this.PREFIX.USER, userId);
        return this.setCache(key, userData, ttl);
    }

    /**
     * 获取用户缓存
     * @param {number} userId - 用户ID
     * @returns {Promise<Object|null>} 用户数据
     */
    async getUser(userId) {
        const key = this._makeKey(this.PREFIX.USER, userId);
        return this.getCache(key);
    }

    /**
     * 清除用户缓存
     * @param {number} userId - 用户ID
     */
    async clearUser(userId) {
        const key = this._makeKey(this.PREFIX.USER, userId);
        return this.deleteCache(key);
    }

    /**
     * 缓存商品信息
     * @param {number} productId - 商品ID
     * @param {Object} productData - 商品数据
     * @param {number} ttl - 过期时间
     */
    async cacheProduct(productId, productData, ttl = this.TTL.LONG) {
        const key = this._makeKey(this.PREFIX.PRODUCT, productId);
        return this.setCache(key, productData, ttl);
    }

    /**
     * 获取商品缓存
     * @param {number} productId - 商品ID
     * @returns {Promise<Object|null>} 商品数据
     */
    async getProduct(productId) {
        const key = this._makeKey(this.PREFIX.PRODUCT, productId);
        return this.getCache(key);
    }

    /**
     * 清除商品缓存
     * @param {number} productId - 商品ID
     */
    async clearProduct(productId) {
        const key = this._makeKey(this.PREFIX.PRODUCT, productId);
        return this.deleteCache(key);
    }

    /**
     * 清除所有商品缓存
     */
    async clearAllProducts() {
        return this.deleteByPattern(this.PREFIX.PRODUCT + '*');
    }

    /**
     * 关闭 Redis 连接
     */
    async disconnect() {
        if (this.client && this.isConnected) {
            this.client.quit();
            this.isConnected = false;
        }
    }

    /**
     * 获取连接状态
     * @returns {boolean} 是否已连接
     */
    isReady() {
        return this.isConnected;
    }
}

// 导出单例
const cacheService = new CacheService();

module.exports = cacheService;
