'use strict';

const {
    buildCanonicalUser,
    resolveRoleName,
    resolveGoodsFundBalance
} = require('./user-contract');
const {
    DIRECTED_INVITE_DEFAULT_EXPIRE_DAYS,
    DIRECTED_INVITE_FREEZE_STATUS,
    DIRECTED_INVITE_LOCK_STATUS,
    DIRECTED_INVITE_MAX_PENDING_PER_INVITER,
    DIRECTED_INVITE_REROUTE_REQUIRED_REVIEW_NOTE,
    DIRECTED_INVITE_REVIEW_STATUS,
    DIRECTED_INVITE_STATUS,
    DIRECTED_INVITE_TARGET_ROLE_LEVEL,
    addDaysIso,
    buildDirectedInvitePath,
    buildDirectedInviteTypeText,
    buildInviteStatusText,
    ensureDirectedInviteTransferAmount,
    generateDirectedInviteId,
    generateDirectedInviteTicket,
    hasBoundParent,
    isDirectedInviteInitiator,
    isDirectedInvitePendingStatus,
    isDirectedInviteTargetEligible,
    isVip0,
    normalizeDirectedInviteFreezeStatus,
    normalizeDirectedInviteLockStatus,
    normalizeDirectedInviteReviewStatus,
    normalizeDirectedInviteStatus,
    normalizeRoleLevel,
    normalizeTransferAmount,
    pickString,
    roundMoney,
    toNumber
} = require('./shared/directed-invite');

function nowIso() {
    return new Date().toISOString();
}

async function withDbTransaction(db, work) {
    if (db && typeof db.runTransaction === 'function') {
        return db.runTransaction(work);
    }
    return work(db);
}

const DIRECTED_INVITE_PAID_ORDER_STATUSES = new Set([
    'paid',
    'pending_group',
    'pickup_pending',
    'agent_confirmed',
    'shipping_requested',
    'shipped',
    'completed'
]);

function hasIdentityValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function uniqueIdentityValues(values = []) {
    const seen = new Set();
    const list = [];
    values.forEach((value) => {
        if (!hasIdentityValue(value)) return;
        const key = `${typeof value}:${String(value)}`;
        if (seen.has(key)) return;
        seen.add(key);
        list.push(value);
    });
    return list;
}

function buildUserIdentityCandidates(user = {}) {
    const values = [user._id, user.id, user._legacy_id, user.openid];
    return uniqueIdentityValues(values);
}

async function findFirstByWheres(db, collectionName, wheres = []) {
    for (const where of wheres) {
        const result = await db.collection(collectionName)
            .where(where)
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (result.data && result.data[0]) return result.data[0];
    }
    return null;
}

async function listByWheres(db, collectionName, wheres = [], limit = 20) {
    const rows = [];
    const seen = new Set();
    for (const where of wheres) {
        const result = await db.collection(collectionName)
            .where(where)
            .limit(limit)
            .get()
            .catch(() => ({ data: [] }));
        (result.data || []).forEach((row) => {
            const rowId = String(row._id || row.id || row.invite_id || row.order_no || JSON.stringify(where));
            if (seen.has(rowId)) return;
            seen.add(rowId);
            rows.push(row);
        });
    }
    return rows;
}

async function hasAnyByWheres(db, collectionName, wheres = []) {
    for (const where of wheres) {
        const result = await db.collection(collectionName)
            .where(where)
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (result.data && result.data.length > 0) return true;
    }
    return false;
}

async function findUserByAnyId(db, value) {
    const normalized = pickString(value);
    if (!normalized) return null;
    const docRes = await db.collection('users').doc(normalized).get().catch(() => ({ data: null }));
    if (docRes.data) return docRes.data;
    return findFirstByWheres(db, 'users', [
        { openid: normalized },
        { _legacy_id: normalized },
        { id: normalized }
    ]);
}

function buildInviteRerouteMeta(invite = {}) {
    return {
        reroute: !!invite.reroute,
        rerouteFromParentId: invite.reroute_from_parent_id ?? null,
        rerouteFromParentOpenid: pickString(invite.reroute_from_parent_openid),
        rerouteFromReferrerOpenid: pickString(invite.reroute_from_referrer_openid),
        rerouteFromParentSnapshot: invite.reroute_from_parent_snapshot || null,
        rerouteRequiredReviewNote: pickString(invite.reroute_required_review_note),
        rerouteRecalculateHistory: invite.reroute ? false : !!invite.reroute_recalculate_history
    };
}

function isTestOrder(order = {}) {
    if (order.is_test === true || order.test_mode === true || order.mock_pay === true || order.sandbox === true) {
        return true;
    }
    const tags = [
        order.order_type,
        order.biz_type,
        order.source,
        order.scene,
        order.order_no
    ].map((value) => pickString(value).toLowerCase());
    return tags.some((value) => value.startsWith('test') || value.includes('mock') || value.includes('sandbox'));
}

