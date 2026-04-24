'use strict';

const {
    buildPortalPasswordState,
    generateInitialPassword,
    hashPortalPassword,
    isPortalPasswordEligible,
    resolveMemberNo,
    nowIso,
    toNumber
} = require('./shared/portal-password');

function registerUserPortalPasswordRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        rejectUnknownBodyFields,
        ensureFreshCollections = async () => {},
        getCollection,
        findUserByAnyId,
        patchCollectionRow,
        createAuditLog,
        buildFreshUserWriteResponse,
        okStrongWrite,
        fail
    } = deps;

    app.post('/admin/api/users/:id/portal-password/reset', auth, requirePermission('user_portal_password_manage'), async (req, res) => {
        await ensureFreshCollections(['users']);
        if (rejectUnknownBodyFields(res, req.body, [], '业务密码重置参数不合法')) return;

        const user = findUserByAnyId(getCollection('users'), req.params.id);
        if (!user) return fail(res, '用户不存在', 404);
        if (!isPortalPasswordEligible(user)) return fail(res, '当前账号暂不支持业务密码', 400);

        const initialPassword = generateInitialPassword();
        const setAt = nowIso();
        const nextVersion = Math.max(0, toNumber(user.portal_password_version, 0)) + 1;
        const updated = patchCollectionRow('users', req.params.id, (row) => ({
            ...row,
            portal_password_hash: hashPortalPassword(initialPassword),
            portal_password_set_at: setAt,
            portal_password_changed_at: '',
            portal_password_failed_count: 0,
            portal_password_locked_until: '',
            portal_password_version: nextVersion,
            updated_at: setAt
        }));
        if (!updated) return fail(res, '用户不存在', 404);

        createAuditLog(req.admin, 'user.portal_password.reset', 'users', {
            user_id: updated._id || updated.id || req.params.id,
            member_no: resolveMemberNo(updated),
            portal_password_version: nextVersion
        });

        const fresh = await buildFreshUserWriteResponse(req.params.id, updated);
        okStrongWrite(res, {
            user: fresh.data,
            member_no: resolveMemberNo(updated),
            initial_password: initialPassword,
            ...buildPortalPasswordState({
                ...updated,
                portal_password_set_at: setAt,
                portal_password_changed_at: '',
                portal_password_locked_until: '',
                portal_password_version: nextVersion
            })
        }, {
            persisted: true,
            reloaded_collections: fresh.reloadMeta.reloaded_collections,
            read_at: fresh.reloadMeta.read_at
        });
    });

    app.post('/admin/api/users/:id/portal-password/unlock', auth, requirePermission('user_portal_password_manage'), async (req, res) => {
        await ensureFreshCollections(['users']);
        if (rejectUnknownBodyFields(res, req.body, [], '业务密码解锁参数不合法')) return;

        const user = findUserByAnyId(getCollection('users'), req.params.id);
        if (!user) return fail(res, '用户不存在', 404);
        if (!isPortalPasswordEligible(user)) return fail(res, '当前账号暂不支持业务密码', 400);
        if (!String(user.portal_password_hash || '').trim()) return fail(res, '用户尚未设置业务密码', 400);

        const updated = patchCollectionRow('users', req.params.id, (row) => ({
            ...row,
            portal_password_failed_count: 0,
            portal_password_locked_until: '',
            updated_at: nowIso()
        }));
        if (!updated) return fail(res, '用户不存在', 404);

        createAuditLog(req.admin, 'user.portal_password.unlock', 'users', {
            user_id: updated._id || updated.id || req.params.id,
            member_no: resolveMemberNo(updated)
        });

        const fresh = await buildFreshUserWriteResponse(req.params.id, updated);
        okStrongWrite(res, {
            user: fresh.data,
            unlocked: true,
            ...buildPortalPasswordState({
                ...updated,
                portal_password_locked_until: '',
                portal_password_failed_count: 0
            })
        }, {
            persisted: true,
            reloaded_collections: fresh.reloadMeta.reloaded_collections,
            read_at: fresh.reloadMeta.read_at
        });
    });
}

module.exports = {
    registerUserPortalPasswordRoutes
};
