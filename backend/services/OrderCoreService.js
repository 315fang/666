/** OrderCoreService — 订单域协调器，只负责兼容旧入口并委托给职责单一的子服务 */

const OrderCreationService = require('./OrderCreationService');
const OrderPaymentService = require('./OrderPaymentService');
const OrderFulfillmentService = require('./OrderFulfillmentService');
const OrderCancellationService = require('./OrderCancellationService');

class OrderCoreService {

    // ─── 订单创建 ──────────────────────────────
    /** 创建订单（购物袋/历史格式/砍价/拼团/限时活动） */
    static createOrder(req) {
        return OrderCreationService.createOrder(req);
    }

    // ─── 支付流程 ──────────────────────────────
    /** 预下单：生成 wx.requestPayment() 参数 */
    static prepayOrder(req) {
        return OrderPaymentService.prepayOrder(req);
    }

    /** 微信支付回调 V3 JSON */
    static wechatPayNotify(req) {
        return OrderPaymentService.wechatPayNotify(req);
    }

    /** 主动查单同步微信支付状态 */
    static syncPendingOrderWechatPay(req) {
        return OrderPaymentService.syncPendingOrderWechatPay(req);
    }

    /** 后台手动标记已支付 */
    static payOrder(req) {
        return OrderPaymentService.payOrder(req);
    }

    // ─── 履约流程 ──────────────────────────────
    /** 用户确认收货 */
    static confirmOrder(req) {
        return OrderFulfillmentService.confirmOrder(req);
    }

    /** 后台强制完成订单 */
    static forceCompleteOrderByAdmin(id, adminName, reason) {
        return OrderFulfillmentService.forceCompleteOrderByAdmin(id, adminName, reason);
    }

    /** 代理商确认订单 */
    static agentConfirmOrder(req) {
        return OrderFulfillmentService.agentConfirmOrder(req);
    }

    /** 代理商申请发货 */
    static requestShipping(req) {
        return OrderFulfillmentService.requestShipping(req);
    }

    /** 发货（平台发/代理商发） */
    static shipOrder(req) {
        return OrderFulfillmentService.shipOrder(req);
    }

    // ─── 取消流程 ──────────────────────────────
    /** 取消待付款订单（恢复库存+退券退积分） */
    static cancelOrder(req) {
        return OrderCancellationService.cancelOrder(req);
    }
}

module.exports = OrderCoreService;
