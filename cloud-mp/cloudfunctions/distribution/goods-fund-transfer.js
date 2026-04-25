'use strict';

const {
    GOODS_FUND_TRANSFER_STATUS,
    pickString,
    toNumber,
    roundMoney,
    normalizeGoodsFundTransferStatus,
    buildGoodsFundTransferStatusText,
    ensureGoodsFundTransferAmount,
    buildGoodsFundTransferNo,
    buildRelationSourceText
} = require('./shared/goods-fund-transfer');

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function uniqueValues(values = []) {
    const seen = {};
    const list = [];
    values.forEach((value) => {
        if (!hasValue(value)) return;
        const key = `${typeof value}:${String(value)}`;
        if (seen[key]) return;
        seen[key] = true;
        list.push(value);
    });
    return list;
}

function nowIso() {
    return new Date().toISOString();
}

function userRelationIds(user = {}) {
    const ids = [user.id, user._legacy_id, user._id].filter(hasValue);
    const out = [];
    ids.forEach((id) => {
        out.push(id);
        const num = Number(id);
        if (Number.isFinite(num)) out.push(num);
        out.push(String(id));
    });
    return [...new Set(out.map((item) => `${typeof item}:${item}`))].map((key) => {
        const [, value] = key.split(':');
        const numeric = Number(value);
        return key.startsWith('number:') && Number.isFinite(numeric) ? numeric : value;
    });
}

function buildCanonicalUserSnapshot(user = {}) {
    return {
        user_id: user._id || user.id || user._legacy_id || user.openid || '',
        openid: pickString(user.openid),
        nickname: pickString(user.nickname || user.nick_name || user.nickName || user.name || '微信用户'),
        avatar_url: pickString(user.avatar_url || user.avatarUrl || user.avatar),
        role_level: toNumber(user.role_level ?? user.distributor_level ?? user.level, 0),
        role_name: pickString(user.role_name || user.level_name),
        invite_code: pickString(user.invite_code || user.my_invite_code || user.member_no)
    };
}

function relationSourceOf(user = {}) {
    return pickString(user.relation_source || user.invitation_source || '', '');
}

function isDirectMember(currentUser = {}, member = {}) {
    const currentOpenid = pickString(currentUser.openid);
    if (!currentOpenid || !member) return false;
    if (pickString(member.referrer_openid) === currentOpenid) return true;
    const ids = userRelationIds(currentUser);
    return ids.some((id) => String(id) === String(member.parent_id));
}

