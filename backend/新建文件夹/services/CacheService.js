/**
 * 缓存服务 (内存版/Redis版自适应)
 * 适用于低配服务器，无需强制安装 Redis
 * 自动降级策略：Redis连接失败或未安装模块 -> 内存缓存
 */

let redis = null;
try {
    // 尝试加载 redis 模块，如果未安装也不会报错
    redis = require('redis');
} catch (e) {
    console.log('提示: 未检测到 redis 模块，将使用内存缓存模式');
}

const { promisify } = require('util');

class CacheService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.useMemory = true; // 默认优先尝试内存模式
        this.memoryCache = new Map(); // 内存缓存容器

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

        // 启动内存缓存清理定时器 (每分钟清理一次过期键)
        this._startMemoryCleanup();
    }

    /**
     * 内存缓存清理任务
     */
    _startMemoryCleanup() {
        setInterval(() => {
            const now = Date.now();
            let count = 0;
            for (const [key, item] of this.memoryCache.entries()) {
                if (item.expireAt && item.expireAt < now) {
                    this.memoryCache.delete(key);
                    count++;
                }
            }
            if (count > 0 && process.env.NODE_ENV === 'development') {
                // console.log(`[Cache] 内存清理: 移除了 ${count} 个过期键`);
            }
        }, 60 * 1000);
    }

    /**
     * 初始化连接
     */
    async connect(config = {}) {
        // 1. 如果没有 redis 模块，直接使用内存模式
        if (!redis) {
            this.useMemory = true;
            this.isConnected = true;
            console.log('✓ 缓存服务已就绪 (内存模式 - 未安装Redis)');
            return;
        }

        // 2. 如果环境变量明确禁用 Redis，使用内存模式
        if (process.env.USE_REDIS === 'false') {
            this.useMemory = true;
            this.isConnected = true;
            console.log('✓ 缓存服务已就绪 (内存模式 - 配置禁用Redis)');
            return;
        }

        // 3. 尝试连接 Redis
        await this._connectRedis(config);
    }

    async _connectRedis(config) {
        const defaultConfig = {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            db: process.env.REDIS_DB || 0,
            retry_strategy: (options) => {
                // 如果连接失败超过3次，降级为内存模式
                if (options.attempt > 3) {
                    console.log('⚠️ Redis 连接重试次数过多，自动降级为内存模式');
                    this.useMemory = true;
                    this.isConnected = true;
                    if (this.client) {
                        this.client.quit();
                        this.client = null;
                    }
                    return undefined; 
                }
                // 重试间隔
                return Math.min(options.attempt * 200, 2000);
            }
        };

        try {
            this.client = redis.createClient({ ...defaultConfig, ...config });
            
            this.client.on('connect', () => {
                console.log('✓ Redis 连接成功');
                this.isConnected = true;
                this.useMemory = false;
            });

            this.client.on('error', (err) => {
                // 仅在首次连接时报错，后续重试策略会处理
                if (!this.isConnected && !this.useMemory) {
                    console.error('✗ Redis 连接错误:', err.message);
                }
            });

            // Promisify Redis methods
            this.getAsync = promisify(this.client.get).bind(this.client);
            this.setAsync = promisify(this.client.set).bind(this.client);
            this.delAsync = promisify(this.client.del).bind(this.client);
            this.keysAsync = promisify(this.client.keys).bind(this.client);
            this.expireAsync = promisify(this.client.expire).bind(this.client);

        } catch (error) {
            console.error('Redis 初始化异常，降级为内存模式:', error.message);
            this.useMemory = true;
            this.isConnected = true;
        }
    }

    /**
     * 生成缓存键
     */
    _makeKey(prefix, id) {
        return `${prefix}${id}`;
    }

    /**
     * 获取缓存
     */
    async getCache(key) {
        if (!this.isConnected) return null;

        // 内存模式
        if (this.useMemory) {
            const item = this.memoryCache.get(key);
            if (!item) return null;
            
            // 检查过期
            if (item.expireAt && item.expireAt < Date.now()) {
                this.memoryCache.delete(key);
                return null;
            }
            return item.value;
        }

        // Redis 模式
        try {
            const value = await this.getAsync(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error(`Redis Get Error [${key}]:`, error.message);
            return null;
        }
    }

    /**
     * 设置缓存
     */
    async setCache(key, value, ttl = null) {
        if (!this.isConnected) return false;

        // 内存模式
        if (this.useMemory) {
            const expireAt = ttl ? Date.now() + (ttl * 1000) : null;
            this.memoryCache.set(key, { value, expireAt });
            return true;
        }

        // Redis 模式
        try {
            const serialized = JSON.stringify(value);
            if (ttl) {
                await this.setAsync(key, serialized, 'EX', ttl);
            } else {
                await this.setAsync(key, serialized);
            }
            return true;
        } catch (error) {
            console.error(`Redis Set Error [${key}]:`, error.message);
            return false;
        }
    }

    /**
     * 删除缓存
     */
    async deleteCache(key) {
        if (!this.isConnected) return false;

        // 内存模式
        if (this.useMemory) {
            return this.memoryCache.delete(key);
        }

        // Redis 模式
        try {
            await this.delAsync(key);
            return true;
        } catch (error) {
            console.error(`Redis Del Error [${key}]:`, error.message);
            return false;
        }
    }

    /**
     * 批量删除缓存
     */
    async deleteByPattern(pattern) {
        if (!this.isConnected) return 0;

        // 内存模式
        if (this.useMemory) {
            // 将 Redis 通配符转换为正则: user:* -> ^user:.*
            // 简单处理 * 通配符
            const regexStr = '^' + pattern.replace(/\*/g, '.*');
            const regex = new RegExp(regexStr);
            
            let count = 0;
            for (const key of this.memoryCache.keys()) {
                if (regex.test(key)) {
                    this.memoryCache.delete(key);
                    count++;
                }
            }
            return count;
        }

        // Redis 模式
        try {
            const keys = await this.keysAsync(pattern);
            if (keys && keys.length > 0) {
                await this.delAsync(...keys);
                return keys.length;
            }
            return 0;
        } catch (error) {
            console.error(`Redis Batch Del Error [${pattern}]:`, error.message);
            return 0;
        }
    }
}

module.exports = new CacheService();
