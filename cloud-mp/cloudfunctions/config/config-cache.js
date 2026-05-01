'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

let configCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟
let modelCache = {};
let cacheMeta = { value: {}, updatedAt: 0 };
const CACHE_META_TTL = 3 * 1000;
const MODEL_CACHE_DURATION = 60 * 1000;

function parseTimestamp(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const ts = new Date(value).getTime();
        return Number.isFinite(ts) ? ts : 0;
    }
    if (typeof value === 'object') {
        if (typeof value._seconds === 'number') return value._seconds * 1000;
        if (typeof value.seconds === 'number') return value.seconds * 1000;
        if (value.$date !== undefined) return parseTimestamp(value.$date);
        if (typeof value.toDate === 'function') {
            const date = value.toDate();
            return date instanceof Date ? date.getTime() : 0;
        }
    }
    return 0;
}

function isEnabledFlag(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return fallback;
    if (['true', 'yes', 'y', 'on', 'enabled', 'enable', 'active', 'show', 'visible'].includes(normalized)) return true;
    if (['false', 'no', 'n', 'off', 'disabled', 'disable', 'inactive', 'hidden'].includes(normalized)) return false;
    return fallback;
}

function isConfigRowEnabled(row = {}) {
    if (row.active !== undefined && row.active !== null && row.active !== '') {
        return isEnabledFlag(row.active, true);
    }
    if (row.status !== undefined && row.status !== null && row.status !== '') {
        return isEnabledFlag(row.status, true);
    }
    return true;
}

function pickPreferredConfigRow(rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const enabledRows = rows.filter(isConfigRowEnabled);
    const source = enabledRows.length ? enabledRows : rows.slice();
    return source.sort((a, b) => {
        const timeDiff = parseTimestamp(b.updated_at || b.created_at) - parseTimestamp(a.updated_at || a.created_at);
        if (timeDiff !== 0) return timeDiff;
        return String(b._id || b.id || '').localeCompare(String(a._id || a.id || ''));
    })[0] || null;
}

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
    modelCache = {};
    cacheMeta = { value: {}, updatedAt: 0 };
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
            .where(_.or([{ config_key: key }, { key }]))
            .limit(20)
            .get();

        const row = pickPreferredConfigRow(res.data || []);
        if (row) {
            const value = row.config_value !== undefined ? row.config_value : (row.value !== undefined ? row.value : row);
            setCachedConfig(key, value);
            return value;
        }

        const legacyRes = await db.collection('app_configs')
            .where(_.or([{ config_key: key }, { key }]))
            .limit(20)
            .get();

        const legacyRow = pickPreferredConfigRow(legacyRes.data || []);
        if (legacyRow) {
            const row = legacyRow;
            const value = row.config_value !== undefined ? row.config_value : (row.value !== undefined ? row.value : row);
            setCachedConfig(key, value);
            return value;
        }
    } catch (err) {
        console.error('[config-cache] getConfig error:', err);
    }

    return null;
}

function getCachedModel(key, version = '') {
    const entry = modelCache[key];
    if (!entry) {
        return null;
    }
    if (Date.now() - Number(entry.updatedAt || 0) > MODEL_CACHE_DURATION) {
        delete modelCache[key];
        return null;
    }
    if (String(entry.version || '') !== String(version || '')) {
        delete modelCache[key];
        return null;
    }
    return entry.value;
}

function setCachedModel(key, value, version = '') {
    modelCache[key] = {
        value,
        version: String(version || ''),
        updatedAt: Date.now()
    };
}

async function getCacheMeta() {
    if (Date.now() - Number(cacheMeta.updatedAt || 0) <= CACHE_META_TTL) {
        return cacheMeta.value || {};
    }
    try {
        const res = await db.collection('admin_singletons')
            .doc('config-cache-meta')
            .get()
            .catch(() => ({ data: null }));
        cacheMeta = {
            value: res.data && typeof res.data.value === 'object' ? res.data.value : {},
            updatedAt: Date.now()
        };
    } catch (err) {
        console.error('[config-cache] getCacheMeta error:', err);
        cacheMeta = {
            value: {},
            updatedAt: Date.now()
        };
    }
    return cacheMeta.value || {};
}

async function getCacheVersion(key) {
    const meta = await getCacheMeta();
    return String((meta && meta[key]) || '');
}

module.exports = {
    getCachedConfig,
    setCachedConfig,
    clearConfigCache,
    getConfig,
    getCachedModel,
    setCachedModel,
    getCacheVersion
};
