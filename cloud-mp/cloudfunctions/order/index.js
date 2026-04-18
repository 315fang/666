'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const {
    CloudBaseError, cloudFunctionWrapper
} = require('./shared/errors');
const {
    success, badRequest, unauthorized, notFound, serverError
} = require('./shared/response');

// 子模块导入
const orderCreate = require('./order-create');
const orderQuery = require('./order-query');
const orderStatus = require('./order-status');
const orderLifecycle = require('./order-lifecycle');
const orderInteractive = require('./order-interactive');

// 已知的业务验证错误关键词，匹配时返回 400 而非 500，让前端展示具体原因
const VALIDATION_ERROR_PATTERNS = [
    '不存在', '不可用', '不属于', '未达到', '不足', '缺少', '不匹配',
    '已结束', '已过期', '已完成', '类型冲突', '仅限', '归属异常',
    '请返回', '请刷新', '请选择'
];

function isValidationError(msg) {
    if (!msg || typeof msg !== 'string') return false;
    return VALIDATION_ERROR_PATTERNS.some(p => msg.includes(p));
}

const asyncHandler = (handler) => async (...args) => {
    try {
        return await handler(...args);
    } catch (err) {
        if (err instanceof CloudBaseError) throw err;
        if (err && typeof err === 'object' && 'code' in err && 'success' in err && 'message' in err) throw err;
        const msg = err.message || '操作失败';
        throw isValidationError(msg) ? badRequest(msg) : serverError(msg);
    }
};

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
    return `order_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
        function_name: 'order',
        db_ms: null,
        ...entry
    };
    console.log(JSON.stringify(payload));
}

// 主处理函数
const handleAction = {
    // ===== 基础 CRUD =====
    'list': asyncHandler(async (openid, params) => {
        const result = await orderQuery.queryOrders(openid, params);
        return success(result);
    }),

    'counts': asyncHandler(async (openid) => {
        const db = cloud.database();
        const statuses = ['pending_payment', 'pending_group', 'paid', 'shipped'];
        const counts = {};
        await Promise.all(statuses.map(async (s) => {
            const res = await db.collection('orders').where({ openid, status: s }).count().catch(() => ({ total: 0 }));
            counts[s] = res.total || 0;
        }));
        const refundRes = await db.collection('refunds')
            .where({ openid, status: db.command.in(['pending', 'approved', 'processing']) })
            .count().catch(() => ({ total: 0 }));
        counts.pending = counts.pending_payment;
        counts.refund = refundRes.total || 0;
        return success(counts);
    }),

    'detail': asyncHandler(async (openid, params) => {
        const id = params.order_id || params.id;
        if (!id) throw badRequest('缺少订单 ID');
        const order = await orderQuery.getOrderDetail(openid, id);
        if (!order) throw notFound('订单不存在');
        return success(order);
    }),

    'create': asyncHandler(async (openid, params) => {
        const { items, address_id, coupon_id, user_coupon_id, memo, remark, delivery_type, pickup_station_id, points_to_use, type, group_activity_id, group_no, slash_no, use_goods_fund } = params;
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw badRequest('缺少商品信息');
        }
        const actualDeliveryType = delivery_type === 'pickup' ? 'pickup' : 'express';
        if (actualDeliveryType === 'express' && !address_id) throw badRequest('缺少收货地址');
        if (actualDeliveryType === 'pickup' && !pickup_station_id) throw badRequest('缺少自提门店');
        const order = await orderCreate.createOrder(openid, {
            items,
            address_id,
            coupon_id,
            user_coupon_id,
            memo: memo != null ? memo : remark,
            delivery_type: actualDeliveryType,
            pickup_station_id,
            points_to_use,
            type,
            group_activity_id,
            group_no,
            slash_no,
            use_goods_fund: !!use_goods_fund
        });
        return success({
            id: order._id,
            order_id: order._id,
            order_no: order.order_no,
            total_amount: order.total_amount,
            pay_amount: order.pay_amount,
            group_no: order.group_no || '',
            slash_no: order.slash_no || '',
            goods_fund_paid: order.goods_fund_paid || false
        });
    }),

    'createExchangeOrder': asyncHandler(async (openid, params) => {
        const { items, address_id, memo, remark, delivery_type, pickup_station_id, exchange_coupon_id } = params;
        if (!exchange_coupon_id) throw badRequest('缺少兑换券');
        if (!items || !Array.isArray(items) || items.length !== 1) {
            throw badRequest('兑换券订单仅支持单个商品');
        }
        const actualDeliveryType = delivery_type === 'pickup' ? 'pickup' : 'express';
        if (actualDeliveryType === 'express' && !address_id) throw badRequest('缺少收货地址');
        if (actualDeliveryType === 'pickup' && !pickup_station_id) throw badRequest('缺少自提门店');
        const order = await orderCreate.createExchangeOrder(openid, {
            items,
            address_id,
            memo: memo != null ? memo : remark,
            delivery_type: actualDeliveryType,
            pickup_station_id,
            exchange_coupon_id
        });
        return success({
            id: order._id,
            order_id: order._id,
            order_no: order.order_no,
            total_amount: order.total_amount,
            pay_amount: order.pay_amount,
            exchange_coupon_id
        });
    }),

    'status': asyncHandler(async (openid, params) => {
        const id = params.order_id || params.id;
        if (!id) throw badRequest('缺少订单 ID');
        const status = await orderStatus.getOrderStatus(openid, id);
        if (!status) throw notFound('订单不存在');
        return success(status);
    }),

    // ===== 订单生命周期 =====
    'cancel': asyncHandler(async (openid, params) => {
        const id = params.order_id || params.id;
        if (!id) throw badRequest('缺少订单 ID');
        const result = await orderLifecycle.cancelOrder(openid, id);
        return success(result);
    }),

    'confirm': asyncHandler(async (openid, params) => {
        const id = params.order_id || params.id;
        if (!id) throw badRequest('缺少订单 ID');
        const result = await orderLifecycle.confirmOrder(openid, id);
        return success(result);
    }),

    'review': asyncHandler(async (openid, params) => {
        const id = params.order_id || params.id;
        if (!id) throw badRequest('缺少订单 ID');
        const result = await orderLifecycle.reviewOrder(openid, id, {
            rating: params.rating,
            content: params.content,
            images: params.images,
        });
        return success(result);
    }),

    // ===== 退款 =====
    'applyRefund': asyncHandler(async (openid, params) => {
        const result = await orderLifecycle.applyRefund(openid, params);
        return success(result);
    }),

    'refundList': asyncHandler(async (openid, params) => {
        const result = await orderLifecycle.queryRefundList(openid, params);
        return success({ list: result });
    }),

    'refundDetail': asyncHandler(async (openid, params) => {
        const id = params.refund_id || params.id;
        if (!id) throw badRequest('缺少退款 ID');
        const result = await orderLifecycle.queryRefundDetail(openid, id);
        return success(result);
    }),

    'cancelRefund': asyncHandler(async (openid, params) => {
        const id = params.refund_id || params.id;
        if (!id) throw badRequest('缺少退款 ID');
        const result = await orderLifecycle.cancelRefund(openid, id);
        return success(result);
    }),

    'returnShipping': asyncHandler(async (openid, params) => {
        const id = params.refund_id || params.id;
        if (!id) throw badRequest('缺少退款 ID');
        const result = await orderLifecycle.returnShipping(openid, id, params);
        return success(result);
    }),

    // ===== 物流 =====
    'trackLogistics': asyncHandler(async (openid, params) => {
        const result = await orderLifecycle.trackLogistics(openid, params);
        return success(result);
    }),

    // ===== 拼团 =====
    'joinGroup': asyncHandler(async (openid, params) => {
        const result = await orderInteractive.joinGroup(openid, params);
        return success(result);
    }),

    'myGroups': asyncHandler(async (openid, params) => {
        const result = await orderInteractive.myGroups(openid, params);
        return success(result);
    }),

    'groupOrderDetail': asyncHandler(async (openid, params) => {
        const result = await orderInteractive.groupOrderDetail(openid, params);
        return success(result);
    }),

    // ===== 砍价 =====
    'slashStart': asyncHandler(async (openid, params) => {
        const result = await orderInteractive.slashStart(openid, params);
        return success(result);
    }),

    'slashHelp': asyncHandler(async (openid, params) => {
        const result = await orderInteractive.slashHelp(openid, params);
        return success(result);
    }),

    'slashDetail': asyncHandler(async (openid, params) => {
        const result = await orderInteractive.slashDetail(openid, params);
        return success(result);
    }),

    'mySlashList': asyncHandler(async (openid, params) => {
        const result = await orderInteractive.mySlashList(openid, params);
        return success(result);
    }),

    // ===== 抽奖 =====
    'lotteryDraw': asyncHandler(async (openid, params) => {
        const result = await orderInteractive.lotteryDraw(openid, params);
        return success(result);
    }),

    // ===== 自提核销 =====
    'pickupPendingOrders': asyncHandler(async (openid, params) => {
        const result = await orderInteractive.pickupPendingOrders(openid, params);
        return success(result);
    }),

    'pickupMyOrder': asyncHandler(async (openid, params) => {
        const result = await orderInteractive.pickupMyOrder(openid, params);
        return success(result);
    }),

    'pickupVerifyCode': asyncHandler(async (openid, params) => {
        const result = await orderInteractive.pickupVerifyCode(openid, params);
        return success(result);
    }),

    'pickupVerifyQr': asyncHandler(async (openid, params) => {
        const result = await orderInteractive.pickupVerifyQr(openid, params);
        return success(result);
    }),
};

exports.main = cloudFunctionWrapper(async (event) => {
    const startedAt = Date.now();
    const coldStart = isColdStart;
    isColdStart = false;
    const traceId = buildTraceId(event || {});
    const action = event && event.action ? event.action : '';

    try {
        const wxContext = cloud.getWXContext();
        const openid = wxContext.OPENID;

        if (!openid) {
            throw unauthorized('未登录');
        }

        const { action: currentAction, ...params } = event;
        const handler = handleAction[currentAction];

        if (!handler) {
            throw badRequest(`未知 action: ${currentAction}`);
        }

        const result = await handler(openid, params);
        logPerf({
            action: currentAction,
            trace_id: traceId,
            cold_start: coldStart,
            status: 'ok',
            code: 'ok',
            total_ms: Date.now() - startedAt
        });
        return result;
    } catch (error) {
        logPerf({
            action,
            trace_id: traceId,
            cold_start: coldStart,
            status: 'error',
            code: parseErrorCode(error),
            total_ms: Date.now() - startedAt
        });
        throw error;
    }
});
