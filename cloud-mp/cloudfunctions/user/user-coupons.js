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

function couponExpireOffsetMs(validDays) {
    const days = Math.max(1, Math.floor(toNumber(validDays, 30)));
    return days * 24 * 60 * 60 * 1000;
}

function toCouponIdCandidates(couponId) {
    const raw = String(couponId || '').trim();
    if (!raw) return [];
    const numericId = Number(raw);
    return uniqueValues([
        raw,
        Number.isFinite(numericId) ? numericId : null
    ]);
}

async function getCouponIdentity(openid) {
    const userRes = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
    const rawUserIds = [];
    if (user) {
        if (hasValue(user.id)) {
            rawUserIds.push(user.id, String(user.id));
        }
        if (hasValue(user._id)) rawUserIds.push(user._id);
        if (hasValue(user._legacy_id)) rawUserIds.push(user._legacy_id, String(user._legacy_id));
    }
    const userIds = uniqueValues(rawUserIds);
    if (userIds.length === 0 && hasValue(openid)) userIds.push(openid);
    return {
        user,
        openids: [openid],
        userIds
    };
}

function couponKey(coupon) {
    return String(coupon._id || coupon.id || `${coupon.user_id || coupon.openid || ''}:${coupon.coupon_id || ''}`);
}

function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'object') {
        if (value.$date) return parseDate(value.$date);
        if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
        if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
        if (typeof value.toDate === 'function') {
            try { return value.toDate(); } catch (_) {}
        }
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
    if (!date) return '';
    const next = new Date(date.getTime() + Math.max(1, days) * 24 * 60 * 60 * 1000);
    return next.toISOString();
}

async function queryUserCouponsByUserIds(userIds = [], extraWhere = null, limit = null) {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
    const tasks = userIds.map(async (userId) => {
        let query = db.collection('user_coupons').where(extraWhere ? { user_id: userId, ...extraWhere } : { user_id: userId });
        if (limit != null) query = query.limit(limit);
        const res = await query.get().catch(() => ({ data: [] }));
        return res.data || [];
    });
    return (await Promise.all(tasks)).flat();
}

async function findLotteryPrize(prizeId) {
    if (!hasValue(prizeId)) return null;
    const key = String(prizeId);
    const numericId = Number(key);
    const [docRes, legacyRes] = await Promise.all([
        db.collection('lottery_prizes').doc(key).get().catch(() => ({ data: null })),
        Number.isFinite(numericId)
            ? db.collection('lottery_prizes').where({ id: numericId }).limit(1).get().catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] })
    ]);
    return docRes.data || (legacyRes.data && legacyRes.data[0]) || null;
}

function resolveLotteryCouponTemplateId(prize = {}, record = {}) {
    const candidates = [
        prize.coupon_id,
        prize.prize_value,
        prize.value,
        record.coupon_id,
        record.prize_value,
        record.value
    ];
    for (const candidate of candidates) {
        if (hasValue(candidate)) return candidate;
    }
    return null;
}

async function fetchLotteryCouponRecords(identity = {}) {
    const tasks = [];
    if (identity.openids && identity.openids.length) {
        tasks.push(getAllRecords(db, 'lottery_records', { openid: _.in(identity.openids), prize_type: 'coupon' }).catch(() => []));
    }
    if (identity.userIds && identity.userIds.length) {
        tasks.push(...identity.userIds.map((userId) =>
            getAllRecords(db, 'lottery_records', { user_id: userId, prize_type: 'coupon' }).catch(() => [])
        ));
    }
    if (!tasks.length) return [];
    const map = {};
    (await Promise.all(tasks)).flat().forEach((record) => {
        map[String(record._id || record.id || `${record.user_id || record.openid || ''}:${record.prize_id || ''}:${record.created_at || ''}`)] = record;
    });
    return Object.values(map);
}

