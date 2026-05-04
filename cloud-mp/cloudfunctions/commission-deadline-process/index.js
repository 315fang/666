'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function toNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function pickString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function isOrderCompletedForPointRelease(order = {}) {
    const status = pickString(order.status).toLowerCase();
    return status === 'completed' || !!order.confirmed_at || !!order.auto_confirmed_at;
}

function hasSettledRefundProgress(order = {}) {
    return pickString(order.status).toLowerCase() === 'refunded'
        || toNumber(order.refunded_cash_total, 0) > 0
        || toNumber(order.refunded_quantity_total, 0) > 0
        || order.has_partial_refund === true
        || !!order.refunded_at
        || !!order.last_refunded_at
        || !!order.partially_refunded_at;
}

function getOrderPayAmount(order = {}) {
    return roundMoney(order.pay_amount ?? order.actual_price ?? order.total_amount ?? 0);
}

function calculateReleasablePointAmount(log = {}, order = {}) {
    const originalAmount = Math.max(0, Math.floor(toNumber(log.original_amount ?? log.amount, 0)));
    if (originalAmount <= 0) return 0;
    if (pickString(order.status).toLowerCase() === 'refunded') return 0;
    const payAmount = getOrderPayAmount(order);
    const refundedCash = roundMoney(Math.max(0, toNumber(order.refunded_cash_total, 0)));
    if (payAmount <= 0) return originalAmount;
    const refundedPoints = Math.max(0, Math.min(originalAmount, Math.round(originalAmount * (refundedCash / Math.max(payAmount, 0.01)))));
    return Math.max(0, originalAmount - refundedPoints);
}

async function findOrderForPointLog(log = {}) {
    const orderId = pickString(log.order_id);
    if (orderId) {
        const byDoc = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
        if (byDoc.data) return byDoc.data;
        const byNo = await db.collection('orders').where({ order_no: orderId }).limit(1).get().catch(() => ({ data: [] }));
        if (byNo.data && byNo.data[0]) return byNo.data[0];
    }
    const orderNo = pickString(log.order_no);
    if (orderNo) {
        const byNo = await db.collection('orders').where({ order_no: orderNo }).limit(1).get().catch(() => ({ data: [] }));
        if (byNo.data && byNo.data[0]) return byNo.data[0];
    }
    return null;
}

async function hasPendingRefund(orderId) {
    if (!orderId) return false;
    const pendingRefund = await db.collection('refunds')
        .where({
            order_id: orderId,
            status: _.in(['pending', 'approved', 'processing'])
        })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return !!(pendingRefund.data && pendingRefund.data.length > 0);
}

async function lockPointLog(logId) {
    const lockRes = await db.collection('point_logs')
        .where({
            _id: logId,
            status: 'frozen',
            releasing_at: _.exists(false)
        })
        .update({
            data: {
                releasing_at: db.serverDate(),
                release_error: _.remove(),
                updated_at: db.serverDate()
            }
        })
        .catch(() => ({ stats: { updated: 0 } }));
    return !!(lockRes.stats && lockRes.stats.updated > 0);
}

