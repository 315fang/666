'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const express = require('express');
const { createRequest, createResponse } = require('node-mocks-http');

const { registerGoodsFundTransferRoutes } = require('../src/admin-goods-fund-transfers');

function createDeps(overrides = {}) {
    const collections = {
        goods_fund_transfer_applications: [],
        users: [],
        wallet_accounts: [],
        wallet_logs: [],
        goods_fund_logs: []
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
        nextId: (rows = []) => rows.length + 1,
        nowIso: () => '2026-04-20T00:00:00.000Z',
        findByLookup: (rows, lookup, projector) => rows.find((row) => {
            const extra = typeof projector === 'function' ? projector(row) : [];
            return [row?.id, row?._id, row?._legacy_id, row?.application_id, row?.application_no, ...extra]
                .filter((value) => value !== null && value !== undefined && value !== '')
                .some((value) => String(value) === String(lookup));
        }) || null,
        rowMatchesLookup: (row, lookup, extra = []) => {
            return [row?.id, row?._id, row?._legacy_id, row?.application_id, row?.application_no, ...extra]
                .filter((value) => value !== null && value !== undefined && value !== '')
                .some((value) => String(value) === String(lookup));
        },
        paginate: (rows) => ({ list: rows, total: rows.length, pagination: { page: 1, limit: rows.length, total: rows.length } }),
        sortByUpdatedDesc: (rows = []) => [...rows],
        createAuditLog: () => {},
        appendWalletLogEntry: async (entry) => {
            collections.wallet_logs.push({ id: collections.wallet_logs.length + 1, ...entry });
        },
        appendGoodsFundLogEntry: async (entry) => {
            collections.goods_fund_logs.push({ id: collections.goods_fund_logs.length + 1, ...entry });
        },
        flush: async () => {},
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

test('approve goods fund transfer application writes paired transfer logs', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('users', [
        {
            _id: 'user-from',
            id: 'user-from',
            openid: 'openid-from',
            nickname: '上级',
            role_level: 4,
            role_name: '运营合伙人',
            invite_code: 'UP001',
            agent_wallet_balance: 5000,
            wallet_balance: 5000
        },
        {
            _id: 'user-to',
            id: 'user-to',
            openid: 'openid-to',
            nickname: '下级',
            role_level: 1,
            role_name: '初级会员',
            invite_code: 'DOWN001',
            agent_wallet_balance: 0,
            wallet_balance: 0
        }
    ]);
    deps.saveCollection('goods_fund_transfer_applications', [
        {
            _id: 'app-1',
            application_id: 'app-1',
            application_no: 'GFT1001',
            from_openid: 'openid-from',
            to_openid: 'openid-to',
            amount: 600,
            status: 'pending',
            relation_source_text: '普通邀请',
            created_at: '2026-04-20T00:00:00.000Z',
            updated_at: '2026-04-20T00:00:00.000Z'
        }
    ]);

    registerGoodsFundTransferRoutes(app, deps);

    const response = await invoke(app, {
        method: 'PUT',
        path: '/admin/api/goods-fund-transfers/app-1/approve'
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(deps.getCollection('goods_fund_transfer_applications')[0].status, 'approved');
    assert.equal(deps.getCollection('users')[0].agent_wallet_balance, 4400);
    assert.equal(deps.getCollection('users')[1].agent_wallet_balance, 600);
    assert.equal(deps.getCollection('wallet_logs').length, 2);
    assert.equal(deps.getCollection('goods_fund_logs').length, 2);
});

test('reject goods fund transfer application updates status without changing balances', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('users', [
        { _id: 'user-from', id: 'user-from', openid: 'openid-from', agent_wallet_balance: 3000, wallet_balance: 3000 },
        { _id: 'user-to', id: 'user-to', openid: 'openid-to', agent_wallet_balance: 200, wallet_balance: 200 }
    ]);
    deps.saveCollection('goods_fund_transfer_applications', [
        {
            _id: 'app-2',
            application_id: 'app-2',
            application_no: 'GFT1002',
            from_openid: 'openid-from',
            to_openid: 'openid-to',
            amount: 200,
            status: 'pending',
            created_at: '2026-04-20T00:00:00.000Z',
            updated_at: '2026-04-20T00:00:00.000Z'
        }
    ]);

    registerGoodsFundTransferRoutes(app, deps);

    const response = await invoke(app, {
        method: 'PUT',
        path: '/admin/api/goods-fund-transfers/app-2/reject',
        body: { reason: '资料不全' }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(deps.getCollection('goods_fund_transfer_applications')[0].status, 'rejected');
    assert.equal(deps.getCollection('users')[0].agent_wallet_balance, 3000);
    assert.equal(deps.getCollection('users')[1].agent_wallet_balance, 200);
    assert.equal(deps.getCollection('wallet_logs').length, 0);
    assert.equal(deps.getCollection('goods_fund_logs').length, 0);
});
