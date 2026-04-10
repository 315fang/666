'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();

/**
 * 加载配置（不传 configType 时返回所有配置的合并对象）
 */
async function loadConfig(configType) {
    if (configType) {
        const res = await db.collection('configs')
            .where({ type: configType, active: true })
            .limit(1)
            .get();
        return res.data && res.data.length > 0 ? res.data[0] : null;
    }

    // 无参数时加载所有配置并合并为键值对象
    const res = await db.collection('configs')
        .where({ active: true })
        .get()
        .catch(() => ({ data: [] }));

    const config = {};
    (res.data || []).forEach(item => {
        const key = item.key || item.type || item._id;
        if (key) {
            config[key] = item.value !== undefined ? item.value : item;
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
