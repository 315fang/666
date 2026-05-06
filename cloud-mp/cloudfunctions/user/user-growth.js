'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { buildGrowthProgress, loadTierConfig } = require('./shared/growth');
const { toNumber } = require('./shared/utils');

/**
 * 获取用户完整信息（含成长数据）
 */
async function getUser(openid) {
    const res = await db.collection('users').where({ openid }).limit(1).get();
    return res.data[0] || null;
}

/**
 * 获取成长进度
 */
async function getGrowthProgress(openid) {
    const user = await getUser(openid);
    if (!user) return null;

    const growthValue = Math.max(0, toNumber(user.growth_value, 0));
    const tierConfig = await loadTierConfig(db);
    return buildGrowthProgress(growthValue, tierConfig);
}

/**
 * 增加积分
 */
async function addPoints(openid, points) {
    const user = await getUser(openid);
    if (!user) return null;

    const pointDelta = Math.trunc(toNumber(points, 0));
    if (pointDelta === 0) return getGrowthProgress(openid);

    await db.collection('users').where({ openid }).update({
        data: {
            points: _.inc(pointDelta),
            updated_at: db.serverDate()
        }
    });

    return getGrowthProgress(openid);
}

/**
 * 构建用户统计信息（余额、积分等）
 */
function buildUserStats(user) {
    if (!user) return null;
    const growthValue = Math.max(0, toNumber(user.growth_value, 0));
    const points = Math.max(0, toNumber(user.points != null ? user.points : user.growth_value, 0));
    const balance = toNumber(user.commission_balance != null ? user.commission_balance : user.balance, 0);
    const goodsFundBalance = toNumber(user.agent_wallet_balance != null ? user.agent_wallet_balance : user.wallet_balance, 0);
    const totalSpent = toNumber(user.total_spent, 0);
    const orderCount = toNumber(user.order_count, 0);

    return {
        points,
        balance,
        commission_balance: balance,
        wallet_balance: goodsFundBalance,
        agent_wallet_balance: goodsFundBalance,
        total_spent: totalSpent,
        order_count: orderCount,
        growth_value: growthValue
    };
}

module.exports = {
    getUser,
    getGrowthProgress,
    addPoints,
    buildUserStats
};
