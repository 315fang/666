'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const jwt = require('jsonwebtoken');
const { createRequest, createResponse } = require('node-mocks-http');

process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'debug-secret';

const app = require('../src/app');
const { jwtSecret } = require('../src/config');

async function ensureReady() {
    const ready = app.locals.dataStore?.readyPromise;
    if (ready) await ready;
}

function createAdminToken(admin) {
    return jwt.sign(
        { id: admin.id || admin._legacy_id, username: admin.username, role: admin.role },
        jwtSecret,
        { expiresIn: '1h' }
    );
}

async function invoke(path, { method = 'GET', query = {}, body, admin } = {}) {
    await ensureReady();

    const request = createRequest({
        method,
        url: path,
        originalUrl: path,
        path,
        query,
        body,
        headers: {
            authorization: `Bearer ${createAdminToken(admin)}`
        }
    });
    const response = createResponse({ eventEmitter: EventEmitter });

    await new Promise((resolve, reject) => {
        response.on('finish', resolve);
        response.on('end', resolve);
        response.on('error', reject);
        app.handle(request, response);
    });

    return {
        statusCode: response.statusCode,
        body: response._isJSON() ? response._getJSONData() : response._getData()
    };
}

function getEnabledAdmin() {
    const admins = app.locals.dataStore.getCollection('admins');
    const admin = admins.find((row) => row && (row.status === 1 || row.status === true || row.status === '1'));
    assert.ok(admin, 'expected at least one enabled admin in seed data');
    return admin;
}

function getShippableOrder() {
    const orders = app.locals.dataStore.getCollection('orders');
    const hit = orders.find((row) => ['paid', 'agent_confirmed', 'shipping_requested'].includes(String(row.status || '')));
    if (hit) return hit;
    assert.ok(orders[0], 'expected at least one order in seed data');
    orders[0].status = 'paid';
    return orders[0];
}

function getRefundForReview() {
    const refunds = app.locals.dataStore.getCollection('refunds');
    const hit = refunds.find((row) => ['pending', 'approved'].includes(String(row.status || '')));
    if (hit) return hit;
    assert.ok(refunds[0], 'expected at least one refund in seed data');
    refunds[0].status = 'pending';
    return refunds[0];
}

function getAnyUser() {
    const users = app.locals.dataStore.getCollection('users');
    assert.ok(users[0], 'expected at least one user in seed data');
    return users[0];
}

test('POST /admin/api/branch-agents/stations loads pickup stations before sync', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const originalReloadCollections = dataStore.reloadCollections?.bind(dataStore);
    const originalGetCollection = dataStore.getCollection.bind(dataStore);
    const originalSaveCollection = dataStore.saveCollection?.bind(dataStore);
    let loadedStations = false;
    let createdId = null;
    const requestedCollections = [];

    dataStore.reloadCollections = async (names = []) => {
        const list = Array.isArray(names) ? names : [];
        requestedCollections.push(...list);
        if (list.includes('stations')) loadedStations = true;
        if (originalReloadCollections) return originalReloadCollections(names);
        return list.map((name) => originalGetCollection(name));
    };
    dataStore.getCollection = (name) => {
        if (String(name) === 'stations') {
            if (!loadedStations) {
                const error = new Error('CloudBase 集合 stations 尚未完成加载，当前状态：not_loaded');
                error.code = 'NOT_LOADED';
                throw error;
            }
            return [];
        }
        return originalGetCollection(name);
    };
    dataStore.saveCollection = (name, rows) => {
        if (String(name) === 'stations') return undefined;
        return originalSaveCollection(name, rows);
    };

    try {
        const response = await invoke('/admin/api/branch-agents/stations', {
            method: 'POST',
            admin,
            body: {
                name: '测试区域归属加载',
                branch_type: 'district',
                province: '江苏',
                city: '苏州',
                district: '虎丘',
                claimant_id: 'test-claimant',
                status: 'active'
            }
        });
        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        assert.ok(requestedCollections.includes('stations'), 'expected route to load stations before sync');
        createdId = response.body.data?.id;
    } finally {
        dataStore.reloadCollections = originalReloadCollections;
        dataStore.getCollection = originalGetCollection;
        dataStore.saveCollection = originalSaveCollection;
        if (createdId != null && originalSaveCollection) {
            const rows = originalGetCollection('branch_agent_stations')
                .filter((row) => String(row.id || row._id) !== String(createdId));
            originalSaveCollection('branch_agent_stations', rows);
        }
    }
});

