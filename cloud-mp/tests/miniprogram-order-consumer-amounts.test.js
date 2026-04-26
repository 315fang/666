'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOrderConsumer } = require('../miniprogram/pages/order/orderConsumerFields');

test('normalizeOrderConsumer repairs bundle pay amount that was pre-divided as display text', () => {
    const order = normalizeOrderConsumer({
        id: 'order-1',
        status: 'paid',
        payment_method: 'goods_fund',
        original_amount: 16350,
        total_amount: '16350.00',
        bundle_discount: 12351,
        pay_amount: '39.99',
        remaining_refundable_cash: 3999,
        bundle_meta: {
            title: '测试组合',
            bundle_price: 3999
        }
    });

    assert.equal(order.pay_amount, 3999);
    assert.equal(order.display_original_amount, '16350.00');
    assert.equal(order.display_bundle_discount, '12351.00');
    assert.equal(order.display_pay_amount, '3999.00');
    assert.equal(order.display_remaining_refundable_cash, '3999.00');
});

test('normalizeOrderConsumer keeps raw large yuan amount when backend returns it directly', () => {
    const order = normalizeOrderConsumer({
        id: 'order-2',
        status: 'paid',
        payment_method: 'goods_fund',
        original_amount: 16350,
        total_amount: 16350,
        bundle_discount: 12351,
        pay_amount: 3999,
        remaining_refundable_cash: 3999
    });

    assert.equal(order.pay_amount, 3999);
    assert.equal(order.display_pay_amount, '3999.00');
});
