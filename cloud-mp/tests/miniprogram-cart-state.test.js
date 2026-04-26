'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let storage = null;
const app = { globalData: {} };

global.getApp = () => app;
global.wx = {
    getStorageSync(key) {
        return key === 'cart_state_version' ? storage : null;
    },
    setStorageSync(key, value) {
        if (key === 'cart_state_version') storage = value;
    }
};

const {
    getCartStateVersion,
    markCartChanged,
    markCartStateSeen,
    shouldRefreshCartState
} = require('../miniprogram/utils/cartState');

test('cart state version marks pages stale after cart mutations', () => {
    storage = null;
    app.globalData = {};
    const page = {};

    assert.equal(shouldRefreshCartState(page), true);
    markCartStateSeen(page);
    assert.equal(shouldRefreshCartState(page), false);

    const version = markCartChanged('test');
    assert.equal(getCartStateVersion(), version);
    assert.equal(shouldRefreshCartState(page), true);
    assert.equal(shouldRefreshCartState(page), false);
});
