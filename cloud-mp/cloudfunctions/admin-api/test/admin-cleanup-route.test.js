'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const express = require('express');
const { createRequest, createResponse } = require('node-mocks-http');

const { registerCleanupRoutes } = require('../src/admin-cleanup');
const { isVisibleOrder, normalizeOrderVisibility } = require('../src/shared/record-visibility');

function createDeps(overrides = {}) {
    const collections = {
        orders: [
            {
                _id: 'order-1',
                id: 'order-1',
                order_no: 'SO20260423001',
                status: 'cancelled'
            }
        ],
        users: [
            {
                _id: 'user-1',
                id: 'user-1',
                openid: 'openid-1',
                account_visibility: 'hidden',
                hidden_reason: 'visitor_cleanup',
                hidden_at: '2026-04-22T00:00:00.000Z'
            }
        ],
        admin_audit_logs: []
    };
    const auditLogs = [];

    const pickString = (value, fallback = '') => value == null ? fallback : (String(value).trim() || fallback);
    const primaryId = (row) => row?.id ?? row?._legacy_id ?? row?._id ?? null;
    const matchesLookup = (row, id, extraValues = []) => [primaryId(row), row._id, row.id, row.openid, row.order_no, ...extraValues]
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(String)
        .includes(String(id));

    return {
        collections,
        auditLogs,
        auth: (req, _res, next) => {
            req.admin = { id: 1, username: 'tester' };
            next();
        },
        requirePermission: () => (_req, _res, next) => next(),
        rejectUnknownBodyFields: () => false,
        requireNonEmptyStringField: (value, field, label) => {
            const text = pickString(value);
            return text ? { ok: true, value: text } : { ok: false, error: { field, message: `${label}不能为空` } };
        },
        findByLookup: (rows, id, extraValuesGetter) => rows.find((row) => matchesLookup(row, id, typeof extraValuesGetter === 'function' ? extraValuesGetter(row) : [])) || null,
        findUserByAnyId: (rows, id) => rows.find((row) => matchesLookup(row, id)) || null,
        getCollection: (name) => collections[name] || [],
        persistPatchedRow: async (name, id, current, patch) => {
            const rows = collections[name] || [];
            const index = rows.findIndex((row) => matchesLookup(row, id));
            const merged = { ...current, ...patch };
            if (index >= 0) rows[index] = merged;
            return { ok: index >= 0, row: merged };
        },
        buildFreshOrderWriteResponse: async (id, fallbackData = null) => ({
            data: collections.orders.find((row) => matchesLookup(row, id)) || fallbackData,
            reloadMeta: { reloaded_collections: ['orders'], read_at: '2026-04-23T00:00:00.000Z' }
        }),
        buildFreshUserWriteResponse: async (id, fallbackData = null) => ({
            data: collections.users.find((row) => matchesLookup(row, id)) || fallbackData,
            reloadMeta: { reloaded_collections: ['users'], read_at: '2026-04-23T00:00:00.000Z' }
        }),
        createAuditLog: (_admin, action, target, detail) => auditLogs.push({ action, target, detail }),
        okStrongWrite: (res, data, options = {}) => res.json({
            code: 0,
            data: {
                data,
                write_result: {
                    persisted: options.persisted !== false,
                    reloaded_collections: options.reloaded_collections || []
                },
                freshness: {
                    read_mode: 'fresh',
                    read_at: options.read_at || '2026-04-23T00:00:00.000Z'
                }
            }
        }),
        fail: (res, message, status = 400) => res.status(status).json({ code: status, message }),
        failWithFieldErrors: (res, fieldErrors, message, status = 400) => res.status(status).json({ code: status, message, field_errors: fieldErrors }),
        primaryId,
        pickString,
        nowIso: () => '2026-04-23T01:00:00.000Z',
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

test('order visibility route moves cancelled order into cleanup box', async () => {
    const app = express();
    const deps = createDeps();
    registerCleanupRoutes(app, deps);

    const response = await invoke(app, {
        path: '/admin/api/orders/order-1/visibility',
        body: {
            visibility: 'hidden',
            cleanup_category: 'cancelled_unpaid_noise',
            reason: '清理未支付取消单'
        }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(deps.collections.orders[0].order_visibility, 'hidden');
    assert.equal(deps.collections.orders[0].cleanup_category, 'cancelled_unpaid_noise');
    assert.equal(deps.collections.orders[0].hidden_reason, '清理未支付取消单');
    assert.equal(normalizeOrderVisibility(deps.collections.orders[0]), 'hidden');
    assert.equal(isVisibleOrder(deps.collections.orders[0]), false);
    assert.equal(deps.auditLogs[0].action, 'order.visibility.update');
});

test('user visibility route restores hidden account', async () => {
    const app = express();
    const deps = createDeps();
    registerCleanupRoutes(app, deps);

    const response = await invoke(app, {
        path: '/admin/api/users/user-1/visibility',
        body: {
            visibility: 'visible',
            reason: '误隐藏，恢复显示'
        }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(deps.collections.users[0].account_visibility, 'visible');
    assert.equal(deps.collections.users[0].hidden_reason, '');
    assert.equal(deps.collections.users[0].restored_reason, '误隐藏，恢复显示');
    assert.equal(deps.auditLogs[0].action, 'user.visibility.update');
});
