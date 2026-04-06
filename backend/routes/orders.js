const express = require('express');
const router = express.Router();
const {
    createOrder, payOrder, prepayOrder, syncWechatPayStatus, wechatPayNotify,
    shipOrder, confirmOrder, cancelOrder,
    getOrders, getOrderById,
    agentConfirmOrder, requestShipping, settleCommissions, getAgentOrders
} = require('../controllers/orderController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const constants = require('../config/constants');

// POST /api/orders - 创建订单
router.post('/orders', authenticate, validate(schemas.createOrder), createOrder);

// GET /api/orders - 获取订单列表
router.get('/orders', authenticate, getOrders);

// GET /api/orders/agent/list - 代理人获取待处理订单
router.get('/orders/agent/list', authenticate, getAgentOrders);

// GET /api/orders/:id - 获取订单详情
router.get('/orders/:id', authenticate, getOrderById);

// POST /api/orders/:id/prepay - 微信支付预下单（返回 wx.requestPayment 参数）
router.post('/orders/:id/prepay', authenticate, prepayOrder);

// POST /api/orders/:id/sync-wechat-pay - 待付款时主动向微信查单并更新为已支付（补 notify）
router.post('/orders/:id/sync-wechat-pay', authenticate, syncWechatPayStatus);

// POST /api/orders/:id/pay — 仅 DEBUG 开启时注册；正式收款以 prepay + POST /wechat/pay/notify 为准
if (constants.DEBUG.ENABLE_TEST_ROUTES) {
    router.post('/orders/:id/pay', authenticate, payOrder);
}

// 微信支付 V3 回调（无需鉴权；POST 体由签名校验）
// GET：浏览器/商户平台「检测 URL」常用 GET，仅返回说明；正式扣款结果通知一律为 POST JSON
router.get('/wechat/pay/notify', (req, res) => {
    res.status(200).type('text/plain; charset=utf-8').send(
        'OK wenlan wechat pay notify — use POST for payment callbacks'
    );
});
// 原始 JSON 报文由 app.js 的 bodyParser verify 钩子保留到 req.rawBody
router.post('/wechat/pay/notify', wechatPayNotify);

// POST /api/orders/:id/agent-confirm - 代理人确认订单
router.post('/orders/:id/agent-confirm', authenticate, agentConfirmOrder);

// POST /api/orders/:id/request-shipping - 代理人申请发货
router.post('/orders/:id/request-shipping', authenticate, requestShipping);

// ★ 注意：ship 接口已移至 /admin/api/orders/:id/ship，仅管理员可操作
// 普通用户侧不再暴露发货和手动结算接口

// POST /api/orders/:id/confirm - 买家确认收货
router.post('/orders/:id/confirm', authenticate, confirmOrder);

// POST /api/orders/:id/cancel - 取消订单
router.post('/orders/:id/cancel', authenticate, cancelOrder);

// POST /api/orders/:id/review - 用户提交评价
const { submitOrderReview } = require('../controllers/orderController');
router.post('/orders/:id/review', authenticate, submitOrderReview);

module.exports = router;
