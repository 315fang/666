const ORDER_STATUS_TEXT = {
    pending: '待付款',
    pending_payment: '待付款',
    pending_group: '待成团',
    paid: '待发货',
    pickup_pending: '待核销',
    agent_confirmed: '代理已确认',
    shipping_requested: '发货申请中',
    shipped: '待收货',
    completed: '已完成',
    cancelled: '已取消',
    refunding: '退款中',
    refunded: '已退款'
};

const REFUND_STATUS_TEXT = {
    pending: '审核中',
    approved: '已通过',
    processing: '退款中',
    completed: '退款完成',
    rejected: '已驳回',
    cancelled: '已取消',
    failed: '退款失败'
};

const PAYMENT_METHOD_TEXT = {
    wechat: '微信支付',
    goods_fund: '货款支付',
    wallet: '余额支付'
};

const REFUND_TARGET_TEXT = {
    wechat: '原路退回微信支付',
    goods_fund: '退回货款余额',
    wallet: '退回账户余额'
};

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toMoney(value) {
    return toNumber(value).toFixed(2);
}

function normalizePaymentMethodCode(raw) {
    const method = String(raw || '').trim().toLowerCase();
    if (['wechat', 'wx', 'wxpay', 'jsapi', 'miniapp', 'wechatpay', 'wechat_pay', 'weixin'].includes(method)) {
        return 'wechat';
    }
    if (['goods_fund', 'goods-fund', 'goodsfund'].includes(method)) {
        return 'goods_fund';
    }
    if (['wallet', 'wallet_balance', 'account_balance', 'balance', 'credit', 'debt'].includes(method)) {
        return 'wallet';
    }
    return method;
}

function getOrderStatusText(status) {
    return ORDER_STATUS_TEXT[status] || status || '';
}

function getRefundStatusText(status) {
    return REFUND_STATUS_TEXT[status] || status || '';
}

function getPaymentMethodText(method) {
    return PAYMENT_METHOD_TEXT[method] || '';
}

function getRefundTargetText(method, explicitText = '') {
    if (explicitText) return explicitText;
    if (!method) return '';
    return REFUND_TARGET_TEXT[method] || '';
}

function buildRefundStatusDesc(refund = {}, statusDesc = '') {
    if (statusDesc) return statusDesc;
    if (refund.status === 'rejected' && refund.reject_reason) {
        return `驳回原因：${refund.reject_reason}`;
    }
    if (refund.status === 'approved' && refund.type === 'return_refund') {
        return '请寄回商品并填写退货单号';
    }
    if (refund.status === 'failed') {
        return '退款未成功，请联系客服处理';
    }
    return '';
}

function normalizeOrderConsumer(order = {}) {
    const refundFailed = order.status === 'refunding' && (
        order.auto_refund_error
        || order.auto_refund_failed_at
    );
    const paymentMethod = normalizePaymentMethodCode(
        order.payment_method || order.pay_channel || order.pay_type || order.payment_channel || ''
    );
    const totalAmount = toNumber(order.total_amount != null ? order.total_amount : order.original_amount);
    const originalAmount = toNumber(order.original_amount != null ? order.original_amount : totalAmount, totalAmount);
    const payAmount = toNumber(
        order.pay_amount != null
            ? order.pay_amount
            : (order.actual_price != null ? order.actual_price : totalAmount),
        totalAmount
    );
    const couponDiscount = toNumber(order.coupon_discount);
    const pointsDiscount = toNumber(order.points_discount);
    const bundleDiscount = toNumber(order.bundle_discount);
    const refundedCashTotal = toNumber(order.refunded_cash_total);
    const remainingRefundableCash = toNumber(order.remaining_refundable_cash);
    const statusText = refundFailed ? '退款失败' : (order.status_text || getOrderStatusText(order.status));
    const statusDesc = refundFailed ? '退款未成功，请联系客服处理' : (order.status_desc || '');
    const paymentMethodText = order.payment_method_text || getPaymentMethodText(paymentMethod);
    const refundTargetText = getRefundTargetText(paymentMethod, order.refund_target_text || '');
    const normalizedItems = Array.isArray(order.items)
        ? order.items.map((item) => ({
            ...item,
            display_original_line_amount: toMoney(item.original_line_amount),
            display_coupon_allocated_amount: toMoney(item.coupon_allocated_amount),
            display_points_allocated_amount: toMoney(item.points_allocated_amount),
            display_cash_paid_allocated_amount: toMoney(item.cash_paid_allocated_amount),
            display_refunded_cash_amount: toMoney(item.refunded_cash_amount),
            display_refundable_cash_amount: toMoney(item.refundable_cash_amount)
        }))
        : [];

    return {
        ...order,
        items: normalizedItems,
        payment_method: paymentMethod || order.payment_method || '',
        total_amount: totalAmount,
        original_amount: originalAmount,
        pay_amount: payAmount,
        coupon_discount: couponDiscount,
        points_discount: pointsDiscount,
        bundle_discount: bundleDiscount,
        refunded_cash_total: refundedCashTotal,
        remaining_refundable_cash: remainingRefundableCash,
        has_partial_refund: !!order.has_partial_refund,
        status_text: statusText,
        status_desc: statusDesc,
        payment_method_text: paymentMethodText,
        refund_target_text: refundTargetText,
        display_status_text: statusText,
        display_status_desc: statusDesc,
        display_payment_method_text: paymentMethodText,
        display_refund_target_text: refundTargetText,
        display_total_amount: toMoney(totalAmount),
        display_original_amount: toMoney(originalAmount),
        display_pay_amount: toMoney(payAmount),
        display_coupon_discount: toMoney(couponDiscount),
        display_points_discount: toMoney(pointsDiscount),
        display_bundle_discount: toMoney(bundleDiscount),
        display_refunded_cash_total: toMoney(refundedCashTotal),
        display_remaining_refundable_cash: toMoney(remainingRefundableCash)
    };
}

function normalizeRefundConsumer(refund = {}) {
    const normalizedOrder = refund.order ? normalizeOrderConsumer(refund.order) : null;
    const paymentMethod = normalizePaymentMethodCode(
        refund.payment_method
        || normalizedOrder?.payment_method
        || refund.order?.pay_channel
        || refund.order?.pay_type
        || refund.order?.payment_channel
        || ''
    );
    const amount = toNumber(refund.amount);
    const statusText = refund.status_text || getRefundStatusText(refund.status);
    const statusDesc = buildRefundStatusDesc(refund, refund.status_desc || '');
    const paymentMethodText = refund.payment_method_text || getPaymentMethodText(paymentMethod);
    const refundTargetText = getRefundTargetText(paymentMethod, refund.refund_target_text || '');
    const processedAt = refund.processing_at || refund.processed_at || refund.processedAt || '';

    return {
        ...refund,
        order: normalizedOrder,
        payment_method: paymentMethod || refund.payment_method || '',
        amount,
        status_text: statusText,
        status_desc: statusDesc,
        payment_method_text: paymentMethodText,
        refund_target_text: refundTargetText,
        processed_at: processedAt,
        display_status_text: statusText,
        display_status_desc: statusDesc,
        display_payment_method_text: paymentMethodText,
        display_refund_target_text: refundTargetText,
        display_amount: toMoney(amount),
        display_processed_at: processedAt,
        display_created_at: refund.createdAt || refund.created_at || ''
    };
}

module.exports = {
    getOrderStatusText,
    getRefundStatusText,
    getPaymentMethodText,
    getRefundTargetText,
    normalizePaymentMethodCode,
    normalizeOrderConsumer,
    normalizeRefundConsumer,
    toMoney
};
