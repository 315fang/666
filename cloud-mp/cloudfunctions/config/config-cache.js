'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

let configCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟

/**
 * 从缓存获取配置
 */
function getCachedConfig(key) {
    const entry = configCache[key];
    if (!entry) {
        return null;
    }

    if (Date.now() - Number(entry.updatedAt || 0) > CACHE_DURATION) {
        delete configCache[key];
        return null;
    }

    return entry.value;
}

/**
 * 设置缓存
 */
function setCachedConfig(key, value) {
    configCache[key] = {
        value,
        updatedAt: Date.now()
    };
}

/**
 * 清除缓存
 */
function clearConfigCache() {
    configCache = {};
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
            .where({ config_key: key })
            .limit(1)
            .get();

        if (res.data && res.data.length > 0) {
            const row = res.data[0];
            const value = row.config_value !== undefined ? row.config_value : (row.value !== undefined ? row.value : row);
            setCachedConfig(key, value);
            return value;
        }

        const legacyRes = await db.collection('app_configs')
            .where({ config_key: key, status: true })
            .limit(1)
            .get();

        if (legacyRes.data && legacyRes.data.length > 0) {
            const row = legacyRes.data[0];
            const value = row.config_value !== undefined ? row.config_value : (row.value !== undefined ? row.value : row);
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