test('DELETE /admin/api/branch-agents/stations removes region assignment and clears synced pickup binding', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const stationId = 'test-branch-delete-station';
    const claimantId = 'test-branch-delete-user';
    const cleanup = () => {
        dataStore.saveCollection?.('branch_agent_stations', dataStore.getCollection('branch_agent_stations')
            .filter((row) => String(row.id || row._id) !== stationId));
        dataStore.saveCollection?.('stations', dataStore.getCollection('stations')
            .filter((row) => String(row.id || row._id) !== stationId));
    };

    cleanup();
    const branchRows = dataStore.getCollection('branch_agent_stations');
    const pickupRows = dataStore.getCollection('stations');
    branchRows.push({
        _id: stationId,
        id: stationId,
        name: '待删除区域归属',
        branch_type: 'district',
        province: '江苏',
        city: '苏州',
        district: '虎丘',
        claimant_id: claimantId,
        status: 'active'
    });
    pickupRows.push({
        _id: stationId,
        id: stationId,
        name: '同 ID 自提点',
        branch_type: 'district',
        claimant_id: claimantId,
        region_name: '',
        status: 'active'
    });
    dataStore.saveCollection?.('branch_agent_stations', branchRows);
    dataStore.saveCollection?.('stations', pickupRows);

    try {
        const response = await invoke(`/admin/api/branch-agents/stations/${stationId}`, {
            method: 'DELETE',
            admin
        });

        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        assert.equal(response.body.data?.success, true);
        assert.equal(
            dataStore.getCollection('branch_agent_stations').some((row) => String(row.id || row._id) === stationId),
            false
        );
        const pickup = dataStore.getCollection('stations').find((row) => String(row.id || row._id) === stationId);
        assert.equal(pickup?.claimant_id, null);
        assert.equal(pickup?.branch_type, null);
        assert.equal(pickup?.status, 'active');
    } finally {
        cleanup();
    }
});

test('POST /admin/api/commissions/repair-region-agent backfills missing region reward', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const tempPrefix = 'test-region-reward-backfill';
    const claimantOpenid = `${tempPrefix}-openid`;
    const orderNo = `${tempPrefix}-order`;
    const cleanup = () => {
        dataStore.saveCollection?.('users', dataStore.getCollection('users')
            .filter((row) => String(row.openid || row.id || row._id) !== claimantOpenid));
        dataStore.saveCollection?.('branch_agent_stations', dataStore.getCollection('branch_agent_stations')
            .filter((row) => String(row.id || row._id) !== `${tempPrefix}-station`));
        dataStore.saveCollection?.('orders', dataStore.getCollection('orders')
            .filter((row) => String(row.order_no || row.id || row._id) !== orderNo));
        dataStore.saveCollection?.('commissions', dataStore.getCollection('commissions')
            .filter((row) => String(row.order_no || '') !== orderNo));
    };
    const originalPolicy = dataStore.getSingleton?.('branch-agent-policy', null);

    cleanup();
    dataStore.saveSingleton?.('branch-agent-policy', {
        enabled: true,
        region_reward_tiers: [{ threshold: 0, rate: 0.01, label: '测试1%' }]
    });
    dataStore.saveCollection?.('users', dataStore.getCollection('users').concat({
        _id: `${tempPrefix}-user`,
        id: `${tempPrefix}-user`,
        openid: claimantOpenid,
        nickname: '区域奖励测试用户',
        role_level: 5,
        status: 1
    }));
    dataStore.saveCollection?.('branch_agent_stations', dataStore.getCollection('branch_agent_stations').concat({
        _id: `${tempPrefix}-station`,
        id: `${tempPrefix}-station`,
        name: '区域奖励测试区',
        branch_type: 'district',
        province: '测试甲省',
        city: '测试乙市',
        district: '测试丙区',
        claimant_id: claimantOpenid,
        status: 'active',
        created_at: '2026-04-24T00:00:00.000Z'
    }));
    dataStore.saveCollection?.('orders', dataStore.getCollection('orders').concat({
        _id: `${tempPrefix}-order-id`,
        id: `${tempPrefix}-order-id`,
        order_no: orderNo,
        openid: claimantOpenid,
        status: 'paid',
        pay_amount: 100,
        address_snapshot: {
            province: '测试甲',
            city: '测试乙',
            district: '测试丙'
        },
        created_at: '2026-04-24T00:00:00.000Z'
    }));

    try {
        const response = await invoke('/admin/api/commissions/repair-region-agent', {
            method: 'POST',
            admin,
            body: { order_no: orderNo }
        });
        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        assert.equal(response.body.data?.created, 1);
        const commission = dataStore.getCollection('commissions').find((row) => String(row.order_no) === orderNo && row.type === 'region_agent');
        assert.ok(commission, 'expected region_agent commission to be created');
        assert.equal(commission.openid, claimantOpenid);
        assert.equal(Number(commission.amount), 1);
        assert.equal(commission.status, 'pending_approval');
    } finally {
        cleanup();
        if (originalPolicy) {
            dataStore.saveSingleton?.('branch-agent-policy', originalPolicy);
        }
    }
});

