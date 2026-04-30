'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const stored = {};
global.wx = {
    setStorageSync(key, value) {
        stored[key] = value;
    }
};

const appAuth = require('../miniprogram/appAuth');

test('app auth captures numeric member code from scanned scene url', () => {
    delete stored.pending_invite_code;

    appAuth._parseSceneToPendingInvite('pages/product/detail.html?scene=pid%3D1%26cid%3D8%26i%3D459769');

    assert.equal(stored.pending_invite_code, '459769');
});

test('app auth captures numeric member code from launch q', () => {
    delete stored.pending_invite_code;

    appAuth._captureInviteFromLaunch({
        query: {
            q: 'pages/product/detail.html?scene=pid%3D1%26cid%3D8%26i%3D459769'
        }
    });

    assert.equal(stored.pending_invite_code, '459769');
});
