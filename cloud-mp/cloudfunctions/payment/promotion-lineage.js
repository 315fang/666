'use strict';

const DEFAULT_MIN_SEPARATION_ROLE_LEVEL = 3;

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function primaryId(user = {}) {
    return user._id || user.id || user._legacy_id || '';
}

function userRelationIds(user = {}) {
    const raw = [user._id, user.id, user._legacy_id].filter(hasValue);
    const out = [];
    raw.forEach((id) => {
        if (hasValue(id)) {
            const num = Number(id);
            if (Number.isFinite(num)) out.push(num);
            out.push(String(id));
        }
    });
    return [...new Set(out.map((item) => `${typeof item}:${item}`))].map((key) => {
        const [, value] = key.split(':');
        const numeric = Number(value);
        return key.startsWith('number:') && Number.isFinite(numeric) ? numeric : value;
    });
}

function getUserRoleLevel(user = {}) {
    return toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
}

function resolveDisplayName(user = {}) {
    return pickString(
        user.nick_name
        || user.nickname
        || user.nickName
        || user.name
        || user.member_no
        || user.my_invite_code
        || user.invite_code
        || user.openid
    );
}

function sameIdentity(a = {}, b = {}) {
    const aOpenid = pickString(a.openid);
    const bOpenid = pickString(b.openid);
    if (aOpenid && bOpenid && aOpenid === bOpenid) return true;
    const aId = primaryId(a);
    const bId = primaryId(b);
    return hasValue(aId) && hasValue(bId) && String(aId) === String(bId);
}

function buildDirectRelationWhere(command, user = {}) {
    const clauses = [];
    const openid = pickString(user.openid);
    if (openid) clauses.push({ referrer_openid: openid });
    const ids = userRelationIds(user);
    if (ids.length && command && typeof command.in === 'function') {
        clauses.push({ parent_id: command.in(ids) });
    }
    if (!clauses.length) return { referrer_openid: '__none__' };
    if (clauses.length === 1) return clauses[0];
    if (command && typeof command.or === 'function') return command.or(clauses);
    return { $or: clauses };
}

async function listDirectMembers(db, command, user = {}, maxRows = 1000) {
    const where = buildDirectRelationWhere(command, user);
    const rows = [];
    const pageSize = 200;
    let skip = 0;
    while (rows.length < maxRows) {
        let query = db.collection('users').where(where).skip(skip).limit(Math.min(pageSize, maxRows - rows.length));
        const res = await query.get().catch((err) => {
            console.error('[listDirectMembers] 查询失败, skip=' + skip + ':', err.message);
            return { data: [] };
        });
        const batch = res.data || [];
        rows.push(...batch);
        if (batch.length < pageSize) break;
        skip += pageSize;
    }
    return rows;
}

async function updateUserByIdentity(db, user = {}, patch = {}) {
    const id = primaryId(user);
    if (hasValue(id)) {
        return db.collection('users').doc(String(id)).update({ data: patch });
    }
    const openid = pickString(user.openid);
    if (openid) {
        return db.collection('users').where({ openid }).update({ data: patch });
    }
    throw new Error('缺少用户身份，无法更新关系链');
}

function buildInvitedByPatch(target = {}, fallbackInviter = {}, now) {
    if (pickString(target.invited_by_openid || target.invited_by)) return {};
    const existingInviterOpenid = pickString(target.inviter_openid);
    const fallbackOpenid = pickString(fallbackInviter.openid);
    const invitedByOpenid = existingInviterOpenid || fallbackOpenid;
    const invitedByUserId = target.inviter_id ?? (primaryId(fallbackInviter) || null);
    if (!invitedByOpenid && !hasValue(invitedByUserId)) return {};
    return {
        invited_by_openid: invitedByOpenid,
        invited_by_user_id: invitedByUserId,
        invited_by_name: existingInviterOpenid && existingInviterOpenid !== fallbackOpenid
            ? pickString(target.inviter_name || target.inviter_nickname)
            : resolveDisplayName(fallbackInviter),
        invited_by_recorded_at: now
    };
}

async function resolveDirectMembers(db, command, user = {}, directMembers = []) {
    if (Array.isArray(directMembers) && directMembers.length > 0) {
        return directMembers;
    }
    return listDirectMembers(db, command, user);
}

async function appendSeparationLog(db, payload = {}) {
    return db.collection('promotion_lineage_logs').add({
        data: payload
    }).catch((err) => {
        console.error('[PromotionLineage] 脱离日志写入失败:', err.message);
    });
}

