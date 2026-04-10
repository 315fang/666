'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

let configCache = {};
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟

/**
 * 从缓存获取配置
 */
function getCachedConfig(key) {
    const now = Date.now();
    if (now - cacheTime > CACHE_DURATION) {
        configCache = {};
        return null;
    }
    return configCache[key] || null;
}

/**
 * 设置缓存
 */
function setCachedConfig(key, value) {
    configCache[key] = value;
    cacheTime = Date.now();
}

/**
 * 清除缓存
 */
function clearConfigCache() {
    configCache = {};
    cacheTime = 0;
}

/**
 * 从数据库获取配置（兼容 index.js 的 getConfig 调用）
 * @param {string} key - 配置键
 * @returns {Promise<*>} 配置值
 */
async function getConfig(key) {
    // 先查缓存
    const cached = getCachedConfig(key);
    if (cached !== null) return cached;

    // 查数据库
    try {
        const res = await db.collection('configs')
            .where({ key, active: true })
            .limit(1)
            .get();

        if (res.data && res.data.length > 0) {
            const value = res.data[0].value !== undefined ? res.data[0].value : res.data[0];
            setCachedConfig(key, value);
            return value;
        }
    } catch (err) {
        console.error('[config-cache] getConfig error:', err);
    }

    return null;
}

module.exports = {
    getCachedConfig,
    setCachedConfig,
    clearConfigCache,
    getConfig
};
