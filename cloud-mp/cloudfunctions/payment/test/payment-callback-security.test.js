'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadPaymentCallbackWithMocks() {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => ({
                    command: {
                        in: (value) => ({ $in: value }),
                        lt: (value) => ({ $lt: value }),
                        gte: (value) => ({ $gte: value }),
                        inc: (value) => ({ $inc: value }),
                        push: (value) => ({ $push: value }),
                        remove: () => ({ $remove: true }),
                        or: (...value) => ({ $or: value })
                    },
                    collection: () => ({
                        where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
                        doc: () => ({ update: async () => ({ stats: { updated: 1 } }) })
                    }),
                    serverDate: () => new Date('2026-04-24T00:00:00.000Z')
                })
            };
        }
        if (request === './wechat-pay-v3' && parent?.filename?.endsWith('payment-callback.js')) {
            return {
                verifySignature: () => true,
                decryptResource: () => ({ out_trade_no: 'ORDER-1', trade_state: 'SUCCESS' }),
                loadPublicKey: async () => 'mock-public-key'
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../payment-callback');
    delete require.cache[modulePath];
    const paymentCallback = require('../payment-callback');
    return {
        paymentCallback,
        restore: () => {
            Module._load = originalLoad;
            delete require.cache[modulePath];
        }
    };
}

test('handleCallback rejects callbacks without complete WeChat Pay signature headers', async () => {
    const harness = loadPaymentCallbackWithMocks();
    try {
        const result = await harness.paymentCallback.handleCallback({
            body: JSON.stringify({ event_type: 'TRANSACTION.SUCCESS', out_trade_no: 'ORDER-1', trade_state: 'SUCCESS' })
        });
        assert.equal(result.code, 'FAIL');
        assert.equal(result.message, 'Incomplete signature headers');
    } finally {
        harness.restore();
    }
});

test('handleCallback rejects signed but non-encrypted callback payloads', async () => {
    const harness = loadPaymentCallbackWithMocks();
    try {
        const result = await harness.paymentCallback.handleCallback({
            headers: {
                'wechatpay-timestamp': String(Math.floor(Date.now() / 1000)),
                'wechatpay-nonce': 'nonce',
                'wechatpay-signature': 'signature',
                'wechatpay-serial': 'serial'
            },
            body: JSON.stringify({ event_type: 'TRANSACTION.SUCCESS', out_trade_no: 'ORDER-1', trade_state: 'SUCCESS' })
        });
        assert.equal(result.code, 'FAIL');
        assert.equal(result.message, 'Missing encrypted resource');
    } finally {
        harness.restore();
    }
});
