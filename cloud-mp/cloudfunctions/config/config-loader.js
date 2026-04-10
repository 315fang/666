'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();

/**
 * 加载配置（不传 configType 时返回所有配置的合并对象）
 */
async function loadConfig(configType) {
    if (configType) {
        const res = await db.collection('configs')
            .where({ config_key: configType })
            .limit(1)
            .get();
        if (res.data && res.data.length > 0) return res.data[0];
        const legacyRes = await db.collection('app_configs')
            .where({ config_key: configType, status: true })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        return legacyRes.data && legacyRes.data.length > 0 ? legacyRes.data[0] : null;
    }

    // 无参数时加载所有配置并合并为键值对象
    const res = await db.collection('configs')
        .where({ active: true })
        .get()
        .catch(() => ({ data: [] }));

    const config = {};
    (res.data || []).forEach(item => {
        const key = item.config_key || item.key || item.type || item._id;
        if (key) {
            config[key] = item.config_value !== undefined ? item.config_value : (item.value !== undefined ? item.value : item);
        }
    });

    const legacyRes = await db.collection('app_configs')
        .where({ status: true })
        .get()
        .catch(() => ({ data: [] }));
    (legacyRes.data || []).forEach(item => {
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
    const res = await db.collection('configs')
        .where({ active: true })
        .get()
        .catch(() => ({ data: [] }));
    return res.data || [];
}

module.exports = {
    loadConfig,
    loadAllConfigs
};
