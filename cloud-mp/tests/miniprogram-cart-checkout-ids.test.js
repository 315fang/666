'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.getApp = () => ({
    globalData: {
        userInfo: { role_level: 0 }
    }
});

const {
    parseCartIdList,
    getCartItemId
} = require('../miniprogram/pages/order/orderConfirmAddress');

test('cart checkout ids are parsed as stable document ids', () => {
    assert.deepEqual(parseCartIdList('cart-a,cart-b'), ['cart-a', 'cart-b']);
    assert.deepEqual(parseCartIdList('cart-a%2Ccart-b'), ['cart-a', 'cart-b']);
    assert.deepEqual(parseCartIdList(['cart-a', ' cart-b ']), ['cart-a', 'cart-b']);
});

test('cart item matching prefers persistent cart document id', () => {
    assert.equal(getCartItemId({ cart_id: 'cart-a', _id: 'doc-a', id: 123 }), 'cart-a');
    assert.equal(getCartItemId({ _id: 'doc-a', id: 123 }), 'doc-a');
    assert.equal(getCartItemId({ id: 123 }), '123');
});
