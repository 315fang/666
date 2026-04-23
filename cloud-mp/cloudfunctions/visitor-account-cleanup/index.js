'use strict';

let cloud;
try {
    cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (_) {
    cloud = {
        database() {
            return null;
        }
    };
}

const db = cloud.database();

const VISITOR_HIDE_AFTER_MS = 24 * 60 * 60 * 1000;
const VISITOR_DELETE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_VISITOR_NICKNAMES = new Set(['', '新用户', '微信用户']);
const SIDE_RELATION_COLLECTIONS = [
    'addresses',
    'cart_items',
    'notifications',
    'point_accounts',
    'point_logs',
    'user_coupons',
    'user_favorites',
    'user_mass_messages'
];

function pickString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeRoleLevel(user = {}) {
    return toNumber(user.role_level ?? user.distributor_level ?? user.level ?? user.agent_level, 0);
}

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function primaryId(user = {}) {
    return user._id || user.id || user._legacy_id || '';
}

function parseTime(value) {
    if (!value) return 0;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

function buildIdentityCandidates(user = {}) {
    const values = [user.openid, user._id, user.id, user._legacy_id].filter(hasValue);
    const seen = new Set();
    return values.filter((value) => {
        const key = `${typeof value}:${String(value)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function hasBoundParent(user = {}) {
    return !!(
        pickString(user.referrer_openid)
        || pickString(user.parent_openid)
        || hasValue(user.parent_id)
    );
}

function isDefaultVisitorNickname(user = {}) {
    const nickname = pickString(user.nickname || user.nickName || user.nick_name || user.name);
    return DEFAULT_VISITOR_NICKNAMES.has(nickname);
}

function hasAvatarOrPhone(user = {}) {
    return !!(
        pickString(user.avatar_url || user.avatarUrl || user.avatar)
        || pickString(user.phone || user.mobile || user.phoneNumber)
    );
}

async function hasAnyByWheres(database, collectionName, wheres = []) {
    for (const where of wheres) {
        const result = await database.collection(collectionName)
            .where(where)
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (result.data && result.data.length > 0) return true;
    }
    return false;
}

async function hasBusinessRelations(database, user = {}) {
    if (hasBoundParent(user)) return true;

    const openid = pickString(user.openid);
    const ids = buildIdentityCandidates(user);
    const childWheres = [];
    if (openid) childWheres.push({ referrer_openid: openid });
    ids.forEach((id) => childWheres.push({ parent_id: id }));

    const identityWheres = [];
    if (openid) identityWheres.push({ openid });
    ids.forEach((id) => identityWheres.push({ user_id: id }));

    const inviteWheres = [];
    if (openid) {
        inviteWheres.push({ inviter_openid: openid });
        inviteWheres.push({ accepted_openid: openid });
    }

    const [childHit, orderHit, commissionHit, withdrawalHit, walletLogHit, goodsFundLogHit, inviteHit] = await Promise.all([
        hasAnyByWheres(database, 'users', childWheres),
        hasAnyByWheres(database, 'orders', identityWheres),
        hasAnyByWheres(database, 'commissions', identityWheres),
        hasAnyByWheres(database, 'withdrawals', identityWheres),
        hasAnyByWheres(database, 'wallet_logs', identityWheres),
        hasAnyByWheres(database, 'goods_fund_logs', identityWheres),
        hasAnyByWheres(database, 'directed_invites', inviteWheres)
    ]);

    return childHit || orderHit || commissionHit || withdrawalHit || walletLogHit || goodsFundLogHit || inviteHit;
}

async function hasSideRelations(database, user = {}) {
    const openid = pickString(user.openid);
    const ids = buildIdentityCandidates(user);
    const wheres = [];
    if (openid) wheres.push({ openid });
    ids.forEach((id) => wheres.push({ user_id: id }));
    if (!wheres.length) return false;

    const checks = await Promise.all(
        SIDE_RELATION_COLLECTIONS.map((collectionName) => hasAnyByWheres(database, collectionName, wheres))
    );
    return checks.some(Boolean);
}

function shouldHideUser(user = {}, now = new Date()) {
    if (normalizeRoleLevel(user) !== 0) return false;
    if (pickString(user.account_visibility, 'visible') === 'hidden') return false;
    if (!isDefaultVisitorNickname(user)) return false;
    if (hasAvatarOrPhone(user)) return false;
    const createdAt = parseTime(user.created_at);
    if (!createdAt) return false;
    return createdAt <= now.getTime() - VISITOR_HIDE_AFTER_MS;
}

function shouldDeleteUser(user = {}, now = new Date()) {
    if (normalizeRoleLevel(user) !== 0) return false;
    if (pickString(user.account_visibility) !== 'hidden') return false;
    if (pickString(user.hidden_reason) !== 'visitor_cleanup') return false;
    const hiddenAt = parseTime(user.hidden_at);
    if (!hiddenAt) return false;
    return hiddenAt <= now.getTime() - VISITOR_DELETE_AFTER_MS;
}

async function listAllUsers(database, batchSize = 100) {
    const rows = [];
    for (let offset = 0; offset < 5000; offset += batchSize) {
        const result = await database.collection('users')
            .skip(offset)
            .limit(batchSize)
            .get()
            .catch(() => ({ data: [] }));
        const batch = result.data || [];
        rows.push(...batch);
        if (batch.length < batchSize) break;
    }
    return rows;
}

async function hideVisitorUser(database, user = {}, nowIso = '', options = {}) {
    const userId = primaryId(user);
    if (!userId) return false;
    if (options.dryRun) return true;
    await database.collection('users').doc(String(userId)).update({
        data: {
            account_visibility: 'hidden',
            hidden_reason: 'visitor_cleanup',
            hidden_at: nowIso,
            updated_at: nowIso
        }
    });
    return true;
}

async function deleteVisitorUser(database, user = {}, options = {}) {
    const userId = primaryId(user);
    if (!userId) return false;
    if (options.dryRun) return true;
    await database.collection('users').doc(String(userId)).remove();
    return true;
}

async function processVisitorAccounts(database, now = new Date(), options = {}) {
    const users = await listAllUsers(database);
    const nowIso = now.toISOString();
    const mode = pickString(options.mode, 'all');
    const allowHide = mode !== 'delete_only';
    const allowDelete = mode !== 'hide_only';
    const summary = {
        dry_run: !!options.dryRun,
        mode,
        scanned: users.length,
        hidden: 0,
        deleted: 0,
        skipped_with_business_relation: 0,
        skipped_with_side_relation: 0
    };

    for (const user of users) {
        if (allowDelete && shouldDeleteUser(user, now)) {
            if (await hasBusinessRelations(database, user)) {
                summary.skipped_with_business_relation += 1;
                continue;
            }
            if (await hasSideRelations(database, user)) {
                summary.skipped_with_side_relation += 1;
                continue;
            }
            if (await deleteVisitorUser(database, user, options)) {
                summary.deleted += 1;
            }
            continue;
        }

        if (!allowHide || !shouldHideUser(user, now)) continue;
        if (await hasBusinessRelations(database, user)) {
            summary.skipped_with_business_relation += 1;
            continue;
        }
        if (await hideVisitorUser(database, user, nowIso, options)) {
            summary.hidden += 1;
        }
    }

    return summary;
}

exports.main = async (event = {}) => {
    const now = new Date();
    const summary = await processVisitorAccounts(db, now, {
        dryRun: event.dryRun === true || event.dry_run === true,
        mode: pickString(event.mode, 'hide_only')
    });
    console.log('[visitor-account-cleanup] 完成:', JSON.stringify(summary));
    return summary;
};

module.exports.__internals = {
    hasBusinessRelations,
    hasSideRelations,
    isDefaultVisitorNickname,
    processVisitorAccounts,
    shouldDeleteUser,
    shouldHideUser
};