function isPaidBusinessOrder(order = {}) {
    const status = pickString(order.status || order.payment_status).toLowerCase();
    return DIRECTED_INVITE_PAID_ORDER_STATUSES.has(status) && !isTestOrder(order);
}

async function hasDownlineMembers(db, user = {}) {
    const ids = buildUserIdentityCandidates(user);
    const wheres = [];
    if (pickString(user.openid)) wheres.push({ referrer_openid: pickString(user.openid) });
    ids.forEach((id) => wheres.push({ parent_id: id }));
    return hasAnyByWheres(db, 'users', wheres);
}

async function hasNonTestPaidOrders(db, user = {}) {
    const rows = await listByWheres(db, 'orders', [
        { openid: pickString(user.openid) },
        ...buildUserIdentityCandidates(user).map((id) => ({ user_id: id }))
    ], 100);
    return rows.some((row) => isPaidBusinessOrder(row));
}

async function hasCommissionRecords(db, user = {}) {
    return hasAnyByWheres(db, 'commissions', [
        { openid: pickString(user.openid) },
        ...buildUserIdentityCandidates(user).map((id) => ({ user_id: id }))
    ]);
}

async function hasWithdrawalRecords(db, user = {}) {
    return hasAnyByWheres(db, 'withdrawals', [
        { openid: pickString(user.openid) },
        ...buildUserIdentityCandidates(user).map((id) => ({ user_id: id }))
    ]);
}

async function hasWalletFlowRecords(db, user = {}) {
    const wheres = [
        { openid: pickString(user.openid) },
        ...buildUserIdentityCandidates(user).map((id) => ({ user_id: id }))
    ];
    const [walletLogHit, goodsFundLogHit] = await Promise.all([
        hasAnyByWheres(db, 'wallet_logs', wheres),
        hasAnyByWheres(db, 'goods_fund_logs', wheres)
    ]);
    return walletLogHit || goodsFundLogHit;
}

async function hasPendingDirectedInviteRecords(db, user = {}) {
    const wheres = [];
    if (pickString(user.openid)) {
        wheres.push({ inviter_openid: pickString(user.openid) });
        wheres.push({ accepted_openid: pickString(user.openid) });
    }
    const rows = await listByWheres(db, 'directed_invites', wheres, 50);
    return rows.some((row) => {
        const status = normalizeDirectedInviteStatus(row.status);
        if (status === DIRECTED_INVITE_STATUS.ACCEPTED) return true;
        return status === DIRECTED_INVITE_STATUS.SENT && !isExpired(row);
    });
}

async function resolveUserParentSnapshot(db, user = {}) {
    const parent = await findUserByAnyId(db, user.parent_id)
        || await findUserByOpenid(db, user.parent_openid)
        || await findUserByOpenid(db, user.referrer_openid);
    return parent ? normalizeUserSnapshot(parent) : null;
}

async function assessDirectedInviteAcceptance(db, user = {}) {
    const base = {
        canAccept: false,
        canReroute: false,
        reroute: false,
        acceptHint: '',
        rerouteHint: '',
        rerouteRequiredReviewNote: '',
        rerouteFromParentId: user.parent_id ?? null,
        rerouteFromParentOpenid: pickString(user.parent_openid),
        rerouteFromReferrerOpenid: pickString(user.referrer_openid),
        rerouteFromParentSnapshot: null
    };

    if (!user || typeof user !== 'object') {
        return {
            ...base,
            acceptHint: '请先登录后再接受定向邀约'
        };
    }

    if (!hasBoundParent(user)) {
        if (!isDirectedInviteTargetEligible(user)) {
            return {
                ...base,
                acceptHint: '当前账号已是 B1 或更高身份'
            };
        }
        return {
            ...base,
            canAccept: true,
            acceptHint: '接受后将进入待审核，审核通过后正式激活为 B1'
        };
    }

    if (!isVip0(user)) {
        return {
            ...base,
            acceptHint: '当前账号已绑定其他团队，且仅 VIP0 可申请严格改线',
            rerouteHint: '仅 role_level=0 的已绑线 VIP0 才可走严格改线审核'
        };
    }

    const [
        rerouteFromParentSnapshot,
        downlineHit,
        paidOrderHit,
        commissionHit,
        withdrawalHit,
        walletFlowHit,
        pendingInviteHit
    ] = await Promise.all([
        resolveUserParentSnapshot(db, user),
        hasDownlineMembers(db, user),
        hasNonTestPaidOrders(db, user),
        hasCommissionRecords(db, user),
        hasWithdrawalRecords(db, user),
        hasWalletFlowRecords(db, user),
        hasPendingDirectedInviteRecords(db, user)
    ]);

    const blockers = [];
    if (downlineHit) blockers.push('存在下级成员');
    if (paidOrderHit) blockers.push('存在非测试已支付订单');
    if (commissionHit) blockers.push('存在佣金记录');
    if (withdrawalHit) blockers.push('存在提现记录');
    if (walletFlowHit) blockers.push('存在货款或钱包流水');
    if (pendingInviteHit) blockers.push('存在进行中的定向邀约');

    if (blockers.length > 0) {
        const reason = `当前账号已绑定其他团队，不满足严格改线条件：${blockers.join('、')}`;
        return {
            ...base,
            acceptHint: reason,
            rerouteHint: reason,
            rerouteFromParentSnapshot
        };
    }

    return {
        ...base,
        canAccept: true,
        canReroute: true,
        reroute: true,
        acceptHint: '接受后将进入待审核；审核通过后覆盖 parent/referrer，不回算历史数据',
        rerouteHint: '当前账号已绑定其他团队，但满足 VIP0 严格改线条件，可提交审核',
        rerouteRequiredReviewNote: DIRECTED_INVITE_REROUTE_REQUIRED_REVIEW_NOTE,
        rerouteFromParentSnapshot
    };
}

