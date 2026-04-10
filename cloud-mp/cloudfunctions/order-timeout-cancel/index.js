'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 订单超时自动取消定时触发器
 * 每5分钟执行，取消超过30分钟未支付的订单
 */
exports.main = async (event, context) => {
    const TIMEOUT_MINUTES = 30;
    const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000);

    console.log(`[OrderTimeoutCancel] 开始扫描，截止时间: ${cutoff.toISOString()}`);

    try {
        // 查询超时未支付的订单
        const res = await db.collection('orders')
            .where({
                status: 'pending_payment',
                created_at: _.lt(cutoff),
            })
            .limit(100)
            .get();

        if (!res.data || res.data.length === 0) {
            console.log('[OrderTimeoutCancel] 没有超时订单');
            return { cancelled: 0 };
        }

        let cancelledCount = 0;
        const errors = [];

        for (const order of res.data) {
            try {
                // 退还积分
                if (order.points_used > 0) {
                    await db.collection('users').where({ openid: order.openid }).update({
                        data: {
                            points: _.inc(order.points_used),
                            growth_value: _.inc(order.points_used),
                            updated_at: db.serverDate(),
                        },
                    }).catch(() => {});
                }

                // 退还优惠券
                if (order.coupon_id) {
                    await db.collection('user_coupons')
                        .where({ openid: order.openid, coupon_id: order.coupon_id, status: 'used' })
                        .update({ data: { status: 'unused' } })
                        .catch(() => {});
                }

                // 更新订单状态
                await db.collection('orders').doc(order._id).update({
                    data: {
                        status: 'cancelled',
                        cancel_reason: '超时未支付，系统自动取消',
                        cancelled_at: db.serverDate(),
                        updated_at: db.serverDate(),
                    },
                });

                cancelledCount += 1;
            } catch (err) {
                errors.push({ order_id: order._id, error: err.message });
            }
        }

        console.log(`[OrderTimeoutCancel] 完成，取消 ${cancelledCount} 个订单`);
        if (errors.length > 0) {
            console.error('[OrderTimeoutCancel] 部分失败:', JSON.stringify(errors));
        }

        return { cancelled: cancelledCount, errors: errors.length };
    } catch (err) {
        console.error('[OrderTimeoutCancel] 扫描异常:', err);
        return { error: err.message };
    }
};
