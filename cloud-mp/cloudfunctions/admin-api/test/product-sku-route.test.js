'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const jwt = require('jsonwebtoken');
const { createRequest, createResponse } = require('node-mocks-http');

process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'debug-secret';

const app = require('../src/app');
const { jwtSecret } = require('../src/config');

async function ensureReady() {
    const ready = app.locals.dataStore?.readyPromise;
    if (ready) await ready;
}

function getEnabledAdmin() {
    const admins = app.locals.dataStore.getCollection('admins');
    const admin = admins.find((row) => row && (row.status === 1 || row.status === true || row.status === '1'));
    assert.ok(admin, 'expected at least one enabled admin in seed data');
    return admin;
}

function createAdminToken(admin) {
    return jwt.sign(
        { id: admin.id || admin._legacy_id, username: admin.username, role: admin.role },
        jwtSecret,
        { expiresIn: '1h' }
    );
}

async function invoke(path, { method = 'GET', query = {}, body = undefined } = {}) {
    await ensureReady();
    const admin = getEnabledAdmin();
    const request = createRequest({
        method,
        url: path,
        originalUrl: path,
        path,
        query,
        body,
        headers: {
            authorization: `Bearer ${createAdminToken(admin)}`
        }
    });
    const response = createResponse({ eventEmitter: EventEmitter });

    await new Promise((resolve, reject) => {
        response.on('finish', resolve);
        response.on('end', resolve);
        response.on('error', reject);
        app.handle(request, response);
    });

    return {
        statusCode: response.statusCode,
        body: response._isJSON() ? response._getJSONData() : response._getData()
    };
}

function cleanupProduct(productId, productName) {
    const store = app.locals.dataStore;
    const productIdText = productId == null ? '' : String(productId);
    store.saveCollection?.('products', store.getCollection('products').filter((row) => (
        String(row.id || row._legacy_id || row._id) !== productIdText && row.name !== productName
    )));
    if (productIdText) {
        store.saveCollection?.('skus', store.getCollection('skus').filter((row) => (
            String(row.product_id || '') !== productIdText
        )));
    }
}

test('POST /admin/api/products persists simplified SKU rows into skus collection', async () => {
    const productName = `sku-save-test-${Date.now()}`;
    let productId = null;

    try {
        const response = await invoke('/admin/api/products', {
            method: 'POST',
            body: {
                name: productName,
                retail_price: 20,
                market_price: 30,
                cost_price: 8,
                stock: 1,
                status: 1,
                images: [],
                detail_images: [],
                skus: [
                    { spec_value: '红色', retail_price: 21, stock: 2 },
                    { spec_value: '蓝色', retail_price: 23, stock: 3 }
                ]
            }
        });

        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        assert.equal(response.body.code, 0);
        productId = response.body.data.id;

        const productSkus = app.locals.dataStore.getCollection('skus')
            .filter((row) => String(row.product_id) === String(productId));
        assert.equal(productSkus.length, 2);
        assert.deepEqual(productSkus.map((row) => row.spec_value), ['红色', '蓝色']);
        assert.equal(productSkus[0].retail_price, 21);
        assert.equal(productSkus[0].price, 21);

        const product = app.locals.dataStore.getCollection('products')
            .find((row) => String(row.id || row._legacy_id || row._id) === String(productId));
        assert.equal(product.stock, 5);
        assert.equal(product.retail_price, 21);
        assert.equal(String(product.default_sku_id), String(productSkus[0].id || productSkus[0]._id));

        const listResponse = await invoke('/admin/api/products', {
            query: { keyword: productName, page: 1, limit: 10 }
        });
        assert.equal(listResponse.statusCode, 200);
        const listedProduct = listResponse.body.data.list.find((row) => String(row.id) === String(productId));
        assert.ok(listedProduct);
        assert.equal(listedProduct.skus.length, 2);
    } finally {
        cleanupProduct(productId, productName);
    }
});

test('POST /admin/api/products copies total stock into a single empty SKU stock', async () => {
    const productName = `single-sku-stock-sync-${Date.now()}`;
    let productId = null;

    try {
        const response = await invoke('/admin/api/products', {
            method: 'POST',
            body: {
                name: productName,
                retail_price: 293,
                market_price: 498,
                cost_price: 100,
                stock: 100,
                status: 1,
                images: [],
                detail_images: [],
                skus: [
                    { spec_value: '20g', retail_price: 293, stock: 0 }
                ]
            }
        });

        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        assert.equal(response.body.code, 0);
        productId = response.body.data.id;

        const productSkus = app.locals.dataStore.getCollection('skus')
            .filter((row) => String(row.product_id) === String(productId));
        assert.equal(productSkus.length, 1);
        assert.equal(productSkus[0].spec_value, '20g');
        assert.equal(productSkus[0].stock, 100);

        const product = app.locals.dataStore.getCollection('products')
            .find((row) => String(row.id || row._legacy_id || row._id) === String(productId));
        assert.equal(product.stock, 100);
    } finally {
        cleanupProduct(productId, productName);
    }
});

test('PUT /admin/api/products/:id copies total stock into a single empty SKU stock', async () => {
    await ensureReady();
    const store = app.locals.dataStore;
    const productId = `single-sku-stock-update-${Date.now()}`;
    const productName = `${productId}-name`;
    store.saveCollection?.('products', store.getCollection('products').concat({
        id: productId,
        name: productName,
        retail_price: 293,
        market_price: 498,
        cost_price: 100,
        stock: 0,
        status: 1,
        images: [],
        detail_images: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }));

    try {
        const response = await invoke(`/admin/api/products/${productId}`, {
            method: 'PUT',
            body: {
                name: productName,
                retail_price: 293,
                market_price: 498,
                cost_price: 100,
                stock: 100,
                status: 1,
                images: [],
                detail_images: [],
                skus: [
                    { spec_value: '20g', retail_price: 293, stock: 0 }
                ]
            }
        });

        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        assert.equal(response.body.code, 0);

        const productSkus = store.getCollection('skus')
            .filter((row) => String(row.product_id) === String(productId));
        assert.equal(productSkus.length, 1);
        assert.equal(productSkus[0].spec_value, '20g');
        assert.equal(productSkus[0].stock, 100);

        const product = store.getCollection('products')
            .find((row) => String(row.id || row._legacy_id || row._id) === String(productId));
        assert.equal(product.stock, 100);
    } finally {
        cleanupProduct(productId, productName);
    }
});

test('PUT /admin/api/products/:productId/skus supports string product ids and generated sku ids', async () => {
    await ensureReady();
    const store = app.locals.dataStore;
    const productId = `product-sku-route-${Date.now()}`;
    const productName = `${productId}-name`;
    store.saveCollection?.('products', store.getCollection('products').concat({
        _id: productId,
        name: productName,
        retail_price: 10,
        market_price: 12,
        cost_price: 5,
        stock: 0,
        status: 1,
        images: [],
        detail_images: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }));

    try {
        const response = await invoke(`/admin/api/products/${productId}/skus`, {
            method: 'PUT',
            body: {
                skus: [
                    { spec_value: '大份', retail_price: 12, stock: 4 }
                ]
            }
        });

        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        assert.equal(response.body.code, 0);
        assert.equal(response.body.data.total, 1);
        assert.equal(response.body.data.list[0].product_id, productId);
        assert.ok(response.body.data.list[0].id);

        const productSkus = store.getCollection('skus')
            .filter((row) => String(row.product_id) === productId);
        assert.equal(productSkus.length, 1);
        assert.equal(productSkus[0].spec_value, '大份');
    } finally {
        cleanupProduct(productId, productName);
    }
});
