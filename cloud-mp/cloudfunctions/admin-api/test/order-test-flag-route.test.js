'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const express = require('express');
const { createRequest, createResponse } = require('node-mocks-http');

const { registerOrderTestFlagRoutes } = require('../src/admin-order-test-flags');

function createDeps(overrides = {}) {
    const collections = {
        orders: [
            {
                _id: 'order-1',
                id: 'order-1',
                order_no: 'SO20260422001',
                status: 'paid',
                is_test_order: false
            }
        ],
        admin_audit_logs: []
    };

    const ok = (res, data) => res.json({ code: 0, data });
    const fail = (res, message, status = 400) => res.status(status).json({ code: status, message });

    return {
        auth: (req, _res, next) => {
            req.admin = { id: 1, username: 'tester' };
            req.permissions = ['settings_manage'];
            next();
        },
        requirePermission: () => (_req, _res, next) => next(),
        rejectUnknownBodyFields: () => false,
        patchCollectionRow: (name, id, patcher) => {
            const rows = collections[name] || [];
            const index = rows.findIndex((row) => String(row._id || row.id) === String(id));
            if (index === -1) return null;
            rows[index] = patcher(rows[index]);
            return rows[index];
        },
        createAuditLog: () => {},
        buildFreshOrderWriteResponse: async (id, fallbackData = null) => ({
            data: collections.orders.find((row) => String(row._id || row.id) === String(id)) || fallbackData,
            reloadMeta: {
                reloaded_collections: ['orders'],
                read_at: '2026-04-22T00:00:00.000Z'
            }
        }),
        okStrongWrite: (res, data, options = {}) => ok(res, {
            data,
            write_result: {
                persisted: options.persisted !== false,
                reloaded_collections: options.reloaded_collections || []
            },
            freshness: {
                read_mode: 'fresh',
                read_at: options.read_at || '2026-04-22T00:00:00.000Z'
            }
        }),
        fail,
        pickString: (value, fallback = '') => value == null ? fallback : (String(value).trim() || fallback),
        toBoolean: (value) => value === true || value === 1 || value === '1' || value === 'true',
        ...overrides
    };
}

async function invoke(app, { method = 'PUT', path, body = undefined } = {}) {
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

test('update test flag toggles order to test order', async () => {
    const app = express();
    const deps = createDeps();
    registerOrderTestFlagRoutes(app, deps);

    const response = await invoke(app, {
        path: '/admin/api/orders/order-1/test-flag',
        body: {
            is_test_order: true,
            reason: '管理员标记测试订单'
        }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(response.body.data.data.is_test_order, true);
    assert.equal(response.body.data.data.test_order_reason, '管理员标记测试订单');
});