async function reconcileLotteryCoupons(openid) {
    const identity = await getCouponIdentity(openid);
    const [existingCoupons, lotteryCouponRecords] = await Promise.all([
        fetchCouponsByIdentity(openid),
        fetchLotteryCouponRecords(identity)
    ]);
    if (!lotteryCouponRecords.length) return 0;

    const existingSourceIds = new Set(
        existingCoupons
            .map((coupon) => coupon.source_lottery_record_id)
            .filter(hasValue)
            .map((value) => String(value))
    );

    let createdCount = 0;
    for (const record of lotteryCouponRecords) {
        const sourceRecordId = String(record._id || record.id || '');
        if (sourceRecordId && existingSourceIds.has(sourceRecordId)) continue;

        const prize = await findLotteryPrize(record.prize_id);
        const templateId = resolveLotteryCouponTemplateId(prize || {}, record);
        if (!hasValue(templateId)) continue;

        const template = await findCouponTemplate(templateId);
        if (!template) continue;

        const userId = identity.user && (identity.user.id || identity.user._id || identity.user._legacy_id)
            ? (identity.user.id || identity.user._id || identity.user._legacy_id)
            : openid;
        const createdAt = parseDate(record.claimed_at) || parseDate(record.created_at) || new Date();
        const validDays = Math.max(1, toNumber(template.valid_days, 30));

        await db.collection('user_coupons').add({
            data: {
                openid,
                user_id: userId,
                coupon_id: template.id != null ? template.id : (template._id || templateId),
                coupon_name: template.name || record.prize_name || '优惠券',
                coupon_type: template.type === 'percent' ? 'percent' : (template.type || template.coupon_type || 'fixed'),
                coupon_value: toNumber(template.value != null ? template.value : template.coupon_value, 0),
                min_purchase: toNumber(template.min_purchase, 0),
                scope: template.scope || 'all',
                scope_ids: Array.isArray(template.scope_ids) ? template.scope_ids : [],
                status: 'unused',
                source: 'lottery',
                source_lottery_record_id: sourceRecordId,
                source_prize_id: record.prize_id || '',
                created_at: createdAt.toISOString(),
                expire_at: addDays(createdAt, validDays),
                updated_at: createdAt.toISOString()
            }
        }).catch(() => null);

        if (sourceRecordId) existingSourceIds.add(sourceRecordId);
        createdCount += 1;
    }

    return createdCount;
}

