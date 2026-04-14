'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');

const https = require('https');

const { registerMarketingRoutes } = require('../src/admin-marketing');

function createMockHttpsRequestImpl(handlers = []) {
    let index = 0;

    return function requestImpl(options, callback) {
        const handler = handlers[index++];
        if (!handler) throw new Error(`unexpected_request_${options.path}`);

        const req = new EventEmitter();
        req.setTimeout = () => {};
        req.destroy = (error) => {
            if (error) req.emit('error', error);
        };
        req.end = () => {
            const response = new EventEmitter();
            const result = typeof handler === 'function' ? handler({ options }) : handler;
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

function createDeps({ permissions = ['dealers'] } = {}) {
    const collections = {
        configs: [],
        admin_audit_logs: []
    };

    const ok = (res, data) => res.json({ code: 0, data });
    const fail = (res, message, status = 400) => res.status(status).json({ code: status, message });

    return {
        auth: (req, _res, next) => {
            req.admin = { id: 1, username: 'tester' };
            req.permissions = permissions;
            next();
        },
        requirePermission: () => (_req, _res, next) => next(),
        ensureFreshCollections: async () => {},
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
        requireManualAdjustmentReason: () => ({ ok: true, reason: 'ok' }),
        ok,
        fail
    };
}

function createMockApp() {
    const routes = [];
    return {
        routes,
        get(path, ...handlers) {
            routes.push({ method: 'GET', path, handlers });
        },
        post(path, ...handlers) {
            routes.push({ method: 'POST', path, handlers });
        },
        put(path, ...handlers) {
            routes.push({ method: 'PUT', path, handlers });
        },
        delete(path, ...handlers) {
            routes.push({ method: 'DELETE', path, handlers });
        }
    };
}

async function runHandlers(handlers, request, response) {
    async function dispatch(index) {
        const handler = handlers[index];
        if (!handler) return;

        if (handler.length >= 3) {
            await new Promise((resolve, reject) => {
                let advanced = false;
                const next = (error) => {
                    if (advanced) return;
                    advanced = true;
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(dispatch(index + 1));
                };

                try {
                    handler(request, response, next);
                    if (!advanced && response.writableEnded) resolve();
                } catch (error) {
                    reject(error);
                }
            });
            return;
        }

        await handler(request, response);
        if (!response.writableEnded) {
            await dispatch(index + 1);
        }
    }

    await dispatch(0);
}

function createMockRequest({ method = 'GET', path, query = {} } = {}) {
    return {
        method,
        url: path,
        originalUrl: path,
        path,
        query,
        headers: {}
    };
}

function createMockResponse() {
    const emitter = new EventEmitter();
    return {
        statusCode: 200,
        body: null,
        writableEnded: false,
        on(event, handler) {
            emitter.on(event, handler);
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            this.writableEnded = true;
            emitter.emit('finish');
            emitter.emit('end');
            return this;
        }
    };
}

async function invoke(app, { method = 'GET', path, query = {} } = {}) {
    const route = app.routes.find((item) => item.method === method && item.path === path);
    assert.ok(route, `expected route ${method} ${path} to be registered`);

    const response = createMockResponse();
    const request = createMockRequest({ method, path, query });

    await runHandlers(route.handlers, request, response);

    return {
        statusCode: response.statusCode,
        body: response.body
    };
}

test('GET /admin/api/map/geocode proxies address resolution for dealers permission', async (t) => {
    const originalRequest = https.request;
    process.env.TENCENT_MAP_KEY = 'server-map-key';
    https.request = createMockHttpsRequestImpl([
        ({ options }) => {
            assert.match(options.path, /\/ws\/geocoder\/v1\/\?/);
            assert.match(options.path, /address=/);
            assert.match(options.path, /key=server-map-key/);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    status: 0,
                    result: {
                        location: {
                            lat: 31.29834,
                            lng: 120.58531
                        }
                    }
                })
            };
        }
    ]);

    t.after(() => {
        https.request = originalRequest;
        delete process.env.TENCENT_MAP_KEY;
    });

    const app = createMockApp();
    registerMarketingRoutes(app, createDeps({ permissions: ['dealers'] }));

    const response = await invoke(app, {
        path: '/admin/api/map/geocode',
        query: { address: '江苏省苏州市高新区真北路88号' }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.deepEqual(response.body.data, {
        latitude: 31.29834,
        longitude: 120.58531
    });
});
