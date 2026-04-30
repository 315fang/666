'use strict';

const crypto = require('crypto');
const {
    buildMiniProgramPath,
    generateWxacode,
    normalizeEnvVersion
} = require('./coupon-wxacode');

const CLAIM_TICKET_PAGE = 'pages/coupon/claim';

function generateClaimTicketId() {
    return crypto.randomBytes(10).toString('hex');
}

function buildClaimTicketScene(ticketId) {
    return `t=${encodeURIComponent(String(ticketId || '').trim())}`;
}

function buildClaimTicketSharePath(ticketId) {
    return buildMiniProgramPath(CLAIM_TICKET_PAGE, `ticket=${encodeURIComponent(String(ticketId || '').trim())}`);
}

async function generateClaimTicketWxacode({
    ticketId,
    envVersion = 'release',
    width,
    appId,
    appSecret,
    requestImpl,
    tokenFetcher,
    wxacodeFetcher
} = {}) {
    const normalizedTicketId = String(ticketId || '').trim();
    const result = await generateWxacode({
        page: CLAIM_TICKET_PAGE,
        scene: buildClaimTicketScene(normalizedTicketId),
        mpPath: buildClaimTicketSharePath(normalizedTicketId),
        envVersion: normalizeEnvVersion(envVersion),
        width,
        appId,
        appSecret,
        requestImpl,
        tokenFetcher,
        wxacodeFetcher
    });

    return {
        ...result,
        ticket_id: normalizedTicketId
    };
}

function normalizeClaimTicket(ticket = {}) {
    const snapshot = ticket.coupon_snapshot && typeof ticket.coupon_snapshot === 'object'
        ? ticket.coupon_snapshot
        : {};
    return {
        ...ticket,
        ticket_id: String(ticket.ticket_id || ticket._id || '').trim(),
        benefit_kind: String(ticket.benefit_kind || '').trim(),
        source_type: String(ticket.source_type || '').trim(),
        source_id: String(ticket.source_id || '').trim(),
        status: String(ticket.status || 'unused').trim(),
        coupon_template_id: ticket.coupon_template_id == null ? null : ticket.coupon_template_id,
        coupon_snapshot: snapshot,
        exchange_meta: ticket.exchange_meta && typeof ticket.exchange_meta === 'object' ? ticket.exchange_meta : null,
        claimed_by_openid: String(ticket.claimed_by_openid || '').trim(),
        claimed_user_id: ticket.claimed_user_id == null ? null : ticket.claimed_user_id,
        claimed_user_coupon_id: String(ticket.claimed_user_coupon_id || '').trim(),
        invalidated_reason: String(ticket.invalidated_reason || '').trim(),
        mp_path: buildClaimTicketSharePath(ticket.ticket_id || ticket._id || ''),
        scene: buildClaimTicketScene(ticket.ticket_id || ticket._id || '')
    };
}

function buildTemplateCouponSnapshot(coupon = {}, { pickString = (value, fallback = '') => (value == null ? fallback : String(value)), toNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}, toArray = (value) => (Array.isArray(value) ? value : (value == null || value === '' ? [] : [value])) } = {}) {
    return {
        id: coupon.id != null ? coupon.id : (coupon._legacy_id || coupon._id || ''),
        name: pickString(coupon.name),
        type: pickString(coupon.type || coupon.coupon_type || 'fixed'),
        value: toNumber(coupon.value != null ? coupon.value : coupon.coupon_value, 0),
        min_purchase: toNumber(coupon.min_purchase, 0),
        valid_days: Math.max(0, toNumber(coupon.valid_days, 30)),
        description: pickString(coupon.description),
        stock: coupon.stock == null ? -1 : toNumber(coupon.stock, -1),
        is_active: coupon.is_active == null ? 1 : toNumber(coupon.is_active, 1),
        daily_claim_limit: coupon.daily_claim_limit == null ? -1 : toNumber(coupon.daily_claim_limit, -1),
        total_claim_limit: coupon.total_claim_limit == null ? -1 : toNumber(coupon.total_claim_limit, -1),
        per_user_limit: coupon.per_user_limit == null ? 1 : Math.max(1, toNumber(coupon.per_user_limit, 1)),
        activity_enabled: coupon.activity_enabled == null ? 1 : toNumber(coupon.activity_enabled, 1),
        activity_start_at: pickString(coupon.activity_start_at || ''),
        activity_end_at: pickString(coupon.activity_end_at || ''),
        share_poster_enabled: coupon.share_poster_enabled == null ? 0 : toNumber(coupon.share_poster_enabled, 0),
        poster_badge_text: pickString(coupon.poster_badge_text || ''),
        claim_time_enabled: coupon.claim_time_enabled == null ? 0 : toNumber(coupon.claim_time_enabled, 0),
        claim_start_time: pickString(coupon.claim_start_time || '09:00'),
        claim_end_time: pickString(coupon.claim_end_time || '23:59'),
        scope: pickString(coupon.scope || 'all'),
        scope_ids: toArray(coupon.scope_ids)
    };
}

function buildTemplateCouponClaimTicket(coupon = {}, { adminId = '', nowIso = () => new Date().toISOString(), pickString = (value, fallback = '') => (value == null ? fallback : String(value)), toNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}, toArray = (value) => (Array.isArray(value) ? value : (value == null || value === '' ? [] : [value])) } = {}) {
    const ticketId = generateClaimTicketId();
    const couponId = coupon.id != null ? coupon.id : (coupon._legacy_id || coupon._id || '');
    const createdAt = nowIso();

    return {
        _id: ticketId,
        ticket_id: ticketId,
        benefit_kind: 'template_coupon',
        coupon_template_id: couponId,
        coupon_snapshot: buildTemplateCouponSnapshot(coupon, { pickString, toNumber, toArray }),
        exchange_meta: null,
        source_type: 'coupon_template',
        source_id: String(couponId),
        status: 'unused',
        claimed_by_openid: '',
        claimed_user_id: null,
        claimed_user_coupon_id: '',
        claimed_at: '',
        invalidated_reason: '',
        invalidated_at: '',
        created_by_admin_id: adminId == null ? '' : adminId,
        created_at: createdAt,
        updated_at: createdAt
    };
}

module.exports = {
    CLAIM_TICKET_PAGE,
    buildClaimTicketScene,
    buildClaimTicketSharePath,
    buildTemplateCouponClaimTicket,
    buildTemplateCouponSnapshot,
    generateClaimTicketId,
    generateClaimTicketWxacode,
    normalizeClaimTicket
};
