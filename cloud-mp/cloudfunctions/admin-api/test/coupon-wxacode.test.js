'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');

const express = require('express');
const { createRequest, createResponse } = require('node-mocks-http');

const { registerMarketingRoutes } = require('../src/admin-marketing');
const {
    buildCouponWxacodeFallback,
    clearAccessTokenCache,
    generateCouponWxacode,
    getStableAccessToken
} = require('../src/coupon-wxacode');

function createMockRequestImpl(handlers = []) {
    let index = 0;

    return function requestImpl(options, callback) {
        const handler = handlers[index++];
        if (!handler) throw new Error(`unexpected_request_${options.path}`);

        const req = new EventEmitter();
        const bodyChunks = [];
        req.write = (chunk) => { bodyChunks.push(Buffer.from(String(chunk))); };
        req.setTimeout = () => {};
        req.destroy = (error) => {
            if (error) req.emit('error', error);
        };
        req.end = () => {
            const response = new EventEmitter();
            const result = typeof handler === 'function'
                ? handler({
                    options,
                    bodyText: Buffer.concat(bodyChunks).toString('utf8')
                })
                : handler;
            response.statusCode = result.statusCode || 200;
            response.headers = result.headers || { 'content-type': 'application/json' };
            callback(response);
            process.nextTick(() => {
                if (result.body != null) {
                    response.emit('data', Buffer.isBuffer(result.body) ? result.body : Buffer.from(String(result.body)));
                }
                response.emit('end');
            });
        };
        return req;
    };
}

function createDeps(overrides = {}) {
    const collections = {
        configs: [],
        coupons: [{ id: 6, name: '新人券' }],
        user_coupons: [],
        users: [],
        admin_audit_logs: []
    };

    const ok = (res, data) => res.json({ code: 0, data });
    const fail = (res, message, status = 400) => res.status(status).json({ code: status, message });

    return {
        auth: (req, _res, next) => {
            req.admin = { id: 1, username: 'tester' };
            req.permissions = ['products'];
            next();
        },
        requirePermission: () => (_req, _res, next) => next(),
        getCollection: (name) => collections[name] || [],
        saveCollection: (name, rows) => {
            collections[name] = rows;
        },
        nextId: (rows = []) => rows.length + 1,
        nowIso: () => '2026-04-14T00:00:00.000Z',
        toNumber: (value, fallback = 0) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : fallback;
        },
        toArray: (value) => {
            if (Array.isArray(value)) return value;
            if (value == null || value === '') return [];
            return [value];
        },
        toBoolean: (value) => value === true || value === 1 || value === '1' || value === 'true',
        pickString: (value, fallback = '') => (value == null ? fallback : String(value)),
        findByLookup: (rows, lookup) => rows.find((item) => (
            item && [item.id, item._legacy_id, item._id].some((candidate) => candidate != null && String(candidate) === String(lookup))
        )) || null,
        rowMatchesLookup: (item, lookup, aliases = []) => (
            [item?.id, item?._legacy_id, item?._id, ...aliases]
                .filter((candidate) => candidate != null && candidate !== '')
                .some((candidate) => String(candidate) === String(lookup))
        ),
        paginate: (rows) => ({ list: rows, total: rows.length, pagination: { page: 1, limit: rows.length, total: rows.length } }),
        sortByUpdatedDesc: (rows) => rows.slice(),
        assetUrl: (value) => value,
        createAuditLog: () => {},
        directPatchDocument: async () => {},
        appendWalletLogEntry: () => {},
        requireManualAdjustmentReason: () => {},
        ok,
        fail,
        ...overrides
    };
}

