'use strict';

function registerRefundRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        rejectUnknownBodyFields,
        failWithFieldErrors,
        ensureFreshCollections,
        getCollection,
        saveCollection,
        freshReadMeta,
        STRONG_CONSISTENCY_COLLECTIONS,
        sortByUpdatedDesc,
        buildRefundRecord,
        findByLookup,
        findUserByAnyId,
        findWalletAccountByUser,
        buildWalletAccountDocId,
        getWalletAccountUserIds,
        pickString,
        toNumber,
        roundMoney,
        paginate,
        filterRowsByDateRange,
        okStrongRead,
        okStrongWrite,
        reloadCollectionsWithMeta,
        createAuditLog,
        requireNonEmptyStringField,
        directPatchDocument,
        persistPatchedRow,
        dataStore,
        nowIso,
        fail,
        primaryId,
        normalizePaymentMethodCode,
        resolveOrderPaymentMethod,
        isSupportedRefundPaymentMethod,
        getRefundRouteMeta,
        inferRefundResumeOrderStatus,
        getOrderRefundProgress,
        toArray,
        appendWalletLogEntry,
        appendGoodsFundLogEntry,
        cancelCommissionsForOrder,
        restoreOrderStockForRefund,
        refundOrderExtras,
        createWechatRefund,
        syncRefundStatusViaPayment,
        verifyRefundNotifyRequest,
        getOrderAmount,
        pickupStockAdmin
    } = deps;

    function normalizeBatchIds(value) {
        return (typeof toArray === 'function' ? toArray(value) : (Array.isArray(value) ? value : []))
            .map((item) => pickString(item).trim())
            .filter(Boolean);
    }

    function resolveCollectionName(name) {
        return typeof dataStore?.getCollectionName === 'function'
            ? dataStore.getCollectionName(name)
            : (typeof dataStore?._internals?.getCollectionName === 'function'
                ? dataStore._internals.getCollectionName(name)
                : name);
    }

    async function claimRefundExecution(refund, lookupId, processingData) {
        const docId = pickString(refund?._id || refund?.id);
        if (!docId) return { ok: false, message: '退款记录缺少文档 ID' };

        const db = dataStore._internals?.db;
        if (db) {
            const writeRes = await db.collection(resolveCollectionName('refunds'))
                .where({ _id: docId, status: 'approved' })
                .update({ data: processingData })
                .catch((err) => {
                    console.error('[AdminRefund] 退款执行锁获取失败:', err.message);
                    return { stats: { updated: 0 }, error: err };
                });
            if (!writeRes.stats || writeRes.stats.updated === 0) {
                return { ok: false, message: '退款状态已变更或正在处理中' };
            }
            const cache = dataStore._internals?.cache;
            if (cache && cache.has('refunds')) {
                const rows = cache.get('refunds') || [];
                const index = rows.findIndex((row) => pickString(row._id || row.id) === docId);
                if (index !== -1) {
                    rows[index] = { ...rows[index], ...processingData };
                    cache.set('refunds', rows);
                }
            }
            return { ok: true, row: { ...refund, ...processingData } };
        }

        const current = findByLookup(getCollection('refunds'), lookupId);
        if (!current || pickString(current.status) !== 'approved') {
            return { ok: false, message: '退款状态已变更或正在处理中' };
        }
        const persisted = await persistPatchedRow('refunds', lookupId, current, processingData);
        if (!persisted.ok) return { ok: false, message: '退款状态更新失败，请稍后重试' };
        return { ok: true, row: persisted.row };
    }

    app.get('/admin/api/refunds', auth, requirePermission('refunds'), async (req, res) => {
        const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.refunds, true);
        const users = getCollection('users');
        const orders = getCollection('orders');
        const products = getCollection('products');
        const skus = getCollection('skus');
        let rows = sortByUpdatedDesc(getCollection('refunds')).map((item) => buildRefundRecord(item, users, orders, products, skus));
        const keyword = pickString(req.query.keyword).trim().toLowerCase();
        const status = pickString(req.query.status).trim();
        rows = typeof filterRowsByDateRange === 'function'
            ? filterRowsByDateRange(rows, req, ['created_at', 'applied_at', 'requested_at', 'updated_at'])
            : rows;
        if (keyword) {
            rows = rows.filter((item) => [
                item.order?.order_no,
                item.user?.nickname,
                item.user?.phone,
                item.user?.member_no,
                item.user_id,
                item.order_item?.product?.name,
                item.reason,
                item.id
            ].filter(Boolean).join(' ').toLowerCase().includes(keyword));
        }
        if (status) rows = rows.filter((item) => item.status === status);
        okStrongRead(res, paginate(rows, req), readMeta.freshness);
    });

    app.get('/admin/api/refunds/:id', auth, requirePermission('refunds'), async (req, res) => {
        const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.refunds, true);
        const users = getCollection('users');
        const orders = getCollection('orders');
        const products = getCollection('products');
        const skus = getCollection('skus');
        const row = findByLookup(getCollection('refunds'), req.params.id);
        if (!row) return fail(res, '退款记录不存在', 404);
        okStrongRead(res, buildRefundRecord(row, users, orders, products, skus), readMeta.freshness);
    });

    app.put('/admin/api/refunds/:id/approve', auth, requirePermission('refunds'), async (req, res) => {
        if (rejectUnknownBodyFields(res, req.body, ['remark'], '退款审核参数不合法')) return;
        const remarkCheck = req.body?.remark == null
            ? { ok: true, value: '' }
            : requireNonEmptyStringField(req.body?.remark, 'remark', '审核备注', { maxLength: 200, required: false });
        if (!remarkCheck.ok) return failWithFieldErrors(res, [remarkCheck.error], '退款审核参数不合法');

        await ensureFreshCollections(['refunds', 'orders', 'users', 'products', 'skus']);
        const refund = findByLookup(getCollection('refunds'), req.params.id);
        if (!refund) return fail(res, '退款记录不存在', 404);
        if (refund.status !== 'pending') {
            return fail(res, refund.status === 'approved' ? '已经审核通过' : `当前状态不允许审核: ${refund.status}`, 400);
        }

        const updateData = {
            status: 'approved',
            approved_at: nowIso(),
            remark: remarkCheck.value || pickString(refund.remark)
        };
        const writeOk = await directPatchDocument('refunds', String(refund._id), updateData);
        if (!writeOk) {
            return fail(res, '状态更新失败，CloudBase 写入错误，请稍后重试', 500);
        }

        if (!dataStore._internals?.db) {
            deps.patchCollectionRow('refunds', req.params.id, (row) => ({ ...row, ...updateData }));
            await Promise.resolve(dataStore.flush?.());
        }

        const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
        const users = getCollection('users');
        const orders = getCollection('orders');
        const products = getCollection('products');
        const skus = getCollection('skus');
        const freshRefund = findByLookup(getCollection('refunds'), req.params.id);
        createAuditLog(req.admin, 'refund.approve', 'refunds', { refund_id: req.params.id });
        okStrongWrite(res, buildRefundRecord(freshRefund || { ...refund, ...updateData }, users, orders, products, skus), {
            persisted: true,
            reloaded_collections: reloadMeta.reloaded_collections,
            read_at: reloadMeta.read_at
        });
    });

    app.post('/admin/api/refunds/batch-approve', auth, requirePermission('refunds'), async (req, res) => {
        if (rejectUnknownBodyFields(res, req.body, ['ids', 'refund_ids', 'remark'], '批量退款审核参数不合法')) return;
        const ids = normalizeBatchIds(req.body?.refund_ids || req.body?.ids);
        if (!ids.length) return fail(res, '请选择要操作的售后记录', 400);
        const remark = pickString(req.body?.remark).trim();

        await ensureFreshCollections(['refunds', 'orders', 'users', 'products', 'skus']);
        const blockedIds = [];
        let affected = 0;
        for (const id of ids) {
            const refund = findByLookup(getCollection('refunds'), id);
            if (!refund || pickString(refund.status) !== 'pending') {
                blockedIds.push(refund ? (primaryId(refund) || id) : id);
                continue;
            }
            const patch = {
                status: 'approved',
                approved_at: nowIso(),
                remark: remark || pickString(refund.remark),
                updated_at: nowIso()
            };
            const persisted = await persistPatchedRow('refunds', id, refund, patch);
            if (!persisted.ok) return fail(res, '批量退款审核更新失败，请稍后重试', 500);
            affected += 1;
        }

        createAuditLog(req.admin, 'refund.batch_approve', 'refunds', { affected, blocked_ids: blockedIds });
        const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
        okStrongWrite(res, { success: true, affected, blocked_ids: blockedIds }, {
            persisted: true,
            reloaded_collections: reloadMeta.reloaded_collections,
            read_at: reloadMeta.read_at,
            fallbacks_used: blockedIds.length ? ['blocked_ids'] : []
        });
    });

    app.put('/admin/api/refunds/:id/reject', auth, requirePermission('refunds'), async (req, res) => {
        if (rejectUnknownBodyFields(res, req.body, ['reason'], '退款拒绝参数不合法')) return;
        const reasonField = requireNonEmptyStringField(req.body?.reason, 'reason', '拒绝原因', { maxLength: 200 });
        if (!reasonField.ok) return failWithFieldErrors(res, [reasonField.error], '退款拒绝参数不合法');
        await ensureFreshCollections(['refunds', 'orders', 'users', 'commissions']);
        const rejectedRefund = findByLookup(getCollection('refunds'), req.params.id);
        if (!rejectedRefund) return fail(res, '退款记录不存在', 404);
        if (!['pending', 'approved'].includes(pickString(rejectedRefund.status))) {
            return fail(res, `当前状态不允许拒绝: ${rejectedRefund.status}`, 400);
        }
        const rejectData = { status: 'rejected', reject_reason: reasonField.value };
        const writeOk = await directPatchDocument('refunds', String(rejectedRefund._id), rejectData);
        if (!writeOk) return fail(res, '状态更新失败，请稍后重试', 500);
        if (!dataStore._internals?.db) {
            deps.patchCollectionRow('refunds', req.params.id, (row) => ({ ...row, ...rejectData }));
        }
        const orderId = rejectedRefund?.order_id || rejectedRefund?.order_no;
        if (orderId) {
            await deps.restoreFrozenCommissionsForOrder(orderId);
            const currentOrder = findByLookup(getCollection('orders'), orderId, (row) => [row.order_no]);
            if (currentOrder) {
                const revertPatch = {
                    status: currentOrder.status === 'refunding'
                        ? (currentOrder.prev_status || (currentOrder.confirmed_at || currentOrder.auto_confirmed_at ? 'completed' : (currentOrder.shipped_at ? 'shipped' : (currentOrder.paid_at ? 'paid' : 'pending_payment'))))
                        : currentOrder.status,
                    updated_at: nowIso()
                };
                const orderPersisted = await persistPatchedRow('orders', orderId, currentOrder, revertPatch);
                if (!orderPersisted.ok) return fail(res, '关联订单状态恢复失败，请稍后重试', 500);
            }
        }
        createAuditLog(req.admin, 'refund.reject', 'refunds', { refund_id: req.params.id, order_id: orderId });
        await Promise.resolve(dataStore.flush?.());
        const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
        const freshReject = findByLookup(getCollection('refunds'), req.params.id);
        const rUsers = getCollection('users');
        const rOrders = getCollection('orders');
        const rProducts = getCollection('products');
        const rSkus = getCollection('skus');
        okStrongWrite(res, buildRefundRecord(freshReject || { ...rejectedRefund, ...rejectData }, rUsers, rOrders, rProducts, rSkus), {
            persisted: true,
            reloaded_collections: reloadMeta.reloaded_collections,
            read_at: reloadMeta.read_at
        });
    });

    app.post('/admin/api/refunds/batch-reject', auth, requirePermission('refunds'), async (req, res) => {
        if (rejectUnknownBodyFields(res, req.body, ['ids', 'refund_ids', 'reason'], '批量退款拒绝参数不合法')) return;
        const ids = normalizeBatchIds(req.body?.refund_ids || req.body?.ids);
        if (!ids.length) return fail(res, '请选择要操作的售后记录', 400);
        const reasonField = requireNonEmptyStringField(req.body?.reason, 'reason', '拒绝原因', { maxLength: 200 });
        if (!reasonField.ok) return failWithFieldErrors(res, [reasonField.error], '批量退款拒绝参数不合法');

        await ensureFreshCollections(['refunds', 'orders', 'users', 'commissions']);
        const blockedIds = [];
        let affected = 0;
        for (const id of ids) {
            const refund = findByLookup(getCollection('refunds'), id);
            if (!refund || !['pending', 'approved'].includes(pickString(refund.status))) {
                blockedIds.push(refund ? (primaryId(refund) || id) : id);
                continue;
            }
            const rejectData = {
                status: 'rejected',
                reject_reason: reasonField.value,
                updated_at: nowIso()
            };
            const persisted = await persistPatchedRow('refunds', id, refund, rejectData);
            if (!persisted.ok) return fail(res, '批量退款拒绝更新失败，请稍后重试', 500);

            const orderId = refund?.order_id || refund?.order_no;
            if (orderId) {
                await deps.restoreFrozenCommissionsForOrder(orderId);
                const currentOrder = findByLookup(getCollection('orders'), orderId, (row) => [row.order_no]);
                if (currentOrder) {
                    const revertPatch = {
                        status: currentOrder.status === 'refunding'
                            ? (currentOrder.prev_status || (currentOrder.confirmed_at || currentOrder.auto_confirmed_at ? 'completed' : (currentOrder.shipped_at ? 'shipped' : (currentOrder.paid_at ? 'paid' : 'pending_payment'))))
                            : currentOrder.status,
                        updated_at: nowIso()
                    };
                    const orderPersisted = await persistPatchedRow('orders', orderId, currentOrder, revertPatch);
                    if (!orderPersisted.ok) return fail(res, '关联订单状态恢复失败，请稍后重试', 500);
                }
            }
            affected += 1;
        }

        createAuditLog(req.admin, 'refund.batch_reject', 'refunds', { affected, blocked_ids: blockedIds, reason: reasonField.value });
        await Promise.resolve(dataStore.flush?.());
        const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
        okStrongWrite(res, { success: true, affected, blocked_ids: blockedIds }, {
            persisted: true,
            reloaded_collections: reloadMeta.reloaded_collections,
            read_at: reloadMeta.read_at,
            fallbacks_used: blockedIds.length ? ['blocked_ids'] : []
        });
    });

    app.put('/admin/api/refunds/:id/complete', auth, requirePermission('refunds'), async (req, res) => {
        if (rejectUnknownBodyFields(res, req.body, ['return_company', 'return_tracking_no'], '退款执行参数不合法')) return;
        const returnCompanyCheck = req.body?.return_company == null
            ? { ok: true, value: '' }
            : requireNonEmptyStringField(req.body?.return_company, 'return_company', '退货快递公司', { maxLength: 60, required: false });
        const returnTrackingCheck = req.body?.return_tracking_no == null
            ? { ok: true, value: '' }
            : requireNonEmptyStringField(req.body?.return_tracking_no, 'return_tracking_no', '退货物流单号', { maxLength: 80, required: false });
        const completeFieldErrors = [returnCompanyCheck, returnTrackingCheck].filter((item) => !item.ok).map((item) => item.error);
        if (completeFieldErrors.length) return failWithFieldErrors(res, completeFieldErrors, '退款执行参数不合法');
        await ensureFreshCollections(['refunds', 'orders', 'users', 'wallet_accounts', 'station_sku_stocks', 'station_stock_logs', 'goods_fund_logs']);
        const refunds = getCollection('refunds');
        let refund = findByLookup(refunds, req.params.id);
        if (!refund) return fail(res, '退款记录不存在', 404);
        if (pickString(refund.status) !== 'approved') {
            return fail(res, refund.status === 'completed' ? '退款已完成' : (refund.status === 'processing' ? '退款已在处理中，请同步微信状态' : '当前状态不允许退款'), 400);
        }

        const users = getCollection('users');
        const orders = getCollection('orders');
        const orderId = refund.order_id || refund.order_no;
        const order = findByLookup(orders, orderId, (row) => [row.order_no]);
        if (!order) return fail(res, '关联订单不存在', 400);

        const paymentMethod = resolveOrderPaymentMethod
            ? resolveOrderPaymentMethod(order)
            : normalizePaymentMethodCode(order.payment_method || order.pay_type || order.pay_channel || order.payment_channel || 'wechat');
        if (!isSupportedRefundPaymentMethod(paymentMethod)) {
            return fail(res, '订单缺少有效支付方式，不能继续退款。请先修复订单支付信息后再处理退款', 400);
        }
        const refundRoute = getRefundRouteMeta(paymentMethod);
        const refundAmount = toNumber(refund.amount, 0);
        const orderProgress = getOrderRefundProgress(order);
        const remainingCash = Math.max(0, roundMoney(orderProgress.payAmount - orderProgress.refundedCash));
        if (refundAmount <= 0 || orderProgress.payAmount <= 0) return fail(res, '退款金额不合法', 400);
        if (refundAmount > remainingCash) {
            return fail(res, `退款金额(${refundAmount})不能超过剩余可退现金(${remainingCash})`, 400);
        }

        const processingData = {
            status: 'processing',
            processing_at: refund.processing_at || nowIso(),
            refund_execution_token: `refund_exec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            refund_execution_status: 'processing',
            payment_method: paymentMethod,
            refund_channel: refundRoute.refund_channel,
            refund_target_text: refundRoute.refund_target_text,
            return_company: returnCompanyCheck.value || pickString(refund.return_company),
            return_tracking_no: returnTrackingCheck.value || pickString(refund.return_tracking_no),
            updated_at: nowIso()
        };
        const processingPersisted = await claimRefundExecution(refund, req.params.id, processingData);
        if (!processingPersisted.ok) return fail(res, processingPersisted.message || '退款状态更新失败，请稍后重试', 409);
        refund = processingPersisted.row;

        const orderRefundingPatch = {
            status: 'refunding',
            prev_status: pickString(order.status).toLowerCase() === 'refunded'
                ? inferRefundResumeOrderStatus(order)
                : (pickString(order.prev_status) || (pickString(order.status).toLowerCase() === 'refunding' ? inferRefundResumeOrderStatus(order) : pickString(order.status || inferRefundResumeOrderStatus(order)))),
            updated_at: nowIso()
        };
        const refundingPersisted = await persistPatchedRow('orders', orderId, order, orderRefundingPatch);
        if (!refundingPersisted.ok) return fail(res, '订单退款状态更新失败，请稍后重试', 500);

        let rollbackInternalFunds = null;
        try {
            if (paymentMethod === 'goods_fund') {
                const buyerOpenid = pickString(order.openid || order.buyer_id || refund.openid || refund.user_id);
                if (!buyerOpenid) throw new Error('货款退款：找不到买家 openid');
                const buyerUser = findUserByAnyId(users, buyerOpenid);
                if (!buyerUser) throw new Error('货款退款：找不到买家用户记录');
                const previousGoodsFund = roundMoney(toNumber(buyerUser.agent_wallet_balance != null ? buyerUser.agent_wallet_balance : buyerUser.wallet_balance, 0));
                const nextGoodsFund = roundMoney(previousGoodsFund + refundAmount);
                const walletAccountUserIds = getWalletAccountUserIds(buyerUser);
                const db = dataStore._internals && dataStore._internals.db;
                if (db) {
                    const _ = db.command;
                    await db.collection('users').where({ openid: buyerOpenid }).update({
                        data: {
                            agent_wallet_balance: _.inc(refundAmount),
                            updated_at: new Date().toISOString()
                        }
                    });
                    let walletAccount = null;
                    for (const candidate of walletAccountUserIds) {
                        const accountRes = await db.collection('wallet_accounts')
                            .where({ user_id: candidate })
                            .limit(1)
                            .get()
                            .catch(() => ({ data: [] }));
                        if (accountRes.data && accountRes.data[0]) {
                            walletAccount = accountRes.data[0];
                            break;
                        }
                    }
                    const accountId = walletAccount?._id || walletAccount?.id || buildWalletAccountDocId(buyerUser);
                    if (!accountId) throw new Error('货款退款：无法确定钱包账户标识');
                    if (walletAccount) {
                        await db.collection('wallet_accounts').doc(String(accountId)).update({
                            data: {
                                balance: _.inc(refundAmount),
                                updated_at: new Date().toISOString()
                            }
                        });
                    } else {
                        await db.collection('wallet_accounts').doc(String(accountId)).set({
                            data: {
                                user_id: walletAccountUserIds[0],
                                openid: buyerOpenid,
                                balance: nextGoodsFund,
                                account_type: 'goods_fund',
                                status: 'active',
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            }
                        });
                    }
                    rollbackInternalFunds = async () => {
                        await db.collection('users').where({ openid: buyerOpenid }).update({
                            data: {
                                agent_wallet_balance: _.inc(-refundAmount),
                                updated_at: new Date().toISOString()
                            }
                        }).catch((err) => { console.error('[admin-refunds] ⚠️ 货款退款回滚用户余额失败:', err.message || err); });
                        await db.collection('wallet_accounts').doc(String(accountId)).update({
                            data: {
                                balance: _.inc(-refundAmount),
                                updated_at: new Date().toISOString()
                            }
                        }).catch((err) => { console.error('[admin-refunds] ⚠️ 货款退款回滚钱包账户失败:', err.message || err); });
                    };
                    await appendWalletLogEntry({
                        openid: buyerOpenid,
                        user_id: walletAccountUserIds[0],
                        account_id: String(accountId),
                        change_type: 'refund',
                        amount: refundAmount,
                        balance_before: previousGoodsFund,
                        balance_after: nextGoodsFund,
                        ref_type: 'order_refund',
                        ref_id: pickString(refund._id || refund.id),
                        remark: `订单退款 ${pickString(order.order_no)}`,
                        created_at: new Date().toISOString()
                    });
                    await appendGoodsFundLogEntry({
                        openid: buyerOpenid,
                        type: 'refund',
                        amount: refundAmount,
                        order_id: String(order._id),
                        order_no: pickString(order.order_no),
                        remark: `订单退款 ${pickString(order.order_no)}`,
                        created_at: new Date().toISOString()
                    });
                } else {
                    const userIdx = users.findIndex((u) => u.openid === buyerOpenid);
                    if (userIdx !== -1) {
                        users[userIdx] = {
                            ...users[userIdx],
                            agent_wallet_balance: nextGoodsFund,
                            updated_at: nowIso()
                        };
                        saveCollection('users', users);
                        const walletAccounts = getCollection('wallet_accounts');
                        const existingWalletAccount = findWalletAccountByUser(walletAccounts, buyerUser);
                        const accountId = deps.primaryId(existingWalletAccount) || buildWalletAccountDocId(buyerUser);
                        const nextWalletAccount = existingWalletAccount
                            ? {
                                ...existingWalletAccount,
                                balance: nextGoodsFund,
                                updated_at: nowIso()
                            }
                            : {
                                _id: accountId,
                                id: accountId,
                                user_id: walletAccountUserIds[0],
                                openid: buyerOpenid,
                                balance: nextGoodsFund,
                                account_type: 'goods_fund',
                                status: 'active',
                                created_at: nowIso(),
                                updated_at: nowIso()
                            };
                        if (existingWalletAccount) {
                            const walletIndex = walletAccounts.findIndex((item) => deps.primaryId(item) === deps.primaryId(existingWalletAccount));
                            if (walletIndex !== -1) walletAccounts[walletIndex] = nextWalletAccount;
                        } else {
                            walletAccounts.push(nextWalletAccount);
                        }
                        saveCollection('wallet_accounts', walletAccounts);
                        rollbackInternalFunds = async () => {
                            const rollbackIdx = users.findIndex((u) => u.openid === buyerOpenid);
                            if (rollbackIdx !== -1) {
                                users[rollbackIdx] = {
                                    ...users[rollbackIdx],
                                    agent_wallet_balance: previousGoodsFund,
                                    updated_at: nowIso()
                                };
                                saveCollection('users', users);
                            }
                            const rollbackWalletAccounts = getCollection('wallet_accounts');
                            const rollbackAccount = findWalletAccountByUser(rollbackWalletAccounts, buyerUser);
                            if (rollbackAccount) {
                                const rollbackWalletIndex = rollbackWalletAccounts.findIndex((item) => deps.primaryId(item) === deps.primaryId(rollbackAccount));
                                if (rollbackWalletIndex !== -1) {
                                    rollbackWalletAccounts[rollbackWalletIndex] = {
                                        ...rollbackWalletAccounts[rollbackWalletIndex],
                                        balance: previousGoodsFund,
                                        updated_at: nowIso()
                                    };
                                    saveCollection('wallet_accounts', rollbackWalletAccounts);
                                }
                            }
                        };
                        await appendWalletLogEntry({
                            openid: buyerOpenid,
                            user_id: walletAccountUserIds[0],
                            account_id: String(accountId),
                            change_type: 'refund',
                            amount: refundAmount,
                            balance_before: previousGoodsFund,
                            balance_after: nextGoodsFund,
                            ref_type: 'order_refund',
                            ref_id: pickString(refund._id || refund.id),
                            remark: `订单退款 ${pickString(order.order_no)}`,
                            created_at: nowIso()
                        });
                    }
                }

                await cancelCommissionsForOrder(orderId, '货款退款完成，佣金作废');
                restoreOrderStockForRefund(orderId, refund);
                pickupStockAdmin?.restorePickupStockForRefund?.(order, refund);
                await Promise.resolve(pickupStockAdmin?.rollbackPickupPrincipalForRefund?.(order, refund)).catch((err) => { console.error('[admin-refunds] ⚠️ 回滚门店进货本金失败:', err.message || err); });
                const settlement = await refundOrderExtras(orderId, refund);

                const completedData = { status: 'completed', completed_at: nowIso(), updated_at: nowIso() };
                const refundPersisted = await persistPatchedRow('refunds', req.params.id, refund, completedData);
                if (!refundPersisted.ok) throw new Error('退款记录更新失败');

                const orderPersisted = await persistPatchedRow('orders', orderId, order, { ...settlement.patch, updated_at: nowIso() });
                if (!orderPersisted.ok) throw new Error('订单状态更新失败');

                createAuditLog(req.admin, 'refund.complete', 'refunds', { refund_id: req.params.id, order_id: orderId, payment_method: paymentMethod });
                const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
                const gfFresh = findByLookup(getCollection('refunds'), req.params.id);
                const gfUsers = getCollection('users');
                const gfOrders = getCollection('orders');
                okStrongWrite(res, buildRefundRecord(gfFresh || { ...refund, ...completedData }, gfUsers, gfOrders, getCollection('products'), getCollection('skus')), {
                    persisted: true,
                    reloaded_collections: reloadMeta.reloaded_collections,
                    read_at: reloadMeta.read_at
                });
            } else if (['wallet', 'balance', 'credit', 'debt'].includes(paymentMethod)) {
                const walletOwner = findUserByAnyId(users, order.openid || order.buyer_id || refund.openid || refund.user_id);
                const walletOwnerDocId = pickString(walletOwner?._id || walletOwner?.id);
                const walletOwnerOpenid = pickString(walletOwner?.openid || order.openid || refund.openid);
                const previousBalance = toNumber(walletOwner?.balance ?? walletOwner?.commission_balance, 0);
                const previousCommissionBalance = toNumber(walletOwner?.commission_balance ?? walletOwner?.balance, 0);
                const previousTotalEarned = toNumber(walletOwner?.total_earned, 0);
                const previousDebtAmount = toNumber(walletOwner?.debt_amount, 0);
                const previousDebtReason = pickString(walletOwner?.debt_reason);
                const change = deps.applyUserMoneyChange(users, order.openid || order.buyer_id || refund.openid || refund.user_id, refundAmount, {
                    reason: `订单退款 ${pickString(order.order_no)}`
                });
                if (!change) throw new Error('退款用户不存在，无法退回余额');
                if (!walletOwnerOpenid) throw new Error('退款用户 openid 缺失，无法写余额流水');

                if (dataStore._internals?.db) {
                    if (!walletOwnerDocId) throw new Error('退款用户文档不存在，无法持久化余额变更');
                    const userWriteOk = await directPatchDocument('users', walletOwnerDocId, {
                        balance: toNumber(change.user.balance, 0),
                        commission_balance: toNumber(change.user.commission_balance, 0),
                        total_earned: toNumber(change.user.total_earned, 0),
                        debt_amount: toNumber(change.user.debt_amount, 0),
                        debt_reason: pickString(change.user.debt_reason)
                    });
                    if (!userWriteOk) throw new Error('退款用户余额更新失败');
                    rollbackInternalFunds = async () => {
                        await directPatchDocument('users', walletOwnerDocId, {
                            balance: previousBalance,
                            commission_balance: previousCommissionBalance,
                            total_earned: previousTotalEarned,
                            debt_amount: previousDebtAmount,
                            debt_reason: previousDebtReason
                        });
                    };
                } else {
                    saveCollection('users', users);
                    rollbackInternalFunds = async () => {
                        const rollbackUser = findUserByAnyId(users, walletOwnerOpenid || walletOwnerDocId || order.openid || refund.openid);
                        if (rollbackUser) {
                            const rollbackKey = deps.primaryId(rollbackUser) || walletOwnerOpenid;
                            deps.patchCollectionRow('users', rollbackKey, (row) => ({
                                ...row,
                                balance: previousBalance,
                                commission_balance: previousCommissionBalance,
                                total_earned: previousTotalEarned,
                                debt_amount: previousDebtAmount,
                                debt_reason: previousDebtReason,
                                updated_at: nowIso()
                            }));
                        }
                    };
                }

                await appendWalletLogEntry({
                    openid: walletOwnerOpenid,
                    type: 'refund',
                    amount: refundAmount,
                    refund_id: pickString(refund._id || refund.id),
                    refund_no: pickString(refund.refund_no),
                    order_id: pickString(order._id || order.id || orderId),
                    order_no: pickString(order.order_no),
                    description: `订单退款 ${pickString(order.order_no)}`
                });

                await cancelCommissionsForOrder(orderId, '退款完成，佣金作废');
                restoreOrderStockForRefund(orderId, refund);
                pickupStockAdmin?.restorePickupStockForRefund?.(order, refund);
                await Promise.resolve(pickupStockAdmin?.rollbackPickupPrincipalForRefund?.(order, refund)).catch((err) => { console.error('[admin-refunds] ⚠️ 回滚门店进货本金失败:', err.message || err); });
                const settlement = await refundOrderExtras(orderId, refund);

                const completedData = { status: 'completed', completed_at: nowIso(), updated_at: nowIso() };
                const refundPersisted = await persistPatchedRow('refunds', req.params.id, refund, completedData);
                if (!refundPersisted.ok) {
                    throw new Error('退款记录更新失败');
                }

                const orderPersisted = await persistPatchedRow('orders', orderId, order, { ...settlement.patch, updated_at: nowIso() });
                if (!orderPersisted.ok) {
                    throw new Error('订单状态更新失败');
                }

                createAuditLog(req.admin, 'refund.complete', 'refunds', { refund_id: req.params.id, order_id: orderId, payment_method: paymentMethod });
                const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
                const cFresh = findByLookup(getCollection('refunds'), req.params.id);
                const cUsers = getCollection('users');
                const cOrders = getCollection('orders');
                const cProducts = getCollection('products');
                const cSkus = getCollection('skus');
                okStrongWrite(res, buildRefundRecord(cFresh || { ...refund, ...completedData }, cUsers, cOrders, cProducts, cSkus), {
                    persisted: true,
                    reloaded_collections: reloadMeta.reloaded_collections,
                    read_at: reloadMeta.read_at
                });
            } else {
                const refundNo = pickString(refund.refund_no) || `RF-${pickString(order.order_no)}-${Date.now()}`;
                const refundNoPersisted = await persistPatchedRow('refunds', req.params.id, refund, { refund_no: refundNo, updated_at: nowIso() });
                if (!refundNoPersisted.ok) throw new Error('退款单号写入失败');

                const totalFee = Math.round(getOrderAmount(order) * 100);
                const wxResult = await createWechatRefund({
                    orderNo: pickString(order.order_no),
                    refundNo,
                    totalFee,
                    refundFee: Math.round(refundAmount * 100),
                    reason: pickString(refund.reason, '管理员退款')
                });
                const wxStatus = pickString(wxResult.status || 'PROCESSING').toUpperCase();
                const wxRefundId = pickString(wxResult.refund_id || refund.wx_refund_id);

                if (wxStatus === 'SUCCESS') {
                    await cancelCommissionsForOrder(orderId, '退款完成，佣金作废');
                    restoreOrderStockForRefund(orderId, refund);
                    pickupStockAdmin?.restorePickupStockForRefund?.(order, refund);
                    await Promise.resolve(pickupStockAdmin?.rollbackPickupPrincipalForRefund?.(order, refund)).catch((err) => { console.error('[admin-refunds] ⚠️ 回滚门店进货本金失败:', err.message || err); });
                    const settlement = await refundOrderExtras(orderId, refund);

                    const completedData = { status: 'completed', completed_at: nowIso(), wx_refund_id: wxRefundId, wx_status: wxStatus, updated_at: nowIso() };
                    const refundPersisted = await persistPatchedRow('refunds', req.params.id, refund, completedData);
                    if (!refundPersisted.ok) throw new Error('退款记录更新失败');
                    const orderPersisted = await persistPatchedRow('orders', orderId, order, { ...settlement.patch, updated_at: nowIso() });
                    if (!orderPersisted.ok) throw new Error('订单状态更新失败');
                    createAuditLog(req.admin, 'refund.complete', 'refunds', { refund_id: req.params.id, order_id: orderId, payment_method: paymentMethod, wx_status: wxStatus });
                    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
                    const freshComplete = findByLookup(getCollection('refunds'), req.params.id);
                    okStrongWrite(res, buildRefundRecord(freshComplete || { ...refund, ...completedData }, getCollection('users'), getCollection('orders'), getCollection('products'), getCollection('skus')), {
                        persisted: true,
                        reloaded_collections: reloadMeta.reloaded_collections,
                        read_at: reloadMeta.read_at
                    });
                } else {
                    const processingFinal = { status: 'processing', wx_refund_id: wxRefundId, wx_status: wxStatus, updated_at: nowIso() };
                    const refundPersisted = await persistPatchedRow('refunds', req.params.id, refund, processingFinal);
                    if (!refundPersisted.ok) throw new Error('退款记录更新失败');

                    createAuditLog(req.admin, 'refund.processing', 'refunds', { refund_id: req.params.id, order_id: orderId, payment_method: paymentMethod, wx_refund_id: wxRefundId, wx_status: wxStatus });
                    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
                    const freshProcessing = findByLookup(getCollection('refunds'), req.params.id);
                    okStrongWrite(res, {
                        ...(freshProcessing
                            ? buildRefundRecord(freshProcessing, getCollection('users'), getCollection('orders'), getCollection('products'), getCollection('skus'))
                            : { ...refund, ...processingFinal }),
                        note: '退款申请已提交微信，处理结果将通过回调通知更新'
                    }, {
                        persisted: true,
                        reloaded_collections: reloadMeta.reloaded_collections,
                        read_at: reloadMeta.read_at
                    });
                }
            }
        } catch (error) {
            if (rollbackInternalFunds) {
                await rollbackInternalFunds().catch((err) => { console.error('[admin-refunds] ⚠️ 退款失败回滚内部资金失败:', err.message || err); });
            }
            const revertData = { status: 'approved', wx_error: pickString(error.message), updated_at: nowIso() };
            await persistPatchedRow('refunds', req.params.id, refund, revertData);

            const prevOrderStatus = order.status === 'refunding'
                ? (order.prev_status || (order.confirmed_at || order.auto_confirmed_at ? 'completed' : (order.shipped_at ? 'shipped' : (order.paid_at ? 'paid' : 'pending_payment'))))
                : order.status;
            await persistPatchedRow('orders', orderId, order, { status: prevOrderStatus, updated_at: nowIso() });

            return fail(res, `退款失败：${error.message || '未知错误'}`, 500);
        }
    });

    app.put('/admin/api/refunds/:id/sync', auth, requirePermission('refunds'), async (req, res) => {
        if (rejectUnknownBodyFields(res, req.body, [], '退款状态同步参数不合法')) return;
        await ensureFreshCollections(['refunds', 'orders', 'users', 'products', 'skus', 'station_sku_stocks', 'station_stock_logs', 'goods_fund_logs']);
        const refund = findByLookup(getCollection('refunds'), req.params.id);
        if (!refund) return fail(res, '退款记录不存在', 404);

        const order = findByLookup(getCollection('orders'), refund.order_id || refund.order_no, (row) => [row.order_no]);
        const paymentMethod = normalizePaymentMethodCode(
            refund.payment_method || refund.refund_channel || (resolveOrderPaymentMethod ? resolveOrderPaymentMethod(order || {}) : '') || ''
        );
        if (paymentMethod !== 'wechat') {
            return fail(res, '当前退款不是微信退款，无需同步状态', 400);
        }
        if (!pickString(refund.refund_no)) {
            return fail(res, '退款单缺少 refund_no，无法同步微信状态', 400);
        }

        try {
            const syncResult = await syncRefundStatusViaPayment(refund);
            await Promise.resolve(dataStore.flush?.());
            const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
            const freshRefund = findByLookup(getCollection('refunds'), req.params.id);
            const users = getCollection('users');
            const orders = getCollection('orders');
            const products = getCollection('products');
            const skus = getCollection('skus');
            okStrongWrite(res, {
                ...buildRefundRecord(freshRefund || refund, users, orders, products, skus),
                sync_result: syncResult
            }, {
                persisted: true,
                reloaded_collections: reloadMeta.reloaded_collections,
                read_at: reloadMeta.read_at
            });
        } catch (error) {
            return fail(res, error.message || '同步微信退款状态失败', 500);
        }
    });

    /**
     * @deprecated 2026-05-03 审计 P0-2：退款异步通知 canonical 路径是
     *   `payment` 云函数 → `payment-callback.js` `handleRefundCallback`。
     *
     * 证据（详见 cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md §3 P0-2）：
     *   - CLOUDBASE_RELEASE_RUNBOOK.md L99-L106 明确 "WeChat Pay notify URL points to the formal payment HTTP path"
     *   - PHASE1_SMOKE_CHECKLIST.md 仅围绕 payment 网关 /payment 与 /payment-notify
     *   - admin-api 这条 wechat-notify 与 payment 共用同一份 PAYMENT_WECHAT_NOTIFY_URL 环境变量；
     *     线上若按 runbook 把该 URL 配成 payment 网关，本路由将不会被微信命中
     *
     * 保留原因：仓库内无法 100% 证明线上 admin-api 的 PAYMENT_WECHAT_NOTIFY_URL
     *   是否曾被独立配置过。删除前需要从生产日志确认本路由"长期 0 次命中"。
     *
     * 监控办法：路由内的 console.warn('[DEPRECATED-NOTIFY-HIT]') 一旦在生产日志出现，
     *   说明本路由仍在线收流量，**移除前必须迁移**。
     */
    app.post('/admin/api/refunds/wechat-notify', async (req, res) => {
        // 主代理监控信号：每次进入都打一行警告，便于 Stage 3 真删之前从日志确认是否仍活
        console.warn('[DEPRECATED-NOTIFY-HIT] /admin/api/refunds/wechat-notify reached. canonical=payment.handleRefundCallback. audit=2026-05-03 P0-2');
        const verified = await verifyRefundNotifyRequest(req);
        if (!verified.ok) {
            return res.status(verified.status || 401).json({
                code: 'REJECTED',
                success: false,
                message: verified.message,
                request_id: req.requestId || '',
                timestamp: nowIso()
            });
        }
        try {
            const eventType = verified.eventType;
            if (!eventType.startsWith('REFUND.')) {
                return res.json({ code: 'SUCCESS', message: 'Ignored non-refund event' });
            }
            const refundData = verified.refundData || {};
            const outRefundNo = pickString(refundData.out_refund_no || verified.callbackData?.out_refund_no);
            const refundStatus = pickString(refundData.refund_status || '').toUpperCase();
            if (!outRefundNo) {
                return res.status(400).json({
                    code: 'REJECTED',
                    success: false,
                    message: '微信退款回调缺少 out_refund_no',
                    request_id: req.requestId || '',
                    timestamp: nowIso()
                });
            }

            await ensureFreshCollections(['refunds', 'orders']);
            const refunds = getCollection('refunds');
            const refund = refunds.find((row) => pickString(row.refund_no) === outRefundNo);
            if (!refund) {
                console.warn(`[RefundNotify] 未找到退款记录 refund_no=${outRefundNo}`);
                return res.json({ code: 'SUCCESS', message: 'Refund not found' });
            }

            if (pickString(refund.status) === 'completed' || pickString(refund.status) === 'failed') {
                return res.json({ code: 'SUCCESS', message: 'Already in terminal state' });
            }

            const orderId = refund.order_id || refund.order_no;
            const orders = getCollection('orders');
            const order = orderId ? findByLookup(orders, orderId) : null;

            if (refundStatus === 'SUCCESS') {
                const refundCompleteData = {
                    status: 'completed',
                    completed_at: nowIso(),
                    wx_refund_id: pickString(refundData.refund_id || refund.wx_refund_id),
                    wx_refund_status: refundStatus,
                    wx_success_time: pickString(refundData.success_time || ''),
                    updated_at: nowIso()
                };
                const refundPersisted = await persistPatchedRow('refunds', deps.primaryId(refund), refund, refundCompleteData);
                if (!refundPersisted.ok) throw new Error('退款回调更新失败');

                await cancelCommissionsForOrder(orderId, '退款完成，佣金作废');
                restoreOrderStockForRefund(orderId, refund);
                pickupStockAdmin?.restorePickupStockForRefund?.(order, refund);
                await Promise.resolve(pickupStockAdmin?.rollbackPickupPrincipalForRefund?.(order, refund)).catch((err) => { console.error('[admin-refunds] ⚠️ 回滚门店进货本金失败:', err.message || err); });
                const settlement = await refundOrderExtras(orderId, refund);

                if (order) {
                    const orderPersisted = await persistPatchedRow('orders', orderId, order, { ...settlement.patch, updated_at: nowIso() });
                    if (!orderPersisted.ok) throw new Error('退款回调订单更新失败');
                }
                console.log(`[RefundNotify] 退款成功处理完毕: ${outRefundNo}, order=${orderId}, serial=${verified.serial}, key_source=${verified.verify_key_source}`);
            } else if (['ABNORMAL', 'CLOSED'].includes(refundStatus)) {
                const refundFailData = {
                    status: 'failed',
                    wx_refund_id: pickString(refundData.refund_id || refund.wx_refund_id),
                    wx_refund_status: refundStatus,
                    updated_at: nowIso()
                };
                const refundPersisted = await persistPatchedRow('refunds', deps.primaryId(refund), refund, refundFailData);
                if (!refundPersisted.ok) throw new Error('退款回调更新失败');

                if (order) {
                    const revertStatus = order.status === 'refunding'
                        ? (order.prev_status || (order.confirmed_at || order.auto_confirmed_at ? 'completed' : (order.shipped_at ? 'shipped' : (order.paid_at ? 'paid' : 'pending_payment'))))
                        : order.status;
                    const orderPersisted = await persistPatchedRow('orders', orderId, order, {
                        status: order.status === 'refunding' ? revertStatus : order.status,
                        updated_at: nowIso()
                    });
                    if (!orderPersisted.ok) throw new Error('退款回调订单更新失败');
                }
                console.warn(`[RefundNotify] 退款异常/关闭: ${outRefundNo}, status=${refundStatus}, serial=${verified.serial}`);
            } else {
                return res.json({ code: 'SUCCESS', message: `Ignored refund status: ${refundStatus || 'UNKNOWN'}` });
            }

            await Promise.resolve(dataStore.flush?.());
            res.json({ code: 'SUCCESS', message: 'OK' });
        } catch (err) {
            console.error('[RefundNotify] 处理退款回调失败:', err.message);
            res.status(500).json({
                code: 'REJECTED',
                success: false,
                message: err.message || '退款回调处理失败',
                request_id: req.requestId || '',
                timestamp: nowIso()
            });
        }
    });
}

module.exports = {
    registerRefundRoutes
};
