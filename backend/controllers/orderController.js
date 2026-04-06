const { error: logError } = require('../utils/logger');
const OrderCoreService = require('../services/OrderCoreService');
const OrderQueryService = require('../services/OrderQueryService');
const OrderReviewService = require('../services/OrderReviewService');

const XML_SUCCESS_RESPONSE = '<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>';

function sendServiceResult(res, result) {
    if (result && result.xml_success) {
        res.set('Content-Type', 'text/xml');
        return res.send(XML_SUCCESS_RESPONSE);
    }

    if (result && result.xml_fail) {
        res.set('Content-Type', 'text/xml');
        return res.send(`<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[${result.xml_fail}]]></return_msg></xml>`);
    }

    return res.json({ code: 0, ...result });
}

function handleOrderControllerError(res, scope, error, statusCode = 400) {
    logError('ORDER_CTRL', `${scope} 失败`, { error: error?.message || error });
    return res.status(statusCode).json({ code: -1, message: error.message || '操作失败' });
}

/** 创建订单，支持多商品共享事务 */
const createOrder = async (req, res) => {
    try {
        const result = await OrderCoreService.createOrder(req);
        return sendServiceResult(res, result);
    } catch (error) {
        return handleOrderControllerError(res, 'createOrder', error);
    }
}

/** 微信小程序支付：V3 统一下单，返回 wx.requestPayment 参数 */
const prepayOrder = async (req, res) => {
    try {
        const result = await OrderCoreService.prepayOrder(req);
        return sendServiceResult(res, result);
    } catch (error) {
        return handleOrderControllerError(res, 'prepayOrder', error);
    }
}

/** 待付款：向微信查单并补记账（notify 漏回调时使用） */
const syncWechatPayStatus = async (req, res) => {
    try {
        const result = await OrderCoreService.syncPendingOrderWechatPay(req);
        return res.json({ code: 0, ...result });
    } catch (error) {
        return handleOrderControllerError(res, 'syncWechatPayStatus', error);
    }
};

/** 微信 V3 支付结果通知：无用户 Token，凭平台签名与 APIv3 密钥验真（body 见 req.rawBody） */
const wechatPayNotify = async (req, res) => {
    try {
        const result = await OrderCoreService.wechatPayNotify(req);
        if (result && result.json_success) {
            return res.status(200).json({ code: 'SUCCESS', message: '成功' });
        }
        if (result && result.json_fail) {
            return res.status(result.statusCode || 500).json({ code: 'ERROR', message: result.json_fail });
        }
        res.json({ code: 0, ...result });
    } catch (error) {
        logError('ORDER_CTRL', 'wechatPayNotify 失败', { error: error?.message || error });
        return res.status(500).json({ code: 'ERROR', message: error.message || '操作失败' });
    }
}
/** 兼容旧客户端或内部调用的手动支付入口 */
const payOrder = async (req, res) => {
    try {
        const result = await OrderCoreService.payOrder(req);
        return sendServiceResult(res, result);
    } catch (error) {
        return handleOrderControllerError(res, 'payOrder', error);
    }
}
/** 确认收货，并进入售后期/佣金后续流程 */
const confirmOrder = async (req, res) => {
    try {
        const result = await OrderCoreService.confirmOrder(req);
        return sendServiceResult(res, result);
    } catch (error) {
        return handleOrderControllerError(res, 'confirmOrder', error);
    }
}
/**
 * 代理人确认订单
 * POST /api/orders/:id/agent-confirm
 */
const agentConfirmOrder = async (req, res) => {
    try {
        const result = await OrderCoreService.agentConfirmOrder(req);
        return sendServiceResult(res, result);
    } catch (error) {
        return handleOrderControllerError(res, 'agentConfirmOrder', error);
    }
}
/**
 * 代理人申请发货
 * POST /api/orders/:id/request-shipping
 */
const requestShipping = async (req, res) => {
    try {
        const result = await OrderCoreService.requestShipping(req);
        return sendServiceResult(res, result);
    } catch (error) {
        return handleOrderControllerError(res, 'requestShipping', error);
    }
}
/**
 * 代理人获取待处理订单
 */
const getAgentOrders = async (req, res) => {
    try {
        const result = await OrderQueryService.getAgentOrders(req);
        return sendServiceResult(res, result);
    } catch (error) {
        return handleOrderControllerError(res, 'getAgentOrders', error, error.statusCode || 500);
    }
};

/** 取消待付款订单，主订单会同步处理关联子订单 */
const cancelOrder = async (req, res) => {
    try {
        const result = await OrderCoreService.cancelOrder(req);
        return sendServiceResult(res, result);
    } catch (error) {
        return handleOrderControllerError(res, 'cancelOrder', error);
    }
}
/** 发货入口，按真实履约方式处理平台/代理商发货 */
const shipOrder = async (req, res) => {
    try {
        const result = await OrderCoreService.shipOrder(req);
        return sendServiceResult(res, result);
    } catch (error) {
        return handleOrderControllerError(res, 'shipOrder', error);
    }
}
/** 获取订单列表，子订单由详情聚合展示 */
const getOrders = async (req, res) => {
    try {
        const result = await OrderQueryService.getOrders(req);
        return sendServiceResult(res, result);
    } catch (error) {
        return handleOrderControllerError(res, 'getOrders', error, error.statusCode || 500);
    }
};

/**
 * 获取订单详情
 */
const getOrderById = async (req, res) => {
    try {
        const result = await OrderQueryService.getOrderById(req);
        return sendServiceResult(res, result);
    } catch (error) {
        return handleOrderControllerError(res, 'getOrderById', error, error.statusCode || 500);
    }
};

/**
 * 用户提交订单评价
 * POST /api/orders/:id/review
 * body: { rating, content, images[] }
 */
const submitOrderReview = async (req, res) => {
    try {
        const result = await OrderReviewService.submitOrderReview(req);
        return sendServiceResult(res, result);
    } catch (error) {
        return handleOrderControllerError(res, 'submitOrderReview', error, error.statusCode || 500);
    }
};

module.exports = {
    createOrder,
    payOrder,
    prepayOrder,
    syncWechatPayStatus,
    wechatPayNotify,
    shipOrder,
    confirmOrder,
    cancelOrder,
    getOrders,
    getOrderById,
    agentConfirmOrder,
    requestShipping,
    getAgentOrders,
    submitOrderReview
};