async function findUserByOpenid(db, openid = '') {
    if (!openid) return null;
    const res = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function findUserByAnyId(db, id) {
    if (!hasValue(id)) return null;
    const stringId = String(id);
    const num = Number(stringId);
    const queries = [
        db.collection('users').doc(stringId).get().then((res) => ({ data: res.data ? [res.data] : [] })).catch(() => ({ data: [] }))
    ];
    if (Number.isFinite(num)) {
        queries.push(db.collection('users').where({ id: num }).limit(1).get().catch(() => ({ data: [] })));
    }
    queries.push(db.collection('users').where({ _legacy_id: stringId }).limit(1).get().catch(() => ({ data: [] })));
    queries.push(db.collection('users').where({ openid: stringId }).limit(1).get().catch(() => ({ data: [] })));
    const results = await Promise.all(queries);
    return results.flatMap((item) => item.data || [])[0] || null;
}

function relationText(level = 0) {
    return level === 2 ? '由你的一级成员继续发展' : '你直接邀请并绑定的成员';
}

async function listApplicationsForPair(db, fromOpenid = '', toOpenid = '') {
    if (!fromOpenid || !toOpenid) return [];
    let query = db.collection('goods_fund_transfer_applications')
        .where({ from_openid: fromOpenid, to_openid: toOpenid });
    if (typeof query.orderBy === 'function') query = query.orderBy('created_at', 'desc');
    if (typeof query.limit === 'function') query = query.limit(50);
    const res = await query.get().catch(() => ({ data: [] }));
    return res.data || [];
}

async function summarizeApplicationsForPair(db, fromOpenid = '', toOpenid = '') {
    const rows = await listApplicationsForPair(db, fromOpenid, toOpenid);
    const normalized = rows.map((row) => ({
        ...row,
        status: normalizeGoodsFundTransferStatus(row.status)
    }));
    const pending = normalized.filter((row) => row.status === GOODS_FUND_TRANSFER_STATUS.PENDING);
    const latest = normalized[0] || null;
    return {
        pending_count: pending.length,
        latest_status: latest ? latest.status : '',
        latest_status_text: latest ? buildGoodsFundTransferStatusText(latest.status) : '',
        latest_amount: latest ? roundMoney(latest.amount) : 0,
        latest_created_at: latest ? latest.created_at || '' : '',
        can_apply: true
    };
}

function normalizeApplicationView(row = {}, currentOpenid = '') {
    const status = normalizeGoodsFundTransferStatus(row.status);
    const outgoing = pickString(row.from_openid) === pickString(currentOpenid);
    return {
        ...row,
        application_id: pickString(row.application_id || row._id || row.id),
        amount: roundMoney(row.amount),
        status,
        status_text: buildGoodsFundTransferStatusText(status),
        direction: outgoing ? 'outgoing' : 'incoming',
        direction_text: outgoing ? '我发起' : '我接收'
    };
}

async function listGoodsFundTransferApplications(db, openid, params = {}) {
    const normalizedOpenid = pickString(openid);
    if (!normalizedOpenid) return [];
    const [outgoingRes, incomingRes] = await Promise.all([
        db.collection('goods_fund_transfer_applications')
            .where({ from_openid: normalizedOpenid })
            .orderBy('created_at', 'desc')
            .limit(100)
            .get()
            .catch(() => ({ data: [] })),
        db.collection('goods_fund_transfer_applications')
            .where({ to_openid: normalizedOpenid })
            .orderBy('created_at', 'desc')
            .limit(100)
            .get()
            .catch(() => ({ data: [] }))
    ]);
    const merged = {};
    [...(outgoingRes.data || []), ...(incomingRes.data || [])].forEach((row) => {
        merged[pickString(row.application_id || row._id || row.id)] = normalizeApplicationView(row, normalizedOpenid);
    });
    let rows = Object.values(merged).sort((left, right) => {
        return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
    });
    const direction = pickString(params.direction).toLowerCase();
    if (direction === 'outgoing' || direction === 'incoming') {
        rows = rows.filter((row) => row.direction === direction);
    }
    const status = normalizeGoodsFundTransferStatus(params.status || '');
    if (pickString(params.status)) {
        rows = rows.filter((row) => row.status === status);
    }
    return rows;
}

async function buildMemberTransferSummary(db, currentOpenid = '', member = {}, level = 0) {
    if (level !== 1 || !currentOpenid || !member?.openid) {
        return {
            pending_count: 0,
            latest_status: '',
            latest_status_text: '',
            latest_amount: 0,
            latest_created_at: '',
            can_apply: false
        };
    }
    const summary = await summarizeApplicationsForPair(db, currentOpenid, member.openid);
    return {
        ...summary,
        can_apply: true
    };
}

async function createGoodsFundTransferApplication(db, openid, params = {}) {
    const currentUser = await findUserByOpenid(db, openid);
    if (!currentUser) throw new Error('当前用户不存在');

    const memberId = params.member_id || params.id;
    if (!memberId) throw new Error('缺少下级成员 ID');
    const member = await findUserByAnyId(db, memberId);
    if (!member) throw new Error('下级成员不存在');
    if (pickString(member.openid) === pickString(openid)) throw new Error('不能给自己申请货款划拨');
    if (!isDirectMember(currentUser, member)) throw new Error('仅可给直属下级发起货款划拨申请');

    const amountCheck = ensureGoodsFundTransferAmount(params.amount);
    if (!amountCheck.ok) throw new Error(amountCheck.message);

    const inviterBalance = roundMoney(toNumber(currentUser.agent_wallet_balance != null ? currentUser.agent_wallet_balance : currentUser.wallet_balance, 0));
    if (inviterBalance < amountCheck.amount) throw new Error('当前货款余额不足，不能发起划拨申请');

    const existingApplications = await listApplicationsForPair(db, pickString(currentUser.openid), pickString(member.openid));
    const pendingApplication = existingApplications.find((row) => normalizeGoodsFundTransferStatus(row.status) === GOODS_FUND_TRANSFER_STATUS.PENDING);
    if (pendingApplication) {
        throw new Error('该成员已有待审核货款划拨申请，请先处理后再发起新申请');
    }

    const applicationId = `gft_apply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = nowIso();
    const application = {
        application_id: applicationId,
        application_no: buildGoodsFundTransferNo(),
        from_openid: pickString(currentUser.openid),
        from_user_id: currentUser._id || currentUser.id || currentUser._legacy_id || currentUser.openid,
        from_snapshot: buildCanonicalUserSnapshot(currentUser),
        to_openid: pickString(member.openid),
        to_user_id: member._id || member.id || member._legacy_id || member.openid,
        to_snapshot: buildCanonicalUserSnapshot(member),
        team_level: 1,
        relation_source: relationSourceOf(member),
        relation_source_text: buildRelationSourceText(relationSourceOf(member)),
        relation_text: relationText(1),
        amount: amountCheck.amount,
        remark: pickString(params.remark),
        status: GOODS_FUND_TRANSFER_STATUS.PENDING,
        review_reason: '',
        reviewed_at: '',
        reviewed_by: '',
        transfer_txn_no: '',
        created_at: createdAt,
        updated_at: createdAt
    };
    await db.collection('goods_fund_transfer_applications').doc(applicationId).set({ data: application });
    return {
        ...application,
        _id: applicationId,
        status_text: buildGoodsFundTransferStatusText(application.status)
    };
}

module.exports = {
    buildRelationSourceText,
    buildMemberTransferSummary,
    createGoodsFundTransferApplication,
    listGoodsFundTransferApplications
};