function expireTime(coupon) {
    const raw = coupon.expire_at || coupon.expires_at || coupon.end_at || coupon.valid_until;
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

async function findCouponTemplate(couponId) {
    const candidates = toCouponIdCandidates(couponId);
    if (!candidates.length) return null;

    const strId = String(couponId);
    const numId = Number(strId);
    const hasNumeric = Number.isFinite(numId);

    // 1) 按数字 id 字段查
    if (hasNumeric) {
        const r = await db.collection('coupons').where({ id: numId }).limit(1).get().catch(() => ({ data: [] }));
        if (r.data && r.data[0]) return r.data[0];
    }

    // 2) 按字符串 id 字段查（兼容 admin-api 存储为字符串的情况）
    const r2 = await db.collection('coupons').where({ id: strId }).limit(1).get().catch(() => ({ data: [] }));
    if (r2.data && r2.data[0]) return r2.data[0];

    // 3) 按 _id 查
    try {
        const byDoc = await db.collection('coupons').doc(strId).get();
        if (byDoc.data) return byDoc.data;
    } catch (_) {}

    // 4) 按 coupon_id 字段查（兼容旧数据格式）
    if (hasNumeric) {
        const r3 = await db.collection('coupons').where({ coupon_id: _.in([numId, strId]) }).limit(1).get().catch(() => ({ data: [] }));
        if (r3.data && r3.data[0]) return r3.data[0];
    }

    console.warn('[findCouponTemplate] 未找到优惠券:', couponId, 'candidates:', candidates);
    return null;
}

function shouldHydrateFromTemplate(coupon) {
    return !hasValue(coupon.coupon_name)
        || !hasValue(coupon.coupon_type)
        || !hasValue(coupon.coupon_value)
        || !hasValue(coupon.min_purchase)
        || !hasValue(coupon.scope)
        || coupon.scope_ids == null;
}

async function normalizeCouponRecord(coupon) {
    const template = shouldHydrateFromTemplate(coupon)
        ? await findCouponTemplate(coupon.coupon_id)
        : null;

    const resolvedType = coupon.coupon_type || coupon.type || (template && (template.coupon_type || template.type)) || 'fixed';
    const resolvedScope = coupon.scope || (template && template.scope) || 'all';
    const resolvedScopeIds = Array.isArray(coupon.scope_ids)
        ? coupon.scope_ids
        : (template && Array.isArray(template.scope_ids) ? template.scope_ids : []);

    return {
        ...coupon,
        status: derivedStatus(coupon),
        coupon_id: hasValue(coupon.coupon_id)
            ? coupon.coupon_id
            : (template ? (template.id != null ? template.id : template._id) : ''),
        coupon_name: coupon.coupon_name || coupon.name || (template && template.name) || '优惠券',
        coupon_type: resolvedType,
        coupon_value: toNumber(
            coupon.coupon_value != null
                ? coupon.coupon_value
                : (coupon.value != null ? coupon.value : (template && (template.coupon_value != null ? template.coupon_value : template.value))),
            0
        ),
        min_purchase: toNumber(
            coupon.min_purchase != null
                ? coupon.min_purchase
                : (template && template.min_purchase),
            0
        ),
        scope: resolvedScope,
        scope_ids: resolvedScopeIds,
        expire_at: coupon.expire_at || coupon.expires_at || coupon.end_at || coupon.valid_until || '',
        expires_at: coupon.expires_at || coupon.expire_at || ''
    };
}

async function hasOwnedCoupon(identity, couponId) {
    const couponIdCandidates = toCouponIdCandidates(couponId);
    if (!couponIdCandidates.length) return false;

    const queries = [
        db.collection('user_coupons')
            .where({ openid: _.in(identity.openids), coupon_id: _.in(couponIdCandidates) })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }))
    ];

    if (identity.userIds.length) {
        queries.push(
            Promise.resolve({ data: await queryUserCouponsByUserIds(identity.userIds, { coupon_id: _.in(couponIdCandidates) }, 1) })
        );
    }

    const results = await Promise.all(queries);
    return results.some((result) => Array.isArray(result.data) && result.data.length > 0);
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
        queries.push(queryUserCouponsByUserIds(identity.userIds));
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
        await reconcileLotteryCoupons(openid).catch(() => 0);
        const allCoupons = await fetchCouponsByIdentity(openid);
        const normalizedCoupons = await Promise.all(allCoupons.map((coupon) => normalizeCouponRecord(coupon)));
        return normalizedCoupons
            .filter((coupon) => statusMatches(coupon, status))
            .sort((a, b) => {
                const ta = expireTime(a);
                const tb = expireTime(b);
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
    const cid = String(couponId);
    const identity = await getCouponIdentity(openid);

    if (await hasOwnedCoupon(identity, cid)) {
        return { success: false, message: '已领取此优惠券' };
    }

    const couponData = await findCouponTemplate(cid);
    if (!couponData) {
        return { success: false, message: '优惠券不存在' };
    }

    if (Number(couponData.is_active) === 0) {
        return { success: false, message: '此活动已结束' };
    }
    if (couponData.stock != null && couponData.stock !== -1 && Number(couponData.stock) <= 0) {
        return { success: false, message: '此券库存不足' };
    }

    const result = await db.collection('user_coupons').add({
        data: {
            openid,
            user_id: identity.user && (identity.user.id || identity.user._id) ? (identity.user.id || identity.user._id) : openid,
            coupon_id: couponData.id != null ? couponData.id : (couponData._id || cid),
            coupon_name: couponData.name,
            coupon_type: couponData.type === 'percent' ? 'percent' : (couponData.type || couponData.coupon_type || 'fixed'),
            coupon_value: toNumber(couponData.value != null ? couponData.value : couponData.coupon_value, 0),
            min_purchase: toNumber(couponData.min_purchase, 0),
            scope: couponData.scope || 'all',
            scope_ids: Array.isArray(couponData.scope_ids) ? couponData.scope_ids : [],
            status: 'unused',
            created_at: db.serverDate(),
            expire_at: db.serverDate({ offset: (couponData.valid_days || 30) * 24 * 60 * 60 * 1000 })
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
            const cid = tpl.id != null ? String(tpl.id) : tpl._id;
            const identity = await getCouponIdentity(openid);
            if (await hasOwnedCoupon(identity, cid)) continue;

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
                    user_id: identity.user && (identity.user.id || identity.user._id) ? (identity.user.id || identity.user._id) : openid,
                    coupon_id: cid,
                    coupon_name: tpl.name,
                    coupon_type: tpl.type === 'percent' ? 'percent' : 'fixed',
                    coupon_value: toNumber(tpl.value, 0),
                    min_purchase: toNumber(tpl.min_purchase, 0),
                    scope: tpl.scope || 'all',
                    scope_ids: Array.isArray(tpl.scope_ids) ? tpl.scope_ids : [],
                    status: 'unused',
                    created_at: db.serverDate(),
                    // CloudBase serverDate offset 使用毫秒，这里必须按“天 -> 毫秒”换算。
                    expire_at: db.serverDate({ offset: couponExpireOffsetMs(validDays) })
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
    claimWelcomeCoupons,
    normalizeCouponRecord,
    reconcileLotteryCoupons
};
