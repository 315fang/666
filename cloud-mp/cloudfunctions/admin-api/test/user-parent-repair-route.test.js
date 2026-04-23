'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const express = require('express');
const { createRequest, createResponse } = require('node-mocks-http');

const { registerUserParentRepairRoutes } = require('../src/admin-user-parent-repair');

function createDeps(overrides = {}) {
    const collections = {
        users: [],
        admin_audit_logs: []
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
        nowIso: () => '2026-04-21T12:00:00.000Z',
        createAuditLog: (_admin, action, collection, payload) => {
            collections.admin_audit_logs.push({ action, collection, payload });
        },
        ok,
        fail,
        flush: async () => {},
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

test('parent repair batch repairs locked orphan user with explicit mapping', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('users', [
        {
            _id: 'parent-1',
            id: 101,
            openid: 'openid-parent',
            my_invite_code: 'PARENT01',
            role_level: 6
        },
        {
            _id: 'child-1',
            id: 202,
            openid: 'openid-child',
            my_invite_code: 'CHILD001',
            line_locked: true,
            referrer_openid: '',
            parent_openid: '',
            parent_id: null
        }
    ]);

    registerUserParentRepairRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/users/parent-repair-batch',
        body: {
            repairs: [
                {
                    child_user: { openid: 'openid-child' },
                    parent_user: { invite_code: 'PARENT01' }
                }
            ]
        }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(response.body.data.repaired, 1);
    assert.equal(response.body.data.skipped, 0);
    assert.equal(deps.getCollection('users')[1].referrer_openid, 'openid-parent');
    assert.equal(deps.getCollection('users')[1].parent_openid, 'openid-parent');
    assert.equal(String(deps.getCollection('users')[1].parent_id), 'parent-1');
    assert.equal(deps.getCollection('users')[1].line_locked, true);
    assert.equal(deps.getCollection('users')[1].relation_source, 'share_invite');
});

test('parent repair batch skips user already bound to another parent', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('users', [
        {
            _id: 'parent-a',
            openid: 'openid-parent-a',
            my_invite_code: 'PARENTA1'
        },
        {
            _id: 'parent-b',
            openid: 'openid-parent-b',
            my_invite_code: 'PARENTB1'
        },
        {
            _id: 'child-2',
            openid: 'openid-child-2',
            referrer_openid: 'openid-parent-a',
            parent_openid: 'openid-parent-a',
            parent_id: 'parent-a',
            line_locked: true
        }
    ]);

    registerUserParentRepairRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/users/parent-repair-batch',
        body: {
            repairs: [
                {
                    child_user: { openid: 'openid-child-2' },
                    parent_user: { invite_code: 'PARENTB1' }
                }
            ]
        }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(response.body.data.repaired, 0);
    assert.equal(response.body.data.skipped, 1);
    assert.equal(response.body.data.results[0].code, 'already_bound');
    assert.equal(deps.getCollection('users')[2].referrer_openid, 'openid-parent-a');
    assert.equal(deps.getCollection('users')[2].parent_id, 'parent-a');
});
