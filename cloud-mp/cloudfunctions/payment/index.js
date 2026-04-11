'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

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
            const result = await paymentQuery.queryPaymentStatus(orderId);
            return success(result);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('Query error:', err);
            throw serverError('查询支付状态失败: ' + err.message);
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
            const result = await paymentQuery.queryPaymentStatus(orderId);
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
            const result = await paymentQuery.queryPaymentStatus(orderId);
            return success(result);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('SyncWechatPay error:', err);
            throw serverError('同步微信支付状态失败: ' + err.message);
        }
    }

    throw badRequest(`未知 action: ${action}`);
}

// ==================== 云函数导出 ====================
exports.main = async (event, context) => {
    // 支付回调：微信服务器 HTTP 调用，可能没有 openid
    if (event.action === 'callback') {
        return handlePaymentAction(event, '');
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
