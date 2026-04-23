'use strict';

const {
    GOODS_FUND_TRANSFER_STATUS,
    pickString,
    roundMoney,
    toNumber,
    normalizeGoodsFundTransferStatus,
    buildGoodsFundTransferStatusText
} = require('./shared/goods-fund-transfer');

function registerGoodsFundTransferRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        ensureFreshCollections,
        getCollection,
        saveCollection,
        nextId,
        nowIso,
        findByLookup,
        rowMatchesLookup,
        paginate,
        sortByUpdatedDesc,
        createAuditLog,
        appendWalletLogEntry,
        appendGoodsFundLogEntry,
        ok,
        fail,
        flush
    } = deps;

    function primaryId(row = {}) {
        return row._id || row.id || row._legacy_id || '';
    }

    function getUserGoodsFundBalance(user = {}) {
        return roundMoney(toNumber(user.agent_wallet_balance != null ? user.agent_wallet_balance : user.wallet_balance, 0));
    }

    function findUserByOpenid(users = [], openid = '') {
        return users.find((item) => pickString(item.openid) === pickString(openid)) || null;
    }

    function findWalletAccount(walletAccounts = [], user = {}) {
        const ids = [user.id, user._legacy_id, user._id].filter((value) => value !== null && value !== undefined && value !== '');
        return walletAccounts.find((row) => {
            if (pickString(row.openid) && pickString(row.openid) === pickString(user.openid)) return true;
            return ids.some((id) => String(row.user_id) === String(id));
        }) || null;
    }

    function ensureWalletAccount(walletAccounts = [], user = {}) {
        const existing = findWalletAccount(walletAccounts, user);
        if (existing) return existing;
        const accountId = `wallet-${String(primaryId(user) || user.openid || nextId(walletAccounts)).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const nextAccount = {
            _id: accountId,
            id: accountId,
            user_id: primaryId(user) || user.openid,
            openid: pickString(user.openid),
            balance: getUserGoodsFundBalance(user),
            account_type: 'goods_fund',
            status: 'active',
            created_at: nowIso(),
            updated_at: nowIso()
        };
        walletAccounts.push(nextAccount);
        return nextAccount;
    }

    function buildApplicationRecord(row = {}, users = []) {
        const fromUser = findUserByOpenid(users, row.from_openid) || row.from_snapshot || {};
        const toUser = findUserByOpenid(users, row.to_openid) || row.to_snapshot || {};
        return {
            ...row,
            id: pickString(row.application_id || row._id || row.id),
            amount: roundMoney(row.amount),
            status: normalizeGoodsFundTransferStatus(row.status),
            status_text: buildGoodsFundTransferStatusText(row.status),
            from_snapshot: row.from_snapshot || {
                user_id: primaryId(fromUser),
                openid: pickString(fromUser.openid),
                nickname: pickString(fromUser.nickname || fromUser.nick_name || fromUser.nickName || fromUser.name || '微信用户'),
                role_name: pickString(fromUser.role_name),
                invite_code: pickString(fromUser.invite_code || fromUser.member_no)
            },
            to_snapshot: row.to_snapshot || {
                user_id: primaryId(toUser),
                openid: pickString(toUser.openid),
                nickname: pickString(toUser.nickname || toUser.nick_name || toUser.nickName || toUser.name || '微信用户'),
                role_name: pickString(toUser.role_name),
                invite_code: pickString(toUser.invite_code || toUser.member_no)
            },
            relation_source_text: pickString(row.relation_source_text || '普通邀请'),
            from_goods_fund_balance: getUserGoodsFundBalance(fromUser),
            to_goods_fund_balance: getUserGoodsFundBalance(toUser)
        };
    }

    function hasTransferLog(logs = [], transferNo = '', type = '') {
        const normalizedTransferNo = pickString(transferNo);
        const normalizedType = pickString(type);
        return logs.some((row) => pickString(row.transfer_no) === normalizedTransferNo && pickString(row.type || row.change_type) === normalizedType);
    }

    app.get('/admin/api/goods-fund-transfers', auth, requirePermission('commissions'), async (req, res) => {
        await ensureFreshCollections(['goods_fund_transfer_applications', 'users']);
        const users = getCollection('users');
        const keyword = pickString(req.query.keyword).toLowerCase();
        const status = pickString(req.query.status);
        let rows = sortByUpdatedDesc(getCollection('goods_fund_transfer_applications')).map((row) => buildApplicationRecord(row, users));
        if (status) rows = rows.filter((row) => row.status === status);
        if (keyword) {
            rows = rows.filter((row) => {
                const haystack = [
                    row.application_no,
                    row.from_snapshot?.nickname,
                    row.from_snapshot?.invite_code,
                    row.to_snapshot?.nickname,
                    row.to_snapshot?.invite_code,
                    row.relation_source_text
                ].join(' ').toLowerCase();
                return haystack.includes(keyword);
            });
        }
        ok(res, paginate(rows, req));
    });

    app.put('/admin/api/goods-fund-transfers/:id/approve', auth, requirePermission('commissions'), async (req, res) => {
        await ensureFreshCollections(['goods_fund_transfer_applications', 'users', 'wallet_accounts', 'wallet_logs', 'goods_fund_logs']);
        const rows = getCollection('goods_fund_transfer_applications');
        const users = getCollection('users');
        const walletAccounts = getCollection('wallet_accounts');
        const walletLogs = getCollection('wallet_logs');
        const goodsFundLogs = getCollection('goods_fund_logs');
        const index = rows.findIndex((row) => rowMatchesLookup(row, req.params.id, [row.application_id, row.application_no]));
        if (index === -1) return fail(res, '货款划拨申请不存在', 404);
        if (normalizeGoodsFundTransferStatus(rows[index].status) !== GOODS_FUND_TRANSFER_STATUS.PENDING) {
            return fail(res, '当前状态不可审核通过', 400);
        }

        const application = rows[index];
        const fromUser = findUserByOpenid(users, application.from_openid);
        const toUser = findUserByOpenid(users, application.to_openid);
        if (!fromUser) return fail(res, '上级用户不存在', 404);
        if (!toUser) return fail(res, '下级用户不存在', 404);
        const amount = roundMoney(application.amount);
        if (amount <= 0) return fail(res, '划拨金额不合法', 400);
        const fromBalanceBefore = getUserGoodsFundBalance(fromUser);
        if (fromBalanceBefore < amount) return fail(res, '上级货款余额不足，当前不可审核通过', 400);
        const toBalanceBefore = getUserGoodsFundBalance(toUser);
        const fromBalanceAfter = roundMoney(fromBalanceBefore - amount);
        const toBalanceAfter = roundMoney(toBalanceBefore + amount);
        const transferNo = pickString(application.transfer_txn_no || `GFTX_${pickString(application.application_id || application._id)}`);
        const reviewedAt = nowIso();

        const usersSnapshot = JSON.parse(JSON.stringify(users));
        const walletsSnapshot = JSON.parse(JSON.stringify(walletAccounts));
        const applicationsSnapshot = JSON.parse(JSON.stringify(rows));
        const walletLogsSnapshot = JSON.parse(JSON.stringify(walletLogs));
        const goodsFundLogsSnapshot = JSON.parse(JSON.stringify(goodsFundLogs));

        try {
            const fromIndex = users.findIndex((item) => rowMatchesLookup(item, primaryId(fromUser), [fromUser.openid]));
            const toIndex = users.findIndex((item) => rowMatchesLookup(item, primaryId(toUser), [toUser.openid]));
            users[fromIndex] = {
                ...users[fromIndex],
                agent_wallet_balance: fromBalanceAfter,
                wallet_balance: fromBalanceAfter,
                updated_at: reviewedAt
            };
            users[toIndex] = {
                ...users[toIndex],
                agent_wallet_balance: toBalanceAfter,
                wallet_balance: toBalanceAfter,
                updated_at: reviewedAt
            };

            const fromWallet = ensureWalletAccount(walletAccounts, users[fromIndex]);
            const toWallet = ensureWalletAccount(walletAccounts, users[toIndex]);
            const fromWalletIndex = walletAccounts.findIndex((item) => rowMatchesLookup(item, primaryId(fromWallet), [fromWallet.user_id]));
            const toWalletIndex = walletAccounts.findIndex((item) => rowMatchesLookup(item, primaryId(toWallet), [toWallet.user_id]));
            walletAccounts[fromWalletIndex] = {
                ...fromWallet,
                balance: fromBalanceAfter,
                updated_at: reviewedAt
            };
            walletAccounts[toWalletIndex] = {
                ...toWallet,
                balance: toBalanceAfter,
                updated_at: reviewedAt
            };

            rows[index] = {
                ...rows[index],
                status: GOODS_FUND_TRANSFER_STATUS.APPROVED,
                reviewed_at: reviewedAt,
                reviewed_by: String(req.admin?.id || req.admin?.username || ''),
                review_reason: pickString(req.body?.reason),
                transfer_txn_no: transferNo,
                updated_at: reviewedAt
            };

            saveCollection('users', users);
            saveCollection('wallet_accounts', walletAccounts);
            saveCollection('goods_fund_transfer_applications', rows);

            if (!hasTransferLog(walletLogs, transferNo, 'n_allocate_out')) {
                await appendWalletLogEntry({
                    openid: users[fromIndex].openid,
                    user_id: primaryId(users[fromIndex]),
                    account_id: primaryId(walletAccounts[fromWalletIndex]),
                    change_type: 'n_allocate_out',
                    type: 'n_allocate_out',
                    amount: -amount,
                    balance_before: fromBalanceBefore,
                    balance_after: fromBalanceAfter,
                    transfer_no: transferNo,
                    ref_type: 'goods_fund_transfer_application',
                    ref_id: rows[index].application_id,
                    description: `货款划拨审核通过，向下级划拨 ${amount} 元`
                });
            }
            if (!hasTransferLog(walletLogs, transferNo, 'n_allocate_in')) {
                await appendWalletLogEntry({
                    openid: users[toIndex].openid,
                    user_id: primaryId(users[toIndex]),
                    account_id: primaryId(walletAccounts[toWalletIndex]),
                    change_type: 'n_allocate_in',
                    type: 'n_allocate_in',
                    amount,
                    balance_before: toBalanceBefore,
                    balance_after: toBalanceAfter,
                    transfer_no: transferNo,
                    ref_type: 'goods_fund_transfer_application',
                    ref_id: rows[index].application_id,
                    description: `货款划拨审核通过，收到上级划拨 ${amount} 元`
                });
            }
            if (!hasTransferLog(goodsFundLogs, transferNo, 'n_allocate_out')) {
                await appendGoodsFundLogEntry({
                    openid: users[fromIndex].openid,
                    user_id: primaryId(users[fromIndex]),
                    type: 'n_allocate_out',
                    amount: -amount,
                    transfer_no: transferNo,
                    application_id: rows[index].application_id,
                    description: `货款划拨审核通过，向下级划拨 ${amount} 元`
                });
            }
            if (!hasTransferLog(goodsFundLogs, transferNo, 'n_allocate_in')) {
                await appendGoodsFundLogEntry({
                    openid: users[toIndex].openid,
                    user_id: primaryId(users[toIndex]),
                    type: 'n_allocate_in',
                    amount,
                    transfer_no: transferNo,
                    application_id: rows[index].application_id,
                    description: `货款划拨审核通过，收到上级划拨 ${amount} 元`
                });
            }
            await flush();
        } catch (error) {
            saveCollection('users', usersSnapshot);
            saveCollection('wallet_accounts', walletsSnapshot);
            saveCollection('goods_fund_transfer_applications', applicationsSnapshot);
            saveCollection('wallet_logs', walletLogsSnapshot);
            saveCollection('goods_fund_logs', goodsFundLogsSnapshot);
            return fail(res, `审核通过失败：${error.message || '写入异常'}`, 500);
        }

        createAuditLog(req.admin, 'goods_fund_transfer.approve', 'goods_fund_transfer_applications', {
            application_id: rows[index].application_id,
            transfer_txn_no: transferNo,
            amount
        });
        ok(res, buildApplicationRecord(rows[index], users));
    });

    app.put('/admin/api/goods-fund-transfers/:id/reject', auth, requirePermission('commissions'), async (req, res) => {
        await ensureFreshCollections(['goods_fund_transfer_applications', 'users']);
        const rows = getCollection('goods_fund_transfer_applications');
        const users = getCollection('users');
        const index = rows.findIndex((row) => rowMatchesLookup(row, req.params.id, [row.application_id, row.application_no]));
        if (index === -1) return fail(res, '货款划拨申请不存在', 404);
        if (normalizeGoodsFundTransferStatus(rows[index].status) !== GOODS_FUND_TRANSFER_STATUS.PENDING) {
            return fail(res, '当前状态不可拒绝', 400);
        }
        rows[index] = {
            ...rows[index],
            status: GOODS_FUND_TRANSFER_STATUS.REJECTED,
            reviewed_at: nowIso(),
            reviewed_by: String(req.admin?.id || req.admin?.username || ''),
            review_reason: pickString(req.body?.reason),
            updated_at: nowIso()
        };
        saveCollection('goods_fund_transfer_applications', rows);
        await flush();
        createAuditLog(req.admin, 'goods_fund_transfer.reject', 'goods_fund_transfer_applications', {
            application_id: rows[index].application_id,
            review_reason: rows[index].review_reason
        });
        ok(res, buildApplicationRecord(rows[index], users));
    });
}

module.exports = {
    registerGoodsFundTransferRoutes
};
