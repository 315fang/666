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
    const payAmount = toNumber(order.pay_amount || order.total_amount, 0);
    if (params.refund_amount !== undefined && params.refund_amount !== null && params.refund_amount !== '') {
        const requestedAmount = toNumber(params.refund_amount, NaN);
        if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
            throw new Error('退款金额必须大于0');
        }
        if (Math.round(requestedAmount * 100) !== Math.round(payAmount * 100)) {
            throw new Error('旧退款入口不支持部分退款，请从订单售后流程发起退款');
        }
    }

    // 2. 创建本地退款记录
    const refundResult = await applyRefund(orderId, params.reason || '用户申请退款');
    if (!refundResult.success) return refundResult;

    // 3. 调用微信支付退款 API
    try {
        const privateKey = await loadPrivateKey(cloud);
        const totalFen = Math.round(payAmount * 100);
        const requestedFen = params.refund_amount ? Math.round(toNumber(params.refund_amount, payAmount) * 100) : totalFen;
        const refundAmount = Math.min(Math.max(0, requestedFen), totalFen);

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

        // 退款失败：将订单恢复为之前状态
        await db.collection('orders').doc(orderId).update({
            data: {
                status: order.status,  // 保持原状态
                updated_at: db.serverDate(),
            },
        });

        // 微信退款接口失败，应抛出错误而不是返回 success:true，防止调用方误判
        throw new Error(`微信退款接口调用失败：${wxErr.message}，请管理员手动处理`);
    }
}

module.exports = {
    applyRefund,
    refundPayment,
};
