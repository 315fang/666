'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');

const express = require('express');
const { createRequest, createResponse } = require('node-mocks-http');

const { registerDepositRoutes } = require('../src/admin-deposits');

function createDeps(overrides = {}) {
    const collections = {
        configs: [],
        app_configs: [],
        deposit_orders: [],
        deposit_refunds: [],
        coupon_claim_tickets: [],
        admin_audit_logs: []
    };

    const ok = (res, data) => res.json({ code: 0, data });
    const fail = (res, message, status = 400) => res.status(status).json({ code: status, message });

    return {
        auth: (req, _res, next) => {
            req.admin = { id: 1, username: 'tester' };
            req.permissions = ['refunds'];
            next();
        },
        requirePermission: () => (_req, _res, next) => next(),
        ensureFreshCollections: async () => {},
        getCollection: (name) => collections[name] || [],
        saveCollection: (name, rows) => {
            collections[name] = rows;
        },
        nextId: (rows = []) => rows.length + 1,
        nowIso: () => '2026-04-17T00:00:00.000Z',
        toNumber: (value, fallback = 0) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : fallback;
        },
        toArray: (value) => (Array.isArray(value) ? value : (value == null || value === '' ? [] : [value])),
        pickString: (value, fallback = '') => (value == null ? fallback : String(value)),
        findByLookup: (rows, lookup, extraValuesGetter) => rows.find((row) => {
            const values = [row?.id, row?._id, row?.deposit_no].concat(typeof extraValuesGetter === 'function' ? extraValuesGetter(row) : []);
            return values.filter((item) => item != null && item !== '').some((item) => String(item) === String(lookup));
        }) || null,
        paginate: (rows) => ({ list: rows, total: rows.length, pagination: { page: 1, limit: rows.length, total: rows.length } }),
        createAuditLog: () => {},
        flush: async () => {},
        createWechatRefund: async () => ({ status: 'PROCESSING', refund_id: 'wx-refund-1' }),
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

test('deposit refund route invalidates unused ticket and creates processing refund', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('deposit_orders', [{
        _id: 'deposit-1',
        deposit_no: 'DEP-1001',
        openid: 'openid-1',
        amount_paid: 50,
        refunded_total: 0,
        refundable_balance: 50,
        refund_count: 0,
        status: 'paid',
        active_ticket_id: 'ticket-1',
        coupon_claim_state: 'unused',
        paid_at: '2026-04-10T00:00:00.000Z',
        created_at: '2026-04-10T00:00:00.000Z'
    }]);
    deps.saveCollection('coupon_claim_tickets', [{
        _id: 'ticket-1',
        ticket_id: 'ticket-1',
        status: 'unused',
        mp_path: '/pages/coupon/claim?ticket=ticket-1'
    }]);
    registerDepositRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/deposit-orders/deposit-1/refunds',
        body: { amount: 10 }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(deps.getCollection('deposit_refunds').length, 1);
    assert.equal(deps.getCollection('deposit_refunds')[0].status, 'processing');
    assert.equal(deps.getCollection('coupon_claim_tickets')[0].status, 'invalidated');
    assert.equal(deps.getCollection('deposit_orders')[0].coupon_claim_state, 'invalidated_by_refund');
    assert.equal(deps.getCollection('deposit_orders')[0].status, 'refund_locked');
});

test('deposit refund route rejects claimed ticket orders', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('deposit_orders', [{
        _id: 'deposit-2',
        deposit_no: 'DEP-1002',
        openid: 'openid-2',
        amount_paid: 50,
        refunded_total: 0,
        refundable_balance: 50,
        refund_count: 0,
        status: 'paid',
        active_ticket_id: 'ticket-2',
        coupon_claim_state: 'claimed',
        paid_at: '2026-04-10T00:00:00.000Z'
    }]);
    deps.saveCollection('coupon_claim_tickets', [{
        _id: 'ticket-2',
        ticket_id: 'ticket-2',
        status: 'claimed'
    }]);
    registerDepositRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/deposit-orders/deposit-2/refunds',
        body: { amount: 10 }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, '权益已领取，不允许退押金');
    assert.equal(deps.getCollection('deposit_refunds').length, 0);
});
