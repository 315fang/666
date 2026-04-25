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

test('GET /admin/api/users team_leader_id keeps numeric-id descendants after canonical user mapping', async () => {
    await ensureReady();
    const store = app.locals.dataStore;
    const originalGetCollection = store.getCollection.bind(store);
    const originalReloadCollections = store.reloadCollections?.bind(store);
    const originalReloadCollection = store.reloadCollection?.bind(store);
    const admin = { id: 1, username: 'admin', role: 'super_admin', status: 1 };
    const collections = {
        admins: [admin],
        admin_roles: [],
        orders: [],
        commissions: [],
        users: [
            {
                _id: 'leader-doc',
                id: 3,
                openid: 'openid-leader',
                nickname: 'Leader',
                account_visibility: 'visible'
            },
            {
                _id: 'direct-old-doc',
                id: 8,
                openid: 'openid-direct-old',
                nickname: 'Old direct',
                parent_id: 3,
                parent_openid: 'openid-leader',
                referrer_openid: 'openid-leader',
                account_visibility: 'visible'
            },
            {
                _id: 'indirect-old-doc',
                id: 17,
                openid: 'openid-indirect-old',
                nickname: 'Old indirect',
                parent_id: 8,
                parent_openid: 'openid-direct-old',
                referrer_openid: 'openid-direct-old',
                account_visibility: 'visible'
            },
            {
                _id: 'direct-new-doc',
                openid: 'openid-direct-new',
                nickname: 'New direct',
                parent_id: 'leader-doc',
                parent_openid: 'openid-leader',
                referrer_openid: 'openid-leader',
                account_visibility: 'visible'
            },
            {
                _id: 'outside-doc',
                id: 99,
                openid: 'openid-outside',
                nickname: 'Outside',
                account_visibility: 'visible'
            }
        ]
    };

    store.getCollection = (name) => collections[name] || [];
    store.reloadCollections = async () => [];
    store.reloadCollection = async () => [];

    try {
        const response = await invoke('/admin/api/users', {
            admin,
            query: {
                team_leader_id: 'leader-doc',
                page: 1,
                limit: 20
            }
        });
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.code, 0);
        assert.equal(response.body.data.total, 3);
        assert.deepEqual(
            response.body.data.list.map((row) => row._id).sort(),
            ['direct-new-doc', 'direct-old-doc', 'indirect-old-doc']
        );

        const firstLevelResponse = await invoke('/admin/api/users', {
            admin,
            query: {
                team_leader_id: 'leader-doc',
                team_level: '1',
                page: 1,
                limit: 20
            }
        });
        assert.equal(firstLevelResponse.statusCode, 200);
        assert.equal(firstLevelResponse.body.data.total, 2);
        assert.deepEqual(
            firstLevelResponse.body.data.list.map((row) => row._id).sort(),
            ['direct-new-doc', 'direct-old-doc']
        );

        const secondLevelResponse = await invoke('/admin/api/users', {
            admin,
            query: {
                team_leader_id: 'leader-doc',
                team_level: '2',
                page: 1,
                limit: 20
            }
        });
        assert.equal(secondLevelResponse.statusCode, 200);
        assert.equal(secondLevelResponse.body.data.total, 1);
        assert.deepEqual(
            secondLevelResponse.body.data.list.map((row) => row._id),
            ['indirect-old-doc']
        );
    } finally {
        store.getCollection = originalGetCollection;
        if (originalReloadCollections) store.reloadCollections = originalReloadCollections;
        if (originalReloadCollection) store.reloadCollection = originalReloadCollection;
    }
});
