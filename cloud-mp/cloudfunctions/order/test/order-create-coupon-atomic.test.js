'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadOrderCreateWithDb(db) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => db,
                callFunction: async () => ({ result: {} })
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../order-create');
    delete require.cache[modulePath];
    try {
        return require('../order-create');
    } finally {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    }
}

function createDbMock(updated = 1) {
    const calls = [];
    return {
        calls,
        db: {
            command: {
                in: (values) => ({ op: 'in', values }),
                inc: (value) => ({ op: 'inc', value }),
                or: (conditions) => ({ op: 'or', conditions }),
                gte: (value) => ({ op: 'gte', value }),
                remove: () => ({ op: 'remove' })
            },
            serverDate: () => new Date('2026-05-01T00:00:00.000Z'),
            collection: (name) => {
                if (name === 'user_coupons') {
                    return {
                        where: (where) => ({
                            update: async ({ data }) => {
                                calls.push({ name, where, data });
                                return { stats: { updated } };
                            }
                        })
                    };
                }
                return {
                    where: () => ({
                        limit: () => ({ get: async () => ({ data: [] }) }),
                        get: async () => ({ data: [] }),
                        update: async () => ({ stats: { updated: 1 } })
                    }),
                    doc: () => ({
                        get: async () => ({ data: null }),
                        update: async () => ({ stats: { updated: 1 } }),
                        set: async () => ({ stats: { updated: 1 } })
                    }),
                    add: async () => ({ _id: 'unused' })
                };
            }
        }
    };
}

test('markUserCouponUsedForOrder uses status=unused as the atomic guard', async () => {
    const { db, calls } = createDbMock(1);
    const orderCreate = loadOrderCreateWithDb(db);

    const result = await orderCreate._test.markUserCouponUsedForOrder({
        _id: 'coupon-doc-1',
        openid: 'buyer-openid'
    }, 'order-1');

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].where, {
        _id: 'coupon-doc-1',
        status: 'unused',
        openid: 'buyer-openid'
    });
    assert.equal(calls[0].data.status, 'used');
    assert.equal(calls[0].data.order_id, 'order-1');
    assert.equal(calls[0].data.used_order_id, 'order-1');
});

test('markUserCouponUsedForOrder fails closed when coupon is no longer unused', async () => {
    const { db } = createDbMock(0);
    const orderCreate = loadOrderCreateWithDb(db);

    const result = await orderCreate._test.markUserCouponUsedForOrder({
        _id: 'coupon-doc-1',
        openid: 'buyer-openid'
    }, 'order-1');

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'coupon_not_unused');
});
