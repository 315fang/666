'use strict';

const DEFAULT_ROLE_NAMES = {
    0: 'VIP用户',
    1: '初级会员',
    2: '高级会员',
    3: '推广合伙人',
    4: '运营合伙人',
    5: '区域合伙人',
    6: '线下实体门店'
};

function pickString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function primaryId(user = {}) {
    return user._id || user.id || user._legacy_id || '';
}

function resolveRoleLevel(user = {}) {
    return toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
}

function resolveRoleName(user = {}) {
    const roleLevel = resolveRoleLevel(user);
    return pickString(user.role_name || DEFAULT_ROLE_NAMES[roleLevel] || 'VIP用户');
}

function resolveNickname(user = {}) {
    return pickString(user.nickname || user.nick_name || user.nickName || user.name || '微信用户');
}

function resolveAvatar(user = {}) {
    return pickString(user.avatarUrl || user.avatar_url || user.avatar || '');
}

function resolveInviteCode(user = {}) {
    return pickString(user.my_invite_code || user.invite_code || user.member_no);
}

function resolveMemberNo(user = {}) {
    return pickString(user.member_no || user.my_invite_code || user.invite_code);
}

function resolveCommissionBalance(user = {}) {
    return toNumber(user.commission_balance ?? user.balance, 0);
}

function resolveGoodsFundBalance(user = {}) {
    return toNumber(user.agent_wallet_balance ?? user.wallet_balance, 0);
}

function buildCanonicalUser(user = {}, extra = {}) {
    const id = primaryId(user);
    const nickname = resolveNickname(user);
    const avatar = resolveAvatar(user);
    const roleLevel = resolveRoleLevel(user);
    const commissionBalance = resolveCommissionBalance(user);
    const goodsFundBalance = resolveGoodsFundBalance(user);

    return {
        ...user,
        id,
        _id: id || user._id || '',
        openid: pickString(user.openid),
        nickname,
        nickName: nickname,
        nick_name: nickname,
        avatar_url: avatar,
        avatarUrl: avatar,
        avatar,
        phone: pickString(user.phone),
        role_level: roleLevel,
        role_name: resolveRoleName(user),
        member_no: resolveMemberNo(user),
        invite_code: resolveInviteCode(user),
        my_invite_code: pickString(user.my_invite_code || resolveInviteCode(user)),
        referrer_openid: pickString(user.referrer_openid || user.parent_openid),
        parent_id: user.parent_id ?? null,
        parent_openid: pickString(user.parent_openid || user.referrer_openid),
        commission_balance: commissionBalance,
        balance: commissionBalance,
        goods_fund_balance: goodsFundBalance,
        agent_wallet_balance: goodsFundBalance,
        wallet_balance: goodsFundBalance,
        is_distributor: roleLevel >= 3 || toNumber(user.distributor_level ?? user.agent_level, 0) > 0,
        status_text: toNumber(user.status, 1) === 0 ? '禁用' : '正常',
        ...extra
    };
}

module.exports = {
    buildCanonicalUser,
    resolveRoleLevel,
    resolveRoleName,
    resolveCommissionBalance,
    resolveGoodsFundBalance
};
