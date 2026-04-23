'use strict';

function registerOrderTestFlagRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        rejectUnknownBodyFields,
        patchCollectionRow,
        createAuditLog,
        buildFreshOrderWriteResponse,
        okStrongWrite,
        fail,
        pickString,
        toBoolean
    } = deps;

    app.put('/admin/api/orders/:id/test-flag', auth, requirePermission('settings_manage'), async (req, res) => {
        if (rejectUnknownBodyFields(res, req.body, ['is_test_order', 'reason'], '测试订单参数不合法')) return;

        const isTestOrder = toBoolean(req.body?.is_test_order);
        const reason = pickString(req.body?.reason || (isTestOrder ? '管理员标记测试订单' : '管理员取消测试订单标记'));
        const updated = patchCollectionRow('orders', req.params.id, (row) => ({
            ...row,
            is_test_order: isTestOrder,
            test_order_reason: reason,
            updated_at: new Date().toISOString()
        }));
        if (!updated) return fail(res, '订单不存在', 404);

        createAuditLog(req.admin, 'order.test_flag.update', 'orders', {
            order_id: updated._id || updated.id || req.params.id,
            order_no: pickString(updated.order_no),
            is_test_order: isTestOrder,
            reason
        });

        const fresh = await buildFreshOrderWriteResponse(req.params.id, updated);
        okStrongWrite(res, fresh.data, {
            persisted: true,
            reloaded_collections: fresh.reloadMeta.reloaded_collections,
            read_at: fresh.reloadMeta.read_at
        });
    });
}

module.exports = {
    registerOrderTestFlagRoutes
};
