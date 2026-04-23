'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');

const express = require('express');
const { createRequest, createResponse } = require('node-mocks-http');

const { registerSystemRoutes } = require('../src/admin-system');

function createDeps() {
    const singletonStore = {};
    const upsertCalls = [];
    const ok = (res, data) => res.json({ code: 0, data });
    const fail = (res, message, status = 400) => res.status(status).json({ code: status, message });

    return {
        auth: (req, _res, next) => {
            req.admin = { id: 1, username: 'tester' };
            next();
        },
        requirePermission: () => (_req, _res, next) => next(),
        rejectUnknownBodyFields: () => false,
        failWithFieldErrors: (res, fieldErrors, message) => res.status(400).json({ code: 400, message, fieldErrors }),
        ensureFreshCollections: async () => {},
        getCollection: () => [],
        saveCollection: () => {},
        getSingleton: (key, fallback) => (Object.prototype.hasOwnProperty.call(singletonStore, key) ? singletonStore[key] : fallback),
        saveSingleton: (key, value) => {
            singletonStore[key] = value;
        },
        getSettingsSnapshot: () => ({ WITHDRAWAL: { MIN_AMOUNT: 100 } }),
        getMiniProgramConfigSnapshot: () => ({}),
        getMemberTierConfigSnapshot: () => ({}),
        normalizeAlertConfigPayload: () => ({ value: {}, fieldErrors: [] }),
        normalizeFeatureTogglePayload: () => ({ value: {}, fieldErrors: [] }),
        buildConfigSourceReport: () => ({}),
        buildCronRuntimeStatus: () => ({}),
        buildDataSourceRuntimeStatus: () => ({}),
        resolveOperationalStatus: () => 'ok',
        probeDataStore: async () => ({ checked_at: '2026-04-23T00:00:00.000Z' }),
        getPaymentHealthSnapshot: () => ({ status: 'ok' }),
        upsertConfigRow: (...args) => {
            upsertCalls.push(args);
        },
        normalizePeerBonusConfig: (value) => value,
        buildExchangeMetaFromPeerBonus: () => ({}),
        getConfigRowValue: (_key, fallback) => fallback,
        freshReadMeta: async () => ({ freshness: {} }),
        STRONG_CONSISTENCY_COLLECTIONS: {},
        okStrongRead: ok,
        configContract: {
            normalizeMiniProgramConfig: (value) => value,
            normalizePopupAdConfig: (value) => value
        },
        createAuditLog: () => {},
        pickString: (value, fallback = '') => (value == null ? fallback : String(value).trim()),
        toObject: (value, fallback = {}) => (value && typeof value === 'object' && !Array.isArray(value) ? value : fallback),
        toArray: (value) => (Array.isArray(value) ? value : []),
        toNumber: (value, fallback = 0) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : fallback;
        },
        nowIso: () => '2026-04-23T00:00:00.000Z',
        dataRoot: '',
        runtimeRoot: '',
        uploadsRoot: '',
        dataStore: { flush: async () => {}, health: () => ({}) },
        formatUptimeHuman: () => '0m',
        SUPER_ADMIN_ROLE: 'super_admin',
        os: {
            freemem: () => 0,
            totalmem: () => 0,
            loadavg: () => [0, 0, 0],
            platform: () => 'win32',
            release: () => 'test'
        },
        process: {
            pid: 1,
            version: 'v22.0.0',
            uptime: () => 0,
            memoryUsage: () => ({ rss: 0, heapUsed: 0, heapTotal: 0 })
        },
        ok,
        fail,
        _internals: {
            singletonStore,
            upsertCalls
        }
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

test('PUT /admin/api/settings mirrors category settings into config rows', async () => {
    const app = express();
    const deps = createDeps();
    registerSystemRoutes(app, deps);

    const response = await invoke(app, {
        method: 'PUT',
        path: '/admin/api/settings',
        body: {
            category: 'WITHDRAWAL',
            settings: {
                MIN_AMOUNT: 200
            }
        }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(response.body.data.WITHDRAWAL.MIN_AMOUNT, 200);
    assert.deepEqual(deps._internals.singletonStore.settings.WITHDRAWAL, { MIN_AMOUNT: 200 });
    assert.equal(deps._internals.upsertCalls.length, 1);
    assert.equal(deps._internals.upsertCalls[0][0], 'MIN_AMOUNT');
    assert.equal(deps._internals.upsertCalls[0][1], 200);
    assert.deepEqual(deps._internals.upsertCalls[0][2], {
        category: 'WITHDRAWAL',
        group: 'WITHDRAWAL',
        description: 'WITHDRAWAL 配置：MIN_AMOUNT'
    });
});
