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

// 异步处理包装
const asyncHandler = (handler) => async (...args) => {
    try {
        return await handler(...args);
    } catch (err) {
        if (err instanceof CloudBaseError) throw err;
        if (err && typeof err === 'object' && 'code' in err && 'success' in err && 'message' in err) throw err;
        throw serverError(err.message || '操作失败');
    }
};

// 主处理函数
const handleAction = {
    // ===== 基础 CRUD =====
    'list': asyncHandler(async (openid, params) => {
        const result = await orderQuery.queryOrders(openid, params);
        return success(result);
    }),

    'detail': asyncHandler(async (openid, params) => {
        const id = params.order_id || params.id;
        if (!id) throw badRequest('缺少订单 ID');
        const order = await orderQuery.getOrderDetail(openid, id);
        if (!order) throw notFound('订单不存在');
        return success(order);
    }),

    'create': asyncHandler(async (openid, params) => {
        const { items, address_id, coupon_id, memo, delivery_type, pickup_station_id, points_to_use, type, group_activity_id, group_no } = params;
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw badRequest('缺少商品信息');
        }
        if (!address_id) throw badRequest('缺少收货地址');
        const order = await orderCreate.createOrder(openid, {
            items, address_id, coupon_id, memo, delivery_type, pickup_station_id, points_to_use, type, group_activity_id, group_no
        });
        return success({ id: order._id, order_id: order._id, order_no: order.order_no, total_amount: order.total_amount, pay_amount: order.pay_amount });
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
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    if (!openid) {
        throw unauthorized('未登录');
    }

    const { action, ...params } = event;
    const handler = handleAction[action];

    if (!handler) {
        throw badRequest(`未知 action: ${action}`);
    }

    return handler(openid, params);
});
