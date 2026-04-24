'use strict';

const { toNumber } = require('./utils');

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

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function firstFiniteNumber(values, fallback = 0) {
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const num = Number(value);
        if (Number.isFinite(num)) return num;
    }
    return fallback;
}

function normalizePaymentMethodCode(rawValue) {
    const raw = pickString(rawValue).toLowerCase();
    if (!raw) return '';
    if (['wechat', 'wx', 'wxpay', 'jsapi', 'miniapp', 'wechatpay', 'wechat_pay', 'weixin'].includes(raw)) return 'wechat';
    if (['goods_fund', 'goods-fund', 'goodsfund'].includes(raw)) return 'goods_fund';
    if (['wallet', 'wallet_balance', 'account_balance', 'balance', 'credit', 'debt'].includes(raw)) return 'wallet';
    return raw;
}

function hasWechatPaymentEvidence(order = {}) {
    const payPackage = order.pay_params && typeof order.pay_params === 'object'
        ? pickString(order.pay_params.package)
        : '';
    return !!(
        pickString(order.trade_id || order.transaction_id || order.wx_transaction_id)
        || pickString(order.prepay_id)
        || payPackage.startsWith('prepay_id=')
    );
}

function resolvePaymentChannelAlias(paymentMethod) {
    const normalized = normalizePaymentMethodCode(paymentMethod);
    if (normalized === 'wechat') return 'wxpay';
    if (normalized === 'goods_fund') return 'goods_fund';
    return normalized || '';
}

function resolveOrderPaymentMethod(order = {}) {
    const explicit = normalizePaymentMethodCode(
        order.payment_method || order.pay_channel || order.pay_type || order.payment_channel || ''
    );
    if (explicit) return explicit;
    return hasWechatPaymentEvidence(order) ? 'wechat' : '';
}

function resolveOrderPayAmount(order = {}, fallback = 0) {
    return roundMoney(firstFiniteNumber([order.pay_amount, order.actual_price, order.total_amount], fallback));
}

function resolveOrderTotalAmount(order = {}, fallback = 0) {
    return roundMoney(firstFiniteNumber([order.total_amount, order.pay_amount, order.actual_price], fallback));
}

function resolveRefundChannel(paymentMethod, explicitChannel = '') {
    const explicit = pickString(explicitChannel);
    if (explicit) {
        const normalizedExplicit = normalizePaymentMethodCode(explicit);
        return normalizedExplicit || explicit;
    }
    const normalized = normalizePaymentMethodCode(paymentMethod);
    if (normalized === 'goods_fund') return 'goods_fund';
    if (normalized === 'wallet') return 'wallet';
    return 'wechat';
}

function getRefundTargetText(paymentMethod, explicitTarget = '') {
    const explicit = pickString(explicitTarget);
    if (explicit) return explicit;
    const normalized = normalizePaymentMethodCode(paymentMethod);
    return REFUND_TARGET_TEXT_MAP[normalized] || '-';
}

function buildPaymentWritePatch(paymentMethod, payAmount, extra = {}) {
    const normalizedPayAmount = resolveOrderPayAmount({ pay_amount: payAmount }, 0);
    return {
        payment_method: normalizePaymentMethodCode(paymentMethod),
        pay_channel: resolvePaymentChannelAlias(paymentMethod),
        pay_amount: normalizedPayAmount,
        actual_price: normalizedPayAmount,
        ...extra
    };
}

function isGroupOrder(order = {}) {
    return order.type === 'group' || order.order_type === 'group' || Boolean(
        order.group_activity_id || order.group_no || order.group_id
    );
}

function resolvePostPayStatus(order = {}) {
    if (isGroupOrder(order)) {
        return 'pending_group';
    }
    if (pickString(order.delivery_type).toLowerCase() === 'pickup') {
        return 'pickup_pending';
    }
    return 'paid';
}

module.exports = {
    pickString,
    normalizePaymentMethodCode,
    resolvePaymentChannelAlias,
    resolveOrderPaymentMethod,
    resolveOrderPayAmount,
    resolveOrderTotalAmount,
    resolveRefundChannel,
    getRefundTargetText,
    buildPaymentWritePatch,
    isGroupOrder,
    resolvePostPayStatus
};
