'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const express = require('express');
const { createRequest, createResponse } = require('node-mocks-http');

const { registerPickupStockRoutes } = require('../src/admin-pickup-stock');

function createDeps(overrides = {}) {
    const collections = {
        stations: [],
        station_staff: [],
        station_procurement_orders: [],
        station_sku_stocks: [],
        station_stock_logs: [],
        users: [],
        wallet_accounts: [],
        goods_fund_logs: [],
        products: [],
        skus: []
    };

    const ok = (res, data) => res.json({ code: 0, data });
    const fail = (res, message, status = 400) => res.status(status).json({ code: status, message });

    return {
        auth: (req, _res, next) => {
            req.admin = { id: 1, username: 'tester' };
            next();
        },
        requirePermission: () => (_req, _res, next) => next(),
        ensureFreshCollections: async () => {},
        getCollection: (name) => collections[name] || [],
        saveCollection: (name, rows) => {
            collections[name] = rows;
        },
        nextId: (rows = []) => rows.length + 1,
        nowIso: () => '2026-04-20T00:00:00.000Z',
        findByLookup: (rows, lookup, projector) => rows.find((row) => {
            const extra = typeof projector === 'function' ? projector(row) : [];
            return [row?.id, row?._id, row?._legacy_id, ...extra]
                .filter((value) => value !== null && value !== undefined && value !== '')
                .some((value) => String(value) === String(lookup));
        }) || null,
        rowMatchesLookup: (row, lookup, extra = []) => {
            return [row?.id, row?._id, row?._legacy_id, ...extra]
                .filter((value) => value !== null && value !== undefined && value !== '')
                .some((value) => String(value) === String(lookup));
        },
        paginate: (rows) => ({ list: rows, total: rows.length, pagination: { page: 1, limit: rows.length, total: rows.length } }),
        sortByUpdatedDesc: (rows = []) => [...rows],
        createAuditLog: () => {},
        appendGoodsFundLogEntry: async (entry) => {
            collections.goods_fund_logs.push({ id: collections.goods_fund_logs.length + 1, ...entry });
        },
        ok,
        fail,
        flush: async () => {},
        ...overrides
    };
}

async function invoke(app, { method = 'GET', path, query = {}, body = undefined } = {}) {
    const response = createResponse({ eventEmitter: EventEmitter });
    const request = createRequest({
        method,
        url: path,
        originalUrl: path,
        path,
        query,
        body
    });

    await new Promise((resolve, reject) => {
        response.on('finish', resolve);
        response.on('end', resolve);
        response.on('error', reject);
        app.handle(request, response);
    });

    return {
        statusCode: response.statusCode,
        body: response._getJSONData()
    };
}

test('create pickup procurement deducts goods fund and stores pending receive order', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('stations', [{
        _id: 'station-1',
        id: 'station-1',
        name: '浦东门店',
        status: 'active',
        pickup_claimant_openid: 'openid-store'
    }]);
    deps.saveCollection('users', [{
        _id: 'user-store',
        id: 'user-store',
        openid: 'openid-store',
        role_level: 6,
        nickname: '门店店长',
        agent_wallet_balance: 500,
        wallet_balance: 500
    }]);
    deps.saveCollection('products', [{
        _id: 'product-1',
        id: 'product-1',
        name: '山茶油',
        stock: 20,
        supply_price_b3: 30
    }]);

    registerPickupStockRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/pickup-stations/procurements',
        body: {
            station_id: 'station-1',
            product_id: 'product-1',
            quantity: 5
        }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(deps.getCollection('station_procurement_orders').length, 1);
    assert.equal(deps.getCollection('station_procurement_orders')[0].status, 'pending_receive');
    assert.equal(deps.getCollection('users')[0].agent_wallet_balance, 350);
    assert.equal(deps.getCollection('goods_fund_logs').length, 1);
    assert.equal(deps.getCollection('goods_fund_logs')[0].type, 'station_procurement');
});

test('receive pickup procurement moves stock into station inventory and deducts hq stock', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('station_procurement_orders', [{
        _id: 'proc-1',
        id: 'proc-1',
        procurement_no: 'PROC001',
        station_id: 'station-1',
        product_id: 'product-1',
        sku_id: 'sku-1',
        quantity: 4,
        cost_price: 28,
        total_cost: 112,
        status: 'pending_receive'
    }]);
    deps.saveCollection('products', [{
        _id: 'product-1',
        id: 'product-1',
        name: '山茶油',
        stock: 20
    }]);
    deps.saveCollection('skus', [{
        _id: 'sku-1',
        id: 'sku-1',
        product_id: 'product-1',
        name: '500ml',
        stock: 12
    }]);

    registerPickupStockRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/pickup-stations/procurements/proc-1/receive'
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(deps.getCollection('station_procurement_orders')[0].status, 'received');
    assert.equal(deps.getCollection('products')[0].stock, 16);
    assert.equal(deps.getCollection('skus')[0].stock, 8);
    assert.equal(deps.getCollection('station_sku_stocks').length, 1);
    assert.equal(deps.getCollection('station_sku_stocks')[0].available_qty, 4);
    assert.equal(deps.getCollection('station_stock_logs').length, 1);
    assert.equal(deps.getCollection('station_stock_logs')[0].type, 'procure_in');
});

test('create pickup procurement rejects sku that does not belong to product', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('stations', [{
        _id: 'station-1',
        id: 'station-1',
        name: '浦东门店',
        status: 'active',
        pickup_claimant_openid: 'openid-store'
    }]);
    deps.saveCollection('users', [{
        _id: 'user-store',
        id: 'user-store',
        openid: 'openid-store',
        role_level: 6,
        nickname: '门店店长',
        agent_wallet_balance: 500,
        wallet_balance: 500
    }]);
    deps.saveCollection('products', [{
        _id: 'product-1',
        id: 'product-1',
        name: '山茶油',
        stock: 20,
        supply_price_b3: 30
    }]);
    deps.saveCollection('skus', [{
        _id: 'sku-2',
        id: 'sku-2',
        product_id: 'other-product',
        name: '错误规格',
        stock: 12
    }]);

    registerPickupStockRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/pickup-stations/procurements',
        body: {
            station_id: 'station-1',
            product_id: 'product-1',
            sku_id: 'sku-2',
            quantity: 1
        }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 400);
});
