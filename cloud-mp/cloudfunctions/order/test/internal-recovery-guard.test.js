'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('order internal recovery action requires ORDER_INTERNAL_TOKEN', async () => {
    process.env.ORDER_INTERNAL_TOKEN = 'guard-token';
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
                            get: async () => ({ data: null }),
                            update: async () => ({ stats: { updated: 0 } }),
                            set: async () => ({})
                        }),
                        where: () => ({
                            limit: () => ({
                                get: async () => ({ data: [] }),
                                update: async () => ({ stats: { updated: 0 } })
                            }),
                            update: async () => ({ stats: { updated: 0 } }),
                            orderBy: () => ({
                                limit: () => ({ get: async () => ({ data: [] }) })
                            })
                        }),
                        add: async () => ({ _id: 'mock-id' })
                    })
                }),
                getWXContext: () => ({ OPENID: '' }),
                callFunction: async () => ({ result: { code: 0, data: { scanned: 0, completed: 0, errors: [] } } })
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const order = require('../index');
    try {
        const result = await order.main({ action: 'recoverGoodsFundRefunds' }, {});
        assert.equal(result.code, 401);
        assert.equal(result.message, '内部订单接口禁止直接访问');
    } finally {
        Module._load = originalLoad;
    }
});
