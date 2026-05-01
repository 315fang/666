'use strict';

const crypto = require('crypto');

const DIRECTED_INVITE_TARGET_ROLE_LEVEL = 3;
const DIRECTED_INVITE_MIN_TRANSFER_AMOUNT = 3000;
const DIRECTED_INVITE_MAX_PENDING_PER_INVITER = 20;
const DIRECTED_INVITE_DEFAULT_EXPIRE_DAYS = 7;
const DIRECTED_INVITE_REROUTE_REQUIRED_REVIEW_NOTE = '当前账号为已绑定团队的 VIP0，满足严格改线条件；审核通过后覆盖 parent/referrer，不回算历史订单、佣金与资金数据。';
const DEFAULT_DIRECTED_INVITE_RULES = {
    enabled: true,
    initiator_min_role_level: 4,
    target_role_level: DIRECTED_INVITE_TARGET_ROLE_LEVEL,
    min_transfer_amount: DIRECTED_INVITE_MIN_TRANSFER_AMOUNT,
    max_pending_per_inviter: DIRECTED_INVITE_MAX_PENDING_PER_INVITER,
    expire_days: DIRECTED_INVITE_DEFAULT_EXPIRE_DAYS,
    reroute_required_review_note: DIRECTED_INVITE_REROUTE_REQUIRED_REVIEW_NOTE
};

const DIRECTED_INVITE_STATUS = {
    SENT: 'sent',
    ACCEPTED: 'accepted',
    ACTIVATED: 'activated',
    EXPIRED: 'expired',
    REVOKED: 'revoked',
    REJECTED: 'rejected'
};

const DIRECTED_INVITE_REVIEW_STATUS = {
    NONE: '',
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
};

const DIRECTED_INVITE_FREEZE_STATUS = {
    NONE: '',
    FROZEN: 'frozen',
    RELEASED: 'released',
    SETTLED: 'settled'
};

const DIRECTED_INVITE_LOCK_STATUS = {
    NONE: '',
    UNLOCKED: 'unlocked',
    LOCKED: 'locked'
};

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function pickString(value, fallback = '') {
    if (!hasValue(value)) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function normalizeRoleLevel(user = {}) {
    return toNumber(user.role_level ?? user.distributor_level ?? user.level ?? user.agent_level, 0);
}

function normalizeDirectedInviteRules(raw = {}) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
        enabled: source.enabled !== false,
        initiator_min_role_level: Math.max(0, Math.floor(toNumber(source.initiator_min_role_level, DEFAULT_DIRECTED_INVITE_RULES.initiator_min_role_level))),
        target_role_level: Math.max(0, Math.floor(toNumber(source.target_role_level, DEFAULT_DIRECTED_INVITE_RULES.target_role_level))),
        min_transfer_amount: roundMoney(Math.max(0, toNumber(source.min_transfer_amount, DEFAULT_DIRECTED_INVITE_RULES.min_transfer_amount))),
        max_pending_per_inviter: Math.max(1, Math.floor(toNumber(source.max_pending_per_inviter, DEFAULT_DIRECTED_INVITE_RULES.max_pending_per_inviter))),
        expire_days: Math.max(1, Math.floor(toNumber(source.expire_days, DEFAULT_DIRECTED_INVITE_RULES.expire_days))),
        reroute_required_review_note: pickString(source.reroute_required_review_note, DEFAULT_DIRECTED_INVITE_RULES.reroute_required_review_note)
    };
}

function isDirectedInviteInitiator(user = {}, rules = DEFAULT_DIRECTED_INVITE_RULES) {
    const normalizedRules = normalizeDirectedInviteRules(rules);
    return normalizeRoleLevel(user) >= normalizedRules.initiator_min_role_level;
}

function isB1OrAbove(user = {}, rules = DEFAULT_DIRECTED_INVITE_RULES) {
    const normalizedRules = normalizeDirectedInviteRules(rules);
    return normalizeRoleLevel(user) >= normalizedRules.target_role_level;
}

function isVip0(user = {}) {
    return normalizeRoleLevel(user) === 0;
}

function hasBoundParent(user = {}) {
    return !!(
        pickString(user.referrer_openid)
        || pickString(user.parent_openid)
        || hasValue(user.parent_id)
        || pickString(user.inviter_openid)
        || hasValue(user.inviter_id)
    );
}

function isDirectedInviteTargetEligible(user = {}, rules = DEFAULT_DIRECTED_INVITE_RULES) {
    if (!user || typeof user !== 'object') return false;
    if (isB1OrAbove(user, rules)) return false;
    if (hasBoundParent(user)) return false;
    return true;
}

