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
            const pendingRefund = await db.collection('refunds')
                .where({
                    order_id: order._id,
                    status: _.in(['pending', 'approved', 'processing'])
                })
                .limit(1)
                .get()
                .catch(() => ({ data: [] }));

            if (pendingRefund.data && pendingRefund.data.length > 0) {
                continue;
            }

            await db.collection('orders').doc(order._id).update({
                data: {
                    status: 'completed',
                    confirmed_at: db.serverDate(),
                    auto_confirmed_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            });

            await db.collection('commissions')
                .where({ order_id: order._id, status: _.in(['pending', 'pending_approval']) })
                .update({
                    data: {
                        status: 'frozen',
                        frozen_at: db.serverDate(),
                        refund_deadline: refundDeadlineDate(),
                        updated_at: db.serverDate()
                    }
                })
                .catch(() => {});

            confirmed += 1;
        } catch (err) {
            errors.push({ order_id: order._id, error: err.message });
        }
    }
    } // end while

    console.log(`[OrderAutoConfirm] confirmed=${confirmed}, errors=${errors.length}`);
    return { confirmed, errors };
};
