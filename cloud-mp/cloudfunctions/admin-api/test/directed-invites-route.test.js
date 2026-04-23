'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const express = require('express');
const { createRequest, createResponse } = require('node-mocks-http');

const { registerDirectedInviteRoutes } = require('../src/admin-directed-invites');

function createDeps(overrides = {}) {
    const collections = {
        directed_invites: [],
        users: [],
        wallet_accounts: [],
        wallet_logs: [],
        goods_fund_logs: [],
        admin_audit_logs: []
    };

    const ok = (res, data) => res.json({ code: 0, data });
    const fail = (res, message, status = 400) => res.status(status).json({ code: status, message });

    return {
        auth: (req, _res, next) => {
            req.admin = { id: 1, username: 'tester' };
            req.permissions = ['dealers'];
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
        findByLookup: (rows, lookup) => rows.find((row) => {
            return [row?.id, row?._id, row?.invite_id].filter(Boolean).some((value) => String(value) === String(lookup));
        }) || null,
        rowMatchesLookup: (row, lookup, extra = []) => {
            return [row?.id, row?._id, row?.invite_id, ...extra].filter(Boolean).some((value) => String(value) === String(lookup));
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

test('approve directed invite activates user and writes paired transfer logs', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('users', [
        {
            _id: 'user-b2',
            openid: 'openid-b2',
            nickname: 'B2',
            role_level: 4,
            role_name: '运营合伙人',
            invite_code: 'B20001',
            agent_wallet_balance: 5000,
            wallet_balance: 5000
        },
        {
            _id: 'user-target',
            openid: 'openid-target',
            nickname: 'target',
            role_level: 0,
            role_name: 'VIP用户',
            invite_code: 'U10001',
            agent_wallet_balance: 0,
            wallet_balance: 0,
            referrer_openid: '',
            parent_openid: '',
            parent_id: null
        }
    ]);
    deps.saveCollection('wallet_accounts', [
        { _id: 'wallet-b2', id: 'wallet-b2', user_id: 'user-b2', openid: 'openid-b2', balance: 5000 }
    ]);
    deps.saveCollection('directed_invites', [
        {
            _id: 'invite-1',
            invite_id: 'invite-1',
            invite_type: 'directed_b1',
            inviter_openid: 'openid-b2',
            transfer_amount: 3000,
            status: 'accepted',
            review_status: 'pending',
            accepted_openid: 'openid-target',
            ticket_id: 'ticket-1',
            ticket_expire_at: '2026-04-27T00:00:00.000Z'
        }
    ]);

    registerDirectedInviteRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/directed-invites/invite-1/approve'
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(deps.getCollection('directed_invites')[0].status, 'activated');
    assert.equal(deps.getCollection('directed_invites')[0].lock_status, 'locked');
    assert.equal(deps.getCollection('users')[1].role_level, 3);
    assert.equal(deps.getCollection('users')[1].referrer_openid, 'openid-b2');
    assert.equal(deps.getCollection('users')[0].agent_wallet_balance, 2000);
    assert.equal(deps.getCollection('users')[1].agent_wallet_balance, 3000);
    assert.equal(deps.getCollection('wallet_logs').length, 2);
    assert.equal(deps.getCollection('goods_fund_logs').length, 2);
});

test('approve directed invite rejects when inviter goods fund balance is insufficient', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('users', [
        {
            _id: 'user-b2',
            openid: 'openid-b2',
            nickname: 'B2',
            role_level: 4,
            role_name: '运营合伙人',
            invite_code: 'B20001',
            agent_wallet_balance: 1000,
            wallet_balance: 1000
        },
        {
            _id: 'user-target',
            openid: 'openid-target',
            nickname: 'target',
            role_level: 0,
            role_name: 'VIP用户',
            invite_code: 'U10001',
            agent_wallet_balance: 0,
            wallet_balance: 0,
            referrer_openid: '',
            parent_openid: '',
            parent_id: null
        }
    ]);
    deps.saveCollection('directed_invites', [
        {
            _id: 'invite-2',
            invite_id: 'invite-2',
            invite_type: 'directed_b1',
            inviter_openid: 'openid-b2',
            transfer_amount: 3000,
            status: 'accepted',
            review_status: 'pending',
            accepted_openid: 'openid-target',
            ticket_id: 'ticket-2',
            ticket_expire_at: '2026-04-27T00:00:00.000Z'
        }
    ]);

    registerDirectedInviteRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/directed-invites/invite-2/approve'
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, '发起人货款余额不足，需补足后再审核');
    assert.equal(deps.getCollection('directed_invites')[0].status, 'accepted');
    assert.equal(deps.getCollection('wallet_logs').length, 0);
    assert.equal(deps.getCollection('goods_fund_logs').length, 0);
});

test('approve directed invite settles frozen goods fund without deducting inviter balance twice', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('users', [
        {
            _id: 'user-b2',
            openid: 'openid-b2',
            nickname: 'B2',
            role_level: 4,
            role_name: '运营合伙人',
            invite_code: 'B20001',
            agent_wallet_balance: 2000,
            wallet_balance: 2000,
            agent_wallet_frozen_amount: 3000,
            goods_fund_frozen_amount: 3000
        },
        {
            _id: 'user-target',
            openid: 'openid-target',
            nickname: 'target',
            role_level: 0,
            role_name: 'VIP用户',
            invite_code: 'U10001',
            agent_wallet_balance: 0,
            wallet_balance: 0,
            referrer_openid: '',
            parent_openid: '',
            parent_id: null
        }
    ]);
    deps.saveCollection('wallet_accounts', [
        { _id: 'wallet-b2', id: 'wallet-b2', user_id: 'user-b2', openid: 'openid-b2', balance: 2000, frozen_balance: 3000 }
    ]);
    deps.saveCollection('directed_invites', [
        {
            _id: 'invite-3',
            invite_id: 'invite-3',
            invite_type: 'directed_b1',
            inviter_openid: 'openid-b2',
            transfer_amount: 3000,
            frozen_amount: 3000,
            freeze_status: 'frozen',
            frozen_transfer_no: 'DIRFRZ_invite-3',
            status: 'accepted',
            review_status: 'pending',
            accepted_openid: 'openid-target',
            ticket_id: 'ticket-3',
            ticket_expire_at: '2026-04-27T00:00:00.000Z'
        }
    ]);

    registerDirectedInviteRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/directed-invites/invite-3/approve'
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(deps.getCollection('directed_invites')[0].freeze_status, 'settled');
    assert.equal(deps.getCollection('directed_invites')[0].lock_status, 'locked');
    assert.equal(deps.getCollection('users')[0].agent_wallet_balance, 2000);
    assert.equal(deps.getCollection('users')[0].agent_wallet_frozen_amount, 0);
    assert.equal(deps.getCollection('users')[1].agent_wallet_balance, 3000);
    assert.equal(deps.getCollection('wallet_logs').length, 1);
    assert.equal(deps.getCollection('goods_fund_logs').length, 1);
    assert.equal(deps.getCollection('wallet_logs')[0].type, 'directed_b1_allocate_in');
});

