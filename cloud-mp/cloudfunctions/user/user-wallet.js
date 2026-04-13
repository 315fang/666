'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber, getAllRecords } = require('./shared/utils');
const { normalizeCouponRecord } = require('./user-coupons');

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

function normalizeScopeIds(value) {
    if (Array.isArray(value)) return uniqueValues(value);
    if (!hasValue(value)) return [];
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return uniqueValues(parsed);
            } catch (_) {}
        }
        return uniqueValues(trimmed.split(',').map((item) => item.trim()));
    }
    return uniqueValues([value]);
}

function couponMatchesScope(coupon = {}, params = {}) {
    const scope = String(coupon.scope || 'all').toLowerCase();
    const scopeIds = normalizeScopeIds(coupon.scope_ids);
    if (!scope || scope === 'all' || scopeIds.length === 0) return true;
    if (scope === 'product') {
        const productIds = normalizeScopeIds(params.product_ids);
        return productIds.length === 0 || productIds.some((id) => scopeIds.includes(String(id)));
    }
    if (scope === 'category') {
        const categoryIds = normalizeScopeIds(params.category_ids);
        return categoryIds.length === 0 || categoryIds.some((id) => scopeIds.includes(String(id)));
    }
    return true;
}

async function getCommissionIdentity(openid) {
    const userRes = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
    const userIds = [];
    if (user) {
        if (hasValue(user.id)) userIds.push(user.id, String(user.id));
        if (hasValue(user._id)) userIds.push(user._id);
        if (hasValue(user._legacy_id)) userIds.push(user._legacy_id, String(user._legacy_id));
    }
    return {
        user,
        openid,
        userIds: uniqueValues(userIds)
    };
}

function commissionRecordKey(row = {}) {
    return String(row._id || `${row.openid || ''}:${row.user_id || ''}:${row.order_id || ''}:${row.type || ''}:${row.created_at || ''}`);
}

async function listCommissionRows(identity = {}) {
    const tasks = [];
    if (identity.openid) {
        tasks.push(getAllRecords(db, 'commissions', { openid: identity.openid }).catch(() => []));
    }
    if (identity.userIds && identity.userIds.length) {
        identity.userIds.forEach((userId) => {
            tasks.push(getAllRecords(db, 'commissions', { user_id: userId }).catch(() => []));
        });
    }
    if (!tasks.length) return [];

    const groups = await Promise.all(tasks);
    const merged = {};
    groups.flat().forEach((row) => {
        merged[commissionRecordKey(row)] = row;
    });
    return Object.values(merged);
}

function roundMoney(val) {
    return Math.round(toNumber(val, 0) * 100) / 100;
}

function getAgentWalletBalance(user = {}) {
    return roundMoney(toNumber(user.agent_wallet_balance != null ? user.agent_wallet_balance : user.wallet_balance, 0));
}

function hasExplicitCommissionBalance(user = {}) {
    if (user.commission_balance != null) return true;
    if (user.balance == null) return false;
    if (user.wallet_balance == null) return true;
    return roundMoney(user.balance) !== roundMoney(user.wallet_balance);
}

function deriveCommissionBalance(user = {}, stats = {}) {
    const settled = roundMoney(stats.settled);
    const withdrawn = roundMoney(user.total_withdrawn);
    const total = roundMoney(stats.total);
    const earned = roundMoney(user.total_earned);
    if (total <= 0 && earned > 0) {
        return Math.max(0, roundMoney(earned - withdrawn));
    }
    return Math.max(0, roundMoney(settled - withdrawn));
}

function shouldReconcileCommissionBalance(user = {}, stats = {}) {
    const explicit = hasExplicitCommissionBalance(user);
    const derived = deriveCommissionBalance(user, stats);
    if (!explicit) return { explicit, derived, useDerived: true };

    const stored = roundMoney(toNumber(user.commission_balance != null ? user.commission_balance : user.balance, 0));
    const useDerived = stored === 0 && derived > 0;
    return { explicit, derived, stored, useDerived };
}

async function syncWalletFields(user = {}, stats = {}) {
    const updates = {};
    const agentBalance = getAgentWalletBalance(user);
    const { explicit, derived, stored, useDerived } = shouldReconcileCommissionBalance(user, stats);
    const ambiguousLegacyBalance = !explicit && user.balance != null && user.wallet_balance != null;
    const commissionBalance = useDerived
        ? derived
        : roundMoney(toNumber(user.commission_balance != null ? user.commission_balance : user.balance, stored || 0));

    if (user.agent_wallet_balance == null) {
        updates.agent_wallet_balance = agentBalance;
    }
    if (user.commission_balance == null || ambiguousLegacyBalance || useDerived) {
        updates.commission_balance = commissionBalance;
    }
    if (user.balance == null || ambiguousLegacyBalance || useDerived) {
        updates.balance = commissionBalance;
    }

    if (Object.keys(updates).length && user._id) {
        await db.collection('users').doc(String(user._id)).update({
            data: {
                ...updates,
                updated_at: db.serverDate()
            }
        }).catch(() => {});
        return { ...user, ...updates };
    }
    return user;
}

/**
 * 获取钱包信息
 * 实时从 commissions 集合汇总各状态金额，保证数据准确。
 * 返回结构与前端 wallet/index.js 的 loadWalletInfo 完全对应。
 */
