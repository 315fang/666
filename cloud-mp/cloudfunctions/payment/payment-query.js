'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { queryOrderByOutTradeNo, loadPrivateKey } = require('./wechat-pay-v3');
const paymentCallback = require('./payment-callback');
const { processPaidOrder } = paymentCallback;
const shouldRunPaidOrderPostProcess = paymentCallback.shouldRunPaidOrderPostProcess || (() => true);
const { resolvePostPayStatus } = require('./shared/order-payment');

const PAID_POST_PROCESS_STATUSES = new Set([
    'paid',
    'pending_group',
    'pickup_pending',
    'agent_confirmed',
    'shipping_requested',
    'shipped',
    'completed'
]);

function normalizeStatus(status) {
    return String(status || '').trim().toLowerCase();
}

function needsPaidOrderPostProcess(order = {}) {
    return PAID_POST_PROCESS_STATUSES.has(normalizeStatus(order.status))
        && shouldRunPaidOrderPostProcess(order)
        && (!order.payment_post_processed_at || order.branch_region_commission_retry_required === true);
}

async function retryPaidOrderPostProcess(orderId, order) {
    if (!needsPaidOrderPostProcess(order)) return null;
    return processPaidOrder(orderId, order).catch((postErr) => {
        console.error('[PaymentQuery] 已支付订单后处理补偿失败:', postErr.message);
        return { error: postErr.message };
    });
}

/**
 * 查询支付状态（优先查微信侧，回退查本地）
 * @param {string} orderId - 订单 ID
 * @param {string} [callerOpenid] - 调用者 openid，用于归属校验（传 null 表示内部调用跳过校验）
 * @returns {object} 支付状态
 */
async function queryPaymentStatus(orderId, callerOpenid) {
    if (!orderId) {
        throw new Error('缺少订单 ID');
    }

    // 1. 查本地订单
    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data) {
        throw new Error('订单不存在');
    }
    let order = orderRes.data;

    // 校验订单归属（callerOpenid 为 null 时为内部调用，跳过校验）
    if (callerOpenid !== null && callerOpenid !== undefined && order.openid && order.openid !== callerOpenid) {
        throw new Error('无权查询该订单');
    }

    const localPostProcess = await retryPaidOrderPostProcess(orderId, order);
    if (localPostProcess && !localPostProcess.error) {
        order = await db.collection('orders').doc(orderId).get().then((res) => res.data || order).catch(() => order);
    }

    // 2. 如果是待支付，尝试查微信侧获取最新状态
    if (order.status === 'pending_payment' && order.order_no) {
        try {
            const privateKey = await loadPrivateKey(cloud);
            const wxResult = await queryOrderByOutTradeNo(order.order_no, privateKey);

            if (wxResult.trade_state === 'SUCCESS' && order.status !== 'paid') {
                const postPayStatus = resolvePostPayStatus(order);
                // 微信已支付但本地未更新，补偿更新
                await db.collection('orders').doc(orderId).update({
                    data: {
                        status: postPayStatus,
                        paid_at: db.serverDate(),
                        trade_id: wxResult.transaction_id || '',
                        pay_time: wxResult.success_time ? new Date(wxResult.success_time) : db.serverDate(),
                        updated_at: db.serverDate(),
                    },
                });
                const postProcess = await retryPaidOrderPostProcess(orderId, { ...order, status: postPayStatus, paid_at: new Date() });
                return {
                    orderId: order._id,
                    order_no: order.order_no,
                    status: postPayStatus,
                    amount: order.pay_amount,
                    trade_state: wxResult.trade_state,
                    paidAt: new Date().toISOString(),
                    post_processed: !postProcess?.error,
                    post_process_retried: Boolean(postProcess),
                };
            }

            return {
                orderId: order._id,
                order_no: order.order_no,
                status: order.status,
                amount: order.pay_amount,
                trade_state: wxResult.trade_state || order.status,
                paidAt: order.paid_at,
            };
        } catch (wxErr) {
            console.warn('[PaymentQuery] 微信侧查询失败，返回本地状态:', wxErr.message);
        }
    }

    // 3. 返回本地状态
    return {
        orderId: order._id,
        order_no: order.order_no,
        status: order.status,
        amount: order.pay_amount,
        trade_state: order.status === 'paid' ? 'SUCCESS' : order.status,
        paidAt: order.paid_at,
        post_processed: localPostProcess ? !localPostProcess.error : Boolean(order.payment_post_processed_at),
        post_process_retried: Boolean(localPostProcess),
    };
}

module.exports = {
    queryPaymentStatus,
};
