'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber, getAllRecords } = require('./shared/utils');

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
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

function directRelationWhere(user = {}) {
    const clauses = [];
    if (user.openid) clauses.push({ referrer_openid: user.openid });
    const ids = userRelationIds(user);
    if (ids.length) clauses.push({ parent_id: _.in(ids) });
    if (!clauses.length) return { referrer_openid: '__none__' };
    return clauses.length === 1 ? clauses[0] : _.or(clauses);
}

function indirectRelationWhere(directMembers = []) {
    const clauses = [];
    const directOpenids = directMembers.map((item) => item.openid).filter(Boolean);
    if (directOpenids.length) clauses.push({ referrer_openid: _.in(directOpenids) });
    const ids = directMembers.flatMap(userRelationIds);
    if (ids.length) clauses.push({ parent_id: _.in(ids) });
    if (!clauses.length) return { referrer_openid: '__none__' };
    return clauses.length === 1 ? clauses[0] : _.or(clauses);
}

async function listMembers(where, limit = 100) {
    const res = await db.collection('users')
        .where(where)
        .limit(limit)
        .get()
        .catch(() => ({ data: [] }));
    return res.data || [];
}

/**
 * 查询分销数据
 */
async function queryDistribution(openid) {
    const user = await db.collection('users').where({ openid }).limit(1).get();
    if (!user.data.length) return null;

    const distLevel = user.data[0].distributor_level || 0;
    const balance = user.data[0].wallet_balance || 0;

    return {
        level: distLevel,
        balance: balance,
        totalCommission: 0,
        status: distLevel > 0 ? 'active' : 'inactive'
    };
}

/**
 * 获取分销仪表板数据
 */
async function getDashboard(openid) {
    const user = await db.collection('users').where({ openid }).limit(1).get();
    if (!user.data.length) return null;

    const userData = user.data[0];
    const distLevel = toNumber(userData.distributor_level != null ? userData.distributor_level : userData.agent_level, 0);
    const walletBalance = toNumber(userData.wallet_balance != null ? userData.wallet_balance : userData.balance, 0);

    // 查佣金统计
    let totalCommission = 0;
    let pendingCommission = 0;
    let settledCommission = 0;
    try {
        const commRes = await getAllRecords(db, 'commissions', { openid });
        (commRes || []).forEach(c => {
            const amount = toNumber(c.amount, 0);
            totalCommission += amount;
            if (c.status === 'pending' || c.status === 'frozen') {
                pendingCommission += amount;
            } else if (c.status === 'settled') {
                settledCommission += amount;
            }
        });
    } catch (_) {}

    // 查团队人数
    let directCount = 0;
    let indirectCount = 0;
    try {
        const directWhere = directRelationWhere(userData);
        const directMembers = await listMembers(directWhere, 100);
        const directCountRes = await db.collection('users').where(directWhere).count().catch(() => ({ total: directMembers.length }));
        directCount = directCountRes.total || directMembers.length;

        const indirectWhere = indirectRelationWhere(directMembers);
        const indirectCountRes = await db.collection('users').where(indirectWhere).count().catch(() => ({ total: 0 }));
        indirectCount = indirectCountRes.total || 0;
    } catch (_) {}

    let monthlyNewMembers = 0;
    try {
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        const directMembers = await listMembers(directRelationWhere(userData), 100);
        monthlyNewMembers = directMembers.filter((item) => item.created_at && new Date(item.created_at) >= start).length;
    } catch (_) {}

    // 查订单数
    let orderCount = 0;
    try {
        const orderRes = await db.collection('orders')
            .where({ referrer_openid: openid })
            .count().catch(() => ({ total: 0 }));
        orderCount = orderRes.total || 0;
    } catch (_) {}

    const inviteCode = userData.my_invite_code || userData.invite_code || '';
    const team = {
        directCount,
        indirectCount,
        totalCount: directCount + indirectCount,
        monthlyNewMembers
    };
    const stats = {
        totalEarnings: totalCommission,
        availableAmount: settledCommission,
        frozenAmount: pendingCommission,
        totalCommission,
        pendingCommission,
        settledCommission
    };

    return {
        level: distLevel,
        level_name: distLevel > 0 ? ['',
            '普通分销员', '高级分销员', '团队长', '区域代理', '合伙人'
        ][distLevel] || '分销员' : '非分销员',
        userInfo: {
            _id: userData._id,
            openid: userData.openid,
            nickname: userData.nickname || userData.nickName || '新用户',
            nickName: userData.nickName || userData.nickname || '新用户',
            avatarUrl: userData.avatarUrl || userData.avatar_url || '',
            invite_code: inviteCode,
            role_level: toNumber(userData.role_level, 0),
            role_name: userData.role_name || ''
        },
        team,
        stats,
        wallet_balance: walletBalance,
        balance: walletBalance,
        total_commission: totalCommission,
        pending_commission: pendingCommission,
        settled_commission: settledCommission,
        team_count: team.totalCount,
        order_count: orderCount,
        invite_code: inviteCode,
        status: distLevel > 0 ? 'active' : 'inactive'
    };
}

module.exports = {
    queryDistribution,
    getDashboard
};