function isExpired(invite = {}) {
    const expireAt = invite.ticket_expire_at ? new Date(invite.ticket_expire_at).getTime() : 0;
    return !!expireAt && expireAt <= Date.now();
}

function normalizeUserSnapshot(user = {}) {
    const canonical = buildCanonicalUser(user);
    return {
        user_id: canonical.id,
        openid: canonical.openid,
        nickname: canonical.nickname,
        avatar_url: canonical.avatar_url,
        role_level: normalizeRoleLevel(canonical),
        role_name: resolveRoleName(canonical),
        invite_code: canonical.invite_code,
        goods_fund_balance: roundMoney(resolveGoodsFundBalance(canonical))
    };
}

function getUserGoodsFundFrozenBalance(user = {}) {
    return roundMoney(toNumber(user.agent_wallet_frozen_amount ?? user.goods_fund_frozen_amount, 0));
}

function buildUserGoodsFundPatch(user = {}, { balance, frozen, now }) {
    const nextBalance = roundMoney(balance);
    const nextFrozen = roundMoney(frozen);
    return {
        ...user,
        agent_wallet_balance: nextBalance,
        wallet_balance: nextBalance,
        agent_wallet_frozen_amount: nextFrozen,
        goods_fund_frozen_amount: nextFrozen,
        updated_at: now
    };
}

async function findWalletAccountByUser(db, user = {}) {
    const candidates = [user._id, user.id, user._legacy_id, user.openid]
        .filter((value) => value !== null && value !== undefined && value !== '');
    for (const candidate of candidates) {
        const response = await db.collection('wallet_accounts')
            .where({ user_id: candidate })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (response.data && response.data[0]) return response.data[0];
    }
    if (user.openid) {
        const response = await db.collection('wallet_accounts')
            .where({ openid: user.openid })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (response.data && response.data[0]) return response.data[0];
    }
    return null;
}

