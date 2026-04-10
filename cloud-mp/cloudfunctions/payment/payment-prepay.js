'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { toNumber } = require('./shared/utils');
const { jsapiOrder, buildMiniPayParams, loadPrivateKey } = require('./wechat-pay-v3');
const { processPaidOrder } = require('./payment-callback');

/**
 * 预支付 — 调用微信支付 V3 JSAPI 下单
 * @param {string} openid - 用户 openid
 * @param {Object} params - { order_id }
 * @returns {Object} 小程序支付参数（供 wx.requestPayment 使用）
 */
async function preparePay(openid, params) {
    const orderId = params.order_id || params.id;
    if (!orderId) {
        throw new Error('缺少订单 ID');
    }

    // 1. 查询订单
    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data) {
        throw new Error('订单不存在');
    }
    const order = orderRes.data;

    // 2. 校验订单状态
    if (order.status !== 'pending_payment') {
        throw new Error(`订单状态不允许支付: ${order.status}`);
    }

    // 3. 校验订单归属
    if (order.openid !== openid) {
        throw new Error('无权操作此订单');
    }

    // 4. 计算支付金额（元→分）
    const payAmount = toNumber(order.pay_amount || order.total_amount, 0);
    const amountInFen = Math.round(payAmount * 100);
    if (amountInFen <= 0) {
        await db.collection('orders').doc(orderId).update({
            data: {
                status: 'paid',
                paid_at: db.serverDate(),
                pay_time: db.serverDate(),
                pay_channel: 'free',
                updated_at: db.serverDate(),
            },
        });
        await processPaidOrder(orderId, { ...order, status: 'paid', paid_at: new Date() });
        return {
            order_id: orderId,
            order_no: order.order_no,
            pay_amount: 0,
            paid_by_free: true,
            message: '订单已自动完成支付'
        };
    }

    // 5. 加载私钥
    const privateKey = await loadPrivateKey(cloud);

    // 6. 调用微信支付 JSAPI 统一下单
    const description = (order.items && order.items[0] && order.items[0].name)
        ? order.items[0].name.substring(0, 127)
        : '商品支付';

    const wxResult = await jsapiOrder(openid, order.order_no, amountInFen, description, privateKey);

    if (!wxResult.prepay_id) {
        console.error('[PaymentPrepay] 微信下单失败:', JSON.stringify(wxResult));
        throw new Error('微信支付下单失败: ' + (wxResult.message || '未返回 prepay_id'));
    }

    // 7. 生成小程序支付参数
    const payParams = buildMiniPayParams(wxResult.prepay_id, privateKey);

    // 8. 记录预支付信息到订单
    await db.collection('orders').doc(orderId).update({
        data: {
            prepay_id: wxResult.prepay_id,
            pay_params: payParams,
            updated_at: db.serverDate(),
        },
    });

    return {
        order_id: orderId,
        order_no: order.order_no,
        pay_amount: payAmount,
        ...payParams,
    };
}

/**
 * 生成微信支付预支付信息（兼容旧调用）
 */
async function generatePrepayInfo(orderId, amount, description) {
    const privateKey = await loadPrivateKey(cloud);
    const amountInFen = Math.round(amount * 100);
    const wxResult = await jsapiOrder('', orderId, amountInFen, description, privateKey);
    return buildMiniPayParams(wxResult.prepay_id, privateKey);
}

module.exports = {
    generatePrepayInfo,
    preparePay,
};
