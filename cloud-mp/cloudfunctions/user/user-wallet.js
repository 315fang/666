'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber } = require('./shared/utils');

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function uniqueValues(values) {
    const seen = {};
    const list = [];
    values.forEach((value) => {
        if (!hasValue(value)) return;
        const key = String(value);
        if (seen[key]) return;
        seen[key] = true;
        list.push(value);
    });
    return list;
}

async function getUserCouponIds(openid) {
    const userRes = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
    const values = [openid];
    if (user) {
        if (hasValue(user.id)) values.push(user.id, String(user.id));
        if (hasValue(user._id)) values.push(user._id);
    }
    return uniqueValues(values);
}

function isCouponExpired(coupon) {
    const raw = coupon.expire_at || coupon.end_at || coupon.valid_until;
    if (!raw) return false;
    const time = new Date(raw).getTime();
    return Number.isFinite(time) && time < Date.now();
}

function normalizeCoupon(coupon) {
    return {
        ...coupon,
        status: isCouponExpired(coupon) ? 'expired' : (coupon.status || 'unused'),
        coupon_name: coupon.coupon_name || coupon.name || '优惠券',
        coupon_type: coupon.coupon_type || coupon.type || 'fixed',
        coupon_value: toNumber(coupon.coupon_value != null ? coupon.coupon_value : coupon.value, 0),
        min_purchase: toNumber(coupon.min_purchase, 0),
        scope: coupon.scope || 'all'
    };
}

/**
 * 获取钱包信息
 */
async function getWalletInfo(openid) {
    const user = await db.collection('users').where({ openid }).limit(1).get();
    if (!user.data || user.data.length === 0) throw new Error('用户不存在');

    const userData = user.data[0];
    const balance = toNumber(userData.wallet_balance != null ? userData.wallet_balance : userData.balance, 0);
    const frozenAmount = toNumber(userData.frozen_amount, 0);

    // 可提现余额
    const availableBalance = Math.max(0, balance - frozenAmount);

    return {
        balance,
        available_balance: availableBalance,
        frozen_amount: frozenAmount,
        total_earned: toNumber(userData.total_earned, 0),
        total_withdrawn: toNumber(userData.total_withdrawn, 0),
    };
}

/**
 * 钱包佣金明细
 */
async function walletCommissions(openid, params = {}) {
    const res = await db.collection('commissions')
        .where({ openid })
        .orderBy('created_at', 'desc')
        .limit(50)
        .get().catch(() => ({ data: [] }));
    return res.data || [];
}

/**
 * 积分账户信息
 */
async function pointsAccount(openid) {
    const user = await db.collection('users').where({ openid }).limit(1).get();
    if (!user.data || user.data.length === 0) throw new Error('用户不存在');

    const userData = user.data[0];
    const points = toNumber(userData.points != null ? userData.points : userData.growth_value, 0);

    return {
        points,
        growth_value: points,
        level: toNumber(userData.role_level, 0),
        level_name: userData.role_name || '普通用户',
    };
}

/**
 * 签到状态
 */
async function pointsSignInStatus(openid) {
    const user = await db.collection('users').where({ openid }).limit(1).get();
    if (!user.data || user.data.length === 0) throw new Error('用户不存在');

    const userData = user.data[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastSignIn = userData.last_sign_in_at ? new Date(userData.last_sign_in_at) : null;
    const signedToday = lastSignIn && lastSignIn >= today;

    // 计算连续签到天数
    let consecutiveDays = toNumber(userData.consecutive_sign_days, 0);
    if (lastSignIn) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (lastSignIn < yesterday) {
            consecutiveDays = 0; // 断签
        }
    }

    return {
        signed_today: !!signedToday,
        consecutive_days: consecutiveDays,
        last_sign_in_at: userData.last_sign_in_at || null,
        today_points: getSignInReward(consecutiveDays + 1),
    };
}

/**
 * 执行签到
 */
