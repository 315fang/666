'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('payment internal transfer actions require PAYMENT_INTERNAL_TOKEN', async () => {
    process.env.PAYMENT_INTERNAL_TOKEN = 'guard-token';
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => ({
                    command: {},
                    collection: () => ({
                        doc: () => ({ get: async () => ({ data: null }) }),
                        where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) })
                    })
                }),
                getWXContext: () => ({ OPENID: '' })
            };
        }
        return originalLoad(request, parent, isMain);
    };
    const payment = require('../index');
    try {
        await assert.rejects(
            () => payment.main({ action: 'createWithdrawalTransfer' }, {}),
            (error) => {
                assert.equal(error.code, 401);
                assert.equal(error.message, '内部支付接口禁止直接访问');
                return true;
            }
        );
    } finally {
        Module._load = originalLoad;
    }
});