function buildWalletAccountDocId(user = {}) {
    const primary = user._id || user.id || user._legacy_id || user.openid || '';
    return primary ? `wallet-${String(primary).replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
}

function buildWalletAccountDoc(user = {}, walletAccount = null, { balance, frozen, now }) {
    const accountId = String(walletAccount?._id || walletAccount?.id || buildWalletAccountDocId(user));
    return {
        _id: accountId,
        id: accountId,
        user_id: walletAccount?.user_id || user._id || user.id || user._legacy_id || user.openid || '',
        openid: walletAccount?.openid || pickString(user.openid),
        account_type: walletAccount?.account_type || 'goods_fund',
        status: walletAccount?.status || 'active',
        balance: roundMoney(balance),
        frozen_balance: roundMoney(frozen),
        created_at: walletAccount?.created_at || now,
        updated_at: now
    };
}

async function saveWalletAccount(db, user = {}, walletAccount = null, state = {}) {
    const doc = buildWalletAccountDoc(user, walletAccount, state);
    const cloudData = { ...doc };
    delete cloudData._id;
    await db.collection('wallet_accounts').doc(String(doc._id)).set({
        data: cloudData
    });
    return doc;
}

async function appendDirectedInviteGoodsFundLogs(db, payload = {}) {
    const {
        openid,
        userId,
        transferNo,
        inviteId,
        amount,
        balanceBefore,
        balanceAfter,
        walletType,
        goodsFundType,
        description,
        now
    } = payload;

    await db.collection('wallet_logs').add({
        data: {
            openid,
            user_id: userId,
            type: walletType,
            change_type: walletType,
            amount,
            balance_before: roundMoney(balanceBefore),
            balance_after: roundMoney(balanceAfter),
            transfer_no: transferNo,
            ref_type: 'directed_invite',
            ref_id: inviteId,
            description,
            created_at: now
        }
    });

    await db.collection('goods_fund_logs').add({
        data: {
            openid,
            user_id: userId,
            type: goodsFundType,
            amount,
            transfer_no: transferNo,
            invite_id: inviteId,
            description,
            created_at: now
        }
    });
}

async function releaseInviteFrozenFunds(db, invite = {}, reason = 'manual_release') {
    const freezeStatus = normalizeDirectedInviteFreezeStatus(invite.freeze_status);
    const frozenAmount = normalizeTransferAmount(invite.frozen_amount || invite.transfer_amount);
    if (freezeStatus !== DIRECTED_INVITE_FREEZE_STATUS.FROZEN || frozenAmount <= 0) {
        return invite;
    }

    const inviter = await findUserByOpenid(db, invite.inviter_openid);
    if (!inviter) {
        return {
            ...invite,
            freeze_status: DIRECTED_INVITE_FREEZE_STATUS.RELEASED,
            lock_status: DIRECTED_INVITE_LOCK_STATUS.LOCKED,
            released_at: nowIso(),
            release_reason: reason,
            lock_reason: reason,
            updated_at: nowIso()
        };
    }

    const now = nowIso();
    const beforeBalance = roundMoney(resolveGoodsFundBalance(inviter));
    const beforeFrozen = getUserGoodsFundFrozenBalance(inviter);
    const nextBalance = roundMoney(beforeBalance + frozenAmount);
    const nextFrozen = roundMoney(Math.max(0, beforeFrozen - frozenAmount));
    const nextUser = buildUserGoodsFundPatch(inviter, {
        balance: nextBalance,
        frozen: nextFrozen,
        now
    });
    await db.collection('users').doc(String(inviter._id || inviter.id)).update({
        data: {
            agent_wallet_balance: db.command.inc(frozenAmount),
            wallet_balance: db.command.inc(frozenAmount),
            agent_wallet_frozen_amount: db.command.inc(-frozenAmount),
            goods_fund_frozen_amount: db.command.inc(-frozenAmount),
            updated_at: now
        }
    }).catch((err) => {
        console.error('[directed-invite] 释放冻结货款更新用户余额失败:', err.message || err);
        return null;
    });

    const walletAccount = await findWalletAccountByUser(db, inviter);
    if (walletAccount) {
        await db.collection('wallet_accounts').doc(String(walletAccount._id || walletAccount.id)).update({
            data: {
                balance: db.command.inc(frozenAmount),
                frozen_balance: db.command.inc(-frozenAmount),
                updated_at: now
            }
        }).catch((err) => { console.error('[directed-invite] 释放冻结货款更新钱包账户失败:', err.message || err); });
    } else {
        await saveWalletAccount(db, nextUser, null, {
            balance: nextBalance,
            frozen: nextFrozen,
            now
        });
    }

    const transferNo = pickString(invite.frozen_transfer_no || invite.transfer_txn_no || `DIRREL_${pickString(invite.invite_id || invite._id)}`);
    await appendDirectedInviteGoodsFundLogs(db, {
        openid: pickString(inviter.openid),
        userId: inviter._id || inviter.id || inviter._legacy_id || inviter.openid,
        transferNo,
        inviteId: pickString(invite.invite_id || invite._id),
        amount: frozenAmount,
        balanceBefore: beforeBalance,
        balanceAfter: nextBalance,
        walletType: 'directed_b1_unfreeze',
        goodsFundType: 'directed_b1_unfreeze',
        description: `B1定向邀约释放冻结货款 ${frozenAmount} 元`,
        now
    });

    return {
        ...invite,
        inviter_snapshot: normalizeUserSnapshot(nextUser),
        freeze_status: DIRECTED_INVITE_FREEZE_STATUS.RELEASED,
        lock_status: DIRECTED_INVITE_LOCK_STATUS.LOCKED,
        released_at: now,
        release_reason: reason,
        lock_reason: reason,
        updated_at: now
    };
}

function normalizeInviteView(invite = {}, currentOpenid = '') {
    const rerouteMeta = buildInviteRerouteMeta(invite);
    const status = normalizeDirectedInviteStatus(invite.status);
    const reviewStatus = normalizeDirectedInviteReviewStatus(invite.review_status);
    const freezeStatus = normalizeDirectedInviteFreezeStatus(invite.freeze_status);
    const expired = status === DIRECTED_INVITE_STATUS.SENT && isExpired(invite);
    const displayStatus = expired ? DIRECTED_INVITE_STATUS.EXPIRED : status;
    const persistedLockStatus = normalizeDirectedInviteLockStatus(invite.lock_status);
    const lockStatus = persistedLockStatus || (displayStatus === DIRECTED_INVITE_STATUS.SENT ? DIRECTED_INVITE_LOCK_STATUS.UNLOCKED : DIRECTED_INVITE_LOCK_STATUS.LOCKED);
    const lockReason = pickString(invite.lock_reason || (expired ? 'expired' : (lockStatus === DIRECTED_INVITE_LOCK_STATUS.LOCKED ? displayStatus : '')));
    const inviter = invite.inviter_snapshot || {};
    const acceptedUser = invite.accepted_user_snapshot || {};
    const isInviter = currentOpenid && currentOpenid === invite.inviter_openid;
    const isAcceptedUser = currentOpenid && currentOpenid === invite.accepted_openid;
    const ticketUsable = displayStatus === DIRECTED_INVITE_STATUS.SENT && lockStatus === DIRECTED_INVITE_LOCK_STATUS.UNLOCKED;
    return {
        ...invite,
        invite_id: pickString(invite.invite_id || invite._id || invite.id),
        invite_type: invite.invite_type || 'directed_b1',
        target_role_level: toNumber(invite.target_role_level, DIRECTED_INVITE_TARGET_ROLE_LEVEL),
        transfer_amount: normalizeTransferAmount(invite.transfer_amount),
        frozen_amount: normalizeTransferAmount(invite.frozen_amount || 0),
        freeze_status: freezeStatus,
        lock_status: lockStatus,
        lock_reason: lockReason,
        lock_status_text: lockStatus === DIRECTED_INVITE_LOCK_STATUS.LOCKED ? '已锁定' : '可用',
        status: displayStatus,
        review_status: reviewStatus,
        status_text: buildInviteStatusText(displayStatus, reviewStatus),
        type_text: buildDirectedInviteTypeText(),
        invite_path: buildDirectedInvitePath(invite.ticket_id),
        ticket_expired: expired,
        ticket_usable: ticketUsable,
        inviter,
        accepted_user: acceptedUser,
        reroute: rerouteMeta.reroute,
        can_reroute: rerouteMeta.reroute,
        reroute_hint: '',
        reroute_required_review_note: rerouteMeta.rerouteRequiredReviewNote,
        reroute_from_parent_id: rerouteMeta.rerouteFromParentId,
        reroute_from_parent_openid: rerouteMeta.rerouteFromParentOpenid,
        reroute_from_referrer_openid: rerouteMeta.rerouteFromReferrerOpenid,
        reroute_from_parent_snapshot: rerouteMeta.rerouteFromParentSnapshot,
        reroute_recalculate_history: rerouteMeta.rerouteRecalculateHistory,
        can_accept: ticketUsable && !isInviter,
        accept_hint: '',
        can_revoke: ticketUsable && isInviter,
        can_share: ticketUsable && isInviter,
        can_preview: ticketUsable && isInviter,
        is_inviter: !!isInviter,
        is_accepted_user: !!isAcceptedUser
    };
}

async function findUserByOpenid(db, openid = '') {
    const normalizedOpenid = pickString(openid);
    if (!normalizedOpenid) return null;
    const res = await db.collection('users').where({ openid: normalizedOpenid }).limit(1).get().catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function listAcceptedPendingInvitesByOpenid(db, openid = '') {
    const normalizedOpenid = pickString(openid);
    if (!normalizedOpenid) return [];
    const res = await db.collection('directed_invites')
        .where({
            accepted_openid: normalizedOpenid,
            status: DIRECTED_INVITE_STATUS.ACCEPTED
        })
        .limit(20)
        .get()
        .catch(() => ({ data: [] }));
    return res.data || [];
}

async function countPendingInvitesByInviter(db, inviterOpenid = '') {
    const normalizedOpenid = pickString(inviterOpenid);
    if (!normalizedOpenid) return 0;
    const res = await db.collection('directed_invites')
        .where({
            inviter_openid: normalizedOpenid
        })
        .limit(100)
        .get()
        .catch(() => ({ data: [] }));
    return (res.data || []).filter((item) => {
        const status = normalizeDirectedInviteStatus(item.status);
        if (![DIRECTED_INVITE_STATUS.SENT, DIRECTED_INVITE_STATUS.ACCEPTED].includes(status)) return false;
        if (status === DIRECTED_INVITE_STATUS.ACCEPTED) return true;
        return !isExpired(item);
    }).length;
}

async function findInviteByTicket(db, ticketId = '') {
    const normalizedTicket = pickString(ticketId);
    if (!normalizedTicket) return null;
    const res = await db.collection('directed_invites')
        .where({ ticket_id: normalizedTicket })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function findInviteById(db, inviteId = '') {
    const normalizedId = pickString(inviteId);
    if (!normalizedId) return null;
    const docRes = await db.collection('directed_invites').doc(normalizedId).get().catch(() => ({ data: null }));
    if (docRes.data) return docRes.data;
    const res = await db.collection('directed_invites')
        .where({ invite_id: normalizedId })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function createDirectedInvite(db, _, openid, params = {}) {
    return withDbTransaction(db, async (conn) => {
        const inviter = await findUserByOpenid(conn, openid);
        if (!inviter) throw new Error('邀请人不存在');
        if (!isDirectedInviteInitiator(inviter)) throw new Error('仅 B2、B3 或店主可发起 B1 定向邀约');

        const transferCheck = ensureDirectedInviteTransferAmount(params.transfer_amount);
        if (!transferCheck.ok) throw new Error(transferCheck.message);

        const pendingCount = await countPendingInvitesByInviter(conn, openid);
        if (pendingCount >= DIRECTED_INVITE_MAX_PENDING_PER_INVITER) {
            throw new Error(`进行中的定向邀约最多 ${DIRECTED_INVITE_MAX_PENDING_PER_INVITER} 条`);
        }

        const inviterBalance = roundMoney(resolveGoodsFundBalance(inviter));
        if (inviterBalance < transferCheck.amount) {
            throw new Error('当前货款余额不足，不能发起定向邀约');
        }

        const inviteId = generateDirectedInviteId();
        const ticketId = generateDirectedInviteTicket();
        const createdAt = nowIso();
        const transferNo = `DIRFRZ_${pickString(inviteId)}`;
        const inviterFrozenBefore = getUserGoodsFundFrozenBalance(inviter);
        const inviterBalanceAfter = roundMoney(inviterBalance - transferCheck.amount);
        const inviterFrozenAfter = roundMoney(inviterFrozenBefore + transferCheck.amount);
        const nextInviter = buildUserGoodsFundPatch(inviter, {
            balance: inviterBalanceAfter,
            frozen: inviterFrozenAfter,
            now: createdAt
        });

        await conn.collection('users').doc(String(inviter._id || inviter.id)).update({
            data: {
                agent_wallet_balance: conn.command.inc(-transferCheck.amount),
                wallet_balance: conn.command.inc(-transferCheck.amount),
                agent_wallet_frozen_amount: conn.command.inc(transferCheck.amount),
                goods_fund_frozen_amount: conn.command.inc(transferCheck.amount),
                updated_at: createdAt
            }
        });

        const inviterWallet = await findWalletAccountByUser(conn, inviter);
        if (inviterWallet) {
            await conn.collection('wallet_accounts').doc(String(inviterWallet._id || inviterWallet.id)).update({
                data: {
                    balance: conn.command.inc(-transferCheck.amount),
                    frozen_balance: conn.command.inc(transferCheck.amount),
                    updated_at: createdAt
                }
            });
        } else {
            await saveWalletAccount(conn, nextInviter, null, {
                balance: inviterBalanceAfter,
                frozen: inviterFrozenAfter,
                now: createdAt
            });
        }

        const inviteDoc = {
            invite_id: inviteId,
            invite_type: 'directed_b1',
            target_role_level: DIRECTED_INVITE_TARGET_ROLE_LEVEL,
            inviter_openid: openid,
            inviter_user_id: inviter._id || inviter.id || inviter._legacy_id || openid,
            inviter_role_level: normalizeRoleLevel(inviter),
            inviter_snapshot: normalizeUserSnapshot(nextInviter),
            transfer_amount: transferCheck.amount,
            frozen_amount: transferCheck.amount,
            freeze_status: DIRECTED_INVITE_FREEZE_STATUS.FROZEN,
            lock_status: DIRECTED_INVITE_LOCK_STATUS.UNLOCKED,
            lock_reason: '',
            frozen_at: createdAt,
            frozen_transfer_no: transferNo,
            released_at: '',
            release_reason: '',
            status: DIRECTED_INVITE_STATUS.SENT,
            review_status: DIRECTED_INVITE_REVIEW_STATUS.NONE,
            ticket_id: ticketId,
            ticket_expire_at: addDaysIso(DIRECTED_INVITE_DEFAULT_EXPIRE_DAYS),
            accepted_openid: '',
            accepted_user_id: '',
            accepted_at: '',
            accepted_user_snapshot: null,
            reviewed_by: '',
            reviewed_at: '',
            review_reason: '',
            transfer_txn_no: '',
            transfer_at: '',
            activated_at: '',
            line_locked: true,
            created_at: createdAt,
            updated_at: createdAt
        };

        await conn.collection('directed_invites').doc(inviteId).set({ data: inviteDoc });
        await appendDirectedInviteGoodsFundLogs(conn, {
            openid,
            userId: inviter._id || inviter.id || inviter._legacy_id || openid,
            transferNo,
            inviteId,
            amount: -transferCheck.amount,
            balanceBefore: inviterBalance,
            balanceAfter: inviterBalanceAfter,
            walletType: 'directed_b1_freeze',
            goodsFundType: 'directed_b1_freeze',
            description: `B1定向邀约冻结货款 ${transferCheck.amount} 元`,
            now: createdAt
        });

        return normalizeInviteView({
            ...inviteDoc,
            _id: inviteId
        }, openid);
    });
}

async function listDirectedInvites(db, openid, params = {}) {
    const inviter = await findUserByOpenid(db, openid);
    if (!inviter) throw new Error('用户不存在');
    if (!isDirectedInviteInitiator(inviter)) throw new Error('仅 B2、B3 或店主可查看定向邀约');
    const res = await db.collection('directed_invites')
        .where({ inviter_openid: openid })
        .orderBy('created_at', 'desc')
        .limit(100)
        .get()
        .catch(() => ({ data: [] }));
    const statusFilter = pickString(params.status);
    const reviewFilter = pickString(params.review_status);
    return (res.data || [])
        .map((item) => normalizeInviteView(item, openid))
        .filter((item) => !statusFilter || item.status === statusFilter)
        .filter((item) => !reviewFilter || item.review_status === reviewFilter);
}

async function getDirectedInviteTicket(db, openid, params = {}) {
    const ticketId = params.ticket || params.ticket_id;
    let invite = await findInviteByTicket(db, ticketId);
    if (!invite) throw new Error('定向邀约不存在');
    if (normalizeDirectedInviteStatus(invite.status) === DIRECTED_INVITE_STATUS.SENT && isExpired(invite)) {
        invite = await releaseInviteFrozenFunds(db, {
            ...invite,
            status: DIRECTED_INVITE_STATUS.EXPIRED
        }, 'expired');
        await db.collection('directed_invites').doc(String(invite._id || invite.invite_id)).update({
            data: {
                status: DIRECTED_INVITE_STATUS.EXPIRED,
                freeze_status: invite.freeze_status,
                lock_status: DIRECTED_INVITE_LOCK_STATUS.LOCKED,
                released_at: invite.released_at || nowIso(),
                release_reason: invite.release_reason || 'expired',
                lock_reason: invite.lock_reason || 'expired',
                updated_at: invite.updated_at || nowIso()
            }
        }).catch(() => null);
    }
    const view = normalizeInviteView(invite, openid);
    if (view.ticket_expired) {
        view.accept_hint = '该定向邀约已失效';
        return view;
    }
    if (view.is_inviter) {
        view.can_accept = false;
        view.accept_hint = view.can_share
            ? '你是发起人，可直接分享该定向邀约'
            : `该定向邀约当前状态为${view.status_text}${view.lock_status === DIRECTED_INVITE_LOCK_STATUS.LOCKED ? '，已锁定不可再分享' : ''}`;
        return view;
    }
    if (view.status === DIRECTED_INVITE_STATUS.ACCEPTED) {
        if (pickString(view.accepted_openid) === pickString(openid)) {
            view.can_accept = false;
            view.accept_hint = '你已接受该定向邀约，正在等待后台审核';
            if (view.reroute) {
                view.can_reroute = true;
                view.reroute_hint = '严格改线申请已提交，等待后台审核';
            }
        } else {
            view.can_accept = false;
            view.accept_hint = '该定向邀约已被其他用户接受';
        }
        return view;
    }
    if (view.status !== DIRECTED_INVITE_STATUS.SENT) {
        view.can_accept = false;
        view.accept_hint = `该定向邀约当前状态为${view.status_text}`;
        return view;
    }

    const user = await findUserByOpenid(db, openid);
    if (!user) {
        view.can_accept = false;
        view.accept_hint = '请先登录后再接受定向邀约';
        return view;
    }
    const acceptance = await assessDirectedInviteAcceptance(db, user);
    const existingAccepted = await listAcceptedPendingInvitesByOpenid(db, openid);
    if (!acceptance.canReroute && existingAccepted.length > 0) {
        view.can_accept = false;
        view.accept_hint = '你已有待审核的定向邀约，请先完成处理';
        return view;
    }
    view.can_accept = acceptance.canAccept;
    view.can_reroute = acceptance.canReroute;
    view.reroute = acceptance.reroute;
    view.reroute_hint = acceptance.rerouteHint;
    view.reroute_required_review_note = acceptance.rerouteRequiredReviewNote;
    view.reroute_from_parent_id = acceptance.rerouteFromParentId;
    view.reroute_from_parent_openid = acceptance.rerouteFromParentOpenid;
    view.reroute_from_referrer_openid = acceptance.rerouteFromReferrerOpenid;
    view.reroute_from_parent_snapshot = acceptance.rerouteFromParentSnapshot;
    view.reroute_recalculate_history = acceptance.reroute ? false : view.reroute_recalculate_history;
    view.accept_hint = acceptance.acceptHint;
    return view;
}

async function acceptDirectedInvite(db, _, openid, params = {}) {
    const ticketId = params.ticket || params.ticket_id;
    const ticket = pickString(ticketId);
    if (!ticket) throw new Error('缺少邀约票据');

    return withDbTransaction(db, async (conn) => {
        const inviteRes = await conn.collection('directed_invites')
            .where({ ticket_id: ticket })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        const invite = inviteRes.data && inviteRes.data[0] ? inviteRes.data[0] : null;
        if (!invite) throw new Error('定向邀约不存在');
        if (normalizeDirectedInviteStatus(invite.status) !== DIRECTED_INVITE_STATUS.SENT) {
            return normalizeInviteView(invite, openid);
        }
        if (isExpired(invite)) throw new Error('定向邀约已失效');
        if (pickString(invite.inviter_openid) === pickString(openid)) {
            throw new Error('不能接受自己发起的定向邀约');
        }

        const user = await findUserByOpenid(conn, openid);
        if (!user) throw new Error('用户不存在，请先完成登录');
        const acceptance = await assessDirectedInviteAcceptance(conn, user);
        if (!acceptance.canAccept) {
            throw new Error(acceptance.acceptHint || '当前账号不满足 B1 定向邀约接受条件');
        }

        const existingAccepted = await listAcceptedPendingInvitesByOpenid(conn, openid);
        if (!acceptance.canReroute && existingAccepted.length > 0) {
            throw new Error('你已有待审核的定向邀约，请先完成处理');
        }

        const acceptedAt = nowIso();
        const acceptedUserSnapshot = normalizeUserSnapshot(user);
        const reroutePatch = acceptance.reroute ? {
            reroute: true,
            reroute_from_parent_id: acceptance.rerouteFromParentId,
            reroute_from_parent_openid: acceptance.rerouteFromParentOpenid,
            reroute_from_referrer_openid: acceptance.rerouteFromReferrerOpenid,
            reroute_from_parent_snapshot: acceptance.rerouteFromParentSnapshot,
            reroute_required_review_note: acceptance.rerouteRequiredReviewNote,
            reroute_recalculate_history: false,
            reroute_requested_at: acceptedAt
        } : {
            reroute: false,
            reroute_from_parent_id: null,
            reroute_from_parent_openid: '',
            reroute_from_referrer_openid: '',
            reroute_from_parent_snapshot: null,
            reroute_required_review_note: '',
            reroute_recalculate_history: false,
            reroute_requested_at: ''
        };
        await conn.collection('directed_invites').doc(String(invite._id || invite.invite_id)).update({
            data: {
                status: DIRECTED_INVITE_STATUS.ACCEPTED,
                review_status: DIRECTED_INVITE_REVIEW_STATUS.PENDING,
                lock_status: DIRECTED_INVITE_LOCK_STATUS.LOCKED,
                lock_reason: 'accepted',
                accepted_openid: openid,
                accepted_user_id: user._id || user.id || user._legacy_id || openid,
                accepted_at: acceptedAt,
                accepted_user_snapshot: acceptedUserSnapshot,
                ...reroutePatch,
                updated_at: acceptedAt
            }
        });

        return normalizeInviteView({
            ...invite,
            status: DIRECTED_INVITE_STATUS.ACCEPTED,
            review_status: DIRECTED_INVITE_REVIEW_STATUS.PENDING,
            lock_status: DIRECTED_INVITE_LOCK_STATUS.LOCKED,
            lock_reason: 'accepted',
            accepted_openid: openid,
            accepted_user_id: user._id || user.id || user._legacy_id || openid,
            accepted_at: acceptedAt,
            accepted_user_snapshot: acceptedUserSnapshot,
            ...reroutePatch,
            updated_at: acceptedAt
        }, openid);
    });
}

async function revokeDirectedInvite(db, openid, params = {}) {
    const inviteId = params.invite_id || params.id;
    const invite = await findInviteById(db, inviteId);
    if (!invite) throw new Error('定向邀约不存在');
    if (pickString(invite.inviter_openid) !== pickString(openid)) throw new Error('无权撤销该定向邀约');
    if (isExpired(invite)) throw new Error('该定向邀约已失效，无需撤销');
    if (normalizeDirectedInviteStatus(invite.status) !== DIRECTED_INVITE_STATUS.SENT) {
        throw new Error('当前状态不可撤销');
    }
    const releasedInvite = await releaseInviteFrozenFunds(db, invite, 'revoked');
    const updatedAt = nowIso();
    await db.collection('directed_invites').doc(String(invite._id || invite.invite_id)).update({
        data: {
            status: DIRECTED_INVITE_STATUS.REVOKED,
            freeze_status: releasedInvite.freeze_status,
            lock_status: DIRECTED_INVITE_LOCK_STATUS.LOCKED,
            released_at: releasedInvite.released_at || updatedAt,
            release_reason: releasedInvite.release_reason || 'revoked',
            lock_reason: releasedInvite.lock_reason || 'revoked',
            updated_at: updatedAt
        }
    });
    return normalizeInviteView({
        ...releasedInvite,
        status: DIRECTED_INVITE_STATUS.REVOKED,
        updated_at: updatedAt
    }, openid);
}

module.exports = {
    acceptDirectedInvite,
    createDirectedInvite,
    getDirectedInviteTicket,
    listDirectedInvites,
    normalizeInviteView,
    revokeDirectedInvite
};