test('approve directed invite reroutes bound VIP0 user and records previous parent info', async () => {
    const app = express();
    const deps = createDeps();
    deps.saveCollection('users', [
        {
            _id: 'user-b2',
            openid: 'openid-b2',
            nickname: 'B2',
            role_level: 4,
            role_name: '运营合伙人',
            invite_code: 'B20001',
            agent_wallet_balance: 5000,
            wallet_balance: 5000
        },
        {
            _id: 'user-vip0',
            openid: 'openid-vip0',
            nickname: 'vip0',
            role_level: 0,
            role_name: 'VIP用户',
            invite_code: 'U10002',
            agent_wallet_balance: 0,
            wallet_balance: 0,
            referrer_openid: 'old-parent-openid',
            parent_openid: 'old-parent-openid',
            parent_id: 'old-parent-id'
        }
    ]);
    deps.saveCollection('wallet_accounts', [
        { _id: 'wallet-b2', id: 'wallet-b2', user_id: 'user-b2', openid: 'openid-b2', balance: 5000 }
    ]);
    deps.saveCollection('directed_invites', [
        {
            _id: 'invite-reroute',
            invite_id: 'invite-reroute',
            invite_type: 'directed_b1',
            inviter_openid: 'openid-b2',
            transfer_amount: 3000,
            status: 'accepted',
            review_status: 'pending',
            accepted_openid: 'openid-vip0',
            ticket_id: 'ticket-reroute',
            ticket_expire_at: '2026-04-27T00:00:00.000Z',
            reroute: true,
            reroute_from_parent_id: 'old-parent-id',
            reroute_from_parent_openid: 'old-parent-openid',
            reroute_from_referrer_openid: 'old-parent-openid',
            reroute_required_review_note: 'strict reroute'
        }
    ]);

    registerDirectedInviteRoutes(app, deps);

    const response = await invoke(app, {
        method: 'POST',
        path: '/admin/api/directed-invites/invite-reroute/approve'
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.code, 0);
    assert.equal(deps.getCollection('users')[1].parent_id, 'user-b2');
    assert.equal(deps.getCollection('users')[1].parent_openid, 'openid-b2');
    assert.equal(deps.getCollection('users')[1].referrer_openid, 'openid-b2');
    assert.equal(deps.getCollection('users')[1].relation_source, 'directed_b1');
    assert.equal(deps.getCollection('users')[1].directed_invite_id, 'invite-reroute');
    assert.equal(deps.getCollection('directed_invites')[0].reroute, true);
    assert.equal(deps.getCollection('directed_invites')[0].reroute_from_parent_id, 'old-parent-id');
    assert.equal(deps.getCollection('directed_invites')[0].reroute_from_parent_openid, 'old-parent-openid');
    assert.equal(deps.getCollection('directed_invites')[0].reroute_recalculate_history, false);
});
