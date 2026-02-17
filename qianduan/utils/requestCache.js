/**
 * 请求缓存层
 * 提供 TTL 缓存机制，减少不必要的网络请求
 */

class RequestCache {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 默认 5 分钟
  }

  /**
   * 生成缓存键
   * @param {string} url - 请求 URL
   * @param {Object} params - 请求参数
   * @returns {string} 缓存键
   */
  generateKey(url, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${JSON.stringify(params[key])}`)
      .join('&');
    return `${url}?${sortedParams}`;
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {*} 缓存数据，如果过期或不存在则返回 null
   */
  get(key) {
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > item.expireAt) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {*} data - 缓存数据
   * @param {number} ttl - 过期时间（毫秒），默认使用 defaultTTL
   */
  set(key, data, ttl = this.defaultTTL) {
    this.cache.set(key, {
      data,
      expireAt: Date.now() + ttl,
      createdAt: Date.now()
    });
  }

  /**
   * 删除指定缓存
   * @param {string} key - 缓存键
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 删除匹配前缀的所有缓存
   * @param {string} prefix - URL 前缀
   */
  deleteByPrefix(prefix) {
    const keysToDelete = [];
    this.cache.forEach((value, key) => {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 缓存统计
   */
  getStats() {
    let totalSize = 0;
    let expiredCount = 0;
    const now = Date.now();

    this.cache.forEach((item) => {
      totalSize++;
      if (now > item.expireAt) {
        expiredCount++;
      }
    });

    return {
      total: totalSize,
      expired: expiredCount,
      active: totalSize - expiredCount
    };
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];

    this.cache.forEach((item, key) => {
      if (now > item.expireAt) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));

    return keysToDelete.length;
  }
}

// 创建全局缓存实例
const requestCache = new RequestCache();

// 定期清理过期缓存（每 10 分钟）
setInterval(() => {
  const cleaned = requestCache.cleanup();
  if (cleaned > 0) {
    console.log(`[RequestCache] 清理了 ${cleaned} 个过期缓存`);
  }
}, 10 * 60 * 1000);

/**
 * 缓存策略配置
 * 为不同类型的请求设置不同的缓存时长
 */
const CACHE_STRATEGIES = {
  // 商品相关 - 5分钟
  products: 5 * 60 * 1000,
  categories: 5 * 60 * 1000,

  // 用户信息 - 10分钟
  userInfo: 10 * 60 * 1000,

  // 统计数据 - 3分钟
  statistics: 3 * 60 * 1000,

  // 配置信息 - 30分钟
  config: 30 * 60 * 1000,

  // 搜索结果 - 2分钟
  search: 2 * 60 * 1000,

  // 默认 - 5分钟
  default: 5 * 60 * 1000
};

/**
 * 根据 URL 获取缓存策略
 * @param {string} url - 请求 URL
 * @returns {number} TTL（毫秒）
 */
function getCacheStrategy(url) {
  if (url.includes('/products')) return CACHE_STRATEGIES.products;
  if (url.includes('/categories')) return CACHE_STRATEGIES.categories;
  if (url.includes('/user/profile')) return CACHE_STRATEGIES.userInfo;
  if (url.includes('/statistics')) return CACHE_STRATEGIES.statistics;
  if (url.includes('/config')) return CACHE_STRATEGIES.config;
  if (url.includes('/search')) return CACHE_STRATEGIES.search;

  return CACHE_STRATEGIES.default;
}

/**
 * 带缓存的 GET 请求包装器
 * @param {Function} requestFn - 原始请求函数
 * @param {string} url - 请求 URL
 * @param {Object} params - 请求参数
 * @param {Object} options - 额外选项
 * @param {boolean} options.useCache - 是否使用缓存，默认 true
 * @param {number} options.cacheTTL - 自定义缓存时长
 * @returns {Promise} 请求结果
 */
function cachedGet(requestFn, url, params = {}, options = {}) {
  const { useCache = true, cacheTTL, ...restOptions } = options;

  // 如果不使用缓存，直接发起请求
  if (!useCache) {
    return requestFn(url, params, restOptions);
  }

  // 生成缓存键
  const cacheKey = requestCache.generateKey(url, params);

  // 尝试从缓存获取
  const cachedData = requestCache.get(cacheKey);
  if (cachedData) {
    console.log('[RequestCache] 命中缓存:', url);
    return Promise.resolve(cachedData);
  }

  // 缓存未命中，发起请求
  console.log('[RequestCache] 缓存未命中，发起请求:', url);
  return requestFn(url, params, restOptions).then(data => {
    // 获取缓存策略
    const ttl = cacheTTL || getCacheStrategy(url);

    // 存入缓存
    requestCache.set(cacheKey, data, ttl);

    return data;
  });
}

// CommonJS 导出
module.exports = {
  RequestCache,
  requestCache,
  cachedGet,
  CACHE_STRATEGIES,
  getCacheStrategy
};