async function getWalletInfo(openid) {
    const identity = await getCommissionIdentity(openid);
    if (!identity.user) throw new Error('用户不存在');
    let userData = identity.user;
    const commissionRows = await listCommissionRows(identity);

    // 实时汇总各佣金状态金额
    const stats = {
        frozen: 0,           // 冻结中（退款保护期内）
        pendingApproval: 0,  // 待入账（退款期过，等平台审核）
        approved: 0,         // 待结算（审核通过，等打款）
        settled: 0,          // 已结算完成（历史）
        cancelled: 0,        // 已取消
        total: 0             // 历史累计（不含 cancelled）
    };

    commissionRows.forEach(item => {
        const amt = toNumber(item.amount, 0);
        const s = String(item.status || '');
        if (s === 'frozen')           stats.frozen += amt;
        else if (s === 'pending_approval') stats.pendingApproval += amt;
        else if (s === 'approved')    stats.approved += amt;
        else if (s === 'settled' || s === 'completed') stats.settled += amt;
        // pending 状态：佣金刚生成尚未冻结，归入冻结前暂存，也计入累计
        else if (s === 'pending')     stats.frozen += amt;

        if (s !== 'cancelled') stats.total += amt;
    });

    Object.keys(stats).forEach(k => { stats[k] = roundMoney(stats[k]); });

    userData = await syncWalletFields(userData, stats);

    const balance = roundMoney(toNumber(userData.commission_balance != null ? userData.commission_balance : userData.balance, 0));
    const totalWithdrawn = roundMoney(userData.total_withdrawn);
    const available = balance;
    const goodsFundBalance = getAgentWalletBalance(userData);
    const pendingIn = roundMoney(stats.frozen + stats.pendingApproval + stats.approved);

    return {
        balance,
        available_balance: available,
        commission_balance: balance,
        goods_fund_balance: goodsFundBalance,
        agent_wallet_balance: goodsFundBalance,
        pendingIn,
        total_withdrawn: totalWithdrawn,
        commission: {
            frozen: stats.frozen,                    // 冻结中（退款保护期内）
            pendingApproval: stats.pendingApproval,  // 审核中（等平台审核）
            approved: stats.approved,                // 待打款（审核通过等打款）
            // 待入账合计 = 所有尚未到账的金额之和
            pendingTotal: pendingIn,
            pendingIn,
            available,                               // 可提现（以实际余额为准）
            total: stats.total,                      // 历史累计
            settled: stats.settled,                  // 已结算
        }
    };
}

/**
 * 钱包佣金明细（含分页、类型筛选、来源用户/订单信息）
 */
async function walletCommissions(openid, params = {}) {
    const page  = Math.max(1, parseInt(params.page)  || 1);
    const limit = Math.min(50, parseInt(params.limit) || 20);
    const skip  = (page - 1) * limit;
    const typeFilter = params.type ? String(params.type).toLowerCase() : '';
    const identity = await getCommissionIdentity(openid);
    let list = await listCommissionRows(identity);

    list.sort((a, b) => {
        const ta = new Date(a.created_at || 0).getTime();
        const tb = new Date(b.created_at || 0).getTime();
        return tb - ta;
    });

    // 类型筛选（兼容大小写，如 'Direct'/'direct' 均可）
    if (typeFilter && typeFilter !== 'all') {
        list = list.filter(item => {
            const t = String(item.type || '').toLowerCase();
            return t === typeFilter;
        });
    }

    // 分页截取（筛选后再截）
    const total = list.length;
    list = list.slice(skip, skip + limit);

    if (list.length === 0) return { list: [], total, page, limit };

    // ── 批量拉取来源用户信息（谁的订单触发了这笔佣金）
    const fromOpenids = uniqueValues(list.map(i => i.from_openid).filter(Boolean));
    let fromUserMap = {};
    if (fromOpenids.length > 0) {
        try {
            const userRes = await db.collection('users')
                .where({ openid: _.in(fromOpenids) })
                .field({ openid: true, nickName: true, nickname: true, phone: true, invite_code: true })
                .limit(fromOpenids.length)
                .get();
            (userRes.data || []).forEach(u => {
                fromUserMap[u.openid] = u.nickName || u.nickname || u.phone || '下级用户';
            });
        } catch (_) {}
    }

    // ── 批量拉取订单基本信息
    const orderNos = uniqueValues(list.map(i => i.order_no).filter(Boolean));
    let orderMap = {};
    if (orderNos.length > 0) {
        try {
            const orderRes = await db.collection('orders')
                .where({ order_no: _.in(orderNos) })
                .field({ order_no: true, items: true, total_amount: true, pay_amount: true })
                .limit(orderNos.length)
                .get();
            (orderRes.data || []).forEach(o => {
                orderMap[o.order_no] = {
                    order_no: o.order_no,
                    // 取第一个商品名作摘要
                    product_summary: (o.items && o.items[0]) ? (o.items[0].name || '') : '',
                    pay_amount: o.pay_amount || o.total_amount || 0
                };
            });
        } catch (_) {}
    }

    // ── 组合输出
    const enriched = list.map(item => {
        const typeKey = String(item.type || '').toLowerCase();
        const fromNick = item.from_openid ? (fromUserMap[item.from_openid] || null) : null;
        const order = item.order_no ? (orderMap[item.order_no] || null) : null;
        return {
            ...item,
            // 规范化 type（统一小写，前端按此匹配）
            type: typeKey,
            from_user_nick: fromNick,
            order_no_display: item.order_no || item.order_id || null,
            product_summary: order ? order.product_summary : null,
            order_pay_amount: order ? order.pay_amount : null
        };
    });

    return { list: enriched, total, page, limit };
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
    let coupons = await Promise.all(Object.keys(map).map((key) => normalizeCouponRecord(map[key])));
    coupons = coupons.filter((coupon) => coupon.status === 'unused');
    if (minPurchase > 0) {
        coupons = coupons.filter(c => toNumber(c.min_purchase, 0) <= minPurchase);
    }
    coupons = coupons.filter((coupon) => couponMatchesScope(coupon, params));

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
