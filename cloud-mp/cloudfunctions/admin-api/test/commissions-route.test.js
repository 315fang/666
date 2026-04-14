'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const jwt = require('jsonwebtoken');
const { createRequest, createResponse } = require('node-mocks-http');

process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'debug-secret';

const app = require('../src/app');
const { jwtSecret } = require('../src/config');

async function invoke(path, { method = 'GET', query = {} } = {}) {
    const ready = app.locals.dataStore?.readyPromise;
    if (ready) await ready;

    const admins = app.locals.dataStore.getCollection('admins');
    const admin = admins.find((row) => row && (row.status === 1 || row.status === true || row.status === '1'));
    assert.ok(admin, 'expected at least one enabled admin in seed data');

    const token = jwt.sign(
        { id: admin.id || admin._legacy_id, username: admin.username, role: admin.role },
        jwtSecret,
        { expiresIn: '1h' }
    );

    const request = createRequest({
        method,
        url: path,
        originalUrl: path,
        path,
        query,
        headers: {
            authorization: `Bearer ${token}`
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

test('GET /admin/api/commissions tolerates commission rows without linked orders', async () => {
    const response = await invoke('/admin/api/commissions', {
        query: { page: 1, limit: 20 }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.ok(Array.isArray(response.body.data.list));
    assert.ok(response.body.data.list.length >= 1);
});
