'use strict';
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { loadPaymentConfig } = require('./config');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const WECHAT_PAY_API_BASE = 'https://api.mch.weixin.qq.com';

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

async function getCurrentUserDoc(openid) {
    if (!openid) return null;
    const result = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }));
    return result.data[0] || null;
}

function buildIdentitySet(openid, userDoc) {
    const identities = new Set();
    [openid, userDoc?.openid, userDoc?.id, userDoc?._id, userDoc?._legacy_id].forEach((value) => {
        if (value != null && value !== '') identities.add(String(value));
    });
    return identities;
}

function rowMatchesIdentity(row, identities, fields = ['openid', 'buyer_id', 'user_id']) {
    if (!row || !identities || identities.size === 0) return false;
    return fields.some((field) => row[field] != null && identities.has(String(row[field])));
}

function isHttpEvent(event) {
    return !!(event && (event.httpMethod || event.requestContext || event.headers));
}

function toBufferFromBase64(value) {
    return Buffer.from(String(value || ''), 'base64');
}

function randomNonce(length = 32) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function toPlainObject(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(String(value));
    } catch (_) {
        return fallback;
    }
}

function normalizeHttpHeaders(headers = {}) {
    const result = {};
    Object.keys(headers || {}).forEach((key) => {
        result[String(key).toLowerCase()] = headers[key];
    });
    return result;
}

function parseHttpBody(event) {
    if (event.body == null || event.body === '') return {};
    if (typeof event.body === 'object') return event.body;
    try {
        return JSON.parse(event.body);
    } catch (_) {
        return { _raw: String(event.body) };
    }
}

function formatHttpResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(body),
        isBase64Encoded: false
    };
}

function buildWechatSignature(message, privateKey) {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(message);
    signer.end();
    return signer.sign(privateKey, 'base64');
}

function buildWechatAuthorization(method, pathWithQuery, bodyText, config) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = randomNonce(32);
    const message = `${method}\n${pathWithQuery}\n${timestamp}\n${nonceStr}\n${bodyText}\n`;
    const signature = buildWechatSignature(message, config.wechat.privateKey);
    return {
        timestamp,
        nonceStr,
        authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${config.wechat.mchid}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.wechat.serialNo}"`
    };
}

async function callWechatPay(method, pathWithQuery, payload, config) {
    const bodyText = payload ? JSON.stringify(payload) : '';
    const auth = buildWechatAuthorization(method, pathWithQuery, bodyText, config);
    const response = await fetch(`${WECHAT_PAY_API_BASE}${pathWithQuery}`, {
        method,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: auth.authorization,
            'User-Agent': 'wenlan-cloudbase-payment/1.0.0'
        },
        body: bodyText || undefined
    });

    const text = await response.text();
    const json = toPlainObject(text, null);
    if (!response.ok) {
        const error = new Error(json?.message || text || `微信支付请求失败: ${response.status}`);
        error.statusCode = response.status;
        error.responseText = text;
        error.responseJson = json;
        throw error;
    }
    return json || {};
}

function normalizeOrderAmount(order) {
    const candidate = order.pay_amount != null ? order.pay_amount : (order.actual_price != null ? order.actual_price : order.total_amount);
    const rawAmount = toNumber(candidate, 0);
    // 判断金额单位：如果 > 1000 则认为已经以"分"为单位，否则为"元"
    const amountFen = rawAmount > 1000 ? Math.round(rawAmount) : Math.round(rawAmount * 100);
    return amountFen > 0 ? amountFen : 0;
}

function pickOrderDescription(order) {
    const item = Array.isArray(order.items) ? order.items[0] : null;
    return item?.snapshot_name || item?.product_name || item?.name || order.product?.name || '问兰订单';
}

async function createWechatJsapiPayment(order, openid, config) {
    const amount = normalizeOrderAmount(order);
    const payload = {
        appid: config.wechat.appid,
        mchid: config.wechat.mchid,
        description: pickOrderDescription(order),
        out_trade_no: order.order_no,
        notify_url: config.wechat.notifyUrl,
        amount: {
            total: amount,
            currency: 'CNY'
        },
        payer: {
            openid
        }
    };
    const result = await callWechatPay('POST', '/v3/pay/transactions/jsapi', payload, config);
    if (!result.prepay_id) {
        throw new Error('微信支付未返回 prepay_id');
    }
    return {
        amount,
        payload,
        prepayId: result.prepay_id
    };
}

