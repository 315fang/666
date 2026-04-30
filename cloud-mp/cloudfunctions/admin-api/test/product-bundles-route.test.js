'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const express = require('express');
const { createRequest, createResponse } = require('node-mocks-http');

const { registerProductBundleRoutes } = require('../src/admin-product-bundles');

function createDeps(overrides = {}) {
    const collections = {
        product_bundles: [],
        products: [
            {
                _id: 'product-1',
                id: 1,
                name: 'Test Product',
                retail_price: 100,
                stock: 10
            }
        ],
        skus: []
    };

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
        nowIso: () => '2026-04-23T00:00:00.000Z',
        findByLookup: (rows, lookup, projector) => rows.find((row) => {
            const extra = typeof projector === 'function' ? projector(row) : [];
            return [row?.id, row?._id, row?._legacy_id, ...extra]
                .filter((value) => value !== null && value !== undefined && value !== '')
                .some((value) => String(value) === String(lookup));
        }) || null,
        paginate: (rows) => ({ list: rows, total: rows.length, pagination: { page: 1, limit: rows.length, total: rows.length } }),
        sortByUpdatedDesc: (rows = []) => [...rows],
        pickString: (value, fallback = '') => {
            if (value === null || value === undefined) return fallback;
            const text = String(value).trim();
            return text || fallback;
        },
        toNumber: (value, fallback = 0) => {
            const number = Number(value);
            return Number.isFinite(number) ? number : fallback;
        },
        toBoolean: (value, fallback = false) => {
            if (value === undefined || value === null || value === '') return fallback;
            if (value === true || value === 1 || value === '1') return true;
            if (value === false || value === 0 || value === '0') return false;
            return !['false', 'no', 'off', 'disabled'].includes(String(value).trim().toLowerCase());
        },
        createAuditLog: () => {},
        resolveManagedFileUrl: async (value) => value,
        flush: async () => {},
        ok: (res, data) => res.json({ code: 0, data }),
        fail: (res, message, status = 400) => res.status(status).json({ code: status, message }),
        ...overrides
    };
}

function createPayload() {
    return {
        title: 'Bundle A',
        scene_type: 'flex_bundle',
        bundle_price: 88,
        status: 1,
        publish_status: 'published',
        groups: [
            {
                group_title: 'Group A',
                group_key: 'group_a',
                min_select: 1,
                max_select: 1,
                options: [
                    {
                        product_id: 1,
                        default_qty: 1,
                        enabled: 1,
                        commission_pool_amount: 80,
                        solo_commission_fixed_by_role: { 3: 60, 5: 80 },
                        direct_commission_fixed_by_role: { 3: 40 },
                        indirect_commission_fixed_by_role: { 5: 40 }
                    }
                ]
            }
        ]
    };
}

async function invoke(app, { method = 'GET', path, body = undefined } = {}) {
    const response = createResponse({ eventEmitter: EventEmitter });
    const request = createRequest({
        method,
        url: path,
        originalUrl: path,
        path,
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

test('creating product bundle waits for persistence flush before success', async () => {
    const app = express();
    let flushCalls = 0;
    const deps = createDeps({
        flush: async () => {
            flushCalls += 1;
        }
    });

    registerProductBundleRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/product-bundles',
        body: createPayload()
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(flushCalls, 1);
    assert.equal(deps.getCollection('product_bundles').length, 1);
    assert.equal(deps.getCollection('product_bundles')[0].scene_type, 'flex_bundle');
    const option = deps.getCollection('product_bundles')[0].groups[0].options[0];
    assert.equal(option.commission_mode, 'fixed');
    assert.equal(option.commission_source, 'bundle_option_fixed');
    assert.equal(option.commission_pool_amount, 80);
    assert.equal(option.solo_commission_fixed_by_role['3'], 60);
    assert.equal(option.solo_commission_fixed_by_role['5'], 80);
    assert.equal(option.direct_commission_fixed_by_role['3'], 40);
    assert.equal(option.indirect_commission_fixed_by_role['5'], 40);
});

test('creating product bundle fails when persistence flush fails', async () => {
    const app = express();
    const deps = createDeps({
        flush: async () => {
            throw new Error('flush failed');
        }
    });

    registerProductBundleRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/product-bundles',
        body: createPayload()
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.body.code, 500);
});

test('creating product bundle rejects fixed commission above explicit pool', async () => {
    const app = express();
    const deps = createDeps();
    const payload = createPayload();
    payload.groups[0].options[0].commission_pool_amount = 60;

    registerProductBundleRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/product-bundles',
        body: payload
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 400);
    assert.match(response.body.message, /固定佣金池不能小于 80 元/);
    assert.equal(deps.getCollection('product_bundles').length, 0);
});

test('creating product bundle accepts repeatable option capacity above option count', async () => {
    const app = express();
    const deps = createDeps();
    const payload = createPayload();
    payload.groups[0].min_select = 3;
    payload.groups[0].max_select = 3;
    payload.groups[0].options[0].repeatable = 1;
    payload.groups[0].options[0].max_qty_per_order = 3;

    registerProductBundleRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/product-bundles',
        body: payload
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    const option = deps.getCollection('product_bundles')[0].groups[0].options[0];
    assert.equal(option.repeatable, 1);
    assert.equal(option.max_qty_per_order, 3);
});
