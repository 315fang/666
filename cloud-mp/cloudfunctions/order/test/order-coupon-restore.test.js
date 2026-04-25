'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadOrderCoupon(db) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return { database: () => db };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../order-coupon');
    delete require.cache[modulePath];
    try {
        return require('../order-coupon');
    } finally {
        Module._load = originalLoad;
    }
}

test('restoreUsedCoupon clears order markers that make restored coupons look used', async () => {
    const updates = [];
    const db = {
        command: {
            remove: () => ({ op: 'remove' }),
            in: (values) => ({ op: 'in', values })
        },
        serverDate: () => new Date('2026-04-25T00:00:00.000Z'),
        collection: (name) => {
            if (name === 'user_coupons') {
                return {
                    doc: (id) => ({
                        update: async ({ data }) => {
                            updates.push({ name, id, data });
                            return { stats: { updated: 1 } };
                        }
                    })
                };
            }
            if (name === 'users') {
                return {
                    where: () => ({
                        limit: () => ({
                            get: async () => ({ data: [] })
                        })
                    })
                };
            }
            throw new Error(`unexpected collection ${name}`);
        }
    };
    const { restoreUsedCoupon } = loadOrderCoupon(db);

    const restored = await restoreUsedCoupon({
        openid: 'buyer-openid',
        user_coupon_id: 'coupon-doc-1'
    });

    assert.equal(restored, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].data.status, 'unused');
    assert.deepEqual(updates[0].data.used_at, { op: 'remove' });
    assert.deepEqual(updates[0].data.used_order_id, { op: 'remove' });
    assert.deepEqual(updates[0].data.order_id, { op: 'remove' });
});