async function applyPromotionSeparation(db, command, payload = {}) {
    const user = payload.user || {};
    const parent = payload.parent || {};
    const previousRoleLevel = toNumber(payload.previousRoleLevel, 0);
    const nextRoleLevel = toNumber(payload.nextRoleLevel, 0);
    const parentRoleLevel = getUserRoleLevel(parent);
    const minRoleLevel = Math.max(1, toNumber(payload.minRoleLevel, DEFAULT_MIN_SEPARATION_ROLE_LEVEL));

    if (nextRoleLevel < minRoleLevel) {
        return { skipped: true, reason: 'below_min_role_level', minRoleLevel };
    }
    if (!pickString(parent.openid) && !hasValue(primaryId(parent))) {
        return { skipped: true, reason: 'no_parent' };
    }
    if (nextRoleLevel <= parentRoleLevel) {
        return { skipped: true, reason: 'parent_not_lower', parentRoleLevel };
    }

    const now = db.serverDate();
    const parentId = primaryId(parent) || null;
    const parentOpenid = pickString(parent.openid);
    const userId = primaryId(user) || null;
    const userOpenid = pickString(user.openid);
    const directMembers = await resolveDirectMembers(db, command, user, payload.directMembers);
    const movableMembers = directMembers.filter((member) => {
        return !sameIdentity(member, user) && !sameIdentity(member, parent);
    });

    // 更新脱离人：清空上级关系
    try {
        await updateUserByIdentity(db, user, {
            ...buildInvitedByPatch(user, parent, now),
            referrer_openid: '',
            parent_openid: '',
            parent_id: null,
            inviter_openid: '',
            inviter_id: null,
            promotion_separated_at: now,
            promotion_separated_order_id: payload.triggerOrderId || '',
            separated_from_parent_id: parentId,
            separated_from_parent_openid: parentOpenid,
            separated_from_role_level: parentRoleLevel,
            updated_at: now
        });
    } catch (err) {
        console.error('[PromotionLineage] 脱离人更新失败, 中止脱离:', err.message);
        throw err;
    }

    let movedCount = 0;
    const failedMemberIds = [];
    for (const member of movableMembers) {
        try {
            await updateUserByIdentity(db, member, {
                ...buildInvitedByPatch(member, user, now),
                referrer_openid: parentOpenid,
                parent_openid: parentOpenid,
                parent_id: parentId,
                previous_parent_id: member.parent_id ?? null,
                previous_parent_openid: pickString(member.parent_openid || member.referrer_openid),
                lineage_rebased_from_openid: userOpenid,
                lineage_rebased_from_id: userId,
                lineage_rebased_to_openid: parentOpenid,
                lineage_rebased_to_id: parentId,
                lineage_rebased_order_id: payload.triggerOrderId || '',
                lineage_rebased_at: now,
                updated_at: now
            });
            movedCount += 1;
        } catch (err) {
            console.error('[PromotionLineage] 下级改线失败, openid=' + (member.openid || '?') + ':', err.message);
            failedMemberIds.push(pickString(member.openid));
        }
    }

    // 写入脱离审计日志
    await appendSeparationLog(db, {
        type: 'promotion_separation',
        openid: userOpenid,
        user_id: userId,
        previous_role_level: previousRoleLevel,
        next_role_level: nextRoleLevel,
        previous_parent_id: parentId,
        previous_parent_openid: parentOpenid,
        previous_parent_role_level: parentRoleLevel,
        trigger_order_id: payload.triggerOrderId || '',
        reparented_member_count: movedCount,
        reparented_member_openids: movableMembers.map((member) => pickString(member.openid)).filter(Boolean).slice(0, 50),
        failed_member_openids: failedMemberIds,
        created_at: now
    });

    // 如果有改线失败的成员，在用户身上标记
    if (failedMemberIds.length > 0) {
        try {
            await db.collection('users').where({ openid: userOpenid }).update({
                data: {
                    promotion_separation_partial: true,
                    promotion_separation_failed_members: failedMemberIds,
                    updated_at: db.serverDate()
                }
            });
        } catch (e) {
            console.error('[PromotionLineage] 脱离部分失败标记写入失败:', e.message);
        }
    }

    return {
        separated: true,
        previousParentOpenid: parentOpenid,
        previousParentId: parentId,
        parentRoleLevel,
        movedCount,
        failedCount: failedMemberIds.length
    };
}

module.exports = {
    applyPromotionSeparation,
    buildDirectRelationWhere,
    buildInvitedByPatch,
    listDirectMembers
};
