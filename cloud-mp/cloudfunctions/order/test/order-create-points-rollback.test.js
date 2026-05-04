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

function createDbMock(options = {}) {
    const calls = {
        userUpdates: [],
        orderAdds: 0,
        orderPayloads: []
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
        _id: options.stationDocId || 'station-1',
        id: options.stationBusinessId || 'station-1',
        station_id: options.stationStationId || '',
        station_key: options.stationKey || '',
        name: '测试门店',
        status: 'active',
        is_pickup_point: 1
    };
    const stockRows = Array.isArray(options.stockRows) ? options.stockRows : [];

    const applyPatch = (target, data = {}) => {
        Object.entries(data).forEach(([key, value]) => {
            if (value && value.__op === 'inc') {
                target[key] = (Number(target[key]) || 0) + value.value;
            } else {
                target[key] = value;
            }
        });
    };

    const matchesWhere = (row, where = {}) => {
        return Object.entries(where || {}).every(([key, expected]) => {
            if (expected && expected.__op === 'gte') {
                return Number(row[key] || 0) >= expected.value;
            }
            return String(row[key] || '') === String(expected);
        });
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
                    where: (where) => createQuery({
                        get: async () => ({ data: matchesWhere(station, where) ? [station] : [] })
                    }),
                    doc: (id) => ({
                        get: async () => ({
                            data: options.stationDocFound === false
                                ? null
                                : (String(id) === String(station._id) ? station : null)
                        })
                    }),
                    add: async () => ({ _id: 'station-added' })
                };
            }
            if (name === 'station_sku_stocks') {
                return {
                    where: (where) => createQuery({
                        get: async () => ({ data: stockRows.filter((row) => matchesWhere(row, where)) }),
                        update: async ({ data }) => {
                            const row = stockRows.find((item) => matchesWhere(item, where));
                            if (!row) return { stats: { updated: 0 } };
                            applyPatch(row, data);
                            return { stats: { updated: 1 } };
                        },
                        count: async () => ({ total: stockRows.filter((row) => matchesWhere(row, where)).length })
                    }),
                    skip: () => createQuery({ get: async () => ({ data: stockRows }), count: async () => ({ total: stockRows.length }) }),
                    limit: () => createQuery({ get: async () => ({ data: stockRows }), count: async () => ({ total: stockRows.length }) }),
                    get: async () => ({ data: stockRows }),
                    count: async () => ({ total: stockRows.length }),
                    doc: () => ({ update: async () => ({ stats: { updated: 1 } }) }),
                    add: async () => ({ _id: 'stock-added' })
                };
            }
            if (name === 'orders') {
                return {
                    where: () => createQuery({ get: async () => ({ data: [] }), count: async () => ({ total: 0 }) }),
                    doc: () => ({ get: async () => ({ data: null }), update: async () => ({ stats: { updated: 1 } }) }),
                    add: async ({ data } = {}) => {
                        calls.orderAdds += 1;
                        calls.orderPayloads.push(data || {});
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
    return { db, calls, station, stockRows };
}

test('getPointDeductionRule honors configured max order ratio below default', async () => {
    const db = {
        command: {
            or: (conditions) => ({ __op: 'or', conditions })
        },
        serverDate: () => new Date('2026-05-04T00:00:00.000Z'),
        collection: (name) => {
            if (name === 'configs') {
                return {
                    where: () => ({
                        limit: () => ({
                            get: async () => ({
                                data: [{
                                    _id: 'point-rule',
                                    config_key: 'point_rule_config',
                                    config_value: {
                                        deduction: {
                                            yuan_per_point: 0.1,
                                            max_order_ratio: 0.3
                                        }
                                    },
                                    updated_at: '2026-05-04T00:00:00.000Z'
                                }]
                            })
                        })
                    })
                };
            }
            return {
                where: () => ({
                    limit: () => ({ get: async () => ({ data: [] }) })
                }),
                doc: () => ({ get: async () => ({ data: null }) })
            };
        }
    };
    const { module, restore } = loadOrderCreateWithDb(db);
    try {
        const rule = await module.getPointDeductionRule();
        assert.equal(rule.maxRatio, 0.3);
    } finally {
        restore();
    }
});

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
        const growthChanges = calls.userUpdates
            .map((call) => call.data?.growth_value?.value)
            .filter((value) => Number.isFinite(value));
        assert.deepEqual(pointChanges, [-2051, 2051]);
        assert.deepEqual(growthChanges, []);
        assert.equal(calls.orderAdds, 0);
    } finally {
        restore();
    }
});

test('createOrder accepts string pickup station business id and reserves station stock', async () => {
    const { db, calls, stockRows } = createDbMock({
        stationDocId: 'station-doc-1',
        stationBusinessId: 'store-code-1',
        stationDocFound: false,
        stockRows: [{
            _id: 'stock-store-code-1-product-1',
            id: 'stock-store-code-1-product-1',
            station_id: 'store-code-1',
            product_id: 'product-doc-1',
            sku_id: '',
            available_qty: 3,
            reserved_qty: 0,
            cost_price: 10
        }]
    });
    const { module, restore } = loadOrderCreateWithDb(db);
    try {
        const result = await module.createOrder('buyer-openid', {
            delivery_type: 'pickup',
            pickup_station_id: 'store-code-1',
            items: [
                { product_id: 'product-1', quantity: 1 }
            ]
        });

        assert.equal(result.id, 'order-created');
        assert.equal(calls.orderAdds, 1);
        assert.equal(calls.orderPayloads[0].pickup_station_id, 'station-doc-1');
        assert.equal(stockRows[0].available_qty, 2);
        assert.equal(stockRows[0].reserved_qty, 1);
    } finally {
        restore();
    }
});