test('GET /admin/api/orders hides cancelled orders unless explicitly included', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const orders = app.locals.dataStore.getCollection('orders');
    const tempOrder = {
        _id: 'test-order-cancelled-hidden',
        id: 999090,
        order_no: 'TEST-CANCELLED-HIDDEN',
        status: 'cancelled',
        is_test_order: false,
        order_visibility: 'visible',
        openid: 'test-openid',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
    };
    orders.push(tempOrder);
    app.locals.dataStore.saveCollection?.('orders', orders);

    try {
        const hiddenResponse = await invoke('/admin/api/orders', {
            admin,
            query: {
                search_field: 'order_no',
                search_value: tempOrder.order_no
            }
        });
        assert.equal(hiddenResponse.statusCode, 200);
        assert.equal(hiddenResponse.body.data?.list?.length, 0);

        const includedResponse = await invoke('/admin/api/orders', {
            admin,
            query: {
                search_field: 'order_no',
                search_value: tempOrder.order_no,
                include_cancelled: '1'
            }
        });
        assert.equal(includedResponse.statusCode, 200);
        assert.equal(includedResponse.body.data?.list?.length, 1);
        assert.equal(includedResponse.body.data.list[0].order_no, tempOrder.order_no);
    } finally {
        const nextOrders = app.locals.dataStore.getCollection('orders')
            .filter((row) => String(row.id || row._id) !== String(tempOrder.id));
        app.locals.dataStore.saveCollection?.('orders', nextOrders);
    }
});