async function invoke(app, { method = 'GET', path, query = {}, body = undefined } = {}) {
    const response = createResponse({ eventEmitter: EventEmitter });
    const request = createRequest({
        method,
        url: path,
        originalUrl: path,
        path,
        query,
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

test('generateCouponWxacode returns base64 payload when official token and qr fetch succeed', async () => {
    const payload = await generateCouponWxacode({
        couponId: 6,
        envVersion: 'release',
        tokenFetcher: async () => 'mock-token',
        wxacodeFetcher: async () => Buffer.from('coupon-qrcode')
    });

    assert.equal(payload.mp_path, '/pages/coupon/claim?id=6');
    assert.equal(payload.scene, 'id=6');
    assert.equal(payload.env_version, 'release');
    assert.equal(payload.error, null);
    assert.equal(payload.wxacode_base64, Buffer.from('coupon-qrcode').toString('base64'));
});

test('generateCouponWxacode falls back to share path when wxacode client fails', async () => {
    const payload = await generateCouponWxacode({
        couponId: 6,
        tokenFetcher: async () => 'mock-token',
        wxacodeFetcher: async () => {
            throw new Error('errCode: -1 | errMsg: mock_wxacode_failed');
        }
    });

    assert.equal(payload.mp_path, '/pages/coupon/claim?id=6');
    assert.equal(payload.env_version, 'release');
    assert.equal(payload.wxacode_base64, null);
    assert.equal(payload.error, 'errCode: -1 | errMsg: mock_wxacode_failed');
});

test('generateCouponWxacode refreshes access token once when qr fetch reports invalid token', async () => {
    const issuedTokens = [];
    let attempts = 0;

    const payload = await generateCouponWxacode({
        couponId: 6,
        tokenFetcher: async ({ forceRefresh = false }) => {
            issuedTokens.push(forceRefresh ? 'fresh-token' : 'cached-token');
            return forceRefresh ? 'fresh-token' : 'cached-token';
        },
        wxacodeFetcher: async ({ accessToken }) => {
            attempts += 1;
            if (attempts === 1) {
                assert.equal(accessToken, 'cached-token');
                throw new Error('errCode: 40001 | errMsg: invalid access_token');
            }
            assert.equal(accessToken, 'fresh-token');
            return Buffer.from('coupon-qrcode-after-refresh');
        }
    });

    assert.deepEqual(issuedTokens, ['cached-token', 'fresh-token']);
    assert.equal(payload.wxacode_base64, Buffer.from('coupon-qrcode-after-refresh').toString('base64'));
});

test('getStableAccessToken caches successful token response', async () => {
    clearAccessTokenCache();
    const requestImpl = createMockRequestImpl([
        {
            statusCode: 200,
            body: JSON.stringify({
                access_token: 'cached-token',
                expires_in: 7200
            })
        }
    ]);

    const first = await getStableAccessToken({
        appId: 'wx-app-id',
        appSecret: 'wx-app-secret',
        requestImpl
    });
    const second = await getStableAccessToken({
        appId: 'wx-app-id',
        appSecret: 'wx-app-secret',
        requestImpl
    });

    assert.equal(first, 'cached-token');
    assert.equal(second, 'cached-token');
});

test('getStableAccessToken posts to stable_token endpoint with expected payload', async () => {
    clearAccessTokenCache();
    const requestImpl = createMockRequestImpl([
        ({ options, bodyText }) => {
            assert.equal(options.path, '/cgi-bin/stable_token');
            const payload = JSON.parse(bodyText);
            assert.deepEqual(payload, {
                grant_type: 'client_credential',
                appid: 'wx-app-id',
                secret: 'wx-app-secret',
                force_refresh: false
            });
            return {
                statusCode: 200,
                body: JSON.stringify({
                    access_token: 'fresh-token',
                    expires_in: 7200
                })
            };
        }
    ]);

    const token = await getStableAccessToken({
        appId: 'wx-app-id',
        appSecret: 'wx-app-secret',
        requestImpl
    });

    assert.equal(token, 'fresh-token');
});

test('coupon wxacode route returns fallback payload instead of 404 when generation fails', async () => {
    const app = express();
    registerMarketingRoutes(app, createDeps({
        generateCouponWxacode: async ({ couponId, envVersion }) => buildCouponWxacodeFallback({
            couponId,
            envVersion,
            error: 'mock_wxacode_failed'
        })
    }));

    const response = await invoke(app, {
        path: '/admin/api/coupons/6/wxacode',
        query: { env: 'release' }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(response.body.data.mp_path, '/pages/coupon/claim?id=6');
    assert.equal(response.body.data.env_version, 'release');
    assert.equal(response.body.data.error, 'mock_wxacode_failed');
    assert.equal(response.body.data.wxacode_base64, null);
});
