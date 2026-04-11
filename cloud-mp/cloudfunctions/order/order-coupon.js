'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber } = require('./shared/utils');

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function uniqueValues(values) {
    const seen = new Set();
    const result = [];

    values.forEach((value) => {
        if (!hasValue(value)) return;
        const key = String(value);
        if (seen.has(key)) return;
        seen.add(key);
        result.push(value);
    });

    return result;
}

function deriveCouponStatus(coupon = {}) {
    const raw = String(coupon.status || '').toLowerCase();
    if (['used', 'consumed', 'redeemed'].includes(raw) || coupon.used_at || coupon.used_order_id) {
        return 'used';
    }

    const expireAt = coupon.expire_at || coupon.end_at || coupon.valid_until;
    if (raw === 'expired') return 'expired';
    if (expireAt) {
        const expireTime = new Date(expireAt).getTime();
        if (Number.isFinite(expireTime) && expireTime < Date.now()) {
            return 'expired';
        }
    }

    return 'unused';
}

function couponPriority(coupon = {}) {
    const status = deriveCouponStatus(coupon);
    if (status === 'unused') return 0;
    if (status === 'used') return 1;
    return 2;
}

async function getCouponIdentity(openid) {
    const userRes = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;

    return {
        openid,
        userIds: uniqueValues([
            openid,
            user && user.id,
            user && String(user.id),
            user && user._id
        ])
    };
}

function belongsToIdentity(coupon, identity) {
    if (!coupon || !identity) return false;
    if (hasValue(coupon.openid)) {
        return String(coupon.openid) === String(identity.openid);
    }
    if (hasValue(coupon.user_id)) {
        return identity.userIds.some((value) => String(value) === String(coupon.user_id));
    }
    return false;
}

async function findCouponTemplate(templateId) {
    if (!hasValue(templateId)) return null;

    const key = String(templateId);
    const numericId = toNumber(templateId, NaN);
    const [docRes, legacyRes] = await Promise.all([
        db.collection('coupons').doc(key).get().catch(() => ({ data: null })),
        Number.isFinite(numericId)
            ? db.collection('coupons').where({ id: numericId }).limit(1).get().catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] })
    ]);

    return docRes.data || (legacyRes.data && legacyRes.data[0]) || null;
}

async function normalizeUserCoupon(coupon) {
    if (!coupon) return null;

    const shouldLoadTemplate = !hasValue(coupon.coupon_type)
        || !hasValue(coupon.coupon_value)
        || !hasValue(coupon.min_purchase)
        || !hasValue(coupon.coupon_name);
    const template = shouldLoadTemplate ? await findCouponTemplate(coupon.coupon_id) : null;

    return {
        ...coupon,
        _id: coupon._id || '',
        coupon_id: hasValue(coupon.coupon_id)
            ? coupon.coupon_id
            : (template ? (template._id || template.id || '') : ''),
        coupon_name: coupon.coupon_name || coupon.name || (template && template.name) || '优惠券',
        coupon_type: coupon.coupon_type || coupon.type || (template && template.type) || 'fixed',
        coupon_value: toNumber(
            hasValue(coupon.coupon_value) ? coupon.coupon_value : (hasValue(coupon.value) ? coupon.value : (template && template.value)),
            0
        ),
        min_purchase: toNumber(
            hasValue(coupon.min_purchase) ? coupon.min_purchase : (template && template.min_purchase),
            0
        ),
        status: deriveCouponStatus(coupon)
    };
}

async function findUserCouponDoc(openid, selectedCouponId) {
    if (!hasValue(openid) || !hasValue(selectedCouponId)) return null;

    const identity = await getCouponIdentity(openid);
    const selectedKey = String(selectedCouponId);
    const selectedNum = toNumber(selectedCouponId, NaN);

    const docRes = await db.collection('user_coupons')
        .doc(selectedKey)
        .get()
        .catch(() => ({ data: null }));
    if (docRes.data && belongsToIdentity(docRes.data, identity)) {
        return normalizeUserCoupon(docRes.data);
    }

    if (Number.isFinite(selectedNum)) {
        const legacyRes = await db.collection('user_coupons')
            .where({ id: selectedNum })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        const legacyCoupon = legacyRes.data && legacyRes.data[0];
        if (legacyCoupon && belongsToIdentity(legacyCoupon, identity)) {
            return normalizeUserCoupon(legacyCoupon);
        }
    }

    const couponIdCandidates = uniqueValues([
        selectedKey,
        Number.isFinite(selectedNum) ? selectedNum : null
    ]);
    const queries = [
        db.collection('user_coupons')
            .where({ openid, coupon_id: _.in(couponIdCandidates) })
            .limit(10)
            .get()
            .catch(() => ({ data: [] }))
    ];

    if (identity.userIds.length > 0) {
        queries.push(
            db.collection('user_coupons')
                .where({ user_id: _.in(identity.userIds), coupon_id: _.in(couponIdCandidates) })
                .limit(10)
                .get()
                .catch(() => ({ data: [] }))
        );
    }

    const results = await Promise.all(queries);
    const candidates = [];
    results.forEach((result) => {
        (result.data || []).forEach((coupon) => {
            if (belongsToIdentity(coupon, identity)) {
                candidates.push(coupon);
            }
        });
    });

    if (candidates.length === 0) return null;

    candidates.sort((left, right) => couponPriority(left) - couponPriority(right));
    return normalizeUserCoupon(candidates[0]);
}

async function restoreUsedCoupon(order) {
    if (!order || !hasValue(order.openid)) return false;

    if (hasValue(order.user_coupon_id)) {
        const restored = await db.collection('user_coupons')
            .doc(String(order.user_coupon_id))
            .update({ data: { status: 'unused', used_at: _.remove() } })
            .then(() => true)
            .catch(() => false);
        if (restored) return true;
    }

    if (!hasValue(order.coupon_id)) return false;

    const identity = await getCouponIdentity(order.openid);
    const numericCouponId = toNumber(order.coupon_id, NaN);
    const couponIdCandidates = uniqueValues([
        String(order.coupon_id),
        Number.isFinite(numericCouponId) ? numericCouponId : null
    ]);
    const updates = [
        db.collection('user_coupons')
            .where({ openid: order.openid, coupon_id: _.in(couponIdCandidates), status: 'used' })
            .update({ data: { status: 'unused', used_at: _.remove() } })
            .then((result) => Boolean(result && result.stats && result.stats.updated > 0))
            .catch(() => false)
    ];

    if (identity.userIds.length > 0) {
        updates.push(
            db.collection('user_coupons')
                .where({ user_id: _.in(identity.userIds), coupon_id: _.in(couponIdCandidates), status: 'used' })
                .update({ data: { status: 'unused', used_at: _.remove() } })
                .then((result) => Boolean(result && result.stats && result.stats.updated > 0))
                .catch(() => false)
        );
    }

    const restoredList = await Promise.all(updates);
    return restoredList.some(Boolean);
}

module.exports = {
    findUserCouponDoc,
    restoreUsedCoupon
};
