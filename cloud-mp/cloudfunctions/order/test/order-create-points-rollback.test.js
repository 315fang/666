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
        return {
            module: require('../order-create'),
            restore: () => {
                Module._load = originalLoad;
                delete require.cache[modulePath];
            }
        };
    } catch (error) {
        Module._load = originalLoad;
        delete require.cache[modulePath];
        throw error;
    }
}

function createQuery({ get = async () => ({ data: [] }), update = async () => ({ stats: { updated: 1 } }), count = async () => ({ total: 0 }) } = {}) {
    return {
        limit: () => createQuery({ get, update, count }),
        skip: () => createQuery({ get, update, count }),
        get,
        update,
        count
    };
}

function createDbMock() {
    const calls = {
        userUpdates: [],
        orderAdds: 0
    };
    const command = {
        inc: (value) => ({ __op: 'inc', value }),
        gte: (value) => ({ __op: 'gte', value }),
        or: (conditions) => ({ __op: 'or', conditions }),
        in: (values) => ({ __op: 'in', values }),
        remove: () => ({ __op: 'remove' })
    };
    const user = {
        _id: 'user-doc-1',
        openid: 'buyer-openid',
        points: 3000,
        growth_value: 3000,
        role_level: 0
    };
    const product = {
        _id: 'product-doc-1',
        id: 'product-1',
        name: '测试商品',
        retail_price: 293,
        market_price: 498,
        stock: 100,
        supports_pickup: 1,
        allow_points: 1,
        enable_coupon: 1,
        images: []
    };
    const station = {
        _id: 'station-1',
        id: 'station-1',
        name: '测试门店',
        status: 'active',
        is_pickup_point: 1
    };

    const db = {
        command,
        serverDate: () => new Date('2026-05-04T00:00:00.000Z'),
        collection: (name) => {
            if (name === 'users') {
                return {
                    where: (where) => createQuery({
                        get: async () => ({ data: [user] }),
                        update: async ({ data }) => {
                            calls.userUpdates.push({ where, data });
                            return { stats: { updated: 1 } };
                        }
                    }),
                    doc: () => ({
                        get: async () => ({ data: user }),
                        update: async () => ({ stats: { updated: 1 } })
                    }),
                    add: async () => ({ _id: 'user-added' })
                };
            }
            if (name === 'products') {
                return {
                    where: () => createQuery({ get: async () => ({ data: [] }) }),
                    doc: () => ({ get: async () => ({ data: product }) }),
                    add: async () => ({ _id: 'product-added' })
                };
            }
            if (name === 'stations') {
                return {
                    where: () => createQuery({ get: async () => ({ data: [] }) }),
                    doc: () => ({ get: async () => ({ data: station }) }),
                    add: async () => ({ _id: 'station-added' })
                };
            }
            if (name === 'station_sku_stocks') {
                return {
                    where: () => createQuery({ get: async () => ({ data: [] }), count: async () => ({ total: 0 }) }),
                    skip: () => createQuery({ get: async () => ({ data: [] }), count: async () => ({ total: 0 }) }),
                    limit: () => createQuery({ get: async () => ({ data: [] }), count: async () => ({ total: 0 }) }),
                    get: async () => ({ data: [] }),
                    count: async () => ({ total: 0 }),
                    doc: () => ({ update: async () => ({ stats: { updated: 1 } }) }),
                    add: async () => ({ _id: 'stock-added' })
                };
            }
            if (name === 'orders') {
                return {
                    where: () => createQuery({ get: async () => ({ data: [] }), count: async () => ({ total: 0 }) }),
                    doc: () => ({ get: async () => ({ data: null }), update: async () => ({ stats: { updated: 1 } }) }),
                    add: async () => {
                        calls.orderAdds += 1;
                        return { _id: 'order-created' };
                    }
                };
            }
            return {
                where: () => createQuery(),
                doc: () => ({
                    get: async () => ({ data: null }),
                    update: async () => ({ stats: { updated: 1 } }),
                    set: async () => ({ stats: { updated: 1 } }),
                    remove: async () => ({ stats: { removed: 1 } })
                }),
                add: async () => ({ _id: `${name}-added` }),
                get: async () => ({ data: [] }),
                count: async () => ({ total: 0 }),
                skip: () => createQuery(),
                limit: () => createQuery()
            };
        }
    };
    return { db, calls };
}

test('createOrder refunds deducted points when pickup station stock reservation fails', async () => {
    const { db, calls } = createDbMock();
    const { module, restore } = loadOrderCreateWithDb(db);
    try {
        await assert.rejects(
            () => module.createOrder('buyer-openid', {
                delivery_type: 'pickup',
                pickup_station_id: 'station-1',
                points_to_use: 2051,
                items: [
                    { product_id: 'product-1', quantity: 1 }
                ]
            }),
            /所选门店暂无库存/
        );

        const pointChanges = calls.userUpdates
            .map((call) => call.data?.points?.value)
            .filter((value) => Number.isFinite(value));
        assert.deepEqual(pointChanges, [-2051, 2051]);
        assert.equal(calls.orderAdds, 0);
    } finally {
        restore();
    }
});