async function releaseFrozenPointLog(log = {}, order = {}) {
    const logId = pickString(log._id || log.id);
    const orderId = pickString(order._id || log.order_id);
    const originalAmount = Math.max(0, Math.floor(toNumber(log.original_amount ?? log.amount, 0)));
    const releaseAmount = calculateReleasablePointAmount(log, order);
    const cancelledAmount = Math.max(0, originalAmount - releaseAmount);
    if (!logId) return { released: 0, cancelled: 0 };
    const locked = await lockPointLog(logId);
    if (!locked) return { released: 0, cancelled: 0, skipped: true };

    try {
        if (releaseAmount <= 0) {
            await db.collection('point_logs').doc(logId).update({
                data: {
                    status: 'cancelled',
                    amount: 0,
                    original_amount: originalAmount,
                    cancelled_amount: originalAmount,
                    cancel_reason: 'order_refund_before_points_release',
                    cancelled_at: db.serverDate(),
                    releasing_at: _.remove(),
                    updated_at: db.serverDate()
                }
            });
            if (orderId) {
                await db.collection('orders').doc(orderId).update({
                    data: {
                        points_award_status: 'cancelled',
                        updated_at: db.serverDate()
                    }
                }).catch(() => null);
            }
            return { released: 0, cancelled: originalAmount };
        }

        const userUpdate = await db.collection('users')
            .where({ openid: log.openid })
            .update({
                data: {
                    points: _.inc(releaseAmount),
                    updated_at: db.serverDate()
                }
            })
            .catch(() => ({ stats: { updated: 0 } }));
        if (!userUpdate.stats || userUpdate.stats.updated === 0) {
            throw new Error('point reward user update failed');
        }

        await db.collection('point_logs').doc(logId).update({
            data: {
                status: 'released',
                amount: releaseAmount,
                original_amount: originalAmount,
                released_amount: releaseAmount,
                cancelled_amount: cancelledAmount,
                released_at: db.serverDate(),
                releasing_at: _.remove(),
                updated_at: db.serverDate()
            }
        });
        if (orderId) {
            await db.collection('orders').doc(orderId).update({
                data: {
                    reward_points_released_total: _.inc(releaseAmount),
                    points_award_status: cancelledAmount > 0 ? 'partially_released' : 'released',
                    reward_points_released_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            }).catch(() => null);
        }
        return { released: releaseAmount, cancelled: cancelledAmount };
    } catch (err) {
        await db.collection('point_logs').doc(logId).update({
            data: {
                release_error: err.message || String(err),
                releasing_at: _.remove(),
                updated_at: db.serverDate()
            }
        }).catch(() => null);
        throw err;
    }
}

async function processFrozenOrderPointRewards(now, batchSize, errors) {
    let released = 0;
    let cancelled = 0;
    let hasMore = true;
    while (hasMore) {
        const res = await db.collection('point_logs')
            .where({
                source: 'order_pay',
                status: 'frozen',
                release_at: _.lte(now)
            })
            .limit(batchSize)
            .get()
            .catch((err) => {
                console.error('[CommissionDeadlineProcess] point reward query failed:', err.message);
                return { data: [] };
            });
        const batch = res.data || [];
        if (batch.length === 0) break;
        hasMore = batch.length === batchSize;

        for (const log of batch) {
            const logId = pickString(log._id || log.id);
            try {
                const order = await findOrderForPointLog(log);
                if (!order) continue;
                const orderId = pickString(order._id || log.order_id);
                if (await hasPendingRefund(orderId)) continue;
                if (pickString(order.status).toLowerCase() !== 'refunded' && !isOrderCompletedForPointRelease(order)) continue;
                const result = await releaseFrozenPointLog(log, order);
                released += result.released || 0;
                cancelled += result.cancelled || 0;
            } catch (err) {
                errors.push({ point_log_id: logId, error: err.message });
            }
        }
    }
    return { released, cancelled };
}

exports.main = async () => {
    const now = new Date();
    console.log(`[CommissionDeadlineProcess] start at ${now.toISOString()}`);

    let processed = 0;
    let pointsReleased = 0;
    let pointsCancelled = 0;
    const errors = [];
    let batchSize = 100;
    let hasMore = true;

    while (hasMore) {
        const res = await db.collection('commissions')
            .where({
                status: 'frozen',
                refund_deadline: _.lte(now)
            })
            .limit(batchSize)
            .get()
            .catch((err) => {
                console.error('[CommissionDeadlineProcess] query failed:', err.message);
                return { data: [] };
            });

        const batch = res.data || [];
        if (batch.length === 0) break;
        hasMore = batch.length === batchSize;

    for (const commission of batch) {
        try {
            const pendingRefund = await db.collection('refunds')
                .where({
                    order_id: commission.order_id,
                    status: _.in(['pending', 'approved', 'processing'])
                })
                .limit(1)
                .get()
                .catch(() => ({ data: [] }));

            if (pendingRefund.data && pendingRefund.data.length > 0) {
                continue;
            }

            await db.collection('commissions').doc(commission._id).update({
                data: {
                    status: 'pending_approval',
                    pending_approval_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            });
            processed += 1;
        } catch (err) {
            errors.push({ commission_id: commission._id, error: err.message });
        }
    }
    } // end while

    const pointResult = await processFrozenOrderPointRewards(now, batchSize, errors);
    pointsReleased = pointResult.released;
    pointsCancelled = pointResult.cancelled;

    console.log(`[CommissionDeadlineProcess] processed=${processed}, pointsReleased=${pointsReleased}, pointsCancelled=${pointsCancelled}, errors=${errors.length}`);
    return { processed, pointsReleased, pointsCancelled, errors };
};

exports._test = {
    calculateReleasablePointAmount,
    processFrozenOrderPointRewards
};
