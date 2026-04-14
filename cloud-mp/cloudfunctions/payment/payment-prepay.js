'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { toNumber } = require('./shared/utils');
const { jsapiOrder, buildMiniPayParams, loadPrivateKey } = require('./wechat-pay-v3');
const { processPaidOrder } = require('./payment-callback');
const {
    buildPaymentWritePatch,
    resolveOrderPayAmount,
    resolvePostPayStatus
} = require('./shared/order-payment');

/**
 * 货款余额支付（内部扣减，不走微信支付）
 * 适用于：从订单详情页发起的货款支付
 */
async function payByWalletBalance(openid, orderId, order, payAmount) {
    // 原子扣减：余额必须 >= payAmount
    const deductRes = await db.collection('users')
        .where({ openid, agent_wallet_balance: _.gte(payAmount) })
        .update({
            data: {
                agent_wallet_balance: _.inc(-payAmount),
                goods_fund_total_spent: _.inc(payAmount),
                updated_at: db.serverDate()
            }
        });

    if (!deductRes.stats || deductRes.stats.updated === 0) {
        // 查询真实余额用于提示
        const userSnap = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }));
        const realBalance = toNumber(userSnap.data && userSnap.data[0] && userSnap.data[0].agent_wallet_balance, 0);
        return {
            paid_by_wallet: false,
            wallet_balance_insufficient: true,
            wallet_balance: realBalance
        };
    }
    try {
        const postPayStatus = resolvePostPayStatus(order);
        // 订单标为已付款
        await db.collection('orders').doc(orderId).update({
            data: buildPaymentWritePatch('goods_fund', payAmount, {
                status: postPayStatus,
                paid_at: db.serverDate(),
                updated_at: db.serverDate()
            })
        });

        // 写货款流水
        await db.collection('goods_fund_logs').add({
            data: {
                openid,
                type: 'spend',
                amount: -payAmount,
                order_id: orderId,
                order_no: order.order_no || '',
                remark: `货款支付订单 ${order.order_no || orderId}`,
                created_at: db.serverDate()
            }
        });
    } catch (err) {
        await db.collection('users')
            .where({ openid })
            .update({
                data: {
                    agent_wallet_balance: _.inc(payAmount),
                    goods_fund_total_spent: _.inc(-payAmount),
                    updated_at: db.serverDate()
                }
            })
            .catch(() => {});
        await db.collection('orders').doc(orderId).update({
            data: buildPaymentWritePatch('', payAmount, {
                status: 'pending_payment',
                paid_at: null,
                updated_at: db.serverDate()
            })
        }).catch(() => {});
        throw new Error(`货款支付流水或订单状态写入失败：${err.message}`);
    }

    // 触发订单后续处理（佣金计算、积分等）
    await processPaidOrder(orderId, {
        ...order,
        status: resolvePostPayStatus(order),
        payment_method: 'goods_fund',
        pay_amount: payAmount,
        paid_at: new Date()
    })
        .catch((err) => console.error('[prepay] processPaidOrder 货款支付后处理失败:', err.message));

    return {
        paid_by_wallet: true,
        order_id: orderId,
        order_no: order.order_no
    };
}

/**
 * 预支付 — 调用微信支付 V3 JSAPI 下单
 * @param {string} openid - 用户 openid
 * @param {Object} params - { order_id, use_wallet_balance? }
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
    const payAmount = resolveOrderPayAmount(order, 0);
    const amountInFen = Math.round(payAmount * 100);

    // 4a. 货款余额支付分支（代理商专属）
    if (params.use_wallet_balance) {
        if (payAmount <= 0) {
            const postPayStatus = resolvePostPayStatus(order);
            // 零元订单直接完成
            await db.collection('orders').doc(orderId).update({
                data: buildPaymentWritePatch('', 0, {
                    status: postPayStatus,
                    pay_channel: 'free',
                    paid_at: db.serverDate(),
                    updated_at: db.serverDate()
                })
            });
            await processPaidOrder(orderId, { ...order, status: postPayStatus, pay_amount: 0, paid_at: new Date() });
            return { paid_by_free: true, paid_by_wallet: false, order_id: orderId };
        }
        return await payByWalletBalance(openid, orderId, order, payAmount);
    }

    if (amountInFen <= 0) {
        const postPayStatus = resolvePostPayStatus(order);
        await db.collection('orders').doc(orderId).update({
            data: buildPaymentWritePatch('', 0, {
                status: postPayStatus,
                paid_at: db.serverDate(),
                pay_time: db.serverDate(),
                pay_channel: 'free',
                updated_at: db.serverDate(),
            }),
        });
        await processPaidOrder(orderId, { ...order, status: postPayStatus, pay_amount: 0, paid_at: new Date() });
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
