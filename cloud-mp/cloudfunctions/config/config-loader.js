'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;

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

async function loadRows(collectionName, whereClause) {
    const collection = db.collection(collectionName);
    const allRows = [];
    const limit = 100;
    let skip = 0;

    while (true) {
        let query = collection;
        if (whereClause) query = query.where(whereClause);
        const res = await query.skip(skip).limit(limit).get().catch(() => ({ data: [] }));
        const batch = res.data || [];
        allRows.push(...batch);
        if (batch.length < limit) break;
        skip += batch.length;
    }

    return allRows;
}

/**
 * 加载配置（不传 configType 时返回所有配置的合并对象）
 */
async function loadConfig(configType) {
    if (configType) {
        const rows = await loadRows('configs', _.or([{ config_key: configType }, { key: configType }]));
        const row = pickPreferredConfigRow(rows);
        if (row) return row;

        const legacyRows = await loadRows('app_configs', _.or([{ config_key: configType }, { key: configType }]));
        return pickPreferredConfigRow(legacyRows);
    }

    // 无参数时加载所有配置并合并为键值对象
    const rows = await loadRows('configs');
    const config = {};
    rows.filter(isConfigRowEnabled).forEach(item => {
        const key = item.config_key || item.key || item.type || item._id;
        if (key) {
            config[key] = item.config_value !== undefined ? item.config_value : (item.value !== undefined ? item.value : item);
        }
    });

    const legacyRows = await loadRows('app_configs');
    legacyRows.filter(isConfigRowEnabled).forEach(item => {
        const key = item.config_key || item.key || item._id;
        if (key && config[key] === undefined) {
            config[key] = item.config_value !== undefined ? item.config_value : (item.value !== undefined ? item.value : item);
        }
    });

    return config;
}

/**
 * 加载所有配置
 */
async function loadAllConfigs() {
    const rows = await loadRows('configs');
    return rows.filter(isConfigRowEnabled);
}

module.exports = {
    loadConfig,
    loadAllConfigs
};
