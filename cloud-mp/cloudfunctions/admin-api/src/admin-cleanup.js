'use strict';

const ORDER_CLEANUP_CATEGORIES = new Set([
    'cancelled_unpaid_noise',
    'test_order',
    'invalid_user_noise',
    'finance_related_keep',
    'manual_cleanup'
]);

const USER_CLEANUP_CATEGORIES = new Set([
    'visitor_cleanup',
    'cancelled_unpaid_noise',
    'invalid_user_noise',
    'manual_cleanup'
]);

function normalizeCategory(value, allowedCategories, fallback = 'manual_cleanup') {
    const raw = String(value || '').trim();
    return allowedCategories.has(raw) ? raw : fallback;
}

function normalizeVisibilityInput(value) {
    return String(value || '').trim().toLowerCase() === 'hidden' ? 'hidden' : 'visible';
}

function buildVisibilityPatch({
    visibilityField,
    nextVisibility,
    reason,
    cleanupCategory,
    admin,
    now
}) {
    const actor = [admin?.username, admin?.id].filter(Boolean).join('#') || 'admin';
    if (nextVisibility === 'hidden') {
        return {
            [visibilityField]: 'hidden',
            cleanup_category: cleanupCategory,
            hidden_reason: reason,
            hidden_at: now,
            hidden_by: actor,
            updated_at: now
        };
    }

    return {
        [visibilityField]: 'visible',
        cleanup_category: '',
        hidden_reason: '',
        hidden_at: '',
        hidden_by: '',
        restored_reason: reason,
        restored_at: now,
        restored_by: actor,
        updated_at: now
    };
}

function registerCleanupRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        rejectUnknownBodyFields,
        requireNonEmptyStringField,
        findByLookup,
        findUserByAnyId,
        getCollection,
        persistPatchedRow,
        buildFreshOrderWriteResponse,
        buildFreshUserWriteResponse,
        createAuditLog,
        okStrongWrite,
        fail,
        failWithFieldErrors,
        primaryId,
        pickString,
        nowIso
    } = deps;

    app.put('/admin/api/orders/:id/visibility', auth, requirePermission('settings_manage'), async (req, res) => {
        if (rejectUnknownBodyFields(res, req.body, ['visibility', 'order_visibility', 'cleanup_category', 'reason'], '订单清理参数不合法')) return;

        const nextVisibility = normalizeVisibilityInput(req.body?.order_visibility || req.body?.visibility);
        const reasonCheck = requireNonEmptyStringField(req.body?.reason, 'reason', '操作原因', { maxLength: 200 });
        if (!reasonCheck.ok) return failWithFieldErrors(res, [reasonCheck.error], '订单清理参数不合法');

        const order = findByLookup(getCollection('orders'), req.params.id, (row) => [row.order_no]);
        if (!order) return fail(res, '订单不存在', 404);

        const now = nowIso();
        const cleanupCategory = normalizeCategory(req.body?.cleanup_category, ORDER_CLEANUP_CATEGORIES);
        const patch = buildVisibilityPatch({
            visibilityField: 'order_visibility',
            nextVisibility,
            reason: reasonCheck.value,
            cleanupCategory,
            admin: req.admin,
            now
        });
        const persisted = await persistPatchedRow('orders', req.params.id, order, patch);
        if (!persisted.ok) return fail(res, '订单清理状态更新失败，请稍后重试', 500);

        createAuditLog(req.admin, 'order.visibility.update', 'orders', {
            order_id: primaryId(order),
            order_no: pickString(order.order_no),
            order_visibility: nextVisibility,
            cleanup_category: nextVisibility === 'hidden' ? cleanupCategory : '',
            reason: reasonCheck.value
        });

        const fresh = await buildFreshOrderWriteResponse(req.params.id, persisted.row);
        okStrongWrite(res, fresh.data, {
            persisted: true,
            reloaded_collections: fresh.reloadMeta.reloaded_collections,
            read_at: fresh.reloadMeta.read_at
        });
    });

    app.put('/admin/api/users/:id/visibility', auth, requirePermission('user_status_manage'), async (req, res) => {
        if (rejectUnknownBodyFields(res, req.body, ['visibility', 'account_visibility', 'cleanup_category', 'reason'], '用户清理参数不合法')) return;

        const nextVisibility = normalizeVisibilityInput(req.body?.account_visibility || req.body?.visibility);
        const reasonCheck = requireNonEmptyStringField(req.body?.reason, 'reason', '操作原因', { maxLength: 200 });
        if (!reasonCheck.ok) return failWithFieldErrors(res, [reasonCheck.error], '用户清理参数不合法');

        const user = findUserByAnyId(getCollection('users'), req.params.id);
        if (!user) return fail(res, '用户不存在', 404);

        const now = nowIso();
        const cleanupCategory = normalizeCategory(req.body?.cleanup_category, USER_CLEANUP_CATEGORIES);
        const patch = buildVisibilityPatch({
            visibilityField: 'account_visibility',
            nextVisibility,
            reason: reasonCheck.value,
            cleanupCategory,
            admin: req.admin,
            now
        });
        const persisted = await persistPatchedRow('users', req.params.id, user, patch);
        if (!persisted.ok) return fail(res, '用户清理状态更新失败，请稍后重试', 500);

        createAuditLog(req.admin, 'user.visibility.update', 'users', {
            user_id: primaryId(user),
            openid: pickString(user.openid),
            account_visibility: nextVisibility,
            cleanup_category: nextVisibility === 'hidden' ? cleanupCategory : '',
            reason: reasonCheck.value
        });

        const fresh = await buildFreshUserWriteResponse(req.params.id, persisted.row);
        okStrongWrite(res, fresh.data, {
            persisted: true,
            reloaded_collections: fresh.reloadMeta.reloaded_collections,
            read_at: fresh.reloadMeta.read_at
        });
    });
}

module.exports = {
    registerCleanupRoutes
};
