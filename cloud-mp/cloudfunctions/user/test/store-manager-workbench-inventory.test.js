'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function cloneRow(row) {
    return row && typeof row === 'object' ? { ...row } : row;
}

function matchesExpected(actual, expected) {
    if (expected && expected.__op === 'in') {
        return expected.values.some((value) => String(actual) === String(value));
    }
    return String(actual) === String(expected);
}

function matchesQuery(row, query = {}) {
    return Object.entries(query).every(([key, expected]) => matchesExpected(row[key], expected));
}

function createCollection(rows = []) {
    function createQuery(query = {}, offset = 0, limitCount = Infinity) {
        const scopedRows = () => rows.filter((row) => matchesQuery(row, query));
        return {
            where: (nextQuery = {}) => createQuery({ ...query, ...nextQuery }, offset, limitCount),
            count: async () => ({ total: scopedRows().length }),
            skip: (nextOffset) => createQuery(query, nextOffset, limitCount),
            limit: (nextLimit) => createQuery(query, offset, nextLimit),
            get: async () => ({ data: scopedRows().slice(offset, offset + limitCount).map(cloneRow) })
        };
    }

    return {
        ...createQuery(),
        doc: (id) => ({
            get: async () => ({
                data: cloneRow(rows.find((row) => String(row._id) === String(id)) || null)
            }),
            update: async () => ({ stats: { updated: 0 } }),
            set: async () => ({ stats: { updated: 0 } })
        }),
        add: async ({ data } = {}) => {
            const row = { _id: `generated-${rows.length + 1}`, ...data };
            rows.push(row);
            return { _id: row._id };
        }
    };
}

function createDb(collections) {
    return {
        command: {
            in: (values) => ({ __op: 'in', values: Array.isArray(values) ? values : [values] }),
            inc: (value) => ({ __op: 'inc', value }),
            gte: (value) => ({ __op: 'gte', value })
        },
        serverDate: () => new Date('2026-05-04T00:00:00.000Z'),
        collection: (name) => createCollection(collections[name] || [])
    };
}

function loadUserFunction(db, openid) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => db,
                getWXContext: () => ({ OPENID: openid })
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../index');
    delete require.cache[modulePath];
    try {
        return require('../index');
    } finally {
        Module._load = originalLoad;
    }
}

test('store manager workbench lists only inventory for managed stations', async () => {
    const collections = {
        users: [
            { _id: 'user-manager', id: 1001, openid: 'openid-manager', nickname: '店长', role_level: 6 },
            { _id: 'user-claimant', id: 1002, openid: 'openid-claimant', nickname: '结算人', role_level: 6 }
        ],
        stations: [
            { _id: 'station-doc-2', id: 2, name: '二号门店', status: 'active', pickup_claimant_openid: 'openid-claimant' },
            { _id: 'station-doc-3', id: 3, name: '三号门店', status: 'active' }
        ],
        station_staff: [
            { _id: 'staff-manager', station_id: 2, user_id: 1001, role: 'manager', status: 'active', can_verify: 1 }
        ],
        station_sku_stocks: [
            { _id: 'stock-own', station_id: 2, product_id: 'product-1', sku_id: 'sku-1', available_qty: 5, reserved_qty: 2, cost_price: 12.5 },
            { _id: 'stock-other', station_id: 3, product_id: 'product-2', sku_id: 'sku-2', available_qty: 9, reserved_qty: 0, cost_price: 8 }
        ],
        station_stock_logs: [
            { _id: 'log-own', station_id: 2, stock_id: 'stock-own', product_id: 'product-1', sku_id: 'sku-1', type: 'pickup_consume', quantity: 2, order_no: 'ORDER-OWN', created_at: '2026-05-04T10:00:00.000Z' },
            { _id: 'log-other', station_id: 3, stock_id: 'stock-other', product_id: 'product-2', sku_id: 'sku-2', type: 'procure_in', quantity: 8, procurement_no: 'PROC-OTHER', created_at: '2026-05-04T11:00:00.000Z' }
        ],
        products: [
            { _id: 'product-1', name: '门店可见商品' },
            { _id: 'product-2', name: '其他门店商品' }
        ],
        skus: [
            { _id: 'sku-1', product_id: 'product-1', name: '红色', spec: '500g' },
            { _id: 'sku-2', product_id: 'product-2', name: '蓝色', spec: '1kg' }
        ],
        orders: [],
        station_procurement_orders: [],
        commissions: [],
        goods_fund_logs: []
    };
    const userFunction = loadUserFunction(createDb(collections), 'openid-manager');

    const response = await userFunction.main({ action: 'storeManagerWorkbench' });

    assert.equal(response.code, 0);
    assert.equal(response.data.stations.length, 1);
    assert.equal(response.data.inventory.length, 1);
    assert.equal(response.data.inventory[0].id, 'stock-own');
    assert.equal(response.data.inventory[0].station_name, '二号门店');
    assert.equal(response.data.inventory[0].product_name, '门店可见商品');
    assert.equal(response.data.inventory[0].sku_spec, '500g');
    assert.equal(response.data.summary.inventory_available_qty, 5);
    assert.equal(response.data.summary.inventory_reserved_qty, 2);
    assert.equal(response.data.inventory.some((row) => row.id === 'stock-other'), false);
    assert.equal(response.data.recent_stock_logs.length, 1);
    assert.equal(response.data.recent_stock_logs[0].id, 'log-own');
    assert.equal(response.data.recent_stock_logs[0].type_text, '核销消耗');
    assert.equal(response.data.recent_stock_logs[0].quantity_delta, -2);
    assert.equal(response.data.recent_stock_logs[0].product_name, '门店可见商品');
    assert.equal(response.data.recent_stock_logs.some((row) => row.id === 'log-other'), false);
});
