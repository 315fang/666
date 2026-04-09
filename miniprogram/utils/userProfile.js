// miniprogram/utils/userProfile.js
// 共享的用户 profile 加载工具函数
// index.js 和 user.js 使用各自的 setData 字段，但共享 API 调用和 roleName 计算

const { get } = require('./request');
const { ROLE_NAMES } = require('../config/constants');

function getUserNickname(profile = {}) {
    return profile.nickName || profile.nickname || '';
}

function getUserAvatar(profile = {}) {
    return profile.avatarUrl || profile.avatar_url || '';
}

function normalizeUserProfile(rawProfile = {}) {
    const profile = { ...rawProfile };
    const nickName = getUserNickname(profile);
    const avatarUrl = getUserAvatar(profile);
    return {
        ...profile,
        nickName,
        nickname: nickName,
        avatarUrl,
        avatar_url: avatarUrl
    };
}

function syncUserProfileCache(profilePatch = {}, currentProfile = {}) {
    const app = getApp();
    const nextUserInfo = normalizeUserProfile({
        ...(app?.globalData?.userInfo || currentProfile || {}),
        ...profilePatch
    });
    if (app) {
        app.globalData.userInfo = nextUserInfo;
    }
    wx.setStorageSync('userInfo', nextUserInfo);
    return nextUserInfo;
}

/**
 * 从服务端拉取用户 profile，返回格式化后的 info 对象（含 role_name）。
 * 调用方负责将结果写入各自的 Page.data。
 *
 * @returns {Promise<{info: object}|null>} 成功返回 { info }，失败返回 null
 */
async function fetchUserProfile() {
    try {
        const res = await get('/user/profile');
        if (res.code === 0 && res.data) {
            const info = normalizeUserProfile(res.data);
            const roleLevel = info.role_level || 0;
            info.role_name = info.role_name || ROLE_NAMES[roleLevel] || ROLE_NAMES[info.role || 0] || '普通用户';
            // 同步到 globalData 和缓存
            const app = getApp();
            if (app) {
                app.globalData.userInfo = info;
                wx.setStorageSync('userInfo', info);
            }
            return { info };
        }
    } catch (err) {
        console.error('[userProfile] fetchUserProfile 失败:', err);
    }
    return null;
}

/**
 * 截断昵称到指定长度（首页用）
 * @param {string} nickname
 * @param {number} maxLen
 * @returns {string}
 */
function truncateNickname(nickname, maxLen = 4) {
    const name = nickname || '微信用户';
    return name.length > maxLen ? name.substring(0, maxLen) : name;
}

/**
 * 计算成长值百分比（首页进度条用）
 * @param {number} growth
 * @param {number} threshold
 * @returns {number} 0-100
 */
function calcGrowthPercent(growth, threshold) {
    if (!threshold) return 0;
    return Math.min(100, Math.round((growth / threshold) * 100));
}

module.exports = {
    fetchUserProfile,
    truncateNickname,
    calcGrowthPercent,
    normalizeUserProfile,
    syncUserProfileCache,
    getUserNickname,
    getUserAvatar
};