async function pointsSignIn(openid) {
    const user = await db.collection('users').where({ openid }).limit(1).get();
    if (!user.data || user.data.length === 0) throw new Error('用户不存在');

    const userData = user.data[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastSignIn = userData.last_sign_in_at ? new Date(userData.last_sign_in_at) : null;
    if (lastSignIn && lastSignIn >= today) {
        throw new Error('今日已签到');
    }

    // 计算连续签到天数
    let consecutiveDays = toNumber(userData.consecutive_sign_days, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (lastSignIn && lastSignIn >= yesterday) {
        consecutiveDays += 1;
    } else {
        consecutiveDays = 1;
    }

    const rewardPoints = getSignInReward(consecutiveDays);

    // 发放积分
    await db.collection('users').where({ openid }).update({
        data: {
            points: _.inc(rewardPoints),
            growth_value: _.inc(rewardPoints),
            consecutive_sign_days: consecutiveDays,
            last_sign_in_at: db.serverDate(),
            updated_at: db.serverDate(),
        },
    });

    // 记录日志
    await db.collection('point_logs').add({
        data: {
            openid,
            type: 'earn',
            amount: rewardPoints,
            source: 'sign_in',
            description: `签到奖励（连续${consecutiveDays}天）`,
            created_at: db.serverDate(),
        },
    });

    return {
        success: true,
        points_earned: rewardPoints,
        consecutive_days: consecutiveDays,
    };
}

/**
 * 获取签到奖励积分（连续签到递增）
 */
function getSignInReward(day) {
    const rewards = [5, 10, 15, 20, 30, 40, 50]; // 1-7天
    return rewards[Math.min(day - 1, 6)] || 50;
}

/**
 * 积分任务列表
 */
async function pointsTasks(openid) {
    const user = await db.collection('users').where({ openid }).limit(1).get();
    if (!user.data || user.data.length === 0) throw new Error('用户不存在');

    const userData = user.data[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastSignIn = userData.last_sign_in_at ? new Date(userData.last_sign_in_at) : null;
    const signedToday = lastSignIn && lastSignIn >= today;

    return [
        { id: 'sign_in', name: '每日签到', points: getSignInReward(toNumber(userData.consecutive_sign_days, 0) + 1), completed: !!signedToday, daily: true },
        { id: 'order_pay', name: '下单支付', points: 10, completed: false, daily: false, description: '每消费1元得1积分' },
        { id: 'review', name: '评价订单', points: 10, completed: false, daily: false, description: '评价一次得10积分' },
        { id: 'share', name: '分享商品', points: 5, completed: false, daily: true },
    ];
}

/**
 * 积分日志
 */
async function pointsLogs(openid, params = {}) {
    let query = db.collection('point_logs').where({ openid });

    if (params.type) {
        query = query.where({ type: params.type });
    }

    const res = await query.orderBy('created_at', 'desc').limit(50).get().catch(() => ({ data: [] }));
    return res.data || [];
}

/**
 * 可用优惠券
 */
async function availableCoupons(openid, params = {}) {
    const minPurchase = toNumber(params.min_purchase != null ? params.min_purchase : params.amount, 0);
    const userIds = await getUserCouponIds(openid);

    const [openidRes, userIdRes] = await Promise.all([
        db.collection('user_coupons').where({ openid }).orderBy('expire_at', 'asc').limit(50).get().catch(() => ({ data: [] })),
        db.collection('user_coupons').where({ user_id: _.in(userIds) }).orderBy('expire_at', 'asc').limit(50).get().catch(() => ({ data: [] }))
    ]);

    const map = {};
    (openidRes.data || []).concat(userIdRes.data || []).forEach((coupon) => {
        const key = String(coupon._id || coupon.id || `${coupon.user_id || coupon.openid || ''}:${coupon.coupon_id || ''}`);
        map[key] = coupon;
    });
    let coupons = Object.keys(map)
        .map((key) => normalizeCoupon(map[key]))
        .filter((coupon) => coupon.status === 'unused');
    if (minPurchase > 0) {
        coupons = coupons.filter(c => toNumber(c.min_purchase, 0) <= minPurchase);
    }

    return coupons.sort((a, b) => {
        const ta = a.expire_at ? new Date(a.expire_at).getTime() : 0;
        const tb = b.expire_at ? new Date(b.expire_at).getTime() : 0;
        return ta - tb;
    });
}

module.exports = {
    getWalletInfo,
    walletCommissions,
    pointsAccount,
    pointsSignInStatus,
    pointsSignIn,
    pointsTasks,
    pointsLogs,
    availableCoupons,
};
