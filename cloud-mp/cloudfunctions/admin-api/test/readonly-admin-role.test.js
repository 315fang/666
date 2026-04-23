'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const jwt = require('jsonwebtoken');
const { createRequest, createResponse } = require('node-mocks-http');

process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'debug-secret';

const app = require('../src/app');
const { jwtSecret } = require('../src/config');

function ensureReadonlyAdmin() {
    const ready = app.locals.dataStore?.readyPromise;
    return Promise.resolve(ready).then(() => {
        const admins = app.locals.dataStore.getCollection('admins');
        const exists = admins.find((row) => String(row.username) === 'readonly_marketing');
        if (exists) return exists;
        const row = {
            _id: 'readonly-marketing-admin',
            id: 99001,
            username: 'readonly_marketing',
            name: '市场总监只读',
            role: 'marketing_director',
            permissions: [],
            status: 1,
            created_at: '2026-04-22T00:00:00.000Z',
            updated_at: '2026-04-22T00:00:00.000Z'
        };
        admins.push(row);
        app.locals.dataStore.saveCollection('admins', admins);
        return row;
    });
}

async function invoke(path, { method = 'GET', body = undefined } = {}) {
    const admin = await ensureReadonlyAdmin();
    const token = jwt.sign(
        { id: admin.id, username: admin.username, role: admin.role },
        jwtSecret,
        { expiresIn: '1h' }
    );

    const request = createRequest({
        method,
        url: path,
        originalUrl: path,
        path,
        body,
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

test('marketing director role can read materials list', async () => {
    const response = await invoke('/admin/api/material-groups', { method: 'GET' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
});

test('marketing director role cannot mutate materials', async () => {
    const response = await invoke('/admin/api/material-groups', {
        method: 'POST',
        body: { name: '只读测试分组' }
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.message, '市场总监账号为只读账号，不能执行修改操作');
});
