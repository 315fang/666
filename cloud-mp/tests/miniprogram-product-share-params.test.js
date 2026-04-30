'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeProductLaunchOptions
} = require('../miniprogram/pages/product/productDetailShare');

test('product share params parse wxacode scene', () => {
    const options = normalizeProductLaunchOptions({
        scene: encodeURIComponent('pid=88&i=ABCDEFGH&cid=5&t=TICKET01')
    });

    assert.equal(options.id, '88');
    assert.equal(options.invite, 'ABCDEFGH');
    assert.equal(options.coupon_id, '5');
    assert.equal(options.ticket, 'TICKET01');
});

test('product share params parse scanned q url', () => {
    const options = normalizeProductLaunchOptions({
        q: encodeURIComponent('/pages/product/detail?id=88&invite=ABCDEFGH&cid=5')
    });

    assert.equal(options.id, '88');
    assert.equal(options.invite, 'ABCDEFGH');
    assert.equal(options.coupon_id, '5');
});

test('product share params parse scene nested in scanned q url', () => {
    const nestedScene = encodeURIComponent('pid=88&i=ABCDEFGH&cid=5');
    const options = normalizeProductLaunchOptions({
        q: encodeURIComponent(`/pages/product/detail?scene=${nestedScene}`)
    });

    assert.equal(options.id, '88');
    assert.equal(options.invite, 'ABCDEFGH');
    assert.equal(options.coupon_id, '5');
});
