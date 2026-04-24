'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('group expired refund policy includes historical paid and refunding states', () => {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => ({
                    command: {
                        in: (value) => value,
                        remove: () => ({})
                    },
                    collection: () => ({
                        doc: () => ({
                            update: async () => ({ stats: { updated: 0 } }),
                            get: async () => ({ data: null })
                        }),
                        where: () => ({
                            limit: () => ({
                                get: async () => ({ data: [] })
                            }),
                            update: async () => ({ stats: { updated: 0 } }),
                            orderBy: () => ({
                                limit: () => ({
                                    get: async () => ({ data: [] })
                                })
                            })
                        }),
                        add: async () => ({ _id: 'mock-id' })
                    })
                }),
                callFunction: async () => ({ result: { code: 0, data: {} } })
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../../order-timeout-cancel/shared/system-refund');
    delete require.cache[modulePath];
    const systemRefund = require('../../order-timeout-cancel/shared/system-refund');
    try {
        assert.deepEqual(systemRefund.GROUP_EXPIRED_REFUNDABLE_ORDER_STATUSES, [
            'pending_group',
            'paid',
            'pickup_pending',
            'refunding'
        ]);
        assert.equal(systemRefund.__test__.isGroupExpiredRefundCandidate({
            _id: 'o1',
            openid: 'buyer',
            status: 'paid'
        }), true);
        assert.equal(systemRefund.__test__.isGroupExpiredRefundCandidate({
            _id: 'o2',
            openid: 'buyer',
            status: 'shipped'
        }), false);
    } finally {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    }
});
