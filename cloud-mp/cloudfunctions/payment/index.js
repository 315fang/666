'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ==================== 共享模块导入 ====================
const {
    CloudBaseError, cloudFunctionWrapper
} = require('./shared/errors');
const {
    success, badRequest, unauthorized, notFound, serverError
} = require('./shared/response');

// ==================== 子模块导入 ====================
const paymentPrepay = require('./payment-prepay');
const paymentCallback = require('./payment-callback');
const paymentDeposit = require('./payment-deposit');
const paymentQuery = require('./payment-query');
const paymentRefund = require('./payment-refund');
const paymentTransfer = require('./payment-transfer');
const { loadPaymentConfig } = require('./config');
const { queryRefundByOutRefundNo, loadPrivateKey } = require('./wechat-pay-v3');

let isColdStart = true;

function buildTraceId(event) {
    const candidate = event && (
        event.trace_id
        || event.traceId
        || event.request_id
        || event.requestId
        || event.$requestId
    );
    if (candidate) return String(candidate);
    return `payment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseErrorCode(error) {
    if (!error) return 'unknown_error';
    if (error.code) return String(error.code);
    if (error.errCode) return String(error.errCode);
    return 'internal_error';
}

function logPerf(entry) {
    const payload = {
        kind: 'cf_perf',
        metric_version: 'phase1_v1',
        ts: new Date().toISOString(),
        function_name: 'payment',
        db_ms: null,
        ...entry
    };
    console.log(JSON.stringify(payload));
}

function canRunWithoutOpenid(event = {}) {
    const action = event && event.action ? String(event.action) : '';
    if (['syncRefundStatus', 'createWithdrawalTransfer', 'syncWithdrawalTransfer'].includes(action)) {
        return true;
    }
    if (action !== '_postProcessPaid') return false;
    return ['order-create'].includes(String(event.internal_source || '').trim());
}

// ==================== 主处理函数 ====================
async function handlePaymentAction(event, openid) {
    const { action, ...params } = event;
    const internalActions = new Set(['syncRefundStatus', 'refund', 'createWithdrawalTransfer', 'syncWithdrawalTransfer']);
    if (internalActions.has(action)) {
        const expectedToken = String(process.env.PAYMENT_INTERNAL_TOKEN || '').trim();
        const providedToken = String(params.internal_token || '').trim();
        if (!expectedToken || providedToken !== expectedToken) {
            throw unauthorized('内部支付接口禁止直接访问');
        }
    }

    if (action === 'prepay') {
        try {
            const result = await paymentPrepay.preparePay(openid, params);
            return success(result);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('Prepay error:', err);
            throw serverError('生成支付信息失败: ' + err.message);
        }
    }

    if (action === 'depositPrepay') {
        try {
            const result = await paymentDeposit.prepareDepositPay(openid, params);
            return success(result);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('DepositPrepay error:', err);
            throw serverError('生成押金支付信息失败: ' + err.message);
        }
    }

    // 支付回调 — 微信服务器调用，无 openid
    if (action === 'callback') {
        if (params.__trusted_http_callback !== true) {
            throw unauthorized('支付回调只能通过 HTTP 网关访问');
        }
        try {
            const { __trusted_http_callback, ...callbackParams } = params;
            const result = await paymentCallback.handleCallback(callbackParams);
            return result; // 直接返回微信要求的格式
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('Callback error:', err);
            return { code: 'FAIL', message: err.message };
        }
    }

    if (action === 'query') {
        try {
            const orderId = params.order_id || params.id;
            if (!orderId) throw badRequest('缺少订单 ID');
            const result = await paymentQuery.queryPaymentStatus(orderId, openid);
            return success(result);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('Query error:', err);
            throw serverError('查询支付状态失败: ' + err.message);
        }
    }

    if (action === 'syncRefundStatus') {
        try {
            const refundId = params.refund_id || params.id;
            const refundNo = params.refund_no || '';
            let refund = null;

            if (refundId) {
                refund = await db.collection('refunds').doc(String(refundId)).get().then(r => r.data).catch(() => null);
            }
            if (!refund && refundNo) {
                refund = await db.collection('refunds')
                    .where({ refund_no: String(refundNo) })
                    .limit(1)
                    .get()
                    .then(r => (r.data && r.data[0]) || null)
                    .catch(() => null);
            }
            if (!refund) throw badRequest('退款记录不存在');

            const effectiveRefundNo = String(refund.refund_no || refundNo || '').trim();
            if (!effectiveRefundNo) throw badRequest('退款单缺少 refund_no，无法同步微信状态');

            const config = loadPaymentConfig(process.env);
            if (!config.formalConfigured) {
                throw serverError(`微信退款查询配置不完整: ${config.missingFormalKeys.join(', ')}`);
            }

            const privateKey = await loadPrivateKey(cloud);
            const wxRefund = await queryRefundByOutRefundNo(effectiveRefundNo, privateKey);
            const refundStatus = String(wxRefund.status || wxRefund.refund_status || '').toUpperCase();

            if (!refundStatus) {
                throw serverError('微信退款查询未返回有效状态');
            }

            if (['SUCCESS', 'ABNORMAL', 'CLOSED'].includes(refundStatus)) {
                await paymentCallback.handleRefundCallback({
                    out_refund_no: effectiveRefundNo,
                    refund_id: wxRefund.refund_id || refund.wx_refund_id || '',
                    refund_status: refundStatus,
                    success_time: wxRefund.success_time || ''
                }, `REFUND.${refundStatus}`);
            } else {
                await db.collection('refunds').doc(String(refund._id)).update({
                    data: {
                        status: 'processing',
                        processing_at: refund.processing_at || db.serverDate(),
                        wx_refund_id: wxRefund.refund_id || refund.wx_refund_id || '',
                        wx_refund_status: refundStatus,
                        updated_at: db.serverDate()
                    }
                }).catch(() => {});
            }

            const freshRefund = await db.collection('refunds').doc(String(refund._id)).get().then(r => r.data).catch(() => null);
            return success({
                refund_id: freshRefund?._id || refund._id,
                refund_no: effectiveRefundNo,
                local_status: freshRefund?.status || refund.status,
                wechat_status: refundStatus,
                refund: freshRefund || refund
            });
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('SyncRefundStatus error:', err);
            throw serverError('同步微信退款状态失败: ' + err.message);
        }
    }

    if (action === 'createWithdrawalTransfer') {
        try {
            const result = await paymentTransfer.createWithdrawalTransfer(params);
            return success(result);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('CreateWithdrawalTransfer error:', err);
            throw serverError('微信提现发起失败: ' + err.message);
        }
    }

    if (action === 'syncWithdrawalTransfer') {
        try {
            const result = await paymentTransfer.queryWithdrawalTransferStatus(params);
            return success(result);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('SyncWithdrawalTransfer error:', err);
            throw serverError('同步微信提现状态失败: ' + err.message);
        }
    }

    if (action === 'refund') {
        try {
            const result = await paymentRefund.refundPayment(openid, params);
            return success(result);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('Refund error:', err);
            throw serverError('退款失败: ' + err.message);
        }
    }

    // 查询支付状态（queryStatus = query 的别名）
    if (action === 'queryStatus') {
        try {
            const orderId = params.order_id || params.id;
            if (!orderId) throw badRequest('缺少订单 ID');
            const result = await paymentQuery.queryPaymentStatus(orderId, openid);
            return success(result);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('QueryStatus error:', err);
            throw serverError('查询支付状态失败: ' + err.message);
        }
    }

    // 同步微信支付状态（主动查询微信侧并更新本地）
    if (action === 'syncWechatPay') {
        try {
            const orderId = params.order_id || params.id;
            if (!orderId) throw badRequest('缺少订单 ID');
            const result = await paymentQuery.queryPaymentStatus(orderId, openid);
            return success(result);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('SyncWechatPay error:', err);
            throw serverError('同步微信支付状态失败: ' + err.message);
        }
    }

    if (action === 'retryGroupJoin') {
        const orderId = params.order_id || params.id;
        if (!orderId) throw badRequest('缺少订单 ID');
        try {
            const order = await db.collection('orders').doc(orderId).get().then(r => r.data).catch(() => null);
            if (!order) throw badRequest('订单不存在');
            if (order.openid !== openid) throw badRequest('无权操作');
            if (order.status === 'pending_payment' || order.status === 'cancelled') throw badRequest('订单未支付');
            if (order.group_no && order.group_joined_at) {
                return success({ group_no: order.group_no, already_joined: true });
            }
            const result = await paymentCallback.processPaidOrder(orderId, order);
            const updated = await db.collection('orders').doc(orderId).get().then(r => r.data).catch(() => order);
            return success({ group_no: updated.group_no || '', result });
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('[Payment] retryGroupJoin error:', err.message);
            throw serverError('重试拼团入团失败: ' + err.message);
        }
    }

    // 内部调用：其它云函数通过 callFunction 触发支付后处理
    if (action === '_postProcessPaid') {
        const orderId = params.order_id || params.id;
        if (!orderId) throw badRequest('缺少订单 ID');
        try {
            const order = await db.collection('orders').doc(orderId).get().then(r => r.data).catch(() => null);
            if (!order) throw badRequest('订单不存在');
            const paidStatuses = ['paid', 'pending_group', 'pickup_pending', 'shipped', 'completed', 'agent_confirmed', 'shipping_requested'];
            if (!paidStatuses.includes(order.status)) {
                throw badRequest('订单未支付，不允许执行后处理');
            }
            if (openid && order.openid !== openid) {
                throw badRequest('无权操作此订单');
            }
            const result = await paymentCallback.processPaidOrder(orderId, order);
            return success(result);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('[Payment] _postProcessPaid error:', err.message);
            throw serverError('支付后处理失败: ' + err.message);
        }
    }

    throw badRequest(`未知 action: ${action}`);
}

function pickHeader(headers = {}, name) {
    if (!headers || typeof headers !== 'object') return '';
    const target = String(name || '').toLowerCase();
    const key = Object.keys(headers).find((item) => String(item).toLowerCase() === target);
    return key ? String(headers[key] || '').trim() : '';
}

function getHttpMethod(event = {}) {
    return String(
        event.httpMethod
        || event.method
        || event.requestContext?.httpMethod
        || event.requestContext?.http?.method
        || ''
    ).toUpperCase();
}

function normalizeHttpCallbackEvent(event = {}) {
    if (getHttpMethod(event) !== 'POST') return null;
    const headers = event.headers || {};
    let body = event.body;
    if (event.isBase64Encoded && typeof body === 'string') {
        body = Buffer.from(body, 'base64').toString('utf8');
    }
    if (body === undefined || body === null || body === '') return null;

    return {
        action: 'callback',
        __trusted_http_callback: true,
        headers,
        body
    };
}

// ==================== 云函数导出 ====================
exports.main = async (event, context) => {
    const startedAt = Date.now();
    const coldStart = isColdStart;
    isColdStart = false;
    const traceId = buildTraceId(event || {});
    const action = event && event.action ? event.action : '';

    // 支付回调：微信服务器 HTTP 调用，可能没有 openid
    try {
        let result;
        const httpCallbackEvent = normalizeHttpCallbackEvent(event || {});
        if (httpCallbackEvent) {
            result = await handlePaymentAction(httpCallbackEvent, '');
        } else if (canRunWithoutOpenid(event || {})) {
            result = await handlePaymentAction(event, '');
        }

        if (result === undefined) {
            const wxContext = cloud.getWXContext();
            const openid = wxContext.OPENID;

            if (!openid) {
                throw unauthorized('未登录');
            }

            result = await cloudFunctionWrapper(async () => {
                return handlePaymentAction(event, openid);
            })();
        }

        logPerf({
            action: action || 'callback',
            trace_id: traceId,
            cold_start: coldStart,
            status: 'ok',
            code: 'ok',
            total_ms: Date.now() - startedAt,
            cache_hit: false
        });
        return result;
    } catch (error) {
        logPerf({
            action: action || 'callback',
            trace_id: traceId,
            cold_start: coldStart,
            status: 'error',
            code: parseErrorCode(error),
            total_ms: Date.now() - startedAt,
            cache_hit: false
        });
        throw error;
    }
};
