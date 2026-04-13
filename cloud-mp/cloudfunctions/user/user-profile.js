'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const { buildGrowthProgress, loadTierConfig } = require('./shared/growth');
const { toNumber } = require('./shared/utils');
const { buildCanonicalUser } = require('./user-contract');

/**
 * 获取用户信息
 */
async function getProfile(openid) {
    const res = await db.collection('users').where({ openid }).limit(1).get();
    return res.data[0] || null;
}

/**
 * 更新用户信息
 */
async function updateProfile(openid, data) {
    const updateData = {
        updated_at: db.serverDate(),
        ...data
    };
    await db.collection('users').where({ openid }).update({ data: updateData });
    return getProfile(openid);
}

/**
 * 格式化用户信息（供 index.js 调用）
 */
function formatUser(user) {
    if (!user) return null;
    const points = toNumber(user.points != null ? user.points : user.growth_value, 0);
    const canonical = buildCanonicalUser(user, {
        register_coupons_issued: !!user.register_coupons_issued,
        growth_value: points,
        points
    });
    return {
        ...canonical,
        level: canonical.role_level,
        level_name: canonical.role_name,
        distributor_level: toNumber(user.distributor_level != null ? user.distributor_level : user.agent_level, 0)
    };
}

module.exports = {
    getProfile,
    updateProfile,
    formatUser
};
