'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const { buildGrowthProgress, loadTierConfig } = require('./shared/growth');
const { toNumber } = require('./shared/utils');

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
    const balance = toNumber(user.wallet_balance != null ? user.wallet_balance : user.balance, 0);
    const roleLevel = toNumber(user.role_level, 0);
    const ROLE_NAMES = {
        0: '普通用户',
        1: '初级代理',
        2: '高级代理',
        3: '推广合伙人',
        4: '运营合伙人',
        5: '区域合伙人'
    };

    return {
        _id: user._id,
        openid: user.openid,
        nickName: user.nickName || user.nickname || '新用户',
        nickname: user.nickName || user.nickname || '新用户',
        avatarUrl: user.avatarUrl || user.avatar_url || '',
        avatar_url: user.avatarUrl || user.avatar_url || '',
        phone: user.phone || '',
        gender: user.gender || '',
        level: roleLevel,
        level_name: user.role_name || ROLE_NAMES[roleLevel] || '普通用户',
        role_level: roleLevel,
        role_name: user.role_name || ROLE_NAMES[roleLevel] || '普通用户',
        is_distributor: toNumber(user.distributor_level != null ? user.distributor_level : user.agent_level, 0) > 0,
        distributor_level: toNumber(user.distributor_level != null ? user.distributor_level : user.agent_level, 0),
        invite_code: user.my_invite_code || user.invite_code || '',
        my_invite_code: user.my_invite_code || '',
        register_coupons_issued: !!user.register_coupons_issued,
        growth_value: points,
        wallet_balance: balance,
        balance,
        points
    };
}

module.exports = {
    getProfile,
    updateProfile,
    formatUser
};
