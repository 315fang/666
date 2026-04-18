'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const { buildGrowthProgress, loadTierConfig } = require('./shared/growth');
const { toNumber } = require('./shared/utils');
const { buildCanonicalUser } = require('./user-contract');
const { resolveUserAvatarFields } = require('../shared/asset-url');

function pickString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function buildProfileUpdateData(data = {}) {
    const {
        nickname,
        nick_name: nickNameSnake,
        nickName,
        avatar,
        avatar_url: avatarSnake,
        avatarUrl,
        ...rest
    } = data || {};

    const nextNickname = pickString(nickname || nickNameSnake || nickName);
    const nextAvatar = pickString(avatar || avatarSnake || avatarUrl);
    const updateData = {
        ...rest,
        updated_at: db.serverDate()
    };

    if (nextNickname) {
        updateData.nickname = nextNickname;
        updateData.nick_name = nextNickname;
        updateData.nickName = nextNickname;
    }

    if (nextAvatar) {
        updateData.avatar = nextAvatar;
        updateData.avatar_url = nextAvatar;
        updateData.avatarUrl = nextAvatar;
    }

    return updateData;
}

/**
 * 获取用户信息
 */
async function getProfile(openid) {
    const res = await db.collection('users').where({ openid }).limit(1).get();
    const user = res.data[0] || null;
    return user ? resolveUserAvatarFields(user) : null;
}

/**
 * 更新用户信息
 */
async function updateProfile(openid, data) {
    const updateData = buildProfileUpdateData(data);
    await db.collection('users').where({ openid }).update({ data: updateData });
    return getProfile(openid);
}

/**
 * 格式化用户信息（供 index.js 调用）
 */
async function formatUser(user) {
    if (!user) return null;
    const resolvedUser = await resolveUserAvatarFields(user);
    const points = toNumber(user.points != null ? user.points : user.growth_value, 0);
    const canonical = buildCanonicalUser(resolvedUser, {
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
    buildProfileUpdateData,
    getProfile,
    updateProfile,
    formatUser
};
