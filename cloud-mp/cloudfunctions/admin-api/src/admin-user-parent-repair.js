'use strict';

function registerUserParentRepairRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        ensureFreshCollections,
        getCollection,
        saveCollection,
        nowIso,
        createAuditLog,
        ok,
        fail,
        flush
    } = deps;

    function hasValue(value) {
        return value !== null && value !== undefined && value !== '';
    }

    function pickString(value, fallback = '') {
        if (value == null) return fallback;
        const text = String(value).trim();
        return text || fallback;
    }

    function toBoolean(value, fallback = false) {
        if (value === undefined || value === null || value === '') return fallback;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        const normalized = String(value).trim().toLowerCase();
        if (!normalized) return fallback;
        if (['false', '0', 'no', 'off', 'disabled', 'inactive'].includes(normalized)) return false;
        return true;
    }

    function primaryId(row = {}) {
        return row._id || row.id || row._legacy_id || '';
    }

    function hasBoundParent(user = {}) {
        return !!(
            pickString(user.referrer_openid)
            || pickString(user.parent_openid)
            || hasValue(user.parent_id)
        );
    }

    function isRepairableLockedOrphan(user = {}) {
        return !!toBoolean(user.line_locked, false) && !hasBoundParent(user);
    }

    function normalizeLookup(input = {}) {
        if (!input || typeof input !== 'object') return {};
        return {
            _id: pickString(input._id),
            id: hasValue(input.id) ? input.id : '',
            _legacy_id: hasValue(input._legacy_id) ? input._legacy_id : '',
            openid: pickString(input.openid),
            invite_code: pickString(input.invite_code || input.my_invite_code || input.member_no).toUpperCase()
        };
    }

    function matchesLookup(row = {}, lookup = {}) {
        const inviteCode = pickString(row.my_invite_code || row.invite_code || row.member_no).toUpperCase();
        const candidates = [
            pickString(row._id),
            hasValue(row.id) ? String(row.id) : '',
            hasValue(row._legacy_id) ? String(row._legacy_id) : '',
            pickString(row.openid),
            inviteCode
        ].filter(Boolean);
        const targets = [
            pickString(lookup._id),
            hasValue(lookup.id) ? String(lookup.id) : '',
            hasValue(lookup._legacy_id) ? String(lookup._legacy_id) : '',
            pickString(lookup.openid),
            pickString(lookup.invite_code).toUpperCase()
        ].filter(Boolean);
        if (!targets.length) return false;
        return targets.some((target) => candidates.includes(target));
    }

    function findUserByLookup(users = [], input = {}) {
        const lookup = normalizeLookup(input);
        if (!Object.values(lookup).some(Boolean)) return null;
        return users.find((row) => matchesLookup(row, lookup)) || null;
    }

    function buildResultItem(index, status, extra = {}) {
        return {
            index,
            status,
            ...extra
        };
    }

    app.post('/admin/api/users/parent-repair-batch', auth, requirePermission('user_parent_manage'), async (req, res) => {
        const repairs = Array.isArray(req.body?.repairs) ? req.body.repairs : [];
        if (!repairs.length) return fail(res, '缺少 repairs 映射列表', 400);

        await ensureFreshCollections(['users']);
        const users = getCollection('users');
        const userSnapshot = JSON.parse(JSON.stringify(users));
        const repairedRows = [...users];
        const processed = [];
        let repaired = 0;
        let skipped = 0;
        let failed = 0;

        try {
            repairs.forEach((repair, index) => {
                const child = findUserByLookup(repairedRows, repair && repair.child_user);
                if (!child) {
                    failed += 1;
                    processed.push(buildResultItem(index, 'failed', {
                        code: 'child_not_found',
                        message: '子用户不存在'
                    }));
                    return;
                }

                const parent = findUserByLookup(repairedRows, repair && repair.parent_user);
                if (!parent) {
                    failed += 1;
                    processed.push(buildResultItem(index, 'failed', {
                        code: 'parent_not_found',
                        child_user_id: primaryId(child),
                        child_openid: pickString(child.openid),
                        message: '上级用户不存在'
                    }));
                    return;
                }

                if (String(primaryId(child) || child.openid) === String(primaryId(parent) || parent.openid)) {
                    failed += 1;
                    processed.push(buildResultItem(index, 'failed', {
                        code: 'self_parent',
                        child_user_id: primaryId(child),
                        parent_user_id: primaryId(parent),
                        message: '不能将用户设置为自己的上级'
                    }));
                    return;
                }

                const alreadyBound = hasBoundParent(child);
                const sameParent = pickString(child.referrer_openid) === pickString(parent.openid)
                    || pickString(child.parent_openid) === pickString(parent.openid)
                    || String(child.parent_id) === String(primaryId(parent));

                if (alreadyBound && !sameParent) {
                    skipped += 1;
                    processed.push(buildResultItem(index, 'skipped', {
                        code: 'already_bound',
                        child_user_id: primaryId(child),
                        child_openid: pickString(child.openid),
                        current_parent_openid: pickString(child.parent_openid || child.referrer_openid),
                        target_parent_openid: pickString(parent.openid),
                        message: '用户已存在上级关系，默认跳过'
                    }));
                    return;
                }

                if (!alreadyBound && toBoolean(child.line_locked, false) && !isRepairableLockedOrphan(child)) {
                    skipped += 1;
                    processed.push(buildResultItem(index, 'skipped', {
                        code: 'locked_conflict',
                        child_user_id: primaryId(child),
                        child_openid: pickString(child.openid),
                        message: '该用户线路已锁定且关系异常不可自动修复'
                    }));
                    return;
                }

                if (sameParent) {
                    skipped += 1;
                    processed.push(buildResultItem(index, 'skipped', {
                        code: 'already_target_parent',
                        child_user_id: primaryId(child),
                        child_openid: pickString(child.openid),
                        parent_user_id: primaryId(parent),
                        parent_openid: pickString(parent.openid),
                        message: '用户已绑定到目标上级'
                    }));
                    return;
                }

                const patched = {
                    ...child,
                    parent_id: primaryId(parent) || null,
                    parent_openid: pickString(parent.openid),
                    referrer_openid: pickString(parent.openid),
                    joined_team_at: pickString(child.joined_team_at) || nowIso(),
                    bound_parent_at: pickString(child.bound_parent_at) || nowIso(),
                    relation_source: 'share_invite',
                    invitation_source: 'share_invite',
                    line_locked: true,
                    updated_at: nowIso()
                };
                const targetIndex = repairedRows.findIndex((row) => String(primaryId(row) || row.openid) === String(primaryId(child) || child.openid));
                repairedRows[targetIndex] = patched;
                repaired += 1;
                processed.push(buildResultItem(index, 'repaired', {
                    child_user_id: primaryId(patched),
                    child_openid: pickString(patched.openid),
                    parent_user_id: primaryId(parent),
                    parent_openid: pickString(parent.openid),
                    message: '上下级关系已修复'
                }));
            });

            saveCollection('users', repairedRows);
            await flush();
        } catch (error) {
            saveCollection('users', userSnapshot);
            return fail(res, `修复失败：${error.message || '写入异常'}`, 500);
        }

        createAuditLog(req.admin, 'user.parent.repair_batch', 'users', {
            total: repairs.length,
            repaired,
            skipped,
            failed
        });

        ok(res, {
            total: repairs.length,
            repaired,
            skipped,
            failed,
            results: processed
        });
    });
}

module.exports = {
    registerUserParentRepairRoutes
};
