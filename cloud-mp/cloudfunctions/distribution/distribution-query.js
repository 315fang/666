'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const { toNumber, getAllRecords } = require('./shared/utils');

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
    let teamCount = 0;
    try {
        const teamRes = await db.collection('users')
            .where({ referrer_openid: openid })
            .count().catch(() => ({ total: 0 }));
        teamCount = teamRes.total || 0;
    } catch (_) {}

    // 查订单数
    let orderCount = 0;
    try {
        const orderRes = await db.collection('orders')
            .where({ referrer_openid: openid })
            .count().catch(() => ({ total: 0 }));
        orderCount = orderRes.total || 0;
    } catch (_) {}

    return {
        level: distLevel,
        level_name: distLevel > 0 ? ['',
            '普通分销员', '高级分销员', '团队长', '区域代理', '合伙人'
        ][distLevel] || '分销员' : '非分销员',
        wallet_balance: walletBalance,
        balance: walletBalance,
        total_commission: totalCommission,
        pending_commission: pendingCommission,
        settled_commission: settledCommission,
        team_count: teamCount,
        order_count: orderCount,
        invite_code: userData.my_invite_code || userData.invite_code || '',
        status: distLevel > 0 ? 'active' : 'inactive'
    };
}

module.exports = {
    queryDistribution,
    getDashboard
};
