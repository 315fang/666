'use strict';

const {
    DEFAULT_DIRECTED_INVITE_RULES,
    DIRECTED_INVITE_FREEZE_STATUS,
    DIRECTED_INVITE_LOCK_STATUS,
    DIRECTED_INVITE_REROUTE_REQUIRED_REVIEW_NOTE,
    DIRECTED_INVITE_REVIEW_STATUS,
    DIRECTED_INVITE_STATUS,
    buildDirectedInvitePath,
    buildInviteStatusText,
    hasBoundParent,
    isDirectedInviteInitiator,
    isDirectedInviteTargetEligible,
    isVip0,
    normalizeDirectedInviteFreezeStatus,
    normalizeDirectedInviteLockStatus,
    normalizeDirectedInviteReviewStatus,
    normalizeDirectedInviteRules,
    normalizeDirectedInviteStatus,
    normalizeRoleLevel,
    normalizeTransferAmount,
    pickString,
    roundMoney,
    toNumber
} = require('./shared/directed-invite');

function registerDirectedInviteRoutes(app, deps) {
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

    function findUserByOpenid(users = [], openid = '') {
        const normalized = pickString(openid);
        return users.find((item) => pickString(item.openid) === normalized) || null;
    }

    function parseConfigRowValue(row, fallback = null) {
        if (!row) return fallback;
        const raw = row.config_value !== undefined ? row.config_value : row.value;
        if (raw === undefined || raw === null || raw === '') return fallback;
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw);
            } catch (_) {
                return raw;
            }
        }
        return raw;
    }

    function getDirectedInviteRules() {
        const keys = ['agent_system_directed-invite-rules', 'agent_system_directed_invite_rules'];
        const rows = getCollection('configs');
        for (const key of keys) {
            const row = rows.find((item) => item.config_key === key || item.key === key || item._id === key);
            if (row) return normalizeDirectedInviteRules(parseConfigRowValue(row, DEFAULT_DIRECTED_INVITE_RULES));
        }
        return normalizeDirectedInviteRules(DEFAULT_DIRECTED_INVITE_RULES);
    }

    function getUserGoodsFundBalance(user = {}) {
        return roundMoney(toNumber(user.agent_wallet_balance != null ? user.agent_wallet_balance : user.wallet_balance, 0));
    }

    function getUserGoodsFundFrozenBalance(user = {}) {
        return roundMoney(toNumber(user.agent_wallet_frozen_amount ?? user.goods_fund_frozen_amount, 0));
    }

    function buildUserSnapshot(user = {}) {
        return {
            user_id: primaryId(user),
            openid: pickString(user.openid),
            nickname: pickString(user.nickname || user.nick_name || user.nickName || user.name || '微信用户'),
            avatar_url: pickString(user.avatar_url || user.avatarUrl || user.avatar),
            role_level: normalizeRoleLevel(user),
            role_name: pickString(user.role_name),
            invite_code: pickString(user.my_invite_code || user.invite_code || user.member_no),
            goods_fund_balance: getUserGoodsFundBalance(user)
        };
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
        if (existing) return { account: existing, rows: walletAccounts };
        const accountId = `wallet-${String(primaryId(user) || user.openid || nextId(walletAccounts)).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const nextAccount = {
            _id: accountId,
            id: accountId,
            user_id: primaryId(user) || user.openid,
            openid: pickString(user.openid),
            balance: getUserGoodsFundBalance(user),
            frozen_balance: getUserGoodsFundFrozenBalance(user),
            account_type: 'goods_fund',
            status: 'active',
            created_at: nowIso(),
            updated_at: nowIso()
        };
        walletAccounts.push(nextAccount);
        return { account: nextAccount, rows: walletAccounts };
    }

    function normalizeInviteRow(row = {}, users = [], walletAccounts = []) {
        const rawStatus = normalizeDirectedInviteStatus(row.status);
        const reviewStatus = normalizeDirectedInviteReviewStatus(row.review_status);
        const freezeStatus = normalizeDirectedInviteFreezeStatus(row.freeze_status);
        const expired = rawStatus === DIRECTED_INVITE_STATUS.SENT && row.ticket_expire_at && new Date(row.ticket_expire_at).getTime() <= Date.now();
        const status = expired ? DIRECTED_INVITE_STATUS.EXPIRED : rawStatus;
        const persistedLockStatus = normalizeDirectedInviteLockStatus(row.lock_status);
        const lockStatus = persistedLockStatus || (status === DIRECTED_INVITE_STATUS.SENT ? DIRECTED_INVITE_LOCK_STATUS.UNLOCKED : DIRECTED_INVITE_LOCK_STATUS.LOCKED);
        const inviter = findUserByOpenid(users, row.inviter_openid) || row.inviter_snapshot || {};
        const acceptedUser = findUserByOpenid(users, row.accepted_openid) || row.accepted_user_snapshot || {};
        const inviterBalance = getUserGoodsFundBalance(inviter);
        const inviterFrozenBalance = getUserGoodsFundFrozenBalance(inviter);
        return {
            ...row,
            invite_id: pickString(row.invite_id || row._id || row.id),
            transfer_amount: normalizeTransferAmount(row.transfer_amount),
            frozen_amount: normalizeTransferAmount(row.frozen_amount || 0),
            freeze_status: freezeStatus,
            lock_status: lockStatus,
            lock_status_text: lockStatus === DIRECTED_INVITE_LOCK_STATUS.LOCKED ? '已锁定' : '可用',
            status,
            review_status: reviewStatus,
            status_text: buildInviteStatusText(status, reviewStatus),
            invite_path: buildDirectedInvitePath(row.ticket_id),
            inviter_snapshot: row.inviter_snapshot || buildUserSnapshot(inviter),
            accepted_user_snapshot: row.accepted_user_snapshot || (row.accepted_openid ? buildUserSnapshot(acceptedUser) : null),
            inviter_goods_fund_balance: inviterBalance,
            inviter_frozen_goods_fund_balance: inviterFrozenBalance,
            inviter_balance_sufficient: inviterBalance + inviterFrozenBalance >= normalizeTransferAmount(row.transfer_amount)
        };
    }

    function sanitizeTransferNo(value = '') {
        return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    }

    function hasWalletTransferLog(transferNo = '', changeType = '') {
        const normalizedTransferNo = pickString(transferNo);
        const normalizedType = pickString(changeType);
        if (!normalizedTransferNo || !normalizedType) return false;
        return getCollection('wallet_logs').some((row) => {
            return pickString(row.transfer_no) === normalizedTransferNo
                && pickString(row.change_type || row.type) === normalizedType;
        });
    }

    function hasGoodsFundTransferLog(transferNo = '', type = '') {
        const normalizedTransferNo = pickString(transferNo);
        const normalizedType = pickString(type);
        if (!normalizedTransferNo || !normalizedType) return false;
        return getCollection('goods_fund_logs').some((row) => {
            return pickString(row.transfer_no) === normalizedTransferNo
                && pickString(row.type || row.change_type) === normalizedType;
        });
    }

    app.get('/admin/api/directed-invites', auth, requirePermission('dealers'), async (req, res) => {
        await ensureFreshCollections(['directed_invites', 'users', 'wallet_accounts', 'wallet_logs', 'goods_fund_logs']);
        const rows = getCollection('directed_invites');
        const users = getCollection('users');
        const walletAccounts = getCollection('wallet_accounts');
        const keyword = pickString(req.query.keyword).toLowerCase();
        const status = pickString(req.query.status);
        const reviewStatus = pickString(req.query.review_status);
        let list = sortByUpdatedDesc(rows).map((item) => normalizeInviteRow(item, users, walletAccounts));
        if (keyword) {
            list = list.filter((item) => {
                const inviter = item.inviter_snapshot || {};
                const accepted = item.accepted_user_snapshot || {};
                const haystack = [
                    item.invite_id,
                    inviter.nickname,
                    inviter.invite_code,
                    accepted.nickname,
                    accepted.invite_code,
                    item.ticket_id
                ].join(' ').toLowerCase();
                return haystack.includes(keyword);
            });
        }
        if (status) list = list.filter((item) => item.status === status);
        if (reviewStatus) list = list.filter((item) => item.review_status === reviewStatus);
        ok(res, paginate(list, req));
    });

    app.post('/admin/api/directed-invites/:id/approve', auth, requirePermission('dealers'), async (req, res) => {
        await ensureFreshCollections(['directed_invites', 'users', 'wallet_accounts']);
        const invites = getCollection('directed_invites');
        const users = getCollection('users');
        const walletAccounts = getCollection('wallet_accounts');
        const index = invites.findIndex((item) => rowMatchesLookup(item, req.params.id, [item.invite_id]));
        if (index === -1) return fail(res, '定向邀约不存在', 404);

        const invite = invites[index];
        const currentStatus = normalizeDirectedInviteStatus(invite.status);
        const currentReviewStatus = normalizeDirectedInviteReviewStatus(invite.review_status);
        if (currentStatus === DIRECTED_INVITE_STATUS.ACTIVATED && currentReviewStatus === DIRECTED_INVITE_REVIEW_STATUS.APPROVED) {
            return ok(res, normalizeInviteRow(invite, users, walletAccounts));
        }
        if (!(currentStatus === DIRECTED_INVITE_STATUS.ACCEPTED && currentReviewStatus === DIRECTED_INVITE_REVIEW_STATUS.PENDING)) {
            return fail(res, '当前状态不可审核通过', 400);
        }

        const inviter = findUserByOpenid(users, invite.inviter_openid);
        const acceptedUser = findUserByOpenid(users, invite.accepted_openid);
        if (!inviter) return fail(res, '发起人不存在', 404);
        if (!acceptedUser) return fail(res, '被邀约用户不存在', 404);
        const rules = getDirectedInviteRules();
        if (!rules.enabled) return fail(res, '定向邀约已停用', 400);
        if (!isDirectedInviteInitiator(inviter, rules)) return fail(res, '发起人不具备定向邀约权限', 400);
        const allowReroute = !!invite.reroute && isVip0(acceptedUser);
        if (!isDirectedInviteTargetEligible(acceptedUser, rules) && !allowReroute) return fail(res, '被邀约用户当前不满足激活条件', 400);

        const transferAmount = normalizeTransferAmount(invite.transfer_amount);
        if (transferAmount < rules.min_transfer_amount) {
            return fail(res, `定向邀约货款不得低于 ${rules.min_transfer_amount} 元`, 400);
        }

        const inviterBalance = getUserGoodsFundBalance(inviter);
        const inviterFrozenBalance = getUserGoodsFundFrozenBalance(inviter);
        const freezeStatus = normalizeDirectedInviteFreezeStatus(invite.freeze_status);
        const isFrozenInvite = freezeStatus === DIRECTED_INVITE_FREEZE_STATUS.FROZEN
            && normalizeTransferAmount(invite.frozen_amount || transferAmount) >= transferAmount;
        if (!isFrozenInvite && inviterBalance < transferAmount) {
            return fail(res, '发起人货款余额不足，需补足后再审核', 400);
        }

        const userSnapshot = JSON.parse(JSON.stringify(users));
        const walletSnapshot = JSON.parse(JSON.stringify(walletAccounts));
        const inviteSnapshot = JSON.parse(JSON.stringify(invites));
        const walletLogSnapshot = JSON.parse(JSON.stringify(getCollection('wallet_logs')));
        const goodsFundLogSnapshot = JSON.parse(JSON.stringify(getCollection('goods_fund_logs')));

        const inviterIndex = users.findIndex((item) => rowMatchesLookup(item, primaryId(inviter), [inviter.openid]));
        const acceptedIndex = users.findIndex((item) => rowMatchesLookup(item, primaryId(acceptedUser), [acceptedUser.openid]));

        const inviterUser = { ...users[inviterIndex] };
        const acceptedUserRow = { ...users[acceptedIndex] };

        const inviterWalletResult = ensureWalletAccount(walletAccounts, inviterUser);
        const acceptedWalletResult = ensureWalletAccount(walletAccounts, acceptedUserRow);
        const inviterWallet = inviterWalletResult.account;
        const acceptedWallet = acceptedWalletResult.account;

        const inviterWalletIndex = walletAccounts.findIndex((row) => rowMatchesLookup(row, inviterWallet._id || inviterWallet.id, [inviterWallet.user_id]));
        const acceptedWalletIndex = walletAccounts.findIndex((row) => rowMatchesLookup(row, acceptedWallet._id || acceptedWallet.id, [acceptedWallet.user_id]));

        const transferNo = sanitizeTransferNo(invite.transfer_txn_no || `DIA_${pickString(invite.invite_id || invite._id)}`);
        const reviewedAt = nowIso();
        const previousParentId = acceptedUserRow.parent_id ?? null;
        const previousParentOpenid = pickString(acceptedUserRow.parent_openid);
        const previousReferrerOpenid = pickString(acceptedUserRow.referrer_openid);
        const inviterBefore = getUserGoodsFundBalance(inviterUser);
        const inviterFrozenBefore = getUserGoodsFundFrozenBalance(inviterUser);
        const inviterAfter = isFrozenInvite ? inviterBefore : roundMoney(inviterBefore - transferAmount);
        const inviterFrozenAfter = isFrozenInvite ? roundMoney(Math.max(0, inviterFrozenBefore - transferAmount)) : inviterFrozenBefore;
        const acceptedBefore = getUserGoodsFundBalance(acceptedUserRow);
        const acceptedAfter = roundMoney(acceptedBefore + transferAmount);
        const nextDistributorLevel = Math.max(toNumber(acceptedUserRow.distributor_level ?? acceptedUserRow.agent_level, 0), 3);

        users[inviterIndex] = {
            ...inviterUser,
            agent_wallet_balance: inviterAfter,
            wallet_balance: inviterAfter,
            agent_wallet_frozen_amount: inviterFrozenAfter,
            goods_fund_frozen_amount: inviterFrozenAfter,
            updated_at: reviewedAt
        };
        users[acceptedIndex] = {
            ...acceptedUserRow,
            role_level: 3,
            role_name: '推广合伙人',
            distributor_level: nextDistributorLevel,
            agent_level: nextDistributorLevel,
            participate_distribution: 1,
            discount_rate: 1,
            role_upgraded_at: reviewedAt,
            parent_id: primaryId(inviterUser),
            parent_openid: inviterUser.openid || '',
            referrer_openid: inviterUser.openid || '',
            joined_team_at: reviewedAt,
            bound_parent_at: reviewedAt,
            relation_source: 'directed_b1',
            invitation_source: 'directed_b1',
            directed_invite_id: invite.invite_id || invite._id || '',
            agent_wallet_balance: acceptedAfter,
            wallet_balance: acceptedAfter,
            updated_at: reviewedAt
        };

        walletAccounts[inviterWalletIndex] = {
            ...inviterWallet,
            balance: inviterAfter,
            frozen_balance: inviterFrozenAfter,
            updated_at: reviewedAt
        };
        walletAccounts[acceptedWalletIndex] = {
            ...acceptedWallet,
            balance: acceptedAfter,
            updated_at: reviewedAt
        };

        invites[index] = {
            ...invite,
            status: DIRECTED_INVITE_STATUS.ACTIVATED,
            review_status: DIRECTED_INVITE_REVIEW_STATUS.APPROVED,
            reviewed_by: String(req.admin?.id || req.admin?.username || ''),
            reviewed_at: reviewedAt,
            review_reason: pickString(req.body?.reason || ''),
            transfer_txn_no: transferNo,
            transfer_at: reviewedAt,
            activated_at: reviewedAt,
            freeze_status: isFrozenInvite ? DIRECTED_INVITE_FREEZE_STATUS.SETTLED : normalizeDirectedInviteFreezeStatus(invite.freeze_status),
            lock_status: DIRECTED_INVITE_LOCK_STATUS.LOCKED,
            lock_reason: 'activated',
            line_locked: true,
            accepted_user_snapshot: buildUserSnapshot(users[acceptedIndex]),
            inviter_snapshot: buildUserSnapshot(users[inviterIndex]),
            reroute: allowReroute,
            reroute_from_parent_id: allowReroute ? (invite.reroute_from_parent_id ?? previousParentId) : null,
            reroute_from_parent_openid: allowReroute ? pickString(invite.reroute_from_parent_openid || previousParentOpenid) : '',
            reroute_from_referrer_openid: allowReroute ? pickString(invite.reroute_from_referrer_openid || previousReferrerOpenid) : '',
            reroute_required_review_note: allowReroute ? pickString(invite.reroute_required_review_note || DIRECTED_INVITE_REROUTE_REQUIRED_REVIEW_NOTE) : '',
            reroute_recalculate_history: allowReroute ? false : !!invite.reroute_recalculate_history,
            updated_at: reviewedAt
        };

        try {
            saveCollection('users', users);
            saveCollection('wallet_accounts', walletAccounts);
            saveCollection('directed_invites', invites);
            const logTasks = [];
            if (!isFrozenInvite && !hasWalletTransferLog(transferNo, 'directed_b1_allocate_out')) {
                logTasks.push(appendWalletLogEntry({
                    openid: inviterUser.openid || '',
                    user_id: primaryId(inviterUser),
                    account_id: inviterWallet.id || inviterWallet._id || '',
                    type: 'directed_b1_allocate_out',
                    change_type: 'directed_b1_allocate_out',
                    amount: -transferAmount,
                    balance_before: inviterBefore,
                    balance_after: inviterAfter,
                    transfer_no: transferNo,
                    ref_type: 'directed_invite',
                    ref_id: invites[index].invite_id,
                    description: `B1定向邀约审核通过，划拨货款 ${transferAmount} 元`
                }));
            }
            if (!hasWalletTransferLog(transferNo, 'directed_b1_allocate_in')) {
                logTasks.push(appendWalletLogEntry({
                    openid: acceptedUserRow.openid || '',
                    user_id: primaryId(acceptedUserRow),
                    account_id: acceptedWallet.id || acceptedWallet._id || '',
                    type: 'directed_b1_allocate_in',
                    change_type: 'directed_b1_allocate_in',
                    amount: transferAmount,
                    balance_before: acceptedBefore,
                    balance_after: acceptedAfter,
                    transfer_no: transferNo,
                    ref_type: 'directed_invite',
                    ref_id: invites[index].invite_id,
                    description: `B1定向邀约审核通过，获得货款 ${transferAmount} 元`
                }));
            }
            if (!isFrozenInvite && !hasGoodsFundTransferLog(transferNo, 'directed_b1_allocate_out')) {
                logTasks.push(appendGoodsFundLogEntry({
                    openid: inviterUser.openid || '',
                    user_id: primaryId(inviterUser),
                    type: 'directed_b1_allocate_out',
                    amount: -transferAmount,
                    transfer_no: transferNo,
                    invite_id: invites[index].invite_id,
                    description: `B1定向邀约货款划拨支出 ${transferAmount} 元`
                }));
            }
            if (!hasGoodsFundTransferLog(transferNo, 'directed_b1_allocate_in')) {
                logTasks.push(appendGoodsFundLogEntry({
                    openid: acceptedUserRow.openid || '',
                    user_id: primaryId(acceptedUserRow),
                    type: 'directed_b1_allocate_in',
                    amount: transferAmount,
                    transfer_no: transferNo,
                    invite_id: invites[index].invite_id,
                    description: `B1定向邀约货款划拨收入 ${transferAmount} 元`
                }));
            }
            await Promise.all(logTasks);
            await flush();
        } catch (error) {
            saveCollection('users', userSnapshot);
            saveCollection('wallet_accounts', walletSnapshot);
            saveCollection('directed_invites', inviteSnapshot);
            saveCollection('wallet_logs', walletLogSnapshot);
            saveCollection('goods_fund_logs', goodsFundLogSnapshot);
            return fail(res, `审核通过失败：${error.message || '写入异常'}`, 500);
        }

        createAuditLog(req.admin, 'directed_invite.approve', 'directed_invites', {
            invite_id: invites[index].invite_id,
            transfer_txn_no: transferNo,
            transfer_amount: transferAmount,
            accepted_user_id: primaryId(acceptedUserRow),
            reroute: allowReroute,
            previous_parent_id: allowReroute ? previousParentId : null,
            previous_parent_openid: allowReroute ? previousParentOpenid : '',
            previous_referrer_openid: allowReroute ? previousReferrerOpenid : ''
        });
        ok(res, normalizeInviteRow(invites[index], users, walletAccounts));
    });

    app.post('/admin/api/directed-invites/:id/reject', auth, requirePermission('dealers'), async (req, res) => {
        await ensureFreshCollections(['directed_invites', 'users', 'wallet_accounts']);
        const invites = getCollection('directed_invites');
        const users = getCollection('users');
        const walletAccounts = getCollection('wallet_accounts');
        const index = invites.findIndex((item) => rowMatchesLookup(item, req.params.id, [item.invite_id]));
        if (index === -1) return fail(res, '定向邀约不存在', 404);
        const invite = invites[index];
        const currentStatus = normalizeDirectedInviteStatus(invite.status);
        const currentReviewStatus = normalizeDirectedInviteReviewStatus(invite.review_status);
        if (!(currentStatus === DIRECTED_INVITE_STATUS.ACCEPTED && currentReviewStatus === DIRECTED_INVITE_REVIEW_STATUS.PENDING)) {
            return fail(res, '当前状态不可驳回', 400);
        }
        const userSnapshot = JSON.parse(JSON.stringify(users));
        const walletSnapshot = JSON.parse(JSON.stringify(walletAccounts));
        const inviteSnapshot = JSON.parse(JSON.stringify(invites));
        const walletLogSnapshot = JSON.parse(JSON.stringify(getCollection('wallet_logs')));
        const goodsFundLogSnapshot = JSON.parse(JSON.stringify(getCollection('goods_fund_logs')));
        const inviter = findUserByOpenid(users, invite.inviter_openid);
        const transferAmount = normalizeTransferAmount(invite.transfer_amount);
        const freezeStatus = normalizeDirectedInviteFreezeStatus(invite.freeze_status);
        const reviewedAt = nowIso();
        const transferNo = sanitizeTransferNo(invite.frozen_transfer_no || invite.transfer_txn_no || `DIRREL_${pickString(invite.invite_id || invite._id)}`);
        try {
            if (inviter && freezeStatus === DIRECTED_INVITE_FREEZE_STATUS.FROZEN && transferAmount > 0) {
                const inviterIndex = users.findIndex((item) => rowMatchesLookup(item, primaryId(inviter), [inviter.openid]));
                const inviterBefore = getUserGoodsFundBalance(inviter);
                const inviterFrozenBefore = getUserGoodsFundFrozenBalance(inviter);
                const inviterAfter = roundMoney(inviterBefore + transferAmount);
                const inviterFrozenAfter = roundMoney(Math.max(0, inviterFrozenBefore - transferAmount));
                users[inviterIndex] = {
                    ...users[inviterIndex],
                    agent_wallet_balance: inviterAfter,
                    wallet_balance: inviterAfter,
                    agent_wallet_frozen_amount: inviterFrozenAfter,
                    goods_fund_frozen_amount: inviterFrozenAfter,
                    updated_at: reviewedAt
                };
                const existingWalletAccount = findWalletAccount(walletAccounts, inviter);
                const walletResult = ensureWalletAccount(walletAccounts, users[inviterIndex]);
                const walletIndex = walletAccounts.findIndex((row) => rowMatchesLookup(row, walletResult.account._id || walletResult.account.id, [walletResult.account.user_id]));
                walletAccounts[walletIndex] = {
                    ...walletAccounts[walletIndex],
                    balance: inviterAfter,
                    frozen_balance: inviterFrozenAfter,
                    updated_at: reviewedAt
                };
                await appendWalletLogEntry({
                    openid: inviter.openid || '',
                    user_id: primaryId(inviter),
                    account_id: existingWalletAccount?.id || existingWalletAccount?._id || walletResult.account.id || walletResult.account._id || '',
                    type: 'directed_b1_unfreeze',
                    change_type: 'directed_b1_unfreeze',
                    amount: transferAmount,
                    balance_before: inviterBefore,
                    balance_after: inviterAfter,
                    transfer_no: transferNo,
                    ref_type: 'directed_invite',
                    ref_id: invite.invite_id || invite._id || '',
                    description: `B1定向邀约驳回，释放冻结货款 ${transferAmount} 元`
                });
                await appendGoodsFundLogEntry({
                    openid: inviter.openid || '',
                    user_id: primaryId(inviter),
                    type: 'directed_b1_unfreeze',
                    amount: transferAmount,
                    transfer_no: transferNo,
                    invite_id: invite.invite_id || invite._id || '',
                    description: `B1定向邀约驳回，释放冻结货款 ${transferAmount} 元`
                });
                saveCollection('users', users);
                saveCollection('wallet_accounts', walletAccounts);
            }
            invites[index] = {
                ...invite,
                status: DIRECTED_INVITE_STATUS.REJECTED,
                review_status: DIRECTED_INVITE_REVIEW_STATUS.REJECTED,
                reviewed_by: String(req.admin?.id || req.admin?.username || ''),
                reviewed_at: reviewedAt,
                review_reason: pickString(req.body?.reason),
                freeze_status: freezeStatus === DIRECTED_INVITE_FREEZE_STATUS.FROZEN ? DIRECTED_INVITE_FREEZE_STATUS.RELEASED : freezeStatus,
                lock_status: DIRECTED_INVITE_LOCK_STATUS.LOCKED,
                released_at: freezeStatus === DIRECTED_INVITE_FREEZE_STATUS.FROZEN ? reviewedAt : pickString(invite.released_at),
                release_reason: freezeStatus === DIRECTED_INVITE_FREEZE_STATUS.FROZEN ? 'rejected' : pickString(invite.release_reason),
                lock_reason: 'rejected',
                updated_at: reviewedAt
            };
            saveCollection('directed_invites', invites);
            await flush();
        } catch (error) {
            saveCollection('users', userSnapshot);
            saveCollection('wallet_accounts', walletSnapshot);
            saveCollection('directed_invites', inviteSnapshot);
            saveCollection('wallet_logs', walletLogSnapshot);
            saveCollection('goods_fund_logs', goodsFundLogSnapshot);
            return fail(res, `驳回失败：${error.message || '写入异常'}`, 500);
        }
        createAuditLog(req.admin, 'directed_invite.reject', 'directed_invites', {
            invite_id: invites[index].invite_id,
            review_reason: invites[index].review_reason
        });
        ok(res, normalizeInviteRow(invites[index], users, walletAccounts));
    });
}

module.exports = {
    registerDirectedInviteRoutes
};
