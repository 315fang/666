'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber, getAllRecords } = require('./shared/utils');

/**
 * 计算佣金
 */
async function calculateCommission(orderId) {
    try {
        const order = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
        if (!order.data) return 0;

        const amount = order.data.pay_amount || 0;
        const commissionRate = 0.1; // 10%
        return Math.round(amount * commissionRate * 100) / 100;
    } catch (err) {
        console.error('[distribution-commission] calculateCommission 失败:', err.message);
        return 0;
    }
}

/**
 * 结算佣金
 */
async function settleCommission(openid, amount) {
    await db.collection('users').where({ openid }).update({
        data: {
            wallet_balance: _.inc(amount),
            updated_at: db.serverDate()
        }
    });
    return { success: true };
}

/**
 * 获取佣金列表
 */
async function getCommissions(openid, params = {}) {
    let query = db.collection('commissions').where({ openid });

    if (params.status) {
        query = query.where({ status: params.status });
    }

    const res = await query.orderBy('created_at', 'desc').limit(100).get().catch(() => ({ data: [] }));
    return res.data || [];
}

/**
 * 获取佣金统计
 */
async function getStats(openid) {
    try {
        const commRes = await getAllRecords(db, 'commissions', { openid });

        let totalCommission = 0;
        let pendingCommission = 0;
        let settledCommission = 0;
        let frozenCommission = 0;
        let cancelledCommission = 0;

        (commRes || []).forEach(c => {
            const amount = toNumber(c.amount, 0);
            totalCommission += amount;
            switch (c.status) {
                case 'pending': pendingCommission += amount; break;
                case 'settled': settledCommission += amount; break;
                case 'frozen': frozenCommission += amount; break;
                case 'cancelled': cancelledCommission += amount; break;
            }
        });

        return {
            total_commission: Math.round(totalCommission * 100) / 100,
            pending_commission: Math.round(pendingCommission * 100) / 100,
            settled_commission: Math.round(settledCommission * 100) / 100,
            frozen_commission: Math.round(frozenCommission * 100) / 100,
            cancelled_commission: Math.round(cancelledCommission * 100) / 100,
            count: (commRes || []).length
        };
    } catch (err) {
        console.error('[distribution-commission] getStats 失败:', err.message);
        return {
            total_commission: 0, pending_commission: 0, settled_commission: 0,
            frozen_commission: 0, cancelled_commission: 0, count: 0
        };
    }
}

/**
 * 创建佣金（支付成功后调用）
 * @param {string} referrerOpenid - 推荐人 openid
 * @param {string} fromOpenid - 下单用户 openid
 * @param {string} orderId - 订单 ID
 * @param {string} orderNo - 订单号
 * @param {number} payAmount - 实付金额
 * @param {number} rate - 佣金比例（默认 0.10 = 10%）
 */
async function createCommissions(referrerOpenid, fromOpenid, orderId, orderNo, payAmount, rate = 0.10) {
    if (!referrerOpenid) return { created: false, reason: 'no referrer' };

    const commissionAmount = Math.round(payAmount * rate * 100) / 100;
    if (commissionAmount <= 0) return { created: false, reason: 'amount too small' };

    // 检查是否已创建过
    const existingRes = await db.collection('commissions')
        .where({ order_id: orderId, openid: referrerOpenid })
        .limit(1).get().catch(() => ({ data: [] }));
    if (existingRes.data && existingRes.data.length > 0) {
        return { created: false, reason: 'already exists' };
    }

    const result = await db.collection('commissions').add({
        data: {
            openid: referrerOpenid,
            from_openid: fromOpenid,
            order_id: orderId,
            order_no: orderNo,
            amount: commissionAmount,
            rate: rate,
            status: 'pending',
            created_at: db.serverDate(),
        },
    });

    return { created: true, commission_id: result._id, amount: commissionAmount };
}

/**
 * 解冻佣金（确认收货后调用）
 * 将 pending 状态的佣金改为 settled
 * @param {string} orderId - 订单 ID
 */
async function unfreezeCommissions(orderId) {
    if (!orderId) return { unfreezed: 0 };

    const res = await db.collection('commissions')
        .where({ order_id: orderId, status: 'pending' })
        .get().catch(() => ({ data: [] }));

    let totalUnfreezed = 0;
    for (const comm of (res.data || [])) {
        await db.collection('commissions').doc(comm._id).update({
            data: { status: 'settled', settled_at: db.serverDate() },
        });
        // 将佣金加入推荐人钱包
        const amount = toNumber(comm.amount, 0);
        if (amount > 0) {
            await db.collection('users').where({ openid: comm.openid }).update({
                data: {
                    wallet_balance: _.inc(amount),
                    total_earned: _.inc(amount),
                    updated_at: db.serverDate(),
                },
            });
        }
        totalUnfreezed += amount;
    }

    return { unfreezed: (res.data || []).length, total_amount: Math.round(totalUnfreezed * 100) / 100 };
}

/**
 * 取消佣金（退款时调用）
 * 将 pending/frozen 状态的佣金改为 cancelled
 * @param {string} orderId - 订单 ID
 */
async function cancelCommissions(orderId) {
    if (!orderId) return { cancelled: 0 };

    const res = await db.collection('commissions')
        .where({ order_id: orderId, status: _.in(['pending', 'frozen']) })
        .get().catch(() => ({ data: [] }));

    let totalCancelled = 0;
    for (const comm of (res.data || [])) {
        // 如果佣金已结算（settled），需要从钱包扣回
        if (comm.status === 'settled') {
            const amount = toNumber(comm.amount, 0);
            if (amount > 0) {
                await db.collection('users').where({ openid: comm.openid }).update({
                    data: {
                        wallet_balance: _.inc(-amount),
                        total_earned: _.inc(-amount),
                        updated_at: db.serverDate(),
                    },
                });
            }
        }

        await db.collection('commissions').doc(comm._id).update({
            data: { status: 'cancelled', cancelled_at: db.serverDate() },
        });
        totalCancelled += toNumber(comm.amount, 0);
    }

    return { cancelled: (res.data || []).length, total_amount: Math.round(totalCancelled * 100) / 100 };
}

module.exports = {
    calculateCommission,
    settleCommission,
    getCommissions,
    getStats,
    createCommissions,
    unfreezeCommissions,
    cancelCommissions,
};
