'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber, getAllRecords } = require('./shared/utils');

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

async function getCouponIdentity(openid) {
    const userRes = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
    const rawUserIds = [openid];
    if (user) {
        if (hasValue(user.id)) {
            rawUserIds.push(user.id, String(user.id));
        }
        if (hasValue(user._id)) rawUserIds.push(user._id);
    }
    const userIds = uniqueValues(rawUserIds);
    return {
        openids: [openid],
        userIds
    };
}

function couponKey(coupon) {
    return String(coupon._id || coupon.id || `${coupon.user_id || coupon.openid || ''}:${coupon.coupon_id || ''}`);
}

function expireTime(coupon) {
    const raw = coupon.expire_at || coupon.end_at || coupon.valid_until;
    if (!raw) return 0;
    const time = new Date(raw).getTime();
    return Number.isFinite(time) ? time : 0;
}

function derivedStatus(coupon) {
    const raw = String(coupon.status || '').toLowerCase();
    if (['used', 'consumed', 'redeemed'].includes(raw) || coupon.used_at || coupon.used_order_id) {
        return 'used';
    }
    const expired = raw === 'expired' || (expireTime(coupon) > 0 && expireTime(coupon) < Date.now());
    if (expired) return 'expired';
    return 'unused';
}

function normalizeCoupon(coupon) {
    return {
        ...coupon,
        status: derivedStatus(coupon),
        coupon_name: coupon.coupon_name || coupon.name || '优惠券',
        coupon_type: coupon.coupon_type || coupon.type || 'fixed',
        coupon_value: toNumber(coupon.coupon_value != null ? coupon.coupon_value : coupon.value, 0),
        min_purchase: toNumber(coupon.min_purchase, 0),
        scope: coupon.scope || 'all'
    };
}

function statusMatches(coupon, status) {
    if (!status) return true;
    const wanted = String(status).toLowerCase();
    const actual = coupon.status;
    if (['unused', 'available', 'valid', 'active'].includes(wanted)) return actual === 'unused';
    if (['used', 'consumed', 'redeemed'].includes(wanted)) return actual === 'used';
    if (['expired', 'overdue'].includes(wanted)) return actual === 'expired';
    return actual === wanted;
}

async function fetchCouponsByIdentity(openid) {
    const identity = await getCouponIdentity(openid);
    const queries = [
        getAllRecords(db, 'user_coupons', { openid: _.in(identity.openids) })
    ];
    if (identity.userIds.length) {
        queries.push(getAllRecords(db, 'user_coupons', { user_id: _.in(identity.userIds) }));
    }

    const results = await Promise.all(queries.map((query) => query.catch(() => [])));
    const map = {};
    results.forEach((list) => {
        (list || []).forEach((coupon) => {
            map[couponKey(coupon)] = coupon;
        });
    });
    return Object.keys(map).map((key) => map[key]);
}

/**
 * 获取用户优惠券列表
 */
async function listCoupons(openid, status = 'unused') {
    try {
        const allCoupons = await fetchCouponsByIdentity(openid);
        return allCoupons
            .map(normalizeCoupon)
            .filter((coupon) => statusMatches(coupon, status))
            .sort((a, b) => {
                const ta = a.expire_at ? new Date(a.expire_at).getTime() : 0;
                const tb = b.expire_at ? new Date(b.expire_at).getTime() : 0;
                return ta - tb;
            });
    } catch (err) {
        console.error('[user-coupons] listCoupons 失败:', err.message);
        return [];
    }
}

/**
 * 领取优惠券
 */
async function claimCoupon(openid, couponId) {
    const existing = await db.collection('user_coupons')
        .where({ openid, coupon_id: couponId })
        .limit(1)
        .get();

    if (existing.data && existing.data.length > 0) {
        return { success: false, message: '已领取此优惠券' };
    }

    const coupon = await db.collection('coupons').doc(couponId).get();
    if (!coupon.data) {
        return { success: false, message: '优惠券不存在' };
    }

    const result = await db.collection('user_coupons').add({
        data: {
            openid,
            coupon_id: couponId,
            coupon_name: coupon.data.name,
            status: 'unused',
            created_at: db.serverDate(),
            expire_at: db.serverDate({ offset: (coupon.data.valid_days || 30) * 24 * 60 * 60 })
        }
    });

    return { success: true, id: result._id };
}

/**
 * 自动领取新人优惠券
 */
async function claimWelcomeCoupons(openid) {
    try {
        // 查找所有新人/注册类优惠券模板
        const tplRes = await db.collection('coupons').where({
            name: db.RegExp({ regexp: '注册|见面礼|开运|新人', options: 'i' })
        }).get();

        const templates = tplRes.data.filter(t => t.is_active !== false);
        if (!templates.length) return 0;

        let claimedCount = 0;
        for (const tpl of templates) {
            const cid = String(tpl.id) || tpl._id;
            // 检查是否已领
            const existing = await db.collection('user_coupons')
                .where({ openid, coupon_id: cid })
                .count().catch(() => ({ total: 0 }));
            if (existing.total > 0) continue;

            // 检查库存
            if (tpl.stock > 0) {
                const totalClaimed = await db.collection('user_coupons')
                    .where({ coupon_id: cid })
                    .count().catch(() => ({ total: 0 }));
                if (totalClaimed.total >= tpl.stock) continue;
            }

            const validDays = toNumber(tpl.valid_days, 30);
            await db.collection('user_coupons').add({
                data: {
                    openid,
                    coupon_id: cid,
                    coupon_name: tpl.name,
                    coupon_type: tpl.type === 'percent' ? 'percent' : 'fixed',
                    coupon_value: toNumber(tpl.value, 0),
                    min_purchase: toNumber(tpl.min_purchase, 0),
                    status: 'unused',
                    created_at: db.serverDate(),
                    expire_at: db.serverDate({ offset: validDays * 24 * 60 * 60 })
                }
            });
            claimedCount += 1;
        }

        // 标记已发放
        await db.collection('users').where({ openid }).update({
            data: { register_coupons_issued: true, updated_at: db.serverDate() }
        }).catch(() => {});

        return claimedCount;
    } catch (err) {
        console.error('[claimWelcomeCoupons] Error:', err);
        return 0;
    }
}

module.exports = {
    listCoupons,
    claimCoupon,
    claimWelcomeCoupons
};