function buildMiniProgramPayParams(prepayId, config) {
    const timeStamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = randomNonce(32);
    const pkg = `prepay_id=${prepayId}`;
    const signMessage = `${config.wechat.appid}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
    const paySign = buildWechatSignature(signMessage, config.wechat.privateKey);
    return {
        timeStamp,
        nonceStr,
        package: pkg,
        signType: 'RSA',
        paySign
    };
}

function verifyWechatSignature(headers, bodyText, config) {
    const signature = String(headers['wechatpay-signature'] || '');
    const timestamp = String(headers['wechatpay-timestamp'] || '');
    const nonce = String(headers['wechatpay-nonce'] || '');
    if (!signature || !timestamp || !nonce) {
        throw new Error('缺少微信支付回调签名头');
    }
    const message = `${timestamp}\n${nonce}\n${bodyText}\n`;
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(message);
    verify.end();
    const publicKey = config.wechat.publicKey || config.wechat.platformCert;
    if (!publicKey) throw new Error('未配置微信支付验签公钥或平台证书');
    const valid = verify.verify(publicKey, signature, 'base64');
    if (!valid) throw new Error('微信支付回调验签失败');
}

function decryptWechatResource(resource, config) {
    const key = Buffer.from(config.wechat.apiV3Key, 'utf8');
    const nonce = Buffer.from(resource.nonce, 'utf8');
    const associatedData = Buffer.from(resource.associated_data || '', 'utf8');
    const ciphertext = toBufferFromBase64(resource.ciphertext);
    const authTag = ciphertext.subarray(ciphertext.length - 16);
    const data = ciphertext.subarray(0, ciphertext.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(authTag);
    if (associatedData.length) decipher.setAAD(associatedData);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
}

async function queryWechatOrderByOrderNo(orderNo, config) {
    const encoded = encodeURIComponent(orderNo);
    const query = `mchid=${encodeURIComponent(config.wechat.mchid)}`;
    return callWechatPay('GET', `/v3/pay/transactions/out-trade-no/${encoded}?${query}`, null, config);
}

async function handleWechatNotifyFromHttp(event, config) {
    const rawBody = typeof event.body === 'string' ? event.body : JSON.stringify(event.body || {});
    const headers = normalizeHttpHeaders(event.headers);

    verifyWechatSignature(headers, rawBody, config);

    const parsed = toPlainObject(rawBody, {});
    const resource = parsed.resource;
    if (!resource?.ciphertext) {
        throw new Error('微信支付回调缺少加密资源');
    }

    const decrypted = decryptWechatResource(resource, config);
    const order = await getOrderByOrderNo(decrypted.out_trade_no);
    if (!order) {
        return formatHttpResponse(404, { code: 'ORDER_NOT_FOUND', message: '订单不存在' });
    }

    if (String(decrypted.trade_state) === 'SUCCESS') {
        await markOrderPaid(order, {
            payment_method: 'wechat',
            transaction_id: decrypted.transaction_id || '',
            config
        });
    } else {
        await updateOrderPayment(order, {
            config,
            payment_method: 'wechat',
            payment_status: String(decrypted.trade_state || '').toLowerCase() || 'unknown',
            payment_payload: {
                notify: decrypted
            }
        });
    }

    return formatHttpResponse(200, { code: 'SUCCESS', message: '成功' });
}

function isPaidLikeStatus(status) {
    return ['pending_ship', 'shipped', 'completed', 'refunding', 'refunded'].includes(status);
}

function isCancelableStatus(status) {
    return ['pending', 'pending_payment'].includes(status);
}

function exposeStatus(order) {
    if (order.status === 'pending_payment') return 'pending';
    if (order.status === 'pending_ship') return 'paid';
    return order.status;
}

function normalizePaymentMeta(order, config) {
    const paymentConfig = config || loadPaymentConfig();
    return {
        payment_mode: paymentConfig.mode,
        payment_provider: paymentConfig.provider,
        payment_configured: paymentConfig.formalConfigured,
        payment_last_status: order.status,
        payment_last_display_status: exposeStatus(order)
    };
}

async function getOrderById(openid, orderId) {
    const userDoc = await getCurrentUserDoc(openid);
    const identities = buildIdentitySet(openid, userDoc);
    const rows = await Promise.all([
        db.collection('orders').where({ _id: String(orderId), openid }).limit(1).get().catch(() => ({ data: [] })),
        db.collection('orders').where({ _id: String(orderId), buyer_id: openid }).limit(1).get().catch(() => ({ data: [] }))
    ]);
    const first = rows[0].data[0] || rows[1].data[0];
    if (first) return first;
    const byDoc = await db.collection('orders').doc(String(orderId)).get().catch(() => ({ data: null }));
    if (byDoc.data && rowMatchesIdentity(byDoc.data, identities)) return byDoc.data;
    return null;
}

async function getOrderByOrderNo(orderNo) {
    const res = await db.collection('orders').where({ order_no: String(orderNo) }).limit(1).get().catch(() => ({ data: [] }));
    return res.data[0] || null;
}

async function updateOrderPayment(order, extra = {}) {
    const current = await db.collection('orders').doc(order._id).get().catch(() => ({ data: null }));
    const currentDoc = current.data || order;
    const attempts = toNumber(currentDoc.payment_attempt_count, 0) + 1;
    const paymentConfig = extra.config || loadPaymentConfig();
    const data = {
        ...normalizePaymentMeta(currentDoc, paymentConfig),
        payment_attempt_count: attempts,
        payment_attempt_at: db.serverDate(),
        updated_at: db.serverDate(),
        payment_method: extra.payment_method || currentDoc.payment_method || 'wechat'
    };
    if (extra.transaction_id) data.transaction_id = extra.transaction_id;
    if (extra.payment_status) data.payment_status = extra.payment_status;
    if (extra.payment_payload) data.payment_payload = extra.payment_payload;
    if (extra.status) data.status = extra.status;
    if (extra.paid_at) data.paid_at = extra.paid_at;
    await db.collection('orders').doc(order._id).update({ data });
}

async function markOrderPaid(order, extras = {}) {
    const current = await db.collection('orders').doc(order._id).get().catch(() => ({ data: null }));
    const currentDoc = current.data || order;
    if (isPaidLikeStatus(currentDoc.status)) {
        return { idempotent: true, order };
    }
    await updateOrderPayment(currentDoc, {
        ...extras,
        status: 'pending_ship',
        paid_at: db.serverDate(),
        payment_status: 'paid'
    });

    // ── 支付成功后触发佣金创建 ──
    try {
        const orderAmount = toNumber(
            currentDoc.pay_amount != null ? currentDoc.pay_amount : (currentDoc.actual_price != null ? currentDoc.actual_price : currentDoc.total_amount),
            0
        );
        const buyerOpenid = currentDoc.openid || currentDoc.buyer_id || '';
        const orderNo = currentDoc.order_no || '';
        const orderItems = Array.isArray(currentDoc.items) ? currentDoc.items : [];
        if (buyerOpenid && orderNo && orderAmount > 0) {
            await cloud.callFunction({
                name: 'distribution',
                data: {
                    action: 'createCommissions',
                    order_no: orderNo,
                    buyer_openid: buyerOpenid,
                    order_amount: orderAmount,
                    order_items: orderItems
                }
            }).catch((err) => {
                console.error('触发佣金创建失败（不影响支付流程）:', err);
            });
        }
    } catch (commErr) {
        // 佣金创建失败不影响支付流程
        console.error('佣金创建异常（不影响支付流程）:', commErr);
    }

    return { idempotent: false, order: { ...currentDoc, status: 'pending_ship' } };
}

function buildFormalConfigMessage(config) {
    if (config.formalConfigured) return '';
    return `正式支付未配置，缺少：${config.missingFormalKeys.join(', ')}`;
}

function buildPaymentDisabledResponse(config) {
    return {
        code: 503,
        success: false,
        message: config.mode === 'disabled'
            ? '支付功能当前已禁用，仅支持正式微信支付模式'
            : `不支持的支付模式：${config.mode}`,
        data: {
            payment_mode: config.mode,
            payment_provider: config.provider
        }
    };
}

function buildPaymentResponse(order, config, extras = {}) {
    const amount = toNumber(order.pay_amount != null ? order.pay_amount : order.actual_price, toNumber(order.total_amount, 0));
    const wxPayment = extras.wx_payment || null;
    return {
        code: 0,
        success: true,
        data: {
            order_id: order._id,
            order_no: order.order_no,
            total_amount: amount,
            payment_mode: config.mode,
            payment_provider: config.provider,
            payment_required: extras.payment_required !== undefined ? extras.payment_required : true,
            simulated: !!extras.simulated,
            configured: config.formalConfigured,
            idempotent: !!extras.idempotent,
            formal_check_summary: config.formalCheckSummary || {},
            private_key_path: config.wechat?.privateKeyPath || '',
            platform_cert_path: config.wechat?.platformCertPath || '',
            public_key_path: config.wechat?.publicKeyPath || '',
            wx_payment: wxPayment,
            timeStamp: wxPayment?.timeStamp || '',
            nonceStr: wxPayment?.nonceStr || '',
            package: wxPayment?.package || '',
            signType: wxPayment?.signType || 'RSA',
            paySign: wxPayment?.paySign || '',
            prepay_id: extras.prepay_id || '',
            notify_url: config.wechat?.notifyUrl || ''
        },
        message: extras.message || '支付动作已准备'
    };
}

async function readOrderForPayment(openid, orderId) {
    const order = await getOrderById(openid, orderId);
    if (!order) return null;
    return order;
}

exports.main = async (event) => {
    if (isHttpEvent(event)) {
        const config = loadPaymentConfig();
        const path = String(event.path || event.requestContext?.path || '/');
        const method = String(event.httpMethod || event.requestContext?.httpMethod || 'GET').toUpperCase();
        if (/payment-notify/i.test(path) || method === 'POST') {
            try {
                if (!config.formalConfigured) {
                    return formatHttpResponse(503, {
                        code: 'PAYMENT_CONFIG_MISSING',
                        message: buildFormalConfigMessage(config),
                        data: {
                            formal_check_summary: config.formalCheckSummary || {}
                        }
                    });
                }
                return await handleWechatNotifyFromHttp(event, config);
            } catch (error) {
                return formatHttpResponse(500, {
                    code: 'PAYMENT_NOTIFY_ERROR',
                    message: error.message || '支付回调处理失败'
                });
            }
        }
        return formatHttpResponse(404, { code: 'NOT_FOUND', message: '未找到支付 HTTP 路径' });
    }

    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const { action, order_id } = event;
    const config = loadPaymentConfig();

    if (config.mode === 'disabled') {
        return { code: 503, success: false, message: '支付功能已禁用' };
    }

    if (action === 'configCheck') {
        return {
            code: 0,
            success: true,
            data: {
                mode: config.mode,
                provider: config.provider,
                formal_configured: config.formalConfigured,
                missing_formal_keys: config.missingFormalKeys,
                formal_check_summary: config.formalCheckSummary || {},
                notify_url: config.wechat?.notifyUrl || ''
            }
        };
    }

    if (action === 'prepay') {
        const order = await readOrderForPayment(openid, order_id);
        if (!order) return { code: 404, success: false, message: '订单不存在' };

        if (!isCancelableStatus(order.status)) {
            return { code: 400, success: false, message: `当前状态无法支付：${exposeStatus(order)}` };
        }

        const amount = toNumber(order.pay_amount != null ? order.pay_amount : order.actual_price, toNumber(order.total_amount, 0));
        const useWallet = !!event.use_wallet_balance;

        if (amount <= 0) {
            await markOrderPaid(order, {
                payment_method: 'free',
                transaction_id: '',
                config
            });
            return {
                code: 0,
                success: true,
                data: {
                    paid_by_free: true,
                    message: '订单金额为0，已自动完成支付'
                }
            };
        }

        if (config.mode !== 'formal') {
            return buildPaymentDisabledResponse(config);
        }
        if (!config.formalConfigured) {
            return {
                code: 503,
                success: false,
                message: buildFormalConfigMessage(config),
                data: {
                    formal_check_summary: config.formalCheckSummary || {},
                    private_key_path: config.wechat?.privateKeyPath || '',
                    platform_cert_path: config.wechat?.platformCertPath || ''
                }
            };
        }
        try {
            const prepay = await createWechatJsapiPayment(order, openid, config);
            const wxPayment = buildMiniProgramPayParams(prepay.prepayId, config);
            await updateOrderPayment(order, {
                config,
                payment_method: useWallet ? 'wallet' : config.provider,
                payment_status: 'awaiting_payment',
                payment_payload: {
                    use_wallet_balance: useWallet,
                    amount: prepay.amount,
                    prepay_id: prepay.prepayId,
                    wx_payment: wxPayment
                }
            });

            return buildPaymentResponse(order, config, {
                payment_required: true,
                simulated: false,
                message: '正式支付参数已生成',
                idempotent: false,
                wx_payment: wxPayment,
                prepay_id: prepay.prepayId
            });
        } catch (error) {
            return {
                code: error.statusCode || 500,
                success: false,
                message: error.message || '生成微信支付参数失败',
                data: {
                    raw: error.responseJson || error.responseText || '',
                    formal_check_summary: config.formalCheckSummary || {}
                }
            };
        }
    }

    if (action === 'queryStatus') {
        const order = await readOrderForPayment(openid, order_id);
        if (!order) return { code: 404, success: false, message: '订单不存在' };
        const status = exposeStatus(order);
        return {
            code: 0,
            success: true,
            data: {
                status,
                raw_status: order.status,
                paid: !['pending', 'pending_payment'].includes(order.status)
            }
        };
    }

    if (action === 'syncWechatPay') {
        const order = await readOrderForPayment(openid, order_id);
        if (!order) return { code: 404, success: false, message: '订单不存在' };
        if (config.mode !== 'formal') {
            return buildPaymentDisabledResponse(config);
        }
        if (!config.formalConfigured) {
            return {
                code: 503,
                success: false,
                message: buildFormalConfigMessage(config),
                data: {
                    formal_check_summary: config.formalCheckSummary || {},
                    private_key_path: config.wechat?.privateKeyPath || '',
                    platform_cert_path: config.wechat?.platformCertPath || ''
                }
            };
        }
        try {
            const result = await queryWechatOrderByOrderNo(order.order_no, config);
            const tradeState = String(result.trade_state || '').toUpperCase();
            if (tradeState === 'SUCCESS') {
                await markOrderPaid(order, {
                    payment_method: 'wechat',
                    transaction_id: result.transaction_id || '',
                    config
                });
            }
            return {
                code: 0,
                success: true,
                data: {
                    synced: true,
                    status: tradeState === 'SUCCESS' ? 'paid' : exposeStatus(order),
                    raw_status: tradeState || order.status,
                    wechat_trade_state: tradeState,
                    transaction_id: result.transaction_id || ''
                }
            };
        } catch (error) {
            return {
                code: error.statusCode || 500,
                success: false,
                message: error.message || '同步微信支付状态失败',
                data: {
                    raw: error.responseJson || error.responseText || ''
                }
            };
        }
    }

    if (action === 'notify') {
        const { outTradeNo, transactionId } = event;
        if (!outTradeNo) return { code: 400, success: false, message: '缺少 outTradeNo' };
        if (config.mode !== 'formal') {
            return buildPaymentDisabledResponse(config);
        }
        if (!config.formalConfigured) {
            return {
                code: 503,
                success: false,
                message: buildFormalConfigMessage(config),
                data: {
                    formal_check_summary: config.formalCheckSummary || {},
                    private_key_path: config.wechat?.privateKeyPath || '',
                    platform_cert_path: config.wechat?.platformCertPath || ''
                }
            };
        }
        const order = await getOrderByOrderNo(outTradeNo);
        if (!order) return { code: 404, success: false, message: '订单不存在' };
        if (isPaidLikeStatus(order.status)) {
            return { code: 0, success: true, data: { idempotent: true, status: exposeStatus(order), raw_status: order.status } };
        }
        await markOrderPaid(order, {
            payment_method: 'wechat',
            transaction_id: transactionId || '',
            config
        });
        return { code: 0, success: true, data: { idempotent: false, status: 'paid' } };
    }

    return { code: 400, success: false, message: `未知 action: ${action}` };
};
