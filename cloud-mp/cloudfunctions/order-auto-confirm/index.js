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

function refundDeadlineDate() {
    const days = Math.max(0, toNumber(process.env.REFUND_MAX_DAYS || process.env.COMMISSION_FREEZE_DAYS, 7));
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

exports.main = async () => {
    const confirmDays = Math.max(1, toNumber(process.env.ORDER_AUTO_CONFIRM_DAYS, 7));
    const cutoff = new Date(Date.now() - confirmDays * 24 * 60 * 60 * 1000);
    console.log(`[OrderAutoConfirm] scan shipped before ${cutoff.toISOString()}`);

    let confirmed = 0;
    const errors = [];
    const batchSize = 100;
    let hasMore = true;

    while (hasMore) {
        const res = await db.collection('orders')
            .where({
                status: 'shipped',
                shipped_at: _.lte(cutoff)
            })
            .limit(batchSize)
            .get()
            .catch((err) => {
                console.error('[OrderAutoConfirm] query failed:', err.message);
                return { data: [] };
            });

        const batch = res.data || [];
        if (batch.length === 0) break;
        hasMore = batch.length === batchSize;

        for (const order of batch) {
            try {
                const orderTokens = [order._id, order.id, order.order_no]
                    .filter((value) => value !== undefined && value !== null && value !== '');
                const pendingRefund = await db.collection('refunds')
                    .where(_.and([
                        _.or([
                            { order_id: _.in(orderTokens) },
                            { order_no: _.in(orderTokens) }
                        ]),
                        { status: _.in(['pending', 'approved', 'processing']) }
                    ]))
                    .limit(1)
                    .get()
                    .catch(() => ({ data: [] }));

                if (pendingRefund.data && pendingRefund.data.length > 0) {
                    continue;
                }

                const updateRes = await db.collection('orders')
                    .where({ _id: order._id, status: 'shipped' })
                    .update({
                        data: {
                            status: 'completed',
                            confirmed_at: db.serverDate(),
                            auto_confirmed_at: db.serverDate(),
                            updated_at: db.serverDate()
                        }
                    });
                if (!updateRes.stats || updateRes.stats.updated === 0) {
                    continue;
                }

                const commissionRes = await db.collection('commissions')
                    .where({ order_id: order._id, status: _.in(['pending', 'pending_approval']) })
                    .get()
                    .catch(() => ({ data: [] }));
                for (const commission of (commissionRes.data || [])) {
                    try {
                        await db.collection('commissions').doc(String(commission._id)).update({
                            data: {
                                status: 'frozen',
                                pre_freeze_status: commission.status,
                                commission_freeze_reason: 'order_confirm',
                                frozen_at: db.serverDate(),
                                refund_deadline: refundDeadlineDate(),
                                updated_at: db.serverDate()
                            }
                        });
                    } catch (commissionErr) {
                        console.error('[OrderAutoConfirm] ⚠️ 佣金冻结失败 order_id=%s commission_id=%s error=%s', order._id, commission._id, commissionErr.message);
                        errors.push({ order_id: order._id, commission_id: commission._id, error: `佣金冻结失败: ${commissionErr.message}` });
                    }
                }

                confirmed += 1;
            } catch (err) {
                errors.push({ order_id: order._id, error: err.message });
            }
        }
    } // end while

    // 补偿扫描（2026-05-03 审计 P0-4 新增）：
    // 主循环只扫 status=shipped；若上一轮订单已被推进到 completed，但当时
    // 佣金冻结失败，下一轮就再也不会被主循环捡到。这里独立再扫一遍 completed
    // 订单中仍有 pending / pending_approval 佣金的，做"事后冻结"，避免
    // "订单已完成但佣金长期未冻结"的脏态长期存在。
    let recovered = 0;
    const recoveryErrors = [];
    try {
        const stalePending = await db.collection('commissions')
            .where({ status: _.in(['pending', 'pending_approval']) })
            .field({ _id: true, order_id: true, status: true })
            .limit(200)
            .get()
            .catch((err) => {
                console.error('[OrderAutoConfirm][recover] query commissions failed:', err.message);
                return { data: [] };
            });

        const candidates = (stalePending.data || []).filter((c) => c.order_id);
        const seenOrderIds = new Set();
        for (const commission of candidates) {
            const orderId = String(commission.order_id);
            if (seenOrderIds.has(orderId)) continue;
            seenOrderIds.add(orderId);

            try {
                const orderRes = await db.collection('orders').doc(orderId).get().catch(() => null);
                const order = orderRes && orderRes.data;
                if (!order || order.status !== 'completed') continue;

                // 仅在该订单确实没有阻塞退款时才补冻结，与主流程口径保持一致
                const orderTokens = [order._id, order.id, order.order_no]
                    .filter((value) => value !== undefined && value !== null && value !== '');
                const pendingRefund = await db.collection('refunds')
                    .where(_.and([
                        _.or([
                            { order_id: _.in(orderTokens) },
                            { order_no: _.in(orderTokens) }
                        ]),
                        { status: _.in(['pending', 'approved', 'processing']) }
                    ]))
                    .limit(1)
                    .get()
                    .catch(() => ({ data: [] }));
                if (pendingRefund.data && pendingRefund.data.length > 0) continue;

                const commissionsRes = await db.collection('commissions')
                    .where({ order_id: order._id, status: _.in(['pending', 'pending_approval']) })
                    .get()
                    .catch(() => ({ data: [] }));
                for (const c of (commissionsRes.data || [])) {
                    try {
                        await db.collection('commissions').doc(String(c._id)).update({
                            data: {
                                status: 'frozen',
                                pre_freeze_status: c.status,
                                commission_freeze_reason: 'order_confirm_recovery',
                                frozen_at: db.serverDate(),
                                refund_deadline: refundDeadlineDate(),
                                updated_at: db.serverDate()
                            }
                        });
                        recovered += 1;
                    } catch (commissionErr) {
                        console.error('[OrderAutoConfirm][recover] ⚠️ 补偿冻结失败 order_id=%s commission_id=%s error=%s', order._id, c._id, commissionErr.message);
                        recoveryErrors.push({ order_id: order._id, commission_id: c._id, error: commissionErr.message });
                    }
                }
            } catch (err) {
                recoveryErrors.push({ order_id: orderId, error: err.message });
            }
        }
    } catch (err) {
        console.error('[OrderAutoConfirm][recover] outer failure:', err.message);
        recoveryErrors.push({ error: err.message });
    }

    console.log(`[OrderAutoConfirm] confirmed=${confirmed}, errors=${errors.length}, recovered=${recovered}, recoveryErrors=${recoveryErrors.length}`);
    return { confirmed, errors, recovered, recoveryErrors };
};