test('GET /admin/api/finance/agent-performance rejects invalid date', async () => {
    const admin = getEnabledAdmin();
    const response = await invoke('/admin/api/finance/agent-performance', {
        admin,
        query: { date: 'not-a-date' }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.match(response.body.message, /日期/);
});

test('GET /admin/api/finance/overview excludes hidden owner when first user ref is orphaned', async () => {
    const admin = getEnabledAdmin();
    const users = app.locals.dataStore.getCollection('users');
    const commissions = app.locals.dataStore.getCollection('commissions');
    const tempUserId = 'test-hidden-finance-user';
    const tempCommissionId = 'test-hidden-finance-commission';
    const removeTemps = () => {
        for (let index = users.length - 1; index >= 0; index -= 1) {
            if (String(users[index]?.id || users[index]?._id) === tempUserId) users.splice(index, 1);
        }
        for (let index = commissions.length - 1; index >= 0; index -= 1) {
            if (String(commissions[index]?.id || commissions[index]?._id) === tempCommissionId) commissions.splice(index, 1);
        }
    };

    removeTemps();
    const baselineResponse = await invoke('/admin/api/finance/overview', { admin });
    assert.equal(baselineResponse.statusCode, 200);
    const baselineSettled = Number(baselineResponse.body.data?.commissions?.settled || 0);

    users.push({
        _id: tempUserId,
        id: tempUserId,
        openid: 'test-hidden-finance-openid',
        nickname: 'hidden finance account',
        account_visibility: 'hidden',
        status: 1
    });
    commissions.push({
        _id: tempCommissionId,
        id: tempCommissionId,
        openid: 'test-orphan-finance-openid',
        user_id: tempUserId,
        amount: 987654321,
        status: 'settled',
        created_at: '2026-04-24T10:00:00+08:00'
    });

    try {
        const response = await invoke('/admin/api/finance/overview', { admin });
        assert.equal(response.statusCode, 200);
        assert.equal(Number(response.body.data?.commissions?.settled || 0), baselineSettled);
    } finally {
        removeTemps();
    }
});

test('GET /admin/api/finance/pool-contributions counts visible descendants only', async () => {
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const originalGetCollection = dataStore.getCollection.bind(dataStore);
    const baseUsers = originalGetCollection('users');
    const baseOrders = originalGetCollection('orders');
    const tempPrefix = 'test-finance-team-index';
    const partnerOpenid = `${tempPrefix}-partner`;
    const childOpenid = `${tempPrefix}-child`;
    const grandchildOpenid = `${tempPrefix}-grandchild`;
    const hiddenOpenid = `${tempPrefix}-hidden`;
    const tempUsers = [
        {
            _id: `${tempPrefix}-partner-user`,
            id: `${tempPrefix}-partner-user`,
            openid: partnerOpenid,
            nickname: 'finance partner',
            role_level: 4,
            status: 1
        },
        {
            _id: `${tempPrefix}-child-user`,
            id: `${tempPrefix}-child-user`,
            openid: childOpenid,
            invited_by: partnerOpenid,
            nickname: 'finance child',
            role_level: 3,
            status: 1
        },
        {
            _id: `${tempPrefix}-grandchild-user`,
            id: `${tempPrefix}-grandchild-user`,
            openid: grandchildOpenid,
            parent_openid: childOpenid,
            nickname: 'finance grandchild',
            role_level: 0,
            status: 1
        },
        {
            _id: `${tempPrefix}-hidden-user`,
            id: `${tempPrefix}-hidden-user`,
            openid: hiddenOpenid,
            invited_by: partnerOpenid,
            nickname: 'finance hidden child',
            role_level: 3,
            account_visibility: 'hidden',
            status: 1
        }
    ];
    const tempOrders = [
        {
            _id: `${tempPrefix}-order-partner`,
            id: `${tempPrefix}-order-partner`,
            openid: partnerOpenid,
            status: 'paid',
            pay_amount: 100,
            created_at: '2026-04-24T10:00:00+08:00'
        },
        {
            _id: `${tempPrefix}-order-child`,
            id: `${tempPrefix}-order-child`,
            openid: childOpenid,
            status: 'paid',
            pay_amount: 50,
            created_at: '2026-04-24T10:01:00+08:00'
        },
        {
            _id: `${tempPrefix}-order-grandchild`,
            id: `${tempPrefix}-order-grandchild`,
            openid: grandchildOpenid,
            status: 'paid',
            pay_amount: 25,
            created_at: '2026-04-24T10:02:00+08:00'
        },
        {
            _id: `${tempPrefix}-order-hidden`,
            id: `${tempPrefix}-order-hidden`,
            openid: hiddenOpenid,
            status: 'paid',
            pay_amount: 999,
            created_at: '2026-04-24T10:03:00+08:00'
        }
    ];

    dataStore.getCollection = (name) => {
        if (name === 'users') return [...baseUsers, ...tempUsers];
        if (name === 'orders') return [...baseOrders, ...tempOrders];
        return originalGetCollection(name);
    };

    try {
        const response = await invoke('/admin/api/finance/pool-contributions', { admin });
        assert.equal(response.statusCode, 200);
        const record = response.body.data?.partner_contributions?.find((item) => item.openid === partnerOpenid);
        assert.ok(record, 'expected temp partner contribution row');
        assert.equal(record.team_size, 3);
        assert.equal(Number(record.team_sales), 175);
    } finally {
        dataStore.getCollection = originalGetCollection;
    }
});

test('PUT /admin/api/orders/:id/ship returns field_errors for invalid body', async () => {
    const admin = getEnabledAdmin();
    const order = getShippableOrder();
    const response = await invoke(`/admin/api/orders/${order.id || order._id}/ship`, {
        method: 'PUT',
        admin,
        body: {
            fulfillment_type: 'invalid-mode',
            extra_field: 'unexpected'
        }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.ok(response.body.request_id);
    assert.ok(Array.isArray(response.body.field_errors));
    assert.ok(response.body.field_errors.some((item) => item.field === 'extra_field'));
});

test('PUT /admin/api/refunds/:id/reject returns field_errors for invalid body', async () => {
    const admin = getEnabledAdmin();
    const refund = getRefundForReview();
    const response = await invoke(`/admin/api/refunds/${refund.id || refund._id}/reject`, {
        method: 'PUT',
        admin,
        body: {
            reason: '',
            unexpected: 'x'
        }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.ok(Array.isArray(response.body.field_errors));
    assert.ok(response.body.field_errors.some((item) => item.field === 'unexpected'));
});

test('PUT /admin/api/users/:id/goods-fund returns field_errors for invalid body', async () => {
    const admin = getEnabledAdmin();
    const user = getAnyUser();
    const response = await invoke(`/admin/api/users/${user.id || user._id || user.openid}/goods-fund`, {
        method: 'PUT',
        admin,
        body: {
            amount: 0,
            type: 'invalid',
            reason: '',
            extra_field: 'unexpected'
        }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.ok(Array.isArray(response.body.field_errors));
    assert.ok(response.body.field_errors.some((item) => item.field === 'extra_field'));
});

test('PUT /admin/api/users/:id/goods-fund updates balance and wallet account on valid request', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const users = app.locals.dataStore.getCollection('users');
    const walletAccounts = app.locals.dataStore.getCollection('wallet_accounts');
    const tempUser = {
        _id: 'test-user-goods-fund-success',
        id: 999401,
        openid: 'test-openid-goods-fund-success',
        nickname: 'goods-fund-user',
        role_level: 1,
        agent_wallet_balance: 20,
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
    };
    users.push(tempUser);
    app.locals.dataStore.saveCollection?.('users', users);

    try {
        const response = await invoke(`/admin/api/users/${tempUser.id}/goods-fund`, {
            method: 'PUT',
            admin,
            body: {
                amount: 10,
                type: 'add',
                reason: '管理员补贴'
            }
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.data?.data?.agent_wallet_balance, 30);

        const updatedUser = app.locals.dataStore.getCollection('users').find((row) => String(row.id) === String(tempUser.id));
        assert.equal(updatedUser.agent_wallet_balance, 30);

        const relatedWalletAccount = app.locals.dataStore.getCollection('wallet_accounts').find((row) => String(row.openid) === tempUser.openid);
        assert.ok(relatedWalletAccount);
        assert.equal(Number(relatedWalletAccount.balance), 30);
    } finally {
        app.locals.dataStore.saveCollection?.(
            'users',
            app.locals.dataStore.getCollection('users').filter((row) => String(row.id) !== String(tempUser.id))
        );
        app.locals.dataStore.saveCollection?.(
            'wallet_accounts',
            app.locals.dataStore.getCollection('wallet_accounts').filter((row) => String(row.openid) !== tempUser.openid)
        );
    }
});

test('PUT /admin/api/users/:id/points updates points on valid request', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const users = app.locals.dataStore.getCollection('users');
    const tempUser = {
        _id: 'test-user-points-success',
        id: 999402,
        openid: 'test-openid-points-success',
        nickname: 'points-user',
        role_level: 1,
        points: 12,
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
    };
    users.push(tempUser);
    app.locals.dataStore.saveCollection?.('users', users);

    try {
        const response = await invoke(`/admin/api/users/${tempUser.id}/points`, {
            method: 'PUT',
            admin,
            body: {
                amount: 8,
                type: 'add',
                reason: '活动补点'
            }
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.data?.data?.points, 20);

        const updatedUser = app.locals.dataStore.getCollection('users').find((row) => String(row.id) === String(tempUser.id));
        assert.equal(updatedUser.points, 20);
    } finally {
        app.locals.dataStore.saveCollection?.(
            'users',
            app.locals.dataStore.getCollection('users').filter((row) => String(row.id) !== String(tempUser.id))
        );
    }
});

test('PUT /admin/api/orders/:id/amount accepts reason and updates pending order', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const orders = app.locals.dataStore.getCollection('orders');
    const auditLogs = app.locals.dataStore.getCollection('admin_audit_logs');
    const tempOrder = {
        _id: 'test-order-adjust-pending',
        id: 999101,
        order_no: 'TEST-ADJUST-PENDING',
        status: 'pending',
        total_amount: 100,
        pay_amount: 100,
        actual_price: 100,
        shipping_fee: 0,
        coupon_discount: 0,
        points_discount: 0,
        qty: 1,
        openid: 'test-openid',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
    };
    orders.push(tempOrder);
    app.locals.dataStore.saveCollection?.('orders', orders);

    try {
        const response = await invoke(`/admin/api/orders/${tempOrder.id}/amount`, {
            method: 'PUT',
            admin,
            body: {
                pay_amount: 88.5,
                reason: '客服协商改价'
            }
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.data?.data?.pay_amount, 88.5);
        assert.equal(response.body.data?.data?.actual_price, 88.5);

        const updated = app.locals.dataStore.getCollection('orders').find((row) => String(row.id) === String(tempOrder.id));
        assert.equal(updated.pay_amount, 88.5);
        assert.equal(updated.actual_price, 88.5);
        assert.match(String(updated.admin_remark || ''), /客服协商改价/);
    } finally {
        const nextOrders = app.locals.dataStore.getCollection('orders').filter((row) => String(row.id) !== String(tempOrder.id));
        app.locals.dataStore.saveCollection?.('orders', nextOrders);
        const nextAuditLogs = auditLogs.filter((row) => !(row.action === 'order.amount.adjust' && String(row.detail?.order_no || '') === tempOrder.order_no));
        app.locals.dataStore.saveCollection?.('admin_audit_logs', nextAuditLogs);
    }
});

test('PUT /admin/api/orders/:id/amount rejects orders already in refund chain', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const orders = app.locals.dataStore.getCollection('orders');
    const refunds = app.locals.dataStore.getCollection('refunds');
    const tempOrder = {
        _id: 'test-order-adjust-refund',
        id: 999102,
        order_no: 'TEST-ADJUST-REFUND',
        status: 'pending',
        total_amount: 120,
        pay_amount: 120,
        actual_price: 120,
        shipping_fee: 0,
        coupon_discount: 0,
        points_discount: 0,
        qty: 1,
        openid: 'test-openid-2',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
    };
    const tempRefund = {
        _id: 'test-refund-adjust-refund',
        id: 999201,
        order_id: tempOrder.id,
        order_no: tempOrder.order_no,
        status: 'processing',
        amount: 10
    };
    orders.push(tempOrder);
    refunds.push(tempRefund);
    app.locals.dataStore.saveCollection?.('orders', orders);
    app.locals.dataStore.saveCollection?.('refunds', refunds);

    try {
        const response = await invoke(`/admin/api/orders/${tempOrder.id}/amount`, {
            method: 'PUT',
            admin,
            body: {
                pay_amount: 100,
                reason: '尝试改价'
            }
        });

        assert.equal(response.statusCode, 400);
        assert.equal(response.body.success, false);
        assert.equal(response.body.message, '订单已进入退款链路，不允许改价');
    } finally {
        const nextOrders = app.locals.dataStore.getCollection('orders').filter((row) => String(row.id) !== String(tempOrder.id));
        const nextRefunds = app.locals.dataStore.getCollection('refunds').filter((row) => String(row.id) !== String(tempRefund.id));
        app.locals.dataStore.saveCollection?.('orders', nextOrders);
        app.locals.dataStore.saveCollection?.('refunds', nextRefunds);
    }
});

test('PUT /admin/api/commissions/:id/approve settles pending commission and updates user balance', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const users = app.locals.dataStore.getCollection('users');
    const commissions = app.locals.dataStore.getCollection('commissions');
    const tempUser = {
        _id: 'test-user-commission-approve',
        id: 999301,
        openid: 'test-openid-commission-approve',
        nickname: 'commission-user',
        role_level: 1,
        balance: 0,
        commission_balance: 0,
        total_earned: 0,
        debt_amount: 0,
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
    };
    const tempCommission = {
        _id: 'test-commission-approve',
        id: 999302,
        openid: tempUser.openid,
        user_id: tempUser.id,
        order_id: 'ORDER-COMMISSION-APPROVE',
        order_no: 'ORDER-COMMISSION-APPROVE',
        amount: 25,
        status: 'pending_approval',
        type: 'direct',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
    };
    users.push(tempUser);
    commissions.push(tempCommission);
    app.locals.dataStore.saveCollection?.('users', users);
    app.locals.dataStore.saveCollection?.('commissions', commissions);

    try {
        const response = await invoke(`/admin/api/commissions/${tempCommission.id}/approve`, {
            method: 'PUT',
            admin
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.data?.data?.status, 'settled');

        const updatedUser = app.locals.dataStore.getCollection('users').find((row) => String(row.id) === String(tempUser.id));
        const updatedCommission = app.locals.dataStore.getCollection('commissions').find((row) => String(row.id) === String(tempCommission.id));
        assert.equal(updatedUser.balance, 25);
        assert.equal(updatedUser.commission_balance, 25);
        assert.equal(updatedCommission.status, 'settled');
    } finally {
        app.locals.dataStore.saveCollection?.(
            'users',
            app.locals.dataStore.getCollection('users').filter((row) => String(row.id) !== String(tempUser.id))
        );
        app.locals.dataStore.saveCollection?.(
            'commissions',
            app.locals.dataStore.getCollection('commissions').filter((row) => String(row.id) !== String(tempCommission.id))
        );
    }
});

test('PUT /admin/api/commissions/:id/reject cancels pending commission', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const commissions = app.locals.dataStore.getCollection('commissions');
    const tempCommission = {
        _id: 'test-commission-reject',
        id: 999303,
        openid: 'test-openid-commission-reject',
        user_id: 999304,
        order_id: 'ORDER-COMMISSION-REJECT',
        order_no: 'ORDER-COMMISSION-REJECT',
        amount: 18,
        status: 'pending_approval',
        type: 'direct',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
    };
    commissions.push(tempCommission);
    app.locals.dataStore.saveCollection?.('commissions', commissions);

    try {
        const response = await invoke(`/admin/api/commissions/${tempCommission.id}/reject`, {
            method: 'PUT',
            admin,
            body: { reason: '人工驳回' }
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.data?.data?.status, 'cancelled');

        const updatedCommission = app.locals.dataStore.getCollection('commissions').find((row) => String(row.id) === String(tempCommission.id));
        assert.equal(updatedCommission.status, 'cancelled');
        assert.equal(updatedCommission.cancel_reason, '人工驳回');
    } finally {
        app.locals.dataStore.saveCollection?.(
            'commissions',
            app.locals.dataStore.getCollection('commissions').filter((row) => String(row.id) !== String(tempCommission.id))
        );
    }
});

test('POST /admin/api/commissions/batch-approve settles pending commissions', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const users = app.locals.dataStore.getCollection('users');
    const commissions = app.locals.dataStore.getCollection('commissions');
    const tempUser = {
        _id: 'test-user-commission-batch-approve',
        id: 999305,
        openid: 'test-openid-commission-batch-approve',
        nickname: 'commission-batch-user',
        role_level: 1,
        balance: 0,
        commission_balance: 0,
        total_earned: 0,
        debt_amount: 0,
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
    };
    const tempCommission = {
        _id: 'test-commission-batch-approve',
        id: 999306,
        openid: tempUser.openid,
        user_id: tempUser.id,
        order_id: 'ORDER-COMMISSION-BATCH-APPROVE',
        order_no: 'ORDER-COMMISSION-BATCH-APPROVE',
        amount: 15,
        status: 'pending_approval',
        type: 'direct',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
    };
    users.push(tempUser);
    commissions.push(tempCommission);
    app.locals.dataStore.saveCollection?.('users', users);
    app.locals.dataStore.saveCollection?.('commissions', commissions);

    try {
        const response = await invoke('/admin/api/commissions/batch-approve', {
            method: 'POST',
            admin,
            body: { ids: [tempCommission.id] }
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.data?.data?.affected, 1);

        const updatedUser = app.locals.dataStore.getCollection('users').find((row) => String(row.id) === String(tempUser.id));
        const updatedCommission = app.locals.dataStore.getCollection('commissions').find((row) => String(row.id) === String(tempCommission.id));
        assert.equal(updatedUser.balance, 15);
        assert.equal(updatedCommission.status, 'settled');
    } finally {
        app.locals.dataStore.saveCollection?.(
            'users',
            app.locals.dataStore.getCollection('users').filter((row) => String(row.id) !== String(tempUser.id))
        );
        app.locals.dataStore.saveCollection?.(
            'commissions',
            app.locals.dataStore.getCollection('commissions').filter((row) => String(row.id) !== String(tempCommission.id))
        );
    }
});

test('POST /admin/api/commissions/batch-reject cancels pending commissions', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const commissions = app.locals.dataStore.getCollection('commissions');
    const tempCommission = {
        _id: 'test-commission-batch-reject',
        id: 999307,
        openid: 'test-openid-commission-batch-reject',
        user_id: 999308,
        order_id: 'ORDER-COMMISSION-BATCH-REJECT',
        order_no: 'ORDER-COMMISSION-BATCH-REJECT',
        amount: 12,
        status: 'pending_approval',
        type: 'direct',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
    };
    commissions.push(tempCommission);
    app.locals.dataStore.saveCollection?.('commissions', commissions);

    try {
        const response = await invoke('/admin/api/commissions/batch-reject', {
            method: 'POST',
            admin,
            body: { ids: [tempCommission.id], reason: '批量驳回' }
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.data?.data?.affected, 1);

        const updatedCommission = app.locals.dataStore.getCollection('commissions').find((row) => String(row.id) === String(tempCommission.id));
        assert.equal(updatedCommission.status, 'cancelled');
        assert.equal(updatedCommission.cancel_reason, '批量驳回');
    } finally {
        app.locals.dataStore.saveCollection?.(
            'commissions',
            app.locals.dataStore.getCollection('commissions').filter((row) => String(row.id) !== String(tempCommission.id))
        );
    }
});

test('settings-protected endpoints still reject low-permission admins', async () => {
    await ensureReady();
    const admins = app.locals.dataStore.getCollection('admins');
    const lowPermissionAdmin = {
        _id: 'test-low-permission-admin',
        id: 999001,
        username: 'limited-admin',
        name: 'limited-admin',
        role: 'operator',
        status: true,
        permissions: JSON.stringify(['dashboard'])
    };
    admins.push(lowPermissionAdmin);
    app.locals.dataStore.saveCollection?.('admins', admins);

    try {
        const alertResponse = await invoke('/admin/api/alert-config', {
            admin: lowPermissionAdmin
        });
        assert.equal(alertResponse.statusCode, 403);
        assert.equal(alertResponse.body.success, false);

        const toggleResponse = await invoke('/admin/api/feature-toggles', {
            method: 'POST',
            admin: lowPermissionAdmin,
            body: { show_station_entry: true }
        });
        assert.equal(toggleResponse.statusCode, 403);
        assert.equal(toggleResponse.body.success, false);
    } finally {
        const index = admins.findIndex((row) => String(row.id) === String(lowPermissionAdmin.id));
        if (index !== -1) admins.splice(index, 1);
        app.locals.dataStore.saveCollection?.('admins', admins);
    }
});
