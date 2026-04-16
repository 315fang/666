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

function createAdminToken(admin) {
    return jwt.sign(
        { id: admin.id || admin._legacy_id, username: admin.username, role: admin.role },
        jwtSecret,
        { expiresIn: '1h' }
    );
}

async function invoke(path, { method = 'GET', query = {}, body, admin } = {}) {
    await ensureReady();

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

function getEnabledAdmin() {
    const admins = app.locals.dataStore.getCollection('admins');
    const admin = admins.find((row) => row && (row.status === 1 || row.status === true || row.status === '1'));
    assert.ok(admin, 'expected at least one enabled admin in seed data');
    return admin;
}

function getShippableOrder() {
    const orders = app.locals.dataStore.getCollection('orders');
    const hit = orders.find((row) => ['paid', 'agent_confirmed', 'shipping_requested'].includes(String(row.status || '')));
    if (hit) return hit;
    assert.ok(orders[0], 'expected at least one order in seed data');
    orders[0].status = 'paid';
    return orders[0];
}

function getRefundForReview() {
    const refunds = app.locals.dataStore.getCollection('refunds');
    const hit = refunds.find((row) => ['pending', 'approved'].includes(String(row.status || '')));
    if (hit) return hit;
    assert.ok(refunds[0], 'expected at least one refund in seed data');
    refunds[0].status = 'pending';
    return refunds[0];
}

function getAnyUser() {
    const users = app.locals.dataStore.getCollection('users');
    assert.ok(users[0], 'expected at least one user in seed data');
    return users[0];
}

test('PUT /admin/api/orders/:id/ship returns field_errors for invalid body', async () => {
    const admin = getEnabledAdmin();
    const order = getShippableOrder();
    const response = await invoke(`/admin/api/orders/${order.id || order._id}/ship`, {
        method: 'PUT',
        admin,
        body: {
            fulfillment_type: 'invalid-mode',
            extra_field: 'unexpected'
        }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.ok(response.body.request_id);
    assert.ok(Array.isArray(response.body.field_errors));
    assert.ok(response.body.field_errors.some((item) => item.field === 'extra_field'));
});

test('PUT /admin/api/refunds/:id/reject returns field_errors for invalid body', async () => {
    const admin = getEnabledAdmin();
    const refund = getRefundForReview();
    const response = await invoke(`/admin/api/refunds/${refund.id || refund._id}/reject`, {
        method: 'PUT',
        admin,
        body: {
            reason: '',
            unexpected: 'x'
        }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.ok(Array.isArray(response.body.field_errors));
    assert.ok(response.body.field_errors.some((item) => item.field === 'unexpected'));
});

test('PUT /admin/api/users/:id/goods-fund returns field_errors for invalid body', async () => {
    const admin = getEnabledAdmin();
    const user = getAnyUser();
    const response = await invoke(`/admin/api/users/${user.id || user._id || user.openid}/goods-fund`, {
        method: 'PUT',
        admin,
        body: {
            amount: 0,
            type: 'invalid',
            reason: '',
            extra_field: 'unexpected'
        }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.ok(Array.isArray(response.body.field_errors));
    assert.ok(response.body.field_errors.some((item) => item.field === 'extra_field'));
});

test('settings-protected endpoints still reject low-permission admins', async () => {
    await ensureReady();
    const admins = app.locals.dataStore.getCollection('admins');
    const lowPermissionAdmin = {
        _id: 'test-low-permission-admin',
        id: 999001,
        username: 'limited-admin',
        name: 'limited-admin',
        role: 'operator',
        status: true,
        permissions: JSON.stringify(['dashboard'])
    };
    admins.push(lowPermissionAdmin);
    app.locals.dataStore.saveCollection?.('admins', admins);

    try {
        const alertResponse = await invoke('/admin/api/alert-config', {
            admin: lowPermissionAdmin
        });
        assert.equal(alertResponse.statusCode, 403);
        assert.equal(alertResponse.body.success, false);

        const toggleResponse = await invoke('/admin/api/feature-toggles', {
            method: 'POST',
            admin: lowPermissionAdmin,
            body: { show_station_entry: true }
        });
        assert.equal(toggleResponse.statusCode, 403);
        assert.equal(toggleResponse.body.success, false);
    } finally {
        const index = admins.findIndex((row) => String(row.id) === String(lowPermissionAdmin.id));
        if (index !== -1) admins.splice(index, 1);
        app.locals.dataStore.saveCollection?.('admins', admins);
    }
});
