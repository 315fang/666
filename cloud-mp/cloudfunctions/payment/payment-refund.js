'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { toNumber } = require('./shared/utils');
const { createRefund, loadPrivateKey } = require('./wechat-pay-v3');

/**
 * 申请退款（内部函数）
 */
async function applyRefund(orderId, reason) {
    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data) return { success: false, message: '订单不存在' };
    const order = orderRes.data;

    const payAmount = toNumber(order.pay_amount || order.total_amount, 0);
    const refundNo = 'REF' + Date.now() + Math.floor(Math.random() * 1000);

    // 创建退款记录
    const result = await db.collection('refunds').add({
        data: {
            order_id: orderId,
            order_no: order.order_no,
            openid: order.openid,
            refund_no: refundNo,
            amount: payAmount,
            reason: reason || '用户申请退款',
            status: 'pending',
            created_at: db.serverDate(),
        },
    });

    return { success: true, refundId: result._id, refund_no: refundNo };
}

/**
 * 退款（兼容 index.js 调用名）
 * 同时调用微信支付退款 API
 */
async function refundPayment(openid, params) {
    const orderId = params.order_id || params.id;
    if (!orderId) {
        throw new Error('缺少订单 ID');
    }

    // 1. 验证订单归属和状态
    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data || orderRes.data.openid !== openid) {
        throw new Error('订单不存在或无权操作');
    }
    const order = orderRes.data;

    if (order.status !== 'paid' && order.status !== 'shipped') {
        throw new Error(`订单状态不允许退款: ${order.status}`);
    }

    // 2. 创建本地退款记录
    const refundResult = await applyRefund(orderId, params.reason || '用户申请退款');
    if (!refundResult.success) return refundResult;

    // 3. 调用微信支付退款 API
    try {
        const privateKey = await loadPrivateKey(cloud);
        const payAmount = toNumber(order.pay_amount || order.total_amount, 0);
        const totalFen = Math.round(payAmount * 100);
        const refundAmount = params.refund_amount ? Math.round(toNumber(params.refund_amount, payAmount) * 100) : totalFen;

        const wxRefund = await createRefund(
            order.order_no,
            refundResult.refund_no,
            totalFen,
            refundAmount,
            params.reason || '用户申请退款',
            privateKey
        );

        // 4. 更新退款记录
        await db.collection('refunds').doc(refundResult.refundId).update({
            data: {
                wx_refund_id: wxRefund.refund_id || '',
                wx_status: wxRefund.status || 'PROCESSING',
                updated_at: db.serverDate(),
            },
        });

        // 5. 更新订单状态
        await db.collection('orders').doc(orderId).update({
            data: {
                status: 'refunding',
                updated_at: db.serverDate(),
            },
        });

        return {
            success: true,
            refundId: refundResult.refundId,
            refund_no: refundResult.refund_no,
            wx_status: wxRefund.status || 'PROCESSING',
        };
    } catch (wxErr) {
        console.error('[PaymentRefund] 微信退款失败:', wxErr.message);

        // 微信退款失败，仍保留本地退款记录（状态标记为 failed）
        await db.collection('refunds').doc(refundResult.refundId).update({
            data: {
                status: 'failed',
                error: wxErr.message,
                updated_at: db.serverDate(),
            },
        });

        // 仍然更新订单状态为退款中（管理员可手动处理）
        await db.collection('orders').doc(orderId).update({
            data: {
                status: 'refunding',
                updated_at: db.serverDate(),
            },
        });

        return {
            success: true,
            refundId: refundResult.refundId,
            refund_no: refundResult.refund_no,
            wx_error: wxErr.message,
            note: '微信退款接口调用失败，请管理员手动处理',
        };
    }
}

module.exports = {
    applyRefund,
    refundPayment,
};
