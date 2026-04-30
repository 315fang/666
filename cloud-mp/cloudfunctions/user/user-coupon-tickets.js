'use strict';

const crypto = require('crypto');
const cloud = require('wx-server-sdk');
const userCoupons = require('./user-coupons');

const db = cloud.database();
const _ = db.command;

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null || value === '') return [];
    return [value];
}

function toTicketId(rawValue) {
    return pickString(rawValue).trim();
}

function generateUserCouponId() {
    return crypto.randomBytes(12).toString('hex');
}

async function getCouponIdentity(openid) {
    const userRes = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
    const userIds = [user?.id, user?._id, user?._legacy_id, openid]
        .filter((value) => hasValue(value));
    return {
        user,
        openid,
        userIds: [...new Set(userIds.map((value) => String(value)))]
    };
}

function buildTicketCouponInfo(ticket = {}, latestTemplate = null) {
    const snapshot = ticket.coupon_snapshot && typeof ticket.coupon_snapshot === 'object'
        ? ticket.coupon_snapshot
        : {};
    const template = latestTemplate && typeof latestTemplate === 'object'
        ? latestTemplate
        : snapshot;
    const type = pickString(template.type || template.coupon_type || snapshot.type || 'fixed');
    const value = toNumber(template.value != null ? template.value : (template.coupon_value != null ? template.coupon_value : snapshot.value), 0);
    const validDays = Math.max(0, toNumber(template.valid_days != null ? template.valid_days : snapshot.valid_days, 0));
    const exchangeMeta = ticket.exchange_meta && typeof ticket.exchange_meta === 'object' ? ticket.exchange_meta : null;

    return {
        id: pickString(ticket.ticket_id || ticket._id),
        name: pickString(template.name || snapshot.name || exchangeMeta?.title || '优惠券'),
        type,
        value,
        min_purchase: toNumber(template.min_purchase != null ? template.min_purchase : snapshot.min_purchase, 0),
        valid_days: validDays,
        description: pickString(template.description || snapshot.description),
        stock: pickString(ticket.status) === 'unused' ? 1 : 0,
        is_active: pickString(ticket.status) === 'unused' ? 1 : 0,
        scope: pickString(template.scope || snapshot.scope || (type === 'exchange' ? 'exchange' : 'all')),
        scope_ids: toArray(template.scope_ids || snapshot.scope_ids),
        daily_claim_limit: toNumber(template.daily_claim_limit != null ? template.daily_claim_limit : snapshot.daily_claim_limit, -1),
        claimed_today_count: toNumber(template.claimed_today_count != null ? template.claimed_today_count : snapshot.claimed_today_count, 0),
        total_claim_limit: toNumber(template.total_claim_limit != null ? template.total_claim_limit : snapshot.total_claim_limit, -1),
        per_user_limit: Math.max(1, toNumber(template.per_user_limit != null ? template.per_user_limit : snapshot.per_user_limit, 1)),
        activity_enabled: template.activity_enabled != null ? template.activity_enabled : (snapshot.activity_enabled != null ? snapshot.activity_enabled : 1),
        activity_start_at: pickString(template.activity_start_at || snapshot.activity_start_at),
        activity_end_at: pickString(template.activity_end_at || snapshot.activity_end_at),
        share_poster_enabled: template.share_poster_enabled != null ? template.share_poster_enabled : (snapshot.share_poster_enabled || 0),
        poster_badge_text: pickString(template.poster_badge_text || snapshot.poster_badge_text),
        claim_time_enabled: !!(template.claim_time_enabled != null ? template.claim_time_enabled : snapshot.claim_time_enabled),
        claim_start_time: pickString(template.claim_start_time || snapshot.claim_start_time),
        claim_end_time: pickString(template.claim_end_time || snapshot.claim_end_time),
        exchange_meta: exchangeMeta,
        ticket_status: pickString(ticket.status || 'unused')
    };
}

async function getLatestTemplateCoupon(conn, couponTemplateId) {
    const rawId = pickString(couponTemplateId);
    if (!rawId) return null;
    const numericId = Number(rawId);
    if (Number.isFinite(numericId)) {
        const byNumeric = await conn.collection('coupons')
            .where({ id: numericId })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (byNumeric.data && byNumeric.data[0]) return byNumeric.data[0];
    }
    const byString = await conn.collection('coupons')
        .where({ id: rawId })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (byString.data && byString.data[0]) return byString.data[0];
    try {
        const byDoc = await conn.collection('coupons').doc(rawId).get();
        if (byDoc.data) return byDoc.data;
    } catch (_) {}
    return null;
}

