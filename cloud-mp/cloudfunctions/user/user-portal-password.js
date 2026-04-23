'use strict';

const crypto = require('crypto');

const PORTAL_PASSWORD_MIN_ROLE_LEVEL = 1;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
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

function verifyPortalPasswordHash(storedHash, rawPassword) {
    const text = pickString(storedHash);
    const parts = text.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = toNumber(parts[1], 0);
    const salt = parts[2];
    const expectedHex = parts[3];
    if (!iterations || !salt || !expectedHex) return false;
    const actual = crypto.pbkdf2Sync(
        String(rawPassword || ''),
        salt,
        iterations,
        expectedHex.length / 2,
        PBKDF2_DIGEST
    );
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function buildPortalPasswordFlags(user = {}) {
    const enabled = !!pickString(user.portal_password_hash);
    const changedAt = pickString(user.portal_password_changed_at);
    const lockedUntil = pickString(user.portal_password_locked_until);
    return {
        portal_password_enabled: enabled,
        portal_password_change_required: enabled && !changedAt,
        portal_password_locked_until: lockedUntil,
        portal_password_failed_count: Math.max(0, toNumber(user.portal_password_failed_count, 0))
    };
}

async function loadUserByOpenid(db, openid) {
    const res = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function patchUser(db, user = {}, patch = {}) {
    const docId = pickString(user._id || user.id);
    const data = {
        ...patch,
        updated_at: patch.updated_at || nowIso()
    };
    if (docId) {
        await db.collection('users').doc(docId).update({ data }).catch(async () => {
            await db.collection('users').where({ openid: pickString(user.openid) }).update({ data });
        });
        return;
    }
    await db.collection('users').where({ openid: pickString(user.openid) }).update({ data });
}

function resolveLockMessage(user = {}) {
    const lockedUntil = pickString(user.portal_password_locked_until);
    if (!lockedUntil) return '业务密码已锁定，请稍后再试';
    const ts = new Date(lockedUntil).getTime();
    if (!Number.isFinite(ts) || ts <= Date.now()) return '业务密码已锁定，请稍后再试';
    return `业务密码已锁定，请于 ${lockedUntil.replace('T', ' ').slice(0, 16)} 后重试`;
}

async function registerPasswordFailure(db, user = {}) {
    const current = Math.max(0, toNumber(user.portal_password_failed_count, 0));
    const nextCount = current + 1;
    const lockTriggered = nextCount >= MAX_FAILED_ATTEMPTS;
    const lockedUntil = lockTriggered
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
        : '';
    await patchUser(db, user, {
        portal_password_failed_count: lockTriggered ? 0 : nextCount,
        portal_password_locked_until: lockedUntil
    });
    return lockTriggered
        ? `业务密码已锁定，请 ${LOCK_MINUTES} 分钟后重试`
        : '业务密码错误';
}

async function clearPasswordFailures(db, user = {}) {
    if (!toNumber(user.portal_password_failed_count, 0) && !pickString(user.portal_password_locked_until)) return;
    await patchUser(db, user, {
        portal_password_failed_count: 0,
        portal_password_locked_until: ''
    });
}

function validateNewPassword(password = '') {
    const text = String(password || '').trim();
    if (!/^\d{6}$/.test(text)) return '新密码需为 6 位数字';
    return '';
}

async function verifyPasswordOrThrow(db, user = {}, rawPassword, options = {}) {
    const password = String(rawPassword || '').trim();
    if (!password) throw new Error('请输入业务密码');
    if (!pickString(user.portal_password_hash)) throw new Error('请先在密码中心申领业务密码');
    const lockedUntilTs = new Date(pickString(user.portal_password_locked_until)).getTime();
    if (Number.isFinite(lockedUntilTs) && lockedUntilTs > Date.now()) {
        throw new Error(resolveLockMessage(user));
    }

    if (!verifyPortalPasswordHash(user.portal_password_hash, password)) {
        throw new Error(await registerPasswordFailure(db, user));
    }

    await clearPasswordFailures(db, user);
    const flags = buildPortalPasswordFlags(user);
    if (!options.allowChangeRequired && flags.portal_password_change_required) {
        throw new Error('请先在密码中心修改初始密码');
    }
    return {
        ok: true,
        flags
    };
}

async function assertPortalPassword(db, openid, rawPassword, options = {}) {
    const user = await loadUserByOpenid(db, openid);
    if (!user) throw new Error('用户不存在');
    if (!isPortalPasswordEligible(user)) throw new Error('当前账号暂不支持业务密码');
    const result = await verifyPasswordOrThrow(db, user, rawPassword, options);
    return {
        user,
        flags: result.flags
    };
}

async function applyInitialPassword(db, openid) {
    const user = await loadUserByOpenid(db, openid);
    if (!user) throw new Error('用户不存在');
    if (!isPortalPasswordEligible(user)) throw new Error('当前账号暂不支持业务密码');
    if (pickString(user.portal_password_hash)) {
        throw new Error('业务密码已设置，如需重置请联系后台人工处理');
    }
    const initialPassword = generateInitialPassword();
    const passwordHash = hashPortalPassword(initialPassword);
    const nextVersion = Math.max(0, toNumber(user.portal_password_version, 0)) + 1;
    const setAt = nowIso();
    await patchUser(db, user, {
        portal_password_hash: passwordHash,
        portal_password_set_at: setAt,
        portal_password_changed_at: '',
        portal_password_failed_count: 0,
        portal_password_locked_until: '',
        portal_password_version: nextVersion
    });
    return {
        member_no: resolveMemberNo(user),
        initial_password: initialPassword,
        portal_password_enabled: true,
        portal_password_change_required: true,
        portal_password_set_at: setAt,
        portal_password_version: nextVersion
    };
}

async function verifyPortalPassword(db, openid, rawPassword) {
    const user = await loadUserByOpenid(db, openid);
    if (!user) throw new Error('用户不存在');
    if (!isPortalPasswordEligible(user)) throw new Error('当前账号暂不支持业务密码');
    const result = await verifyPasswordOrThrow(db, user, rawPassword, { allowChangeRequired: true });
    return {
        verified: true,
        ...result.flags
    };
}

async function changePortalPassword(db, openid, currentPassword, nextPassword) {
    const user = await loadUserByOpenid(db, openid);
    if (!user) throw new Error('用户不存在');
    if (!isPortalPasswordEligible(user)) throw new Error('当前账号暂不支持业务密码');
    const validationMessage = validateNewPassword(nextPassword);
    if (validationMessage) throw new Error(validationMessage);
    await verifyPasswordOrThrow(db, user, currentPassword, { allowChangeRequired: true });
    if (verifyPortalPasswordHash(pickString(user.portal_password_hash), String(nextPassword || '').trim())) {
        throw new Error('新密码不能与当前密码相同');
    }
    const changedAt = nowIso();
    const nextVersion = Math.max(0, toNumber(user.portal_password_version, 0)) + 1;
    await patchUser(db, user, {
        portal_password_hash: hashPortalPassword(String(nextPassword || '').trim()),
        portal_password_changed_at: changedAt,
        portal_password_failed_count: 0,
        portal_password_locked_until: '',
        portal_password_version: nextVersion
    });
    return {
        changed: true,
        portal_password_enabled: true,
        portal_password_change_required: false,
        portal_password_changed_at: changedAt,
        portal_password_version: nextVersion
    };
}

module.exports = {
    buildPortalPasswordFlags,
    applyInitialPassword,
    verifyPortalPassword,
    changePortalPassword,
    assertPortalPassword
};
