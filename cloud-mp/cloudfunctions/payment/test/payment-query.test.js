'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadPaymentQueryWithMocks({ order, wxResult = null }) {
    const originalLoad = Module._load;
    let processCalls = 0;
    let queryCalls = 0;
    const updates = [];
    const mutableOrder = { ...order };

    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => ({
                    command: {},
                    collection: (name) => {
                        assert.equal(name, 'orders');
                        return {
                            doc: (id) => ({
                                get: async () => ({ data: id === mutableOrder._id ? { ...mutableOrder } : null }),
                                update: async ({ data }) => {
                                    updates.push({ id, data });
                                    Object.assign(mutableOrder, data);
                                    return { stats: { updated: 1 } };
                                }
                            })
                        };
                    },
                    serverDate: () => new Date('2026-04-24T00:00:00.000Z')
                })
            };
        }
        if (request === './wechat-pay-v3' && parent?.filename?.endsWith('payment-query.js')) {
            return {
                loadPrivateKey: async () => 'mock-key',
                queryOrderByOutTradeNo: async () => {
                    queryCalls += 1;
                    return wxResult || { trade_state: 'NOTPAY' };
                }
            };
        }
        if (request === './payment-callback' && parent?.filename?.endsWith('payment-query.js')) {
            return {
                processPaidOrder: async () => {
                    processCalls += 1;
                    mutableOrder.payment_post_processed_at = new Date('2026-04-24T00:00:00.000Z');
                    mutableOrder.branch_region_commission_retry_required = false;
                    return { ok: true };
                }
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../payment-query');
    delete require.cache[modulePath];
    const paymentQuery = require('../payment-query');
    return {
        paymentQuery,
        restore: () => {
            Module._load = originalLoad;
            delete require.cache[modulePath];
        },
        getState: () => ({ processCalls, queryCalls, updates, order: { ...mutableOrder } })
    };
}

test('queryPaymentStatus retries post process for already paid order missing marker', async () => {
    const harness = loadPaymentQueryWithMocks({
        order: {
            _id: 'order-paid-1',
            order_no: 'PAY-PAID-1',
            openid: 'buyer-openid',
            status: 'paid',
            pay_amount: 100,
            paid_at: '2026-04-24T00:00:00.000Z'
        }
    });

    try {
        const result = await harness.paymentQuery.queryPaymentStatus('order-paid-1', 'buyer-openid');
        const state = harness.getState();
        assert.equal(result.status, 'paid');
        assert.equal(result.post_processed, true);
        assert.equal(state.processCalls, 1);
        assert.equal(state.queryCalls, 0);
    } finally {
        harness.restore();
    }
});

test('queryPaymentStatus marks pending order as paid and runs post process after wx success', async () => {
    const harness = loadPaymentQueryWithMocks({
        order: {
            _id: 'order-pending-1',
            order_no: 'PAY-PENDING-1',
            openid: 'buyer-openid',
            status: 'pending_payment',
            pay_amount: 100,
            delivery_type: 'express'
        },
        wxResult: {
            trade_state: 'SUCCESS',
            transaction_id: 'wx-transaction-1',
            success_time: '2026-04-24T00:00:00+08:00'
        }
    });

    try {
        const result = await harness.paymentQuery.queryPaymentStatus('order-pending-1', 'buyer-openid');
        const state = harness.getState();
        assert.equal(result.status, 'paid');
        assert.equal(result.post_processed, true);
        assert.equal(state.queryCalls, 1);
        assert.equal(state.processCalls, 1);
        assert.equal(state.updates.length, 1);
        assert.equal(state.updates[0].data.status, 'paid');
        assert.equal(state.updates[0].data.trade_id, 'wx-transaction-1');
    } finally {
        harness.restore();
    }
});
