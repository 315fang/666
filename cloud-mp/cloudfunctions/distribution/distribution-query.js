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

function resolveJoinedAt(member = {}) {
    return member.joined_team_at || member.bound_parent_at || member.created_at || null;
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function summarizeMembers(members = [], monthStartTime = 0) {
    return {
        count: members.length,
        monthlyNewCount: members.filter((item) => {
            const joinedAt = resolveJoinedAt(item);
            return joinedAt && new Date(joinedAt).getTime() >= monthStartTime;
        }).length,
        totalSales: roundMoney(members.reduce((sum, item) => {
            return sum + toNumber(item.total_spent != null ? item.total_spent : item.total_sales, 0);
        }, 0))
    };
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
        (commRes || []).forEach((c) => {
            const amount = toNumber(c.amount, 0);
            totalCommission += amount;
            if (c.status === 'pending' || c.status === 'frozen' || c.status === 'pending_approval') {
                pendingCommission += amount;
            } else if (c.status === 'settled') {
                settledCommission += amount;
            }
        });
    } catch (_) { }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartTime = monthStart.getTime();

    let directSummary = { count: 0, monthlyNewCount: 0, totalSales: 0 };
    let indirectSummary = { count: 0, monthlyNewCount: 0, totalSales: 0 };
    try {
        const directMembers = await getAllRecords(db, 'users', directRelationWhere(userData)).catch(() => []);
        directSummary = summarizeMembers(directMembers, monthStartTime);

        const indirectMembers = await getAllRecords(db, 'users', indirectRelationWhere(directMembers)).catch(() => []);
        indirectSummary = summarizeMembers(indirectMembers, monthStartTime);
    } catch (_) { }

    const totalTeamCount = directSummary.count + indirectSummary.count;
    const totalTeamSales = roundMoney(directSummary.totalSales + indirectSummary.totalSales);
    const monthlyNewMembers = directSummary.monthlyNewCount + indirectSummary.monthlyNewCount;

    // 查订单数
    let orderCount = 0;
    try {
        const orderRes = await db.collection('orders')
            .where({ referrer_openid: openid })
            .count().catch(() => ({ total: 0 }));
        orderCount = orderRes.total || 0;
    } catch (_) { }

    const inviteCode = userData.my_invite_code || userData.invite_code || '';
    const team = {
        directCount: directSummary.count,
        indirectCount: indirectSummary.count,
        totalCount: totalTeamCount,
        monthlyNewMembers,
        directMonthlyNewMembers: directSummary.monthlyNewCount,
        indirectMonthlyNewMembers: indirectSummary.monthlyNewCount,
        directTotalSales: directSummary.totalSales,
        indirectTotalSales: indirectSummary.totalSales,
        totalSales: totalTeamSales,
        levels: {
            direct: {
                count: directSummary.count,
                monthlyNewCount: directSummary.monthlyNewCount,
                totalSales: directSummary.totalSales
            },
            indirect: {
                count: indirectSummary.count,
                monthlyNewCount: indirectSummary.monthlyNewCount,
                totalSales: indirectSummary.totalSales
            },
            all: {
                count: totalTeamCount,
                monthlyNewCount: monthlyNewMembers,
                totalSales: totalTeamSales
            }
        }
    };
    const stats = {
        totalEarnings: roundMoney(totalCommission),
        availableAmount: roundMoney(settledCommission),
        frozenAmount: roundMoney(pendingCommission),
        totalCommission: roundMoney(totalCommission),
        pendingCommission: roundMoney(pendingCommission),
        settledCommission: roundMoney(settledCommission),
        teamSales: totalTeamSales,
        directTeamSales: directSummary.totalSales,
        indirectTeamSales: indirectSummary.totalSales
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
        total_commission: roundMoney(totalCommission),
        pending_commission: roundMoney(pendingCommission),
        settled_commission: roundMoney(settledCommission),
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
