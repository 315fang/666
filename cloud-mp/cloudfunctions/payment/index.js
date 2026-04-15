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
const paymentQuery = require('./payment-query');
const paymentRefund = require('./payment-refund');
const { loadPaymentConfig } = require('./config');
const { queryRefundByOutRefundNo, loadPrivateKey } = require('./wechat-pay-v3');

// ==================== 主处理函数 ====================
async function handlePaymentAction(event, openid) {
    const { action, ...params } = event;

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

    // 支付回调 — 微信服务器调用，无 openid
    if (action === 'callback') {
        try {
            const result = await paymentCallback.handleCallback(params);
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

// ==================== 云函数导出 ====================
exports.main = async (event, context) => {
    // 支付回调：微信服务器 HTTP 调用，可能没有 openid
    if (event.action === 'callback' || event.action === 'syncRefundStatus') {
        return handlePaymentAction(event, '');
    }

    // 兼容微信HTTP触发器直接 POST 过来的回调（event.body 为字符串）
    if (event.httpMethod === 'POST' && event.body) {
        try {
            const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
            if (body && body.resource) {
                return handlePaymentAction({ action: 'callback', ...body }, '');
            }
        } catch (e) {
            console.error('[Payment] HTTP body 解析失败:', e.message);
        }
    }

    // 兼容微信回调直接合并到 event 的情况（部分 CloudBase 版本行为）
    if (!event.action && event.resource && event.event_type) {
        return handlePaymentAction({ action: 'callback', ...event }, '');
    }

    // 其他操作：需要用户登录
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    if (!openid) {
        throw unauthorized('未登录');
    }

    return cloudFunctionWrapper(async () => {
        return handlePaymentAction(event, openid);
    })();
};
