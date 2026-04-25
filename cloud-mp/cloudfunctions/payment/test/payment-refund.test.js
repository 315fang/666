'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('refundPayment rejects partial refund through legacy public payment action', async () => {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => ({
                    command: {},
                    collection: (name) => {
                        if (name !== 'orders') throw new Error(`unexpected collection ${name}`);
                        return {
                            doc: () => ({
                                get: async () => ({
                                    data: {
                                        _id: 'order-refund-1',
                                        order_no: 'REFUND-ORDER-1',
                                        openid: 'buyer-openid',
                                        status: 'paid',
                                        pay_amount: 100
                                    }
                                })
                            })
                        };
                    },
                    serverDate: () => new Date('2026-04-24T00:00:00.000Z')
                })
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../payment-refund');
    delete require.cache[modulePath];
    const paymentRefund = require('../payment-refund');
    try {
        await assert.rejects(
            () => paymentRefund.refundPayment('buyer-openid', {
                order_id: 'order-refund-1',
                refund_amount: 10
            }),
            /旧退款入口不支持部分退款/
        );
    } finally {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    }
});