async function hasOwnedTemplateCoupon(conn, identity, couponTemplateId) {
    const normalizedId = pickString(couponTemplateId);
    if (!normalizedId) return false;
    const numericId = Number(normalizedId);
    const couponIdCandidates = [normalizedId];
    if (Number.isFinite(numericId)) couponIdCandidates.push(numericId);

    const openidHit = await conn.collection('user_coupons')
        .where({ openid: identity.openid, coupon_id: _.in(couponIdCandidates) })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (openidHit.data && openidHit.data[0]) return true;

    for (const userId of identity.userIds) {
        const userHit = await conn.collection('user_coupons')
            .where({ user_id: userId, coupon_id: _.in(couponIdCandidates) })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (userHit.data && userHit.data[0]) return true;
    }

    return false;
}

async function withDbTransaction(work) {
    if (typeof db.runTransaction === 'function') {
        return db.runTransaction(work);
    }
    return work(db);
}

async function getClaimTicketInfo(ticketId) {
    const normalizedTicketId = toTicketId(ticketId);
    if (!normalizedTicketId) return { found: false, coupon: null, ticket_status: 'invalid' };
    const ticketRes = await db.collection('coupon_claim_tickets')
        .doc(normalizedTicketId)
        .get()
        .catch(() => ({ data: null }));
    const ticket = ticketRes.data || null;
    if (!ticket) {
        return { found: false, coupon: null, ticket_status: 'invalid' };
    }
    const latestTemplate = pickString(ticket.benefit_kind) === 'template_coupon'
        ? await getLatestTemplateCoupon(db, ticket.coupon_template_id || ticket.coupon_snapshot?.id)
        : null;
    const availability = latestTemplate && pickString(ticket.status || 'unused') === 'unused'
        ? userCoupons.resolveTemplateClaimAvailability(latestTemplate, { alreadyOwned: false })
        : null;

    return {
        found: true,
        ticket_status: pickString(ticket.status || 'unused'),
        coupon: buildTicketCouponInfo(ticket, latestTemplate),
        claim_status: availability ? availability.state : '',
        claim_message: availability ? availability.message : '',
        can_claim: availability ? availability.canClaim : pickString(ticket.status || 'unused') === 'unused',
        ticket
    };
}

function buildExchangeCouponDoc(identity, ticket, ticketInfo) {
    const snapshot = ticket.coupon_snapshot || {};
    const exchangeMeta = ticket.exchange_meta && typeof ticket.exchange_meta === 'object' ? ticket.exchange_meta : {};
    return {
        _id: generateUserCouponId(),
        openid: identity.openid,
        user_id: identity.user?.id || identity.user?._id || identity.user?._legacy_id || identity.openid,
        coupon_id: pickString(ticket.ticket_id || ticket._id),
        coupon_name: pickString(snapshot.name || exchangeMeta.title || '兑换券'),
        coupon_type: 'exchange',
        coupon_value: toNumber(snapshot.value != null ? snapshot.value : exchangeMeta.coupon_product_value, 0),
        min_purchase: 0,
        scope: 'exchange',
        scope_ids: [],
        status: 'unused',
        source: pickString(ticket.source_type) === 'deposit_order' ? 'deposit_order' : 'ticket',
        source_order_id: pickString(ticket.source_id),
        source_ticket_id: pickString(ticket.ticket_id || ticket._id),
        title: pickString(exchangeMeta.title || snapshot.name || '兑换券'),
        description: pickString(snapshot.description),
        exchange_meta: exchangeMeta,
        created_at: new Date().toISOString(),
        expire_at: '',
        updated_at: new Date().toISOString()
    };
}

function buildTemplateCouponDoc(identity, ticket, template) {
    const snapshot = ticket.coupon_snapshot || {};
    const validDays = Math.max(1, toNumber(template.valid_days != null ? template.valid_days : snapshot.valid_days, 30));
    const expireAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();
    return {
        _id: generateUserCouponId(),
        openid: identity.openid,
        user_id: identity.user?.id || identity.user?._id || identity.user?._legacy_id || identity.openid,
        coupon_id: template.id != null ? template.id : (template._id || pickString(ticket.coupon_template_id)),
        coupon_name: pickString(template.name || snapshot.name),
        coupon_type: pickString(template.type || template.coupon_type || snapshot.type || 'fixed'),
        coupon_value: toNumber(template.value != null ? template.value : (template.coupon_value != null ? template.coupon_value : snapshot.value), 0),
        min_purchase: toNumber(template.min_purchase != null ? template.min_purchase : snapshot.min_purchase, 0),
        scope: pickString(template.scope || snapshot.scope || 'all'),
        scope_ids: toArray(template.scope_ids || snapshot.scope_ids),
        status: 'unused',
        source: 'claim_ticket',
        source_ticket_id: pickString(ticket.ticket_id || ticket._id),
        created_at: new Date().toISOString(),
        expire_at: expireAt,
        updated_at: new Date().toISOString()
    };
}

