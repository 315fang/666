'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;

/**
 * 取消订单（仅 pending_payment 状态可取消）
 */
async function cancelOrder(openid, orderId) {
    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data) throw new Error('订单不存在');
    if (orderRes.data.openid !== openid) throw new Error('无权操作此订单');

    const order = orderRes.data;
    if (order.status !== 'pending_payment') {
        throw new Error(`订单状态不允许取消: ${order.status}`);
    }

    // 退还积分
    if (order.points_used > 0) {
        await db.collection('users').where({ openid }).update({
            data: {
                points: _.inc(order.points_used),
                growth_value: _.inc(order.points_used),
                updated_at: db.serverDate(),
            },
        });
    }

    // 退还优惠券
    if (order.coupon_id) {
        await db.collection('user_coupons')
            .where({ openid, coupon_id: order.coupon_id, status: 'used' })
            .update({ data: { status: 'unused', used_at: _.remove() } })
            .catch(() => {});
    }

    // 取消佣金
    try {
        await db.collection('commissions')
            .where({ order_id: orderId, status: _.in(['pending', 'frozen']) })
            .update({ data: { status: 'cancelled', cancelled_at: db.serverDate() } })
            .catch(() => {});
    } catch (commErr) {
        console.error('[OrderLifecycle] 取消佣金失败:', commErr.message);
    }

    // 更新订单状态
    await db.collection('orders').doc(orderId).update({
        data: {
            status: 'cancelled',
            cancelled_at: db.serverDate(),
            cancel_reason: '用户取消',
            updated_at: db.serverDate(),
        },
    });

    return { success: true, order_id: orderId, status: 'cancelled' };
}

/**
 * 确认收货（仅 shipped 状态可确认）
 */
async function confirmOrder(openid, orderId) {
    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data) throw new Error('订单不存在');
    if (orderRes.data.openid !== openid) throw new Error('无权操作此订单');

    if (orderRes.data.status !== 'shipped') {
        throw new Error(`订单状态不允许确认收货: ${orderRes.data.status}`);
    }

    await db.collection('orders').doc(orderId).update({
        data: {
            status: 'completed',
            confirmed_at: db.serverDate(),
            updated_at: db.serverDate(),
        },
    });

    // 确认收货后，将待结算佣金设为可提现（解冻佣金 + 加入钱包余额）
    try {
        const commRes = await db.collection('commissions')
            .where({ order_id: orderId, status: 'pending' })
            .get().catch(() => ({ data: [] }));

        for (const comm of (commRes.data || [])) {
            await db.collection('commissions').doc(comm._id).update({
                data: { status: 'settled', settled_at: db.serverDate() },
            });

            const amount = Number(comm.amount) || 0;
            if (amount > 0) {
                await db.collection('users').where({ openid: comm.openid }).update({
                    data: {
                        wallet_balance: _.inc(amount),
                        total_earned: _.inc(amount),
                        updated_at: db.serverDate(),
                    },
                });
            }
        }
    } catch (commErr) {
        console.error('[OrderLifecycle] 佣金解冻失败:', commErr.message);
    }

    return { success: true, order_id: orderId, status: 'completed' };
}

/**
 * 评价订单（仅 completed 状态可评价）
 */
async function reviewOrder(openid, orderId, reviewData) {
    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data) throw new Error('订单不存在');
    if (orderRes.data.openid !== openid) throw new Error('无权操作此订单');

    if (orderRes.data.status !== 'completed') {
        throw new Error(`订单状态不允许评价: ${orderRes.data.status}`);
    }

    // 检查是否已评价
    const existingReview = await db.collection('reviews')
        .where({ order_id: orderId, openid })
        .limit(1).get().catch(() => ({ data: [] }));
    if (existingReview.data && existingReview.data.length > 0) {
        throw new Error('该订单已评价');
    }

    const { rating, content, images } = reviewData;
    if (!rating || rating < 1 || rating > 5) {
        throw new Error('评分必须为1-5');
    }

    // 为每个商品创建评价
    const items = orderRes.data.items || [];
    const reviewItems = items.length > 0 ? items : [{ product_id: orderRes.data.product_id || '', name: '' }];

    const reviewResults = [];
    for (const item of reviewItems) {
        const result = await db.collection('reviews').add({
            data: {
                order_id: orderId,
                openid,
                product_id: item.product_id || '',
                product_name: item.name || '',
                rating,
                content: content || '',
                images: images || [],
                status: 'visible',
                created_at: db.serverDate(),
            },
        });
        reviewResults.push(result._id);
    }

    // 标记订单已评价
    await db.collection('orders').doc(orderId).update({
        data: {
            reviewed: true,
            reviewed_at: db.serverDate(),
            updated_at: db.serverDate(),
        },
    });

    // 评价奖励积分
    const bonusPoints = 10;
    await db.collection('users').where({ openid }).update({
        data: { points: _.inc(bonusPoints), growth_value: _.inc(bonusPoints), updated_at: db.serverDate() },
    });
    await db.collection('point_logs').add({
        data: {
            openid, type: 'earn', amount: bonusPoints,
            source: 'review', order_id: orderId,
            description: '评价订单奖励10积分',
            created_at: db.serverDate(),
        },
    });

    return { success: true, review_ids: reviewResults };
}

