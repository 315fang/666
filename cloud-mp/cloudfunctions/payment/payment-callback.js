'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { verifySignature, decryptResource, loadPublicKey } = require('./wechat-pay-v3');

/**
 * 处理微信支付 V3 回调通知
 * 
 * 回调数据格式（V3）:
 * {
 *   "id": "...",
 *   "create_time": "...",
 *   "resource_type": "encrypt-resource",
 *   "event_type": "TRANSACTION.SUCCESS",
 *   "resource": {
 *     "algorithm": "AEAD_AES_256_GCM",
 *     "ciphertext": "...",
 *     "nonce": "...",
 *     "associated_data": "transaction"
 *   }
 * }
 */
async function handleCallback(event) {
    try {
        // 1. 提取回调头和请求体
        const headers = event.headers || {};
        const body = typeof event.body === 'string' ? event.body : JSON.stringify(event.body || event);

        // 2. 验证签名
        const wxTimestamp = headers['wechatpay-timestamp'] || headers['Wechatpay-Timestamp'];
        const wxNonce = headers['wechatpay-nonce'] || headers['Wechatpay-Nonce'];
        const wxSignature = headers['wechatpay-signature'] || headers['Wechatpay-Signature'];

        if (wxTimestamp && wxNonce && wxSignature) {
            try {
                const publicKey = await loadPublicKey(cloud);
                const isValid = verifySignature(wxTimestamp, wxNonce, body, wxSignature, publicKey);
                if (!isValid) {
                    console.error('[PaymentCallback] 签名验证失败');
                    return { code: 'FAIL', message: 'Signature verification failed' };
                }
            } catch (verifyErr) {
                console.warn('[PaymentCallback] 签名验证异常（继续处理）:', verifyErr.message);
                // 签名验证失败不阻断，记录日志后继续
            }
        }

        // 3. 解析回调数据
        let callbackData;
        try {
            callbackData = typeof event.body === 'object' ? event.body : JSON.parse(body);
        } catch (e) {
            console.error('[PaymentCallback] 回调数据解析失败:', e.message);
            return { code: 'FAIL', message: 'Invalid callback data' };
        }

        // 4. 解密资源数据
        let transaction;
        if (callbackData.resource && callbackData.resource.ciphertext) {
            try {
                transaction = decryptResource(
                    callbackData.resource.ciphertext,
                    callbackData.resource.nonce,
                    callbackData.resource.associated_data || 'transaction'
                );
            } catch (decryptErr) {
                console.error('[PaymentCallback] 解密失败:', decryptErr.message);
                return { code: 'FAIL', message: 'Decryption failed' };
            }
        } else {
            // 兼容非加密格式（测试/旧版）
            transaction = callbackData;
        }

        const eventType = callbackData.event_type || '';
        const outTradeNo = transaction.out_trade_no;
        const tradeState = transaction.trade_state;

        console.log(`[PaymentCallback] event_type=${eventType}, out_trade_no=${outTradeNo}, trade_state=${tradeState}`);

        // 5. 处理支付成功
        if (tradeState === 'SUCCESS' && outTradeNo) {
            const orderRes = await db.collection('orders')
                .where({ order_no: outTradeNo })
                .limit(1)
                .get();

            if (orderRes.data && orderRes.data.length > 0) {
                const order = orderRes.data[0];

                // 幂等：已支付不重复处理
                if (order.status === 'paid' || order.status === 'shipped' || order.status === 'completed') {
                    return { code: 'SUCCESS', message: 'Already processed' };
                }

                // 更新订单状态
                await db.collection('orders').doc(order._id).update({
                    data: {
                        status: 'paid',
                        paid_at: db.serverDate(),
                        trade_id: transaction.transaction_id || '',
                        pay_time: transaction.success_time ? new Date(transaction.success_time) : db.serverDate(),
                        updated_at: db.serverDate(),
                    },
                });

                // 6. 支付成功后续处理
                try {
                    // 6.1 增加用户积分（消费1元=1积分）
                    const payAmount = order.pay_amount || order.total_amount || 0;
                    const pointsEarned = Math.floor(payAmount);
                    if (pointsEarned > 0 && order.openid) {
                        await db.collection('users').where({ openid: order.openid }).update({
                            data: {
                                points: _.inc(pointsEarned),
                                growth_value: _.inc(pointsEarned),
                                total_spent: _.inc(payAmount),
                                order_count: _.inc(1),
                                updated_at: db.serverDate(),
                            },
                        });

                        // 记录积分日志
                        await db.collection('point_logs').add({
                            data: {
                                openid: order.openid,
                                type: 'earn',
                                amount: pointsEarned,
                                source: 'order_pay',
                                order_id: order._id,
                                description: `订单支付获得${pointsEarned}积分`,
                                created_at: db.serverDate(),
                            },
                        });
                    }

                    // 6.2 分销佣金计算 — 通过云函数调用确保走统一链路
                    try {
                        const userRes = await db.collection('users')
                            .where({ openid: order.openid })
                            .limit(1).get();
                        if (userRes.data && userRes.data.length > 0) {
                            const referrer = userRes.data[0].referrer_openid;
                            if (referrer) {
                                // 直接写入佣金记录（回调场景下无法 callFunction 调自己环境的云函数）
                                const commissionRate = 0.10;
                                const commissionAmount = Math.round(payAmount * commissionRate * 100) / 100;
                                if (commissionAmount > 0) {
                                    // 幂等检查
                                    const existingComm = await db.collection('commissions')
                                        .where({ order_id: order._id, openid: referrer })
                                        .limit(1).get().catch(() => ({ data: [] }));
                                    if (!existingComm.data || existingComm.data.length === 0) {
                                        await db.collection('commissions').add({
                                            data: {
                                                openid: referrer,
                                                from_openid: order.openid,
                                                order_id: order._id,
                                                order_no: order.order_no,
                                                amount: commissionAmount,
                                                rate: commissionRate,
                                                status: 'pending',
                                                created_at: db.serverDate(),
                                            },
                                        });
                                    }
                                }
                            }
                        }
                    } catch (commErr) {
                        console.error('[PaymentCallback] 佣金计算失败:', commErr.message);
                    }

                    // 6.3 扣减库存
                    try {
                        const items = order.items || [];
                        for (const item of items) {
                            if (item.product_id) {
                                await db.collection('products').doc(String(item.product_id)).update({
                                    data: { stock: _.inc(-(item.qty || 1)), sales_count: _.inc(item.qty || 1) },
                                }).catch(() => {});
                            }
                            if (item.sku_id) {
                                await db.collection('skus').doc(String(item.sku_id)).update({
                                    data: { stock: _.inc(-(item.qty || 1)) },
                                }).catch(() => {});
                            }
                        }
                    } catch (stockErr) {
                        console.error('[PaymentCallback] 库存扣减失败:', stockErr.message);
                    }

                    // 6.4 核销优惠券（二次确认，防止创建订单时未核销）
                    if (order.coupon_id) {
                        await db.collection('user_coupons')
                            .where({ openid: order.openid, coupon_id: order.coupon_id, status: 'unused' })
                            .update({ data: { status: 'used', used_at: db.serverDate() } })
                            .catch(() => {});
                    }
                } catch (postErr) {
                    console.error('[PaymentCallback] 后续处理失败:', postErr.message);
                    // 不影响回调响应
                }

                return { code: 'SUCCESS', message: 'Payment processed' };
            }

            return { code: 'FAIL', message: 'Order not found' };
        }

        // 6. 处理支付关闭/退款等事件
        if (tradeState === 'CLOSED') {
            await db.collection('orders').where({ order_no: outTradeNo }).update({
                data: { status: 'closed', updated_at: db.serverDate() },
            }).catch(() => {});
            return { code: 'SUCCESS', message: 'Order closed' };
        }

        if (tradeState === 'REFUND') {
            // 退款通知在 refund 模块处理
            return { code: 'SUCCESS', message: 'Refund notification received' };
        }

        if (tradeState === 'NOTPAY' || tradeState === 'USERPAYING') {
            return { code: 'SUCCESS', message: 'Pending payment' };
        }

        return { code: 'SUCCESS', message: `Trade state: ${tradeState}` };
    } catch (err) {
        console.error('[PaymentCallback] 处理异常:', err);
        return { code: 'FAIL', message: err.message };
    }
}

module.exports = {
    handleCallback,
};
