'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async () => {
    const now = new Date();
    console.log(`[CommissionDeadlineProcess] start at ${now.toISOString()}`);

    const res = await db.collection('commissions')
        .where({
            status: 'frozen',
            refund_deadline: _.lte(now)
        })
        .limit(100)
        .get()
        .catch((err) => {
            console.error('[CommissionDeadlineProcess] query failed:', err.message);
            return { data: [] };
        });

    let processed = 0;
    const errors = [];

    for (const commission of (res.data || [])) {
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

    console.log(`[CommissionDeadlineProcess] processed=${processed}, errors=${errors.length}`);
    return { processed, errors };
};