/**
 * 申请退款
 */
async function applyRefund(openid, params) {
    const orderId = params.order_id;
    if (!orderId) throw new Error('缺少订单 ID');

    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data) throw new Error('订单不存在');
    if (orderRes.data.openid !== openid) throw new Error('无权操作此订单');

    const order = orderRes.data;
    if (order.status !== 'paid' && order.status !== 'shipped' && order.status !== 'completed') {
        throw new Error(`订单状态不允许退款: ${order.status}`);
    }

    // 检查是否已有待处理退款
    const existingRefund = await db.collection('refunds')
        .where({ order_id: orderId, status: _.in(['pending', 'processing']) })
        .limit(1).get().catch(() => ({ data: [] }));
    if (existingRefund.data && existingRefund.data.length > 0) {
        throw new Error('该订单已有待处理的退款申请');
    }

    const refundNo = 'REF' + Date.now() + Math.floor(Math.random() * 1000);
    const refundAmount = params.refund_amount || order.pay_amount || 0;

    const result = await db.collection('refunds').add({
        data: {
            order_id: orderId,
            order_no: order.order_no,
            openid,
            refund_no: refundNo,
            amount: refundAmount,
            reason: params.reason || '用户申请退款',
            status: 'pending',
            images: params.images || [],
            created_at: db.serverDate(),
        },
    });

    // 更新订单状态
    await db.collection('orders').doc(orderId).update({
        data: { status: 'refunding', updated_at: db.serverDate() },
    });

    // 退款申请时，冻结佣金（防止提现）
    try {
        await db.collection('commissions')
            .where({ order_id: orderId, status: 'pending' })
            .update({ data: { status: 'frozen', frozen_at: db.serverDate() } })
            .catch(() => {});
    } catch (freezeErr) {
        console.error('[OrderLifecycle] 佣金冻结失败:', freezeErr.message);
    }

    return { success: true, refund_id: result._id, refund_no: refundNo };
}

/**
 * 查询退款列表
 */
async function queryRefundList(openid, params = {}) {
    let query = db.collection('refunds').where({ openid });

    if (params.status) {
        query = query.where({ status: params.status });
    }

    const res = await query.orderBy('created_at', 'desc').limit(50).get().catch(() => ({ data: [] }));
    return res.data || [];
}

/**
 * 查询退款详情
 */
async function queryRefundDetail(openid, refundId) {
    const refundRes = await db.collection('refunds').doc(refundId).get().catch(() => ({ data: null }));
    if (!refundRes.data || refundRes.data.openid !== openid) {
        throw new Error('退款记录不存在');
    }
    return refundRes.data;
}

/**
 * 取消退款申请
 */
