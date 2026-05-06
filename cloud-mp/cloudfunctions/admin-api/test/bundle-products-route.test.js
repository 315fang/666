'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const express = require('express');
const { createRequest, createResponse } = require('node-mocks-http');

const { registerBundleProductRoutes } = require('../src/admin-bundle-products');

function createDeps(overrides = {}) {
    const collections = {
        bundle_products: [],
        product_bundles: [],
        products: [
            {
                _id: 'product-1',
                id: 1,
                name: 'Normal Product',
                category_id: 7,
                retail_price: 29.9,
                stock: 12,
                images: ['https://example.com/product.jpg']
            }
        ],
        categories: [
            { _id: 'category-7', id: 7, name: 'Default Category' }
        ]
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
        nowIso: () => '2026-05-03T00:00:00.000Z',
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
        flush: async () => {},
        ok: (res, data) => res.json({ code: 0, data }),
        fail: (res, message, status = 400) => res.status(status).json({ code: status, message }),
        ...overrides
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

test('creating bundle product stores a separate combo-library row', async () => {
    const app = express();
    let flushCalls = 0;
    const deps = createDeps({
        flush: async () => {
            flushCalls += 1;
        }
    });

    registerBundleProductRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/bundle-products',
        body: {
            source_product_id: 1,
            name: 'Combo Library Product',
            category_id: 7,
            status: 1
        }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(flushCalls, 1);
    assert.equal(deps.getCollection('bundle_products').length, 1);
    assert.equal(response.body.data.source_product_id, '1');
    assert.equal(response.body.data.product_id, '1');
    assert.equal(response.body.data.name, 'Combo Library Product');
    assert.equal(response.body.data.product_name, 'Normal Product');
    assert.equal(response.body.data.library_label, '特惠随心选');
});

test('deleting bundle product fails when it is used by a product bundle', async () => {
    const app = express();
    const deps = createDeps();
    deps.getCollection('bundle_products').push({
        _id: 'bundle-product-1',
        id: 1,
        source_product_id: 1,
        product_id: 1,
        name: 'Used Combo Product',
        status: 1
    });
    deps.getCollection('product_bundles').push({
        _id: 'bundle-1',
        groups: [
            {
                options: [
                    { bundle_product_id: 'bundle-product-1', product_id: 1 }
                ]
            }
        ]
    });

    registerBundleProductRoutes(app, deps);

    const response = await invoke(app, {
        method: 'DELETE',
        path: '/admin/api/bundle-products/bundle-product-1'
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 400);
    assert.match(response.body.message, /已被自由组合套餐使用/);
    assert.equal(deps.getCollection('bundle_products').length, 1);
});
