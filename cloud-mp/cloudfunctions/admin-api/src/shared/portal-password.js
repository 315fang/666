'use strict';

const crypto = require('crypto');

const PORTAL_PASSWORD_MIN_ROLE_LEVEL = 1;
const PBKDF2_DIGEST = 'sha256';
const PBKDF2_ITERATIONS = 120000;
const PBKDF2_KEYLEN = 32;
const PASSWORD_DIGITS = '0123456789';

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function nowIso() {
    return new Date().toISOString();
}

function resolveRoleLevel(user = {}) {
    return Math.max(0, toNumber(user.role_level ?? user.distributor_level ?? user.level, 0));
}

function isPortalPasswordEligible(user = {}) {
    return resolveRoleLevel(user) >= PORTAL_PASSWORD_MIN_ROLE_LEVEL;
}

function resolveMemberNo(user = {}) {
    return pickString(user.member_no || user.my_invite_code || user.invite_code || user.openid);
}

function generateInitialPassword(length = 6) {
    let output = '';
    while (output.length < length) {
        const index = crypto.randomInt(0, PASSWORD_DIGITS.length);
        output += PASSWORD_DIGITS[index];
    }
    return output;
}

function hashPortalPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const derived = crypto.pbkdf2Sync(
        String(password || ''),
        salt,
        PBKDF2_ITERATIONS,
        PBKDF2_KEYLEN,
        PBKDF2_DIGEST
    ).toString('hex');
    return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${derived}`;
}

function buildPortalPasswordState(user = {}) {
    const enabled = !!pickString(user.portal_password_hash);
    const changedAt = pickString(user.portal_password_changed_at);
    return {
        portal_password_enabled: enabled,
        portal_password_change_required: enabled && !changedAt,
        portal_password_locked_until: pickString(user.portal_password_locked_until),
        portal_password_set_at: pickString(user.portal_password_set_at),
        portal_password_changed_at: changedAt,
        portal_password_version: Math.max(0, toNumber(user.portal_password_version, 0))
    };
}

module.exports = {
    buildPortalPasswordState,
    generateInitialPassword,
    hashPortalPassword,
    isPortalPasswordEligible,
    nowIso,
    pickString,
    resolveMemberNo,
    resolveRoleLevel,
    toNumber
};