async function cancelRefund(openid, refundId) {
    const refundRes = await db.collection('refunds').doc(refundId).get().catch(() => ({ data: null }));
    if (!refundRes.data || refundRes.data.openid !== openid) {
        throw new Error('退款记录不存在');
    }

    if (refundRes.data.status !== 'pending') {
        throw new Error(`退款状态不允许取消: ${refundRes.data.status}`);
    }

    await db.collection('refunds').doc(refundId).update({
        data: { status: 'cancelled', cancelled_at: db.serverDate(), updated_at: db.serverDate() },
    });

    // 取消退款时，解冻佣金（恢复为 pending 状态）
    try {
        const orderId = refundRes.data.order_id;
        if (orderId) {
            await db.collection('commissions')
                .where({ order_id: orderId, status: 'frozen' })
                .update({ data: { status: 'pending', frozen_at: _.remove() } })
                .catch(() => {});
        }
    } catch (unfreezeErr) {
        console.error('[OrderLifecycle] 佣金解冻失败:', unfreezeErr.message);
    }

    // 恢复订单状态
    const orderId = refundRes.data.order_id;
    if (orderId) {
        const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
        if (orderRes.data && orderRes.data.status === 'refunding') {
            // 检查是否还有其他待处理退款
            const otherRefunds = await db.collection('refunds')
                .where({ order_id: orderId, status: _.in(['pending', 'processing']) })
                .limit(1).get().catch(() => ({ data: [] }));
            if (!otherRefunds.data || otherRefunds.data.length === 0) {
                // 恢复为退款前状态
                const prevStatus = orderRes.data.paid_at ? 'paid' : 'pending_payment';
                await db.collection('orders').doc(orderId).update({
                    data: { status: prevStatus, updated_at: db.serverDate() },
                });
            }
        }
    }

    return { success: true };
}

/**
 * 填写退货物流信息
 */
async function returnShipping(openid, refundId, shippingData) {
    const refundRes = await db.collection('refunds').doc(refundId).get().catch(() => ({ data: null }));
    if (!refundRes.data || refundRes.data.openid !== openid) {
        throw new Error('退款记录不存在');
    }

    if (refundRes.data.status !== 'processing') {
        throw new Error(`退款状态不允许填写物流: ${refundRes.data.status}`);
    }

    await db.collection('refunds').doc(refundId).update({
        data: {
            return_shipping: {
                company: shippingData.company || '',
                tracking_no: shippingData.tracking_no || '',
                sent_at: db.serverDate(),
            },
            updated_at: db.serverDate(),
        },
    });

    return { success: true };
}

/**
 * 物流追踪（返回订单物流信息）
 */
async function trackLogistics(openid, params) {
    const orderId = params.order_id;
    const trackingNo = params.tracking_no;

    if (orderId) {
        const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
        if (!orderRes.data || orderRes.data.openid !== openid) {
            throw new Error('订单不存在');
        }
        return {
            order_id: orderId,
            order_no: orderRes.data.order_no,
            status: orderRes.data.status,
            tracking_no: orderRes.data.tracking_no || '',
            shipping_company: orderRes.data.shipping_company || '',
            shipped_at: orderRes.data.shipped_at || null,
            estimated_delivery: orderRes.data.estimated_delivery || null,
            // 简易物流轨迹
            traces: orderRes.data.shipping_traces || generateDefaultTraces(orderRes.data),
        };
    }

    if (trackingNo) {
        // 按物流单号查询
        const orderRes = await db.collection('orders')
            .where({ tracking_no: trackingNo, openid })
            .limit(1).get().catch(() => ({ data: [] }));
        if (!orderRes.data || orderRes.data.length === 0) {
            throw new Error('未找到对应订单');
        }
        const order = orderRes.data[0];
        return {
            order_id: order._id,
            order_no: order.order_no,
            status: order.status,
            tracking_no: order.tracking_no || trackingNo,
            shipping_company: order.shipping_company || '',
            shipped_at: order.shipped_at || null,
            traces: order.shipping_traces || generateDefaultTraces(order),
        };
    }

    throw new Error('缺少订单 ID 或物流单号');
}

/**
 * 生成默认物流轨迹（基于订单状态推断）
 */
function generateDefaultTraces(order) {
    const traces = [];
    if (order.created_at) {
        traces.push({ time: order.created_at, desc: '订单已创建', status: 'created' });
    }
    if (order.paid_at) {
        traces.push({ time: order.paid_at, desc: '支付成功', status: 'paid' });
    }
    if (order.shipped_at || order.status === 'shipped' || order.status === 'completed') {
        traces.push({ time: order.shipped_at || order.updated_at, desc: '商家已发货', status: 'shipped' });
    }
    if (order.confirmed_at || order.status === 'completed') {
        traces.push({ time: order.confirmed_at || order.updated_at, desc: '已签收', status: 'completed' });
    }
    return traces;
}

module.exports = {
    cancelOrder,
    confirmOrder,
    reviewOrder,
    applyRefund,
    queryRefundList,
    queryRefundDetail,
    cancelRefund,
    returnShipping,
    trackLogistics,
};
