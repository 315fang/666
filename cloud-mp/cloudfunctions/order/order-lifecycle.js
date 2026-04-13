'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { getOrderByIdOrNo } = require('./order-query');
const { restoreUsedCoupon } = require('./order-coupon');

function toNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === '') return [];
    return [value];
}

function refundDeadlineDate() {
    const days = Math.max(0, toNumber(process.env.REFUND_MAX_DAYS || process.env.COMMISSION_FREEZE_DAYS, 7));
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function getDocByIdOrLegacy(collectionName, id) {
    if (id === null || id === undefined || id === '') return null;
    const num = toNumber(id, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num)
            ? db.collection(collectionName).where({ id: num }).limit(1).get().catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        db.collection(collectionName).doc(String(id)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

async function restoreOrderStock(orderId, order, markerField = 'stock_restored_at') {
    if (!order.stock_deducted_at || order[markerField]) return { skipped: true };
    for (const item of toArray(order.items)) {
        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        if (item.product_id) {
            const product = await getDocByIdOrLegacy('products', item.product_id);
            if (product && product._id) {
                await db.collection('products').doc(String(product._id)).update({
                    data: { stock: _.inc(qty), sales_count: _.inc(-qty), updated_at: db.serverDate() },
                }).catch(() => {});
            }
        }
        if (item.sku_id) {
            const sku = await getDocByIdOrLegacy('skus', item.sku_id);
            if (sku && sku._id) {
                await db.collection('skus').doc(String(sku._id)).update({
                    data: { stock: _.inc(qty), updated_at: db.serverDate() },
                }).catch(() => {});
            }
        }
    }
    await db.collection('orders').doc(orderId).update({
        data: { [markerField]: db.serverDate(), updated_at: db.serverDate() },
    });
    return { restored: true };
}

async function freezeCommissionsForOrder(orderId, extraData = {}) {
    await db.collection('commissions')
        .where({ order_id: orderId, status: _.in(['pending', 'pending_approval']) })
        .update({
            data: {
                status: 'frozen',
                frozen_at: db.serverDate(),
                updated_at: db.serverDate(),
                ...extraData
            }
        })
        .catch(() => {});
}

async function restoreFrozenCommissions(orderId) {
    await db.collection('commissions')
        .where({ order_id: orderId, status: 'frozen' })
        .update({
            data: {
                status: 'pending',
                frozen_at: _.remove(),
                refund_deadline: _.remove(),
                updated_at: db.serverDate()
            }
        })
        .catch(() => {});
}

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
    await restoreUsedCoupon(order).catch(() => {});

    // 取消佣金
    try {
        await db.collection('commissions')
            .where({ order_id: orderId, status: _.in(['pending', 'frozen', 'pending_approval']) })
            .update({ data: { status: 'cancelled', cancelled_at: db.serverDate() } })
            .catch(() => {});
    } catch (commErr) {
        console.error('[OrderLifecycle] 取消佣金失败:', commErr.message);
    }

    await restoreOrderStock(orderId, order).catch((stockErr) => {
        console.error('[OrderLifecycle] 取消订单恢复库存失败:', stockErr.message);
    });

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

    // 确认收货后进入售后期：佣金先冻结，待售后期结束后转人工审批。
    try {
        await freezeCommissionsForOrder(orderId, { refund_deadline: refundDeadlineDate() });
    } catch (commErr) {
        console.error('[OrderLifecycle] 佣金冻结失败:', commErr.message);
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
                product_name: item.name || item.snapshot_name || '',
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
    const orderId = params.order_id || params.id;
    if (!orderId) throw new Error('缺少订单 ID');

    const order = await getOrderByIdOrNo(openid, orderId);
    if (!order) throw new Error('订单不存在');
    if (order.openid !== openid) throw new Error('无权操作此订单');

    if (!['paid', 'pending_group', 'shipped', 'completed'].includes(order.status)) {
        throw new Error(`订单状态不允许退款: ${order.status}`);
    }
    const canonicalOrderId = order._id || String(orderId);

    // 检查是否已有待处理退款
    const existingRefund = await db.collection('refunds')
        .where({
            order_id: _.in([canonicalOrderId, order.id, order.order_no].filter((value) => value !== undefined && value !== null && value !== '')),
            status: _.in(['pending', 'approved', 'processing'])
        })
        .limit(1).get().catch(() => ({ data: [] }));
    if (existingRefund.data && existingRefund.data.length > 0) {
        throw new Error('该订单已有待处理的退款申请');
    }

    const refundNo = 'REF' + Date.now() + Math.floor(Math.random() * 1000);
    const refundAmount = toNumber(params.amount ?? params.refund_amount, toNumber(order.pay_amount || order.total_amount, 0));
    const type = params.type || 'refund_only';
    const refundQuantity = type === 'return_refund' ? Math.max(1, toNumber(params.refund_quantity, 1)) : 0;

    const result = await db.collection('refunds').add({
        data: {
            order_id: canonicalOrderId,
            order_no: order.order_no,
            openid,
            refund_no: refundNo,
            amount: refundAmount,
            type,
            reason: params.reason || '用户申请退款',
            description: params.description || '',
            refund_quantity: refundQuantity,
            status: 'pending',
            images: params.images || [],
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
        },
    });

    // 更新订单状态，记录 prev_status 供取消退款时恢复
    const currentOrderRes = await db.collection('orders').doc(canonicalOrderId).get().catch(() => ({ data: null }));
    await db.collection('orders').doc(canonicalOrderId).update({
        data: {
            status: 'refunding',
            prev_status: currentOrderRes.data?.status || 'paid',
            updated_at: db.serverDate()
        },
    });

    // 退款申请时，冻结佣金（防止提现）
    try {
        await freezeCommissionsForOrder(canonicalOrderId);
    } catch (freezeErr) {
        console.error('[OrderLifecycle] 佣金冻结失败:', freezeErr.message);
    }

    return { success: true, id: result._id, refund_id: result._id, refund_no: refundNo };
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
    let rows = res.data || [];
    if (params.order_id) {
        const order = await getOrderByIdOrNo(openid, params.order_id);
        const orderTokens = [params.order_id, order && order._id, order && order.id, order && order.order_no]
            .filter((value) => value !== undefined && value !== null && value !== '')
            .map((value) => String(value));
        rows = rows.filter((refund) => orderTokens.includes(String(refund.order_id)) || orderTokens.includes(String(refund.order_no)));
    }
    return rows.map((refund) => ({ ...refund, id: refund._id || refund.id }));
}

/**
 * 查询退款详情
 */
async function queryRefundDetail(openid, refundId) {
    const refundRes = await db.collection('refunds').doc(refundId).get().catch(() => ({ data: null }));
    if (!refundRes.data || refundRes.data.openid !== openid) {
        throw new Error('退款记录不存在');
    }
    return { ...refundRes.data, id: refundRes.data._id || refundRes.data.id };
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
        await restoreFrozenCommissions(orderId);
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
                // 恢复为退款前的状态：优先使用 prev_status 字段，否则按实际字段推断
                // 顺序：completed > shipped > paid > pending_payment
                const order = orderRes.data;
                const prevStatus = order.prev_status
                    || (order.confirmed_at || order.auto_confirmed_at ? 'completed'
                        : (order.shipped_at ? 'shipped'
                            : (order.paid_at ? 'paid' : 'pending_payment')));
                await db.collection('orders').doc(orderId).update({
                    data: { status: prevStatus, prev_status: _.remove(), updated_at: db.serverDate() },
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
            shipping_company: orderRes.data.shipping_company || orderRes.data.logistics_company || '',
            logistics_company: orderRes.data.logistics_company || orderRes.data.shipping_company || '',
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
            shipping_company: order.shipping_company || order.logistics_company || '',
            logistics_company: order.logistics_company || order.shipping_company || '',
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