function generateDirectedInviteId(prefix = 'dirinv') {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function generateDirectedInviteTicket(prefix = 'dirtk') {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function buildDirectedInvitePath(ticketId = '') {
    return `/pages/distribution/directed-invite?ticket=${encodeURIComponent(String(ticketId || ''))}`;
}

function addDaysIso(days = DIRECTED_INVITE_DEFAULT_EXPIRE_DAYS, now = new Date()) {
    const base = now instanceof Date ? now.getTime() : new Date(now).getTime();
    return new Date(base + Math.max(1, Number(days) || DIRECTED_INVITE_DEFAULT_EXPIRE_DAYS) * 24 * 60 * 60 * 1000).toISOString();
}

function isDirectedInvitePendingStatus(status = '') {
    return [DIRECTED_INVITE_STATUS.SENT, DIRECTED_INVITE_STATUS.ACCEPTED].includes(String(status || '').trim());
}

function isDirectedInviteClosedStatus(status = '') {
    return [
        DIRECTED_INVITE_STATUS.ACTIVATED,
        DIRECTED_INVITE_STATUS.EXPIRED,
        DIRECTED_INVITE_STATUS.REVOKED,
        DIRECTED_INVITE_STATUS.REJECTED
    ].includes(String(status || '').trim());
}

function normalizeDirectedInviteStatus(status = '') {
    const raw = pickString(status).toLowerCase();
    if (Object.values(DIRECTED_INVITE_STATUS).includes(raw)) return raw;
    return DIRECTED_INVITE_STATUS.SENT;
}

function normalizeDirectedInviteReviewStatus(status = '') {
    const raw = pickString(status).toLowerCase();
    if (Object.values(DIRECTED_INVITE_REVIEW_STATUS).includes(raw)) return raw;
    return DIRECTED_INVITE_REVIEW_STATUS.NONE;
}

function normalizeDirectedInviteFreezeStatus(status = '') {
    const raw = pickString(status).toLowerCase();
    if (Object.values(DIRECTED_INVITE_FREEZE_STATUS).includes(raw)) return raw;
    return DIRECTED_INVITE_FREEZE_STATUS.NONE;
}

function normalizeDirectedInviteLockStatus(status = '') {
    const raw = pickString(status).toLowerCase();
    if (Object.values(DIRECTED_INVITE_LOCK_STATUS).includes(raw)) return raw;
    return DIRECTED_INVITE_LOCK_STATUS.NONE;
}

function normalizeTransferAmount(amount) {
    return roundMoney(Math.max(0, toNumber(amount, 0)));
}

function ensureDirectedInviteTransferAmount(amount, rules = DEFAULT_DIRECTED_INVITE_RULES) {
    const normalizedRules = normalizeDirectedInviteRules(rules);
    const normalized = normalizeTransferAmount(amount);
    if (normalized < normalizedRules.min_transfer_amount) {
        return {
            ok: false,
            amount: normalized,
            message: `定向邀约货款不得低于 ${normalizedRules.min_transfer_amount} 元`
        };
    }
    return {
        ok: true,
        amount: normalized
    };
}

function buildInviteStatusText(status = '', reviewStatus = '') {
    const normalizedStatus = normalizeDirectedInviteStatus(status);
    const normalizedReviewStatus = normalizeDirectedInviteReviewStatus(reviewStatus);
    if (normalizedStatus === DIRECTED_INVITE_STATUS.ACCEPTED && normalizedReviewStatus === DIRECTED_INVITE_REVIEW_STATUS.PENDING) {
        return '待审核';
    }
    const textMap = {
        [DIRECTED_INVITE_STATUS.SENT]: '邀约中',
        [DIRECTED_INVITE_STATUS.ACCEPTED]: '已接受',
        [DIRECTED_INVITE_STATUS.ACTIVATED]: '已激活',
        [DIRECTED_INVITE_STATUS.EXPIRED]: '已失效',
        [DIRECTED_INVITE_STATUS.REVOKED]: '已撤销',
        [DIRECTED_INVITE_STATUS.REJECTED]: '已拒绝'
    };
    return textMap[normalizedStatus] || '邀约中';
}

function buildDirectedInviteTypeText() {
    return 'B1 定向邀约';
}

module.exports = {
    DIRECTED_INVITE_DEFAULT_EXPIRE_DAYS,
    DIRECTED_INVITE_MIN_TRANSFER_AMOUNT,
    DIRECTED_INVITE_MAX_PENDING_PER_INVITER,
    DIRECTED_INVITE_LOCK_STATUS,
    DIRECTED_INVITE_REROUTE_REQUIRED_REVIEW_NOTE,
    DIRECTED_INVITE_REVIEW_STATUS,
    DIRECTED_INVITE_FREEZE_STATUS,
    DIRECTED_INVITE_STATUS,
    DIRECTED_INVITE_TARGET_ROLE_LEVEL,
    DEFAULT_DIRECTED_INVITE_RULES,
    addDaysIso,
    buildDirectedInvitePath,
    buildDirectedInviteTypeText,
    buildInviteStatusText,
    ensureDirectedInviteTransferAmount,
    generateDirectedInviteId,
    generateDirectedInviteTicket,
    hasBoundParent,
    hasValue,
    isB1OrAbove,
    isVip0,
    isDirectedInviteClosedStatus,
    isDirectedInviteInitiator,
    isDirectedInvitePendingStatus,
    isDirectedInviteTargetEligible,
    normalizeDirectedInviteReviewStatus,
    normalizeDirectedInviteFreezeStatus,
    normalizeDirectedInviteLockStatus,
    normalizeDirectedInviteStatus,
    normalizeDirectedInviteRules,
    normalizeRoleLevel,
    normalizeTransferAmount,
    pickString,
    roundMoney,
    toNumber
};
