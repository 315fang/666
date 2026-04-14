'use strict';

const ORDER_STATUS_GROUP_MAP = {
    pending: 'pending_pay',
    pending_payment: 'pending_pay',
    pending_group: 'pending_group',
    paid: 'pending_ship',
    pickup_pending: 'pending_receive',
    agent_confirmed: 'pending_ship',
    shipping_requested: 'pending_ship',
    shipped: 'pending_receive',
    completed: 'completed',
    cancelled: 'closed',
    refunded: 'closed',
    refunding: 'after_sale'
};

const ORDER_STATUS_TEXT_MAP = {
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

const ORDER_STATUS_DESC_MAP = {
    pending: '请尽快完成支付',
    pending_payment: '请尽快完成支付',
    pending_group: '已支付成功，等待其他团员加入后成团',
    paid: '已支付成功，等待商家发货',
    pickup_pending: '订单已支付，等待顾客到指定门店核销提货',
    agent_confirmed: '代理已确认，正在准备发货',
    shipping_requested: '发货申请已提交，等待仓库处理',
    shipped: '商品已发出，请注意查收快递',
    completed: '交易已完成，佣金将在确认收货后15天结算',
    cancelled: '订单已取消',
    refunding: '退款申请处理中，请耐心等待',
    refunded: '退款已完成'
};

const REFUND_STATUS_TEXT_MAP = {
    pending: '待审核',
    approved: '待退款',
    processing: '退款处理中',
    rejected: '已拒绝',
    completed: '已退款',
    failed: '退款失败',
    cancelled: '已取消'
};

const REFUND_STATUS_DESC_MAP = {
    pending: '售后申请已提交，等待审核',
    approved: '审核通过，等待执行退款',
    processing: '退款处理中，请耐心等待微信回调',
    rejected: '售后申请未通过，请查看原因',
    completed: '退款已完成，请留意到账情况',
    failed: '退款失败，可稍后重试或联系客服',
    cancelled: '退款申请已取消'
};

const PAYMENT_METHOD_TEXT_MAP = {
    wechat: '微信支付',
    goods_fund: '货款支付',
    wallet: '余额支付'
};

const REFUND_TARGET_TEXT_MAP = {
    wechat: '原路退回微信支付',
    goods_fund: '退回货款余额',
    wallet: '退回账户余额'
};

function pickString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function normalizePaymentMethodCode(rawValue) {
    const raw = pickString(rawValue).toLowerCase();
    if (!raw) return '';
    if (['wechat', 'wx', 'wxpay', 'jsapi', 'miniapp', 'wechatpay', 'wechat_pay', 'weixin'].includes(raw)) return 'wechat';
    if (['goods_fund', 'goods-fund', 'goodsfund'].includes(raw)) return 'goods_fund';
    if (['wallet', 'wallet_balance', 'account_balance', 'balance', 'credit', 'debt'].includes(raw)) return 'wallet';
    return raw;
}

function normalizeOrderStatusGroup(status) {
    return ORDER_STATUS_GROUP_MAP[pickString(status)] || 'all';
}

function getOrderStatusText(status) {
    const raw = pickString(status);
    return ORDER_STATUS_TEXT_MAP[raw] || raw;
}

function getOrderStatusDesc(status) {
    const raw = pickString(status);
    return ORDER_STATUS_DESC_MAP[raw] || '';
}

function getRefundStatusText(status) {
    const raw = pickString(status);
    return REFUND_STATUS_TEXT_MAP[raw] || raw;
}

function getRefundStatusDesc(status) {
    const raw = pickString(status);
    return REFUND_STATUS_DESC_MAP[raw] || '';
}

function getPaymentMethodText(method) {
    const normalized = normalizePaymentMethodCode(method);
    return PAYMENT_METHOD_TEXT_MAP[normalized] || normalized || '-';
}

function getRefundTargetText(paymentMethod, explicitTarget = '') {
    const explicit = pickString(explicitTarget);
    if (explicit) return explicit;
    const normalized = normalizePaymentMethodCode(paymentMethod);
    return REFUND_TARGET_TEXT_MAP[normalized] || '-';
}

module.exports = {
    normalizePaymentMethodCode,
    normalizeOrderStatusGroup,
    getOrderStatusText,
    getOrderStatusDesc,
    getRefundStatusText,
    getRefundStatusDesc,
    getPaymentMethodText,
    getRefundTargetText
};