async function claimCouponByTicket(openid, ticketId) {
    const normalizedTicketId = toTicketId(ticketId);
    if (!normalizedTicketId) {
        return { success: false, message: '无效的领取码' };
    }
    const identity = await getCouponIdentity(openid);

    return withDbTransaction(async (conn) => {
        const ticketRes = await conn.collection('coupon_claim_tickets')
            .doc(normalizedTicketId)
            .get()
            .catch(() => ({ data: null }));
        const ticket = ticketRes.data || null;
        if (!ticket) {
            return { success: false, message: '领取码不存在或已失效' };
        }

        const ticketStatus = pickString(ticket.status || 'unused');
        if (ticketStatus === 'claimed') {
            return { success: false, message: '该领取码已被使用' };
        }
        if (ticketStatus !== 'unused') {
            return { success: false, message: '该领取码已失效' };
        }

        if (pickString(ticket.benefit_kind) === 'template_coupon') {
            const latestTemplate = await getLatestTemplateCoupon(conn, ticket.coupon_template_id || ticket.coupon_snapshot?.id);
            if (!latestTemplate) {
                return { success: false, message: '优惠券不存在或已下架' };
            }
            if (await hasOwnedTemplateCoupon(conn, identity, latestTemplate.id != null ? latestTemplate.id : (latestTemplate._id || ticket.coupon_template_id))) {
                return { success: false, message: '已领取此优惠券' };
            }
            const availability = userCoupons.resolveTemplateClaimAvailability(latestTemplate, { alreadyOwned: false });
            if (!availability.canClaim) {
                return { success: false, message: availability.message || '当前不可领取' };
            }
            const userCouponDoc = buildTemplateCouponDoc(identity, ticket, latestTemplate);
            await conn.collection('user_coupons').doc(userCouponDoc._id).set({ data: userCouponDoc });
            if (latestTemplate._id) {
                await conn.collection('coupons').doc(String(latestTemplate._id)).update({
                    data: {
                        issued_count: _.inc(1),
                        claim_day_key: availability.dayKey,
                        claimed_today_count: availability.claimedTodayCount + 1,
                        updated_at: new Date().toISOString()
                    }
                }).catch(() => null);
            }
            await conn.collection('coupon_claim_tickets').doc(normalizedTicketId).update({
                data: {
                    status: 'claimed',
                    claimed_by_openid: identity.openid,
                    claimed_user_id: identity.user?.id || identity.user?._id || identity.user?._legacy_id || identity.openid,
                    claimed_user_coupon_id: userCouponDoc._id,
                    claimed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            });
            return { success: true, id: userCouponDoc._id, coupon_type: 'template_coupon' };
        }

        if (pickString(ticket.benefit_kind) === 'exchange_coupon') {
            const userCouponDoc = buildExchangeCouponDoc(identity, ticket);
            await conn.collection('user_coupons').doc(userCouponDoc._id).set({ data: userCouponDoc });
            await conn.collection('coupon_claim_tickets').doc(normalizedTicketId).update({
                data: {
                    status: 'claimed',
                    claimed_by_openid: identity.openid,
                    claimed_user_id: identity.user?.id || identity.user?._id || identity.user?._legacy_id || identity.openid,
                    claimed_user_coupon_id: userCouponDoc._id,
                    claimed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            });
            if (pickString(ticket.source_type) === 'deposit_order' && pickString(ticket.source_id)) {
                await conn.collection('deposit_orders').doc(pickString(ticket.source_id)).update({
                    data: {
                        coupon_claim_state: 'claimed',
                        updated_at: new Date().toISOString()
                    }
                }).catch(() => null);
            }
            return { success: true, id: userCouponDoc._id, coupon_type: 'exchange_coupon' };
        }

        return { success: false, message: '暂不支持的领取码类型' };
    });
}

module.exports = {
    claimCouponByTicket,
    getClaimTicketInfo
};
