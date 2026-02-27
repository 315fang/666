const express = require('express');
const router = express.Router();
const {
    createOrder, payOrder, prepayOrder, wechatPayNotify,
    shipOrder, confirmOrder, cancelOrder,
    getOrders, getOrderById,
    agentConfirmOrder, requestShipping, settleCommissions, getAgentOrders
} = require('../controllers/orderController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

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

// POST /api/orders/:id/pay - 支付订单（内部/测试用，正式支付通过 wechat notify 触发）
router.post('/orders/:id/pay', authenticate, payOrder);

// POST /wechat/pay/notify - 微信支付回调（无需鉴权，用签名验证）
// ★ 使用 express.text 解析 text/xml 请求体
router.post('/wechat/pay/notify', express.text({ type: 'text/xml' }), wechatPayNotify);

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

module.exports = router;
