'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadPaymentWithMockedCloud(openid = '') {
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
                getWXContext: () => ({ OPENID: openid })
            };
        }
        return originalLoad(request, parent, isMain);
    };
    const modulePath = require.resolve('../index');
    delete require.cache[modulePath];
    const payment = require('../index');
    return {
        payment,
        restore: () => {
            Module._load = originalLoad;
            delete require.cache[modulePath];
            delete process.env.PAYMENT_INTERNAL_TOKEN;
        }
    };
}

test('payment internal no-openid actions require PAYMENT_INTERNAL_TOKEN', async () => {
    const harness = loadPaymentWithMockedCloud('');
    try {
        for (const action of ['createWithdrawalTransfer', 'syncRefundStatus']) {
            await assert.rejects(
                () => harness.payment.main({ action }, {}),
                (error) => {
                    assert.equal(error.code, 401);
                    assert.equal(error.message, '内部支付接口禁止直接访问');
                    return true;
                }
            );
        }
    } finally {
        harness.restore();
    }
});

test('legacy payment refund action is not public callable', async () => {
    const harness = loadPaymentWithMockedCloud('buyer-openid');
    try {
        const result = await harness.payment.main({ action: 'refund', order_id: 'order-1' }, {});
        assert.equal(result.code, 401);
        assert.equal(result.message, '内部支付接口禁止直接访问');
    } finally {
        harness.restore();
    }
});

test('payment callback action is rejected outside trusted HTTP callback path', async () => {
    const harness = loadPaymentWithMockedCloud('buyer-openid');
    try {
        const result = await harness.payment.main({ action: 'callback', body: { resource: {} } }, {});
        assert.equal(result.code, 401);
        assert.equal(result.message, '支付回调只能通过 HTTP 网关访问');
    } finally {
        harness.restore();
    }
});
