// miniprogram/utils/userProfile.js
// 共享的用户 profile 加载工具函数
// index.js 和 user.js 使用各自的 setData 字段，但共享 API 调用和 roleName 计算

const { get } = require('./request');
const { ROLE_NAMES } = require('../config/constants');

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function normalizeUserInfo(info = {}) {
    const roleLevel = toNumber(info.role_level != null ? info.role_level : (info.role || info.distributor_level || 0), 0);
    const nickname = pickString(info.nickname || info.nick_name || info.nickName || '微信用户');
    const avatar = pickString(info.avatar_url || info.avatarUrl || info.avatar || '');
    const commissionBalance = toNumber(info.commission_balance != null ? info.commission_balance : info.balance, 0);
    const goodsFundBalance = toNumber(
        info.goods_fund_balance != null
            ? info.goods_fund_balance
            : (info.agent_wallet_balance != null ? info.agent_wallet_balance : info.wallet_balance),
        0
    );
    return {
        ...info,
        id: info.id || info._id || '',
        _id: info._id || info.id || '',
        nickname,
        nick_name: nickname,
        nickName: nickname,
        avatar_url: avatar,
        avatarUrl: avatar,
        avatar,
        role_level: roleLevel,
        role_name: info.role_name || ROLE_NAMES[roleLevel] || ROLE_NAMES[info.role || 0] || '普通用户',
        commission_balance: commissionBalance,
        balance: commissionBalance,
        goods_fund_balance: goodsFundBalance,
        agent_wallet_balance: goodsFundBalance,
        wallet_balance: goodsFundBalance,
        invite_code: info.invite_code || info.my_invite_code || info.member_no || '',
        my_invite_code: info.my_invite_code || info.invite_code || '',
        member_no: info.member_no || info.my_invite_code || info.invite_code || '',
        status_text: info.status_text || (toNumber(info.status, 1) === 0 ? '禁用' : '正常')
    };
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
            const info = normalizeUserInfo(res.data);
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

module.exports = { fetchUserProfile, truncateNickname, calcGrowthPercent, normalizeUserInfo };
