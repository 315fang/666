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
    const {
        initialCollections = {},
        ...restOverrides
    } = overrides;
    const collections = {
        configs: [],
        coupons: [{ id: 6, name: '新人券' }],
        coupon_claim_tickets: [],
        user_coupons: [],
        users: [],
        admin_audit_logs: [],
        ...JSON.parse(JSON.stringify(initialCollections))
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
        flush: async () => {},
        ok,
        fail,
        ...restOverrides
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

test('coupon claim-ticket route creates one-time ticket and returns ticket share payload', async () => {
    const app = express();
    const deps = createDeps({
        generateClaimTicketWxacodeFn: async ({ ticketId }) => ({
            ticket_id: ticketId,
            mp_path: `/pages/coupon/claim?ticket=${ticketId}`,
            scene: `t=${ticketId}`,
            env_version: 'release',
            wxacode_base64: Buffer.from('one-time-ticket').toString('base64'),
            error: null
        })
    });
    registerMarketingRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/coupons/6/claim-tickets',
        query: { env: 'release' }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(response.body.data.ticket.benefit_kind, 'template_coupon');
    assert.match(response.body.data.ticket.ticket_id, /^[a-f0-9]{20}$/);
    assert.equal(response.body.data.mp_path, `/pages/coupon/claim?ticket=${response.body.data.ticket.ticket_id}`);
    assert.equal(deps.getCollection('coupon_claim_tickets').length, 1);
});

test('coupon issue dry-run accepts synthesized coupon id on a fresh instance', async () => {
    const seedCollections = {
        coupons: [
            {
                _id: 'coupon-doc-1',
                name: '跨实例新人券',
                valid_days: 30,
                is_active: 1
            }
        ],
        users: [
            {
                id: 8,
                openid: 'openid-user-8',
                nickname: '小明',
                role_level: 0
            }
        ]
    };

    const listApp = express();
    registerMarketingRoutes(listApp, createDeps({
        initialCollections: seedCollections
    }));

    const listResponse = await invoke(listApp, {
        path: '/admin/api/coupons'
    });

    assert.equal(listResponse.statusCode, 200);
    const synthesizedCouponId = listResponse.body.data.list[0].id;
    assert.equal(synthesizedCouponId, 1);

    const patchCalls = [];
    const issueApp = express();
    registerMarketingRoutes(issueApp, createDeps({
        initialCollections: seedCollections,
        directPatchDocument: async (collection, docId, patch) => {
            patchCalls.push({ collection, docId, patch });
            return true;
        }
    }));

    const issueResponse = await invoke(issueApp, {
        method: 'POST',
        path: `/admin/api/coupons/${synthesizedCouponId}/issue`,
        query: { dry_run: 'true' },
        body: { user_ids: [8] }
    });

    assert.equal(issueResponse.statusCode, 200);
    assert.equal(issueResponse.body.code, 0);
    assert.equal(issueResponse.body.data.count, 1);
    assert.equal(issueResponse.body.data.preview[0].id, 8);
    assert.deepEqual(patchCalls, [
        {
            collection: 'coupons',
            docId: 'coupon-doc-1',
            patch: { id: 1 }
        }
    ]);
});

test('coupon create ignores stale client identity fields and preserves submitted amount', async () => {
    const app = express();
    const deps = createDeps({
        initialCollections: {
            coupons: [
                {
                    _id: 'coupon-doc-1',
                    id: 6,
                    name: '原新人券',
                    type: 'fixed',
                    coupon_type: 'fixed',
                    value: 10,
                    coupon_value: 10
                }
            ]
        }
    });
    registerMarketingRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/coupons',
        body: {
            _id: 'coupon-doc-1',
            id: null,
            name: '新增满减券',
            type: 'fixed',
            value: 88.8,
            min_purchase: 0,
            scope: 'all',
            valid_days: 30,
            stock: -1,
            is_active: 1
        }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(response.body.data.id, 2);
    assert.equal(response.body.data.value, 88.8);
    assert.equal(response.body.data.coupon_value, 88.8);

    const rows = deps.getCollection('coupons');
    assert.equal(rows.length, 2);
    assert.equal(rows[0]._id, 'coupon-doc-1');
    assert.equal(rows[0].value, 10);
    assert.equal(rows[1].id, 2);
    assert.equal(rows[1]._id, undefined);
    assert.equal(rows[1].value, 88.8);
    assert.equal(rows[1].coupon_value, 88.8);
});

test('coupon update persists edited amount instead of creating a duplicate row', async () => {
    const app = express();
    const deps = createDeps({
        initialCollections: {
            coupons: [
                {
                    _id: 'coupon-doc-1',
                    id: 6,
                    name: '新人券',
                    type: 'fixed',
                    coupon_type: 'fixed',
                    value: 10,
                    coupon_value: 10
                }
            ]
        }
    });
    registerMarketingRoutes(app, deps);

    const response = await invoke(app, {
        method: 'PUT',
        path: '/admin/api/coupons/6',
        body: {
            name: '新人券',
            type: 'fixed',
            value: 66.6,
            min_purchase: 0,
            scope: 'all',
            valid_days: 30,
            stock: -1,
            is_active: 1
        }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(response.body.data.id, 6);
    assert.equal(response.body.data.value, 66.6);

    const rows = deps.getCollection('coupons');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 6);
    assert.equal(rows[0]._id, 'coupon-doc-1');
    assert.equal(rows[0].value, 66.6);
    assert.equal(rows[0].coupon_value, 66.6);
});

test('coupon list keeps fourth and fifth created coupons instead of reverting to the initial three', async () => {
    const app = express();
    const deps = createDeps({
        initialCollections: {
            coupons: [
                { id: 1, name: '券 1', type: 'fixed', value: 10 },
                { id: 2, name: '券 2', type: 'fixed', value: 20 },
                { id: 3, name: '券 3', type: 'fixed', value: 30 }
            ]
        }
    });
    registerMarketingRoutes(app, deps);

    for (const [name, value] of [['券 4', 40], ['券 5', 50]]) {
        const response = await invoke(app, {
            method: 'POST',
            path: '/admin/api/coupons',
            body: {
                name,
                type: 'fixed',
                value,
                min_purchase: 0,
                scope: 'all',
                valid_days: 30,
                stock: -1,
                is_active: 1
            }
        });
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.code, 0);
    }

    const listResponse = await invoke(app, {
        path: '/admin/api/coupons',
        query: { page: 1, limit: 20 }
    });

    assert.equal(listResponse.statusCode, 200);
    assert.equal(listResponse.body.code, 0);
    assert.equal(listResponse.body.data.total, 5);
    assert.equal(listResponse.body.data.list.length, 5);
    assert.deepEqual(
        listResponse.body.data.list.map((item) => item.name).sort(),
        ['券 1', '券 2', '券 3', '券 4', '券 5']
    );
});

test('coupon auto rule enabled state is persisted and returned by the read endpoint', async () => {
    const app = express();
    const deps = createDeps({
        initialCollections: {
            coupon_auto_rules: [{
                id: 1,
                trigger_event: 'register',
                enabled: false,
                coupon_id: null,
                target_levels: []
            }]
        }
    });
    registerMarketingRoutes(app, deps);

    const initial = await invoke(app, {
        path: '/admin/api/coupon-auto-rules'
    });
    assert.equal(initial.statusCode, 200);
    assert.equal(initial.body.code, 0);
    assert.equal(initial.body.data[0].trigger_event, 'register');
    assert.equal(initial.body.data[0].enabled, false);

    const saved = await invoke(app, {
        method: 'PUT',
        path: '/admin/api/coupon-auto-rules',
        body: {
            rules: [{
                id: 'register_welcome',
                name: '新用户注册发券',
                trigger_event: 'register',
                enabled: true,
                coupon_id: 6,
                target_levels: [0, 1]
            }]
        }
    });

    assert.equal(saved.statusCode, 200);
    assert.equal(saved.body.code, 0);
    assert.equal(saved.body.data[0].enabled, true);
    assert.equal(saved.body.data[0].coupon_id, 6);
    assert.equal(deps.getCollection('coupon_auto_rules').length, 1);

    const reread = await invoke(app, {
        path: '/admin/api/coupon-auto-rules'
    });
    assert.equal(reread.statusCode, 200);
    assert.equal(reread.body.code, 0);
    assert.equal(reread.body.data[0].enabled, true);
    assert.equal(reread.body.data[0].coupon_id, 6);
    assert.deepEqual(reread.body.data[0].target_levels, [0, 1]);
});
