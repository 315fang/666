'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const orderContract = require('../order-contract');
const paymentOrder = require('../../payment/shared/order-payment');
const adminOrderContract = require('../../admin-api/src/order-contract');

const legacyWechatOrder = {
    payment_method: '',
    pay_channel: '',
    pay_type: '',
    payment_channel: '',
    trade_id: '4200000000000000000',
    prepay_id: 'wx201410272009395522657a690389285100',
    pay_params: {
        package: 'prepay_id=wx201410272009395522657a690389285100'
    }
};

test('payment method resolver infers WeChat payment from legacy WeChat evidence', () => {
    assert.equal(orderContract.resolveOrderPaymentMethod(legacyWechatOrder), 'wechat');
    assert.equal(paymentOrder.resolveOrderPaymentMethod(legacyWechatOrder), 'wechat');
    assert.equal(adminOrderContract.resolveOrderPaymentMethod(legacyWechatOrder), 'wechat');
});

test('explicit internal payment methods still win over WeChat evidence', () => {
    assert.equal(orderContract.resolveOrderPaymentMethod({
        ...legacyWechatOrder,
        payment_method: 'goods_fund'
    }), 'goods_fund');
    assert.equal(paymentOrder.resolveOrderPaymentMethod({
        ...legacyWechatOrder,
        payment_method: 'wallet'
    }), 'wallet');
    assert.equal(adminOrderContract.resolveOrderPaymentMethod({
        ...legacyWechatOrder,
        payment_method: 'balance'
    }), 'wallet');
});

test('group orders enter pending_group before fulfillment-specific statuses', () => {
    assert.equal(paymentOrder.resolvePostPayStatus({
        type: 'group',
        delivery_type: 'pickup'
    }), 'pending_group');
    assert.equal(paymentOrder.resolvePostPayStatus({
        group_activity_id: 'group-1',
        delivery_type: 'express'
    }), 'pending_group');
    assert.equal(paymentOrder.resolvePostPayStatus({
        type: 'normal',
        delivery_type: 'pickup'
    }), 'pickup_pending');
});
