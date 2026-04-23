'use strict';

const crypto = require('crypto');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const PBKDF2_DIGEST = 'sha256';

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function resolveRoleLevel(user = {}) {
    return Math.max(0, toNumber(user.role_level ?? user.distributor_level ?? user.level, 0));
}

function isPortalPasswordEligible(user = {}) {
    return resolveRoleLevel(user) >= 1;
}

function verifyPortalPasswordHash(storedHash, rawPassword) {
    const parts = pickString(storedHash).split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = toNumber(parts[1], 0);
    const salt = parts[2];
    const expectedHex = parts[3];
    if (!iterations || !salt || !expectedHex) return false;
    const actual = crypto.pbkdf2Sync(String(rawPassword || ''), salt, iterations, expectedHex.length / 2, PBKDF2_DIGEST);
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function loadUserByOpenid(db, openid) {
    const res = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function patchUser(db, user = {}, patch = {}) {
    const docId = pickString(user._id || user.id);
    const data = { ...patch, updated_at: patch.updated_at || new Date().toISOString() };
    if (docId) {
        await db.collection('users').doc(docId).update({ data }).catch(async () => {
            await db.collection('users').where({ openid: pickString(user.openid) }).update({ data });
        });
        return;
    }
    await db.collection('users').where({ openid: pickString(user.openid) }).update({ data });
}

async function registerPasswordFailure(db, user = {}) {
    const current = Math.max(0, toNumber(user.portal_password_failed_count, 0));
    const nextCount = current + 1;
    const lockTriggered = nextCount >= MAX_FAILED_ATTEMPTS;
    await patchUser(db, user, {
        portal_password_failed_count: lockTriggered ? 0 : nextCount,
        portal_password_locked_until: lockTriggered ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : ''
    });
    return lockTriggered ? `业务密码已锁定，请 ${LOCK_MINUTES} 分钟后重试` : '业务密码错误';
}

async function clearPasswordFailures(db, user = {}) {
    if (!toNumber(user.portal_password_failed_count, 0) && !pickString(user.portal_password_locked_until)) return;
    await patchUser(db, user, {
        portal_password_failed_count: 0,
        portal_password_locked_until: ''
    });
}

async function assertPortalPassword(db, openid, rawPassword) {
    const user = await loadUserByOpenid(db, openid);
    if (!user) throw new Error('用户不存在');
    if (!isPortalPasswordEligible(user)) throw new Error('当前账号暂不支持业务密码');
    if (!pickString(user.portal_password_hash)) throw new Error('请先在密码中心申领业务密码');
    if (pickString(user.portal_password_changed_at) === '') throw new Error('请先在密码中心修改初始密码');
    const password = String(rawPassword || '').trim();
    if (!password) throw new Error('请输入业务密码');
    const lockedUntilTs = new Date(pickString(user.portal_password_locked_until)).getTime();
    if (Number.isFinite(lockedUntilTs) && lockedUntilTs > Date.now()) {
        throw new Error(`业务密码已锁定，请 ${LOCK_MINUTES} 分钟后重试`);
    }
    if (!verifyPortalPasswordHash(user.portal_password_hash, password)) {
        throw new Error(await registerPasswordFailure(db, user));
    }
    await clearPasswordFailures(db, user);
    return user;
}

module.exports = {
    assertPortalPassword
};
