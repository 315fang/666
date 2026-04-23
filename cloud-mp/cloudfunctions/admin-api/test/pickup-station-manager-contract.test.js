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

function getAnyStation() {
    const stations = app.locals.dataStore.getCollection('stations');
    if (stations[0]) return stations[0];
    const fallback = {
        _id: 'test-station-seed',
        id: 990001,
        name: '测试门店',
        status: 'active',
        is_pickup_point: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    stations.push(fallback);
    app.locals.dataStore.saveCollection?.('stations', stations);
    return fallback;
}

test('pickup station manager assignment requires role_level 6 user', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const station = getAnyStation();
    const users = app.locals.dataStore.getCollection('users');
    const candidate = {
        _id: 'test-non-store-manager-user',
        id: 991001,
        openid: 'openid-non-store-manager',
        nickname: 'NotStoreManager',
        role_level: 4,
        role_name: '运营合伙人',
        member_no: 'TS991001'
    };
    users.push(candidate);
    app.locals.dataStore.saveCollection?.('users', users);

    try {
        const response = await invoke(`/admin/api/pickup-stations/${station.id || station._id}/staff`, {
            method: 'POST',
            admin,
            body: {
                user_id: candidate.id,
                role: 'manager'
            }
        });

        assert.equal(response.statusCode, 400);
        assert.equal(response.body.message, '仅线下实体门店等级用户可设为店长');
    } finally {
        const nextUsers = app.locals.dataStore.getCollection('users').filter((row) => String(row.id) !== String(candidate.id));
        app.locals.dataStore.saveCollection?.('users', nextUsers);
    }
});
