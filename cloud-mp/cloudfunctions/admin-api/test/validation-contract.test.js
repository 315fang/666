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
                province: '测试加载省',
                city: '测试加载市',
                district: '测试加载区',
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

test('POST /admin/api/branch-agents/stations rejects duplicate active region assignment', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const tempPrefix = 'test-branch-duplicate';
    const cleanup = () => {
        dataStore.saveCollection?.('branch_agent_stations', dataStore.getCollection('branch_agent_stations')
            .filter((row) => !String(row.id || row._id || row.name || '').includes(tempPrefix)));
    };

    cleanup();
    dataStore.saveCollection?.('branch_agent_stations', dataStore.getCollection('branch_agent_stations').concat({
        _id: `${tempPrefix}-existing`,
        id: `${tempPrefix}-existing`,
        name: `${tempPrefix}-existing`,
        branch_type: 'district',
        province: '测试重复省',
        city: '测试重复市',
        district: '测试重复区',
        claimant_id: `${tempPrefix}-claimant-a`,
        status: 'active'
    }));

    try {
        const response = await invoke('/admin/api/branch-agents/stations', {
            method: 'POST',
            admin,
            body: {
                name: `${tempPrefix}-new`,
                branch_type: 'district',
                province: '测试重复省',
                city: '测试重复市',
                district: '测试重复区',
                claimant_id: `${tempPrefix}-claimant-b`,
                status: 'active'
            }
        });
        assert.equal(response.statusCode, 409, response.body?.message || JSON.stringify(response.body));
        assert.match(String(response.body?.message || ''), /已有启用中的代理/);
    } finally {
        cleanup();
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

        const secondResponse = await invoke('/admin/api/commissions/repair-region-agent', {
            method: 'POST',
            admin,
            body: { order_no: orderNo }
        });
        assert.equal(secondResponse.statusCode, 200, secondResponse.body?.message || JSON.stringify(secondResponse.body));
        assert.equal(secondResponse.body.data?.created, 0);
        assert.equal(secondResponse.body.data?.existing, 1);
        const commissions = dataStore.getCollection('commissions')
            .filter((row) => String(row.order_no) === orderNo && row.type === 'region_agent');
        assert.equal(commissions.length, 1);
    } finally {
        cleanup();
        if (originalPolicy) {
            dataStore.saveSingleton?.('branch-agent-policy', originalPolicy);
        }
    }
});

test('GET /admin/api/branch-agents/earnings summarizes region and store rewards', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const tempPrefix = 'test-branch-earnings';
    const regionUserOpenid = `${tempPrefix}-region-openid`;
    const managerOpenid = `${tempPrefix}-manager-openid`;
    const regionStationId = `${tempPrefix}-region`;
    const storeStationId = `${tempPrefix}-store`;
    const regionOrderId = `${tempPrefix}-region-order`;
    const regionOrderNo = `${tempPrefix}-region-no`;
    const storeOrderId = `${tempPrefix}-store-order`;
    const storeOrderNo = `${tempPrefix}-store-no`;
    const cleanup = () => {
        dataStore.saveCollection?.('users', dataStore.getCollection('users')
            .filter((row) => ![regionUserOpenid, managerOpenid].includes(String(row.openid || row.id || row._id))));
        dataStore.saveCollection?.('branch_agent_stations', dataStore.getCollection('branch_agent_stations')
            .filter((row) => String(row.id || row._id) !== regionStationId));
        dataStore.saveCollection?.('stations', dataStore.getCollection('stations')
            .filter((row) => String(row.id || row._id) !== storeStationId));
        dataStore.saveCollection?.('station_staff', dataStore.getCollection('station_staff')
            .filter((row) => !String(row.id || row._id || '').startsWith(tempPrefix)));
        dataStore.saveCollection?.('orders', dataStore.getCollection('orders')
            .filter((row) => ![regionOrderId, storeOrderId].includes(String(row.id || row._id))));
        dataStore.saveCollection?.('commissions', dataStore.getCollection('commissions')
            .filter((row) => !String(row.id || row._id || '').startsWith(tempPrefix)));
    };

    cleanup();
    dataStore.saveCollection?.('users', dataStore.getCollection('users').concat([
        {
            _id: `${tempPrefix}-region-user`,
            id: `${tempPrefix}-region-user`,
            openid: regionUserOpenid,
            nickname: '区域收益测试用户',
            role_level: 5,
            status: 1
        },
        {
            _id: `${tempPrefix}-manager-user`,
            id: `${tempPrefix}-manager-user`,
            openid: managerOpenid,
            nickname: '门店收益测试店长',
            role_level: 4,
            status: 1
        }
    ]));
    dataStore.saveCollection?.('branch_agent_stations', dataStore.getCollection('branch_agent_stations').concat({
        _id: regionStationId,
        id: regionStationId,
        name: '收益测试区域',
        branch_type: 'district',
        province: '测试收益省',
        city: '测试收益市',
        district: '测试收益区',
        claimant_id: regionUserOpenid,
        status: 'active',
        created_at: '2026-04-24T00:00:00.000Z'
    }));
    dataStore.saveCollection?.('stations', dataStore.getCollection('stations').concat({
        _id: storeStationId,
        id: storeStationId,
        name: '收益测试门店',
        province: '测试门店省',
        city: '测试门店市',
        district: '测试门店区',
        status: 'active',
        is_pickup_point: true,
        pickup_commission_tier: 'B',
        pickup_claimant_id: managerOpenid
    }));
    dataStore.saveCollection?.('station_staff', dataStore.getCollection('station_staff').concat({
        _id: `${tempPrefix}-staff`,
        id: `${tempPrefix}-staff`,
        station_id: storeStationId,
        openid: managerOpenid,
        role: 'manager',
        status: 'active'
    }));
    dataStore.saveCollection?.('orders', dataStore.getCollection('orders').concat([
        {
            _id: regionOrderId,
            id: regionOrderId,
            order_no: regionOrderNo,
            openid: `${tempPrefix}-buyer-a`,
            status: 'paid',
            pay_amount: 200,
            address_snapshot: {
                province: '测试收益省',
                city: '测试收益市',
                district: '测试收益区'
            },
            created_at: '2026-04-24T00:00:00.000Z'
        },
        {
            _id: storeOrderId,
            id: storeOrderId,
            order_no: storeOrderNo,
            openid: `${tempPrefix}-buyer-b`,
            status: 'completed',
            pay_amount: 80,
            pickup_verified_station_id: storeStationId,
            pickup_verified_at: '2026-04-24T01:00:00.000Z',
            created_at: '2026-04-24T01:00:00.000Z'
        }
    ]));
    dataStore.saveCollection?.('commissions', dataStore.getCollection('commissions').concat([
        {
            _id: `${tempPrefix}-region-commission`,
            id: `${tempPrefix}-region-commission`,
            openid: regionUserOpenid,
            user_id: `${tempPrefix}-region-user`,
            order_id: regionOrderId,
            order_no: regionOrderNo,
            amount: 2,
            type: 'region_agent',
            status: 'pending_approval',
            branch_station_id: regionStationId,
            created_at: '2026-04-24T02:00:00.000Z'
        },
        {
            _id: `${tempPrefix}-store-commission`,
            id: `${tempPrefix}-store-commission`,
            openid: managerOpenid,
            user_id: `${tempPrefix}-manager-user`,
            order_id: storeOrderId,
            order_no: storeOrderNo,
            amount: 3,
            type: 'pickup_service_fee',
            status: 'settled',
            station_id: storeStationId,
            created_at: '2026-04-24T03:00:00.000Z'
        }
    ]));

    try {
        const response = await invoke('/admin/api/branch-agents/earnings', { admin });
        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        const region = response.body.data?.regions?.find((row) => String(row.id) === regionStationId);
        const store = response.body.data?.stores?.find((row) => String(row.id) === storeStationId);
        assert.ok(region, 'expected temp region earnings row');
        assert.ok(store, 'expected temp store earnings row');
        assert.equal(region.claimant?.openid, regionUserOpenid);
        assert.equal(region.order_count, 1);
        assert.equal(Number(region.order_amount), 200);
        assert.equal(Number(region.rewards?.pending_approval), 2);
        assert.equal(store.managers?.[0]?.openid, managerOpenid);
        assert.equal(store.order_count, 1);
        assert.equal(store.verified_order_count, 1);
        assert.equal(Number(store.order_amount), 80);
        assert.equal(Number(store.rewards?.settled), 3);
        assert.ok(Number(response.body.data?.summary?.regions?.reward_total || 0) >= 2);
        assert.ok(Number(response.body.data?.summary?.stores?.reward_total || 0) >= 3);
    } finally {
        cleanup();
    }
});

test('POST /admin/api/commissions/repair-pickup-service-fee backfills verified pickup service fee', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const tempPrefix = 'test-pickup-fee-repair';
    const managerOpenid = `${tempPrefix}-manager`;
    const stationId = `${tempPrefix}-station`;
    const orderId = `${tempPrefix}-order`;
    const orderNo = `${tempPrefix}-order-no`;
    const cleanup = () => {
        dataStore.saveCollection?.('users', dataStore.getCollection('users').filter((row) => String(row.openid) !== managerOpenid));
        dataStore.saveCollection?.('stations', dataStore.getCollection('stations').filter((row) => String(row.id || row._id) !== stationId));
        dataStore.saveCollection?.('station_staff', dataStore.getCollection('station_staff').filter((row) => !String(row.id || row._id || '').startsWith(tempPrefix)));
        dataStore.saveCollection?.('orders', dataStore.getCollection('orders').filter((row) => String(row.id || row._id) !== orderId));
        dataStore.saveCollection?.('commissions', dataStore.getCollection('commissions').filter((row) => !String(row.id || row._id || '').startsWith(tempPrefix) && String(row.order_id) !== orderId));
    };

    cleanup();
    dataStore.saveCollection?.('users', dataStore.getCollection('users').concat({
        _id: `${tempPrefix}-user`,
        id: `${tempPrefix}-user`,
        openid: managerOpenid,
        nickname: '服务费修复店长',
        role_level: 6,
        status: 1
    }));
    dataStore.saveCollection?.('stations', dataStore.getCollection('stations').concat({
        _id: stationId,
        id: stationId,
        name: '服务费修复门店',
        status: 'active',
        pickup_claimant_id: managerOpenid
    }));
    dataStore.saveCollection?.('station_staff', dataStore.getCollection('station_staff').concat({
        _id: `${tempPrefix}-staff`,
        id: `${tempPrefix}-staff`,
        station_id: stationId,
        openid: managerOpenid,
        role: 'manager',
        status: 'active'
    }));
    dataStore.saveCollection?.('orders', dataStore.getCollection('orders').concat({
        _id: orderId,
        id: orderId,
        order_no: orderNo,
        openid: `${tempPrefix}-buyer`,
        status: 'completed',
        delivery_type: 'pickup',
        pickup_station_id: stationId,
        pay_amount: 100,
        confirmed_at: '2026-04-24T00:00:00.000Z'
    }));

    try {
        const response = await invoke('/admin/api/commissions/repair-pickup-service-fee', {
            method: 'POST',
            admin,
            body: { order_id: orderId }
        });
        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        assert.equal(response.body.data?.created, 1);
        const commission = dataStore.getCollection('commissions').find((row) => String(row.order_id) === orderId && row.type === 'pickup_service_fee');
        assert.ok(commission, 'expected pickup service fee commission');
        assert.equal(Number(commission.amount), 2.5);
        assert.equal(commission.openid, managerOpenid);

        const secondResponse = await invoke('/admin/api/commissions/repair-pickup-service-fee', {
            method: 'POST',
            admin,
            body: { order_id: orderId }
        });
        assert.equal(secondResponse.statusCode, 200);
        assert.equal(secondResponse.body.data?.created, 0);
        assert.equal(secondResponse.body.data?.existing, 1);
    } finally {
        cleanup();
    }
});

test('POST /admin/api/store-benefits/annual-goods-rewards settles yearly goods reward ledger', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const tempPrefix = 'test-annual-goods';
    const managerOpenid = `${tempPrefix}-manager`;
    const stationId = `${tempPrefix}-station`;
    const cleanup = () => {
        dataStore.saveCollection?.('users', dataStore.getCollection('users').filter((row) => String(row.openid) !== managerOpenid));
        dataStore.saveCollection?.('stations', dataStore.getCollection('stations').filter((row) => String(row.id || row._id) !== stationId));
        dataStore.saveCollection?.('station_staff', dataStore.getCollection('station_staff').filter((row) => !String(row.id || row._id || '').startsWith(tempPrefix)));
        dataStore.saveCollection?.('station_procurement_orders', dataStore.getCollection('station_procurement_orders').filter((row) => !String(row.id || row._id || '').startsWith(tempPrefix)));
        dataStore.saveCollection?.('store_annual_goods_rewards', dataStore.getCollection('store_annual_goods_rewards').filter((row) => !String(row.id || row._id || '').includes(tempPrefix)));
    };

    cleanup();
    dataStore.saveCollection?.('users', dataStore.getCollection('users').concat({
        _id: `${tempPrefix}-user`,
        id: `${tempPrefix}-user`,
        openid: managerOpenid,
        nickname: '年度货品店长',
        role_level: 6,
        status: 1
    }));
    dataStore.saveCollection?.('stations', dataStore.getCollection('stations').concat({
        _id: stationId,
        id: stationId,
        name: '年度货品门店',
        status: 'active',
        pickup_claimant_id: managerOpenid
    }));
    dataStore.saveCollection?.('station_staff', dataStore.getCollection('station_staff').concat({
        _id: `${tempPrefix}-staff`,
        id: `${tempPrefix}-staff`,
        station_id: stationId,
        openid: managerOpenid,
        role: 'manager',
        status: 'active'
    }));
    dataStore.saveCollection?.('station_procurement_orders', dataStore.getCollection('station_procurement_orders').concat({
        _id: `${tempPrefix}-procurement`,
        id: `${tempPrefix}-procurement`,
        station_id: stationId,
        status: 'received',
        total_cost: 10000,
        received_at: '2025-05-01T00:00:00.000Z'
    }));

    try {
        const response = await invoke('/admin/api/store-benefits/annual-goods-rewards', {
            method: 'POST',
            admin,
            body: { year: 2025 }
        });
        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        assert.equal(response.body.data?.created, 1);
        const reward = dataStore.getCollection('store_annual_goods_rewards').find((row) => String(row.store_id) === stationId && Number(row.settlement_year) === 2025);
        assert.ok(reward, 'expected annual goods reward row');
        assert.equal(Number(reward.purchase_amount), 10000);
        assert.equal(Number(reward.reward_goods_amount), 500);
        assert.equal(reward.claimant_openid, managerOpenid);
    } finally {
        cleanup();
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

test('PUT /admin/api/refunds/:id/reject restores refund-frozen commissions without cancelling settled rows', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const tempPrefix = 'test-refund-reject-commission';
    const orderId = `${tempPrefix}-order`;
    const orderNo = `${tempPrefix}-no`;
    const refundId = `${tempPrefix}-refund`;
    const userOpenid = `${tempPrefix}-openid`;
    const cleanup = () => {
        dataStore.saveCollection?.('users', dataStore.getCollection('users')
            .filter((row) => String(row.openid || row.id || row._id) !== userOpenid));
        dataStore.saveCollection?.('orders', dataStore.getCollection('orders')
            .filter((row) => String(row._id || row.id || row.order_no) !== orderId && String(row.order_no || '') !== orderNo));
        dataStore.saveCollection?.('refunds', dataStore.getCollection('refunds')
            .filter((row) => String(row._id || row.id) !== refundId));
        dataStore.saveCollection?.('commissions', dataStore.getCollection('commissions')
            .filter((row) => String(row.order_id || row.order_no) !== orderId && String(row.order_no || '') !== orderNo));
    };

    cleanup();
    dataStore.saveCollection?.('users', dataStore.getCollection('users').concat({
        _id: `${tempPrefix}-user`,
        id: `${tempPrefix}-user`,
        openid: userOpenid,
        nickname: '退款拒绝测试用户',
        balance: 10,
        commission_balance: 10
    }));
    dataStore.saveCollection?.('orders', dataStore.getCollection('orders').concat({
        _id: orderId,
        id: orderId,
        order_no: orderNo,
        openid: userOpenid,
        status: 'refunding',
        prev_status: 'paid',
        paid_at: '2026-04-24T00:00:00.000Z'
    }));
    dataStore.saveCollection?.('refunds', dataStore.getCollection('refunds').concat({
        _id: refundId,
        id: refundId,
        order_id: orderId,
        order_no: orderNo,
        openid: userOpenid,
        status: 'pending',
        amount: 100,
        created_at: '2026-04-24T00:00:00.000Z'
    }));
    dataStore.saveCollection?.('commissions', dataStore.getCollection('commissions').concat([
        {
            _id: `${tempPrefix}-region`,
            id: `${tempPrefix}-region`,
            order_id: orderId,
            order_no: orderNo,
            openid: userOpenid,
            type: 'region_agent',
            status: 'frozen',
            pre_freeze_status: 'pending_approval',
            commission_freeze_reason: 'refund',
            amount: 1
        },
        {
            _id: `${tempPrefix}-settled`,
            id: `${tempPrefix}-settled`,
            order_id: orderId,
            order_no: orderNo,
            openid: userOpenid,
            type: 'direct',
            status: 'settled',
            amount: 10
        }
    ]));

    try {
        const response = await invoke(`/admin/api/refunds/${refundId}/reject`, {
            method: 'PUT',
            admin,
            body: { reason: '测试拒绝退款' }
        });

        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        const commissions = dataStore.getCollection('commissions');
        const restored = commissions.find((row) => String(row._id || row.id) === `${tempPrefix}-region`);
        const settled = commissions.find((row) => String(row._id || row.id) === `${tempPrefix}-settled`);
        const user = dataStore.getCollection('users').find((row) => String(row.openid) === userOpenid);
        const order = dataStore.getCollection('orders').find((row) => String(row._id || row.id) === orderId);
        assert.equal(restored?.status, 'pending_approval');
        assert.equal(settled?.status, 'settled');
        assert.equal(Number(user?.commission_balance), 10);
        assert.equal(order?.status, 'paid');
    } finally {
        cleanup();
    }
});

test('PUT /admin/api/refunds/:id/complete requires return logistics before return-refund payout', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const tempPrefix = 'test-return-refund-require-logistics';
    const orderId = `${tempPrefix}-order`;
    const orderNo = `${tempPrefix}-no`;
    const refundId = `${tempPrefix}-refund`;
    const userOpenid = `${tempPrefix}-openid`;
    const cleanup = () => {
        dataStore.saveCollection?.('users', dataStore.getCollection('users')
            .filter((row) => String(row.openid || row.id || row._id) !== userOpenid));
        dataStore.saveCollection?.('orders', dataStore.getCollection('orders')
            .filter((row) => String(row._id || row.id || row.order_no) !== orderId && String(row.order_no || '') !== orderNo));
        dataStore.saveCollection?.('refunds', dataStore.getCollection('refunds')
            .filter((row) => String(row._id || row.id) !== refundId));
    };

    cleanup();
    dataStore.saveCollection?.('users', dataStore.getCollection('users').concat({
        _id: `${tempPrefix}-user`,
        id: `${tempPrefix}-user`,
        openid: userOpenid,
        nickname: '退货退款物流测试用户',
        agent_wallet_balance: 0,
        status: 1
    }));
    dataStore.saveCollection?.('orders', dataStore.getCollection('orders').concat({
        _id: orderId,
        id: orderId,
        order_no: orderNo,
        openid: userOpenid,
        status: 'paid',
        payment_method: 'goods_fund',
        pay_amount: 20,
        actual_price: 20,
        total_amount: 20,
        paid_at: '2026-04-24T00:00:00.000Z'
    }));
    dataStore.saveCollection?.('refunds', dataStore.getCollection('refunds').concat({
        _id: refundId,
        id: refundId,
        order_id: orderId,
        order_no: orderNo,
        openid: userOpenid,
        status: 'approved',
        type: 'return_refund',
        amount: 20,
        payment_method: 'goods_fund',
        created_at: '2026-04-24T00:10:00.000Z'
    }));

    try {
        const response = await invoke(`/admin/api/refunds/${refundId}/complete`, {
            method: 'PUT',
            admin
        });

        assert.equal(response.statusCode, 400, response.body?.message || JSON.stringify(response.body));
        assert.match(String(response.body?.message || ''), /退货物流单号/);
        const refund = dataStore.getCollection('refunds').find((row) => String(row._id || row.id) === refundId);
        assert.equal(refund?.status, 'approved');
    } finally {
        cleanup();
    }
});

test('PUT /admin/api/refunds/:id/complete marks return-refund goods as received before payout', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const tempPrefix = 'test-return-refund-received';
    const orderId = `${tempPrefix}-order`;
    const orderNo = `${tempPrefix}-no`;
    const refundId = `${tempPrefix}-refund`;
    const userOpenid = `${tempPrefix}-openid`;
    const storeOpenid = `${tempPrefix}-store-openid`;
    const walletId = `wallet-${tempPrefix}-user`;
    const cleanup = () => {
        dataStore.saveCollection?.('users', dataStore.getCollection('users')
            .filter((row) => ![userOpenid, storeOpenid].includes(String(row.openid || row.id || row._id))));
        dataStore.saveCollection?.('orders', dataStore.getCollection('orders')
            .filter((row) => String(row._id || row.id || row.order_no) !== orderId && String(row.order_no || '') !== orderNo));
        dataStore.saveCollection?.('refunds', dataStore.getCollection('refunds')
            .filter((row) => String(row._id || row.id) !== refundId));
        dataStore.saveCollection?.('commissions', dataStore.getCollection('commissions')
            .filter((row) => String(row.order_id || row.order_no) !== orderId && String(row.order_no || '') !== orderNo));
        dataStore.saveCollection?.('wallet_accounts', dataStore.getCollection('wallet_accounts')
            .filter((row) => String(row._id || row.id) !== walletId));
        dataStore.saveCollection?.('wallet_logs', dataStore.getCollection('wallet_logs')
            .filter((row) => String(row.ref_id || row.refund_id || '').indexOf(tempPrefix) === -1));
        dataStore.saveCollection?.('goods_fund_logs', dataStore.getCollection('goods_fund_logs')
            .filter((row) => String(row.order_no || row.order_id || '').indexOf(tempPrefix) === -1));
    };

    cleanup();
    dataStore.saveCollection?.('users', dataStore.getCollection('users').concat({
        _id: `${tempPrefix}-user`,
        id: `${tempPrefix}-user`,
        openid: userOpenid,
        nickname: '退货退款确认收货测试用户',
        agent_wallet_balance: 0,
        wallet_balance: 0,
        status: 1
    }));
    dataStore.saveCollection?.('users', dataStore.getCollection('users').concat({
        _id: `${tempPrefix}-store-user`,
        id: `${tempPrefix}-store-user`,
        openid: storeOpenid,
        nickname: '退款开发费门店',
        balance: 0,
        commission_balance: 0,
        status: 1
    }));
    dataStore.saveCollection?.('wallet_accounts', dataStore.getCollection('wallet_accounts').concat({
        _id: walletId,
        id: walletId,
        user_id: `${tempPrefix}-user`,
        openid: userOpenid,
        balance: 0,
        account_type: 'goods_fund',
        status: 'active'
    }));
    dataStore.saveCollection?.('orders', dataStore.getCollection('orders').concat({
        _id: orderId,
        id: orderId,
        order_no: orderNo,
        openid: userOpenid,
        status: 'paid',
        payment_method: 'goods_fund',
        pay_amount: 20,
        actual_price: 20,
        total_amount: 20,
        paid_at: '2026-04-24T00:00:00.000Z'
    }));
    dataStore.saveCollection?.('refunds', dataStore.getCollection('refunds').concat({
        _id: refundId,
        id: refundId,
        order_id: orderId,
        order_no: orderNo,
        openid: userOpenid,
        status: 'approved',
        type: 'return_refund',
        amount: 20,
        cash_refund_amount: 20,
        refund_quantity_effective: 1,
        payment_method: 'goods_fund',
        return_company: '顺丰速运',
        return_tracking_no: `${tempPrefix}-tracking`,
        created_at: '2026-04-24T00:10:00.000Z'
    }));
    dataStore.saveCollection?.('commissions', dataStore.getCollection('commissions').concat({
        _id: `${tempPrefix}-same-level`,
        id: `${tempPrefix}-same-level`,
        order_id: orderId,
        order_no: orderNo,
        openid: storeOpenid,
        user_id: `${tempPrefix}-store-user`,
        type: 'same_level',
        status: 'frozen',
        bonus_role_level: 6,
        amount: 4
    }));

    try {
        const response = await invoke(`/admin/api/refunds/${refundId}/complete`, {
            method: 'PUT',
            admin
        });

        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        const refund = dataStore.getCollection('refunds').find((row) => String(row._id || row.id) === refundId);
        assert.equal(refund?.status, 'completed');
        assert.ok(refund?.return_received_at, 'expected return_received_at to be written');
        assert.equal(refund?.return_tracking_no, `${tempPrefix}-tracking`);
        const user = dataStore.getCollection('users').find((row) => String(row.openid) === userOpenid);
        assert.equal(Number(user?.agent_wallet_balance), 20);
        assert.equal(Number(user?.wallet_balance), 20);
        const devFee = dataStore.getCollection('commissions').find((row) => String(row.type) === 'refund_dev_fee' && String(row.refund_id) === refundId);
        assert.equal(devFee?.openid, storeOpenid);
        assert.equal(devFee?.user_id, `${tempPrefix}-store-user`);
        assert.equal(Number(devFee?.amount), 0.3);
        assert.equal(devFee?.source_commission_id, `${tempPrefix}-same-level`);
    } finally {
        cleanup();
    }
});

test('PUT /admin/api/refunds/:id/approve snapshots return address and GET /refunds searches return tracking', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const tempPrefix = 'test-return-refund-snapshot';
    const orderId = `${tempPrefix}-order`;
    const orderNo = `${tempPrefix}-no`;
    const refundId = `${tempPrefix}-refund`;
    const userOpenid = `${tempPrefix}-openid`;
    const trackingNo = `${tempPrefix}-tracking`;
    const configId = `${tempPrefix}-config`;
    const cleanup = () => {
        dataStore.saveCollection?.('users', dataStore.getCollection('users')
            .filter((row) => String(row.openid || row.id || row._id) !== userOpenid));
        dataStore.saveCollection?.('orders', dataStore.getCollection('orders')
            .filter((row) => String(row._id || row.id || row.order_no) !== orderId && String(row.order_no || '') !== orderNo));
        dataStore.saveCollection?.('refunds', dataStore.getCollection('refunds')
            .filter((row) => String(row._id || row.id) !== refundId));
        dataStore.saveCollection?.('configs', dataStore.getCollection('configs')
            .filter((row) => String(row._id || row.id) !== configId));
    };

    cleanup();
    dataStore.saveCollection?.('configs', dataStore.getCollection('configs').concat({
        _id: configId,
        id: configId,
        config_key: 'mini_program_config',
        key: 'mini_program_config',
        config_value: {
            logistics_config: {
                return_address: {
                    receiver_name: '测试售后仓',
                    receiver_phone: '13800000000',
                    province: '浙江省',
                    city: '杭州市',
                    district: '西湖区',
                    detail: '测试路 1 号',
                    postal_code: '310000',
                    note: '请保留快递底单'
                }
            }
        },
        active: true,
        updated_at: '2099-01-01T00:00:00.000Z',
        created_at: '2099-01-01T00:00:00.000Z'
    }));
    dataStore.saveCollection?.('users', dataStore.getCollection('users').concat({
        _id: `${tempPrefix}-user`,
        id: `${tempPrefix}-user`,
        openid: userOpenid,
        nickname: '退货地址快照用户',
        phone: '13900000000',
        status: 1
    }));
    dataStore.saveCollection?.('orders', dataStore.getCollection('orders').concat({
        _id: orderId,
        id: orderId,
        order_no: orderNo,
        openid: userOpenid,
        status: 'paid',
        payment_method: 'goods_fund',
        pay_amount: 20,
        actual_price: 20,
        total_amount: 20,
        paid_at: '2026-04-24T00:00:00.000Z'
    }));
    dataStore.saveCollection?.('refunds', dataStore.getCollection('refunds').concat({
        _id: refundId,
        id: refundId,
        order_id: orderId,
        order_no: orderNo,
        openid: userOpenid,
        status: 'pending',
        type: 'return_refund',
        amount: 20,
        cash_refund_amount: 20,
        refund_quantity_effective: 1,
        payment_method: 'goods_fund',
        return_company: '顺丰速运',
        return_tracking_no: trackingNo,
        created_at: '2026-04-24T00:10:00.000Z'
    }));

    try {
        const approveResponse = await invoke(`/admin/api/refunds/${refundId}/approve`, {
            method: 'PUT',
            admin
        });
        assert.equal(approveResponse.statusCode, 200, approveResponse.body?.message || JSON.stringify(approveResponse.body));
        const refund = dataStore.getCollection('refunds').find((row) => String(row._id || row.id) === refundId);
        assert.equal(refund?.status, 'approved');
        assert.equal(refund?.return_address?.receiver_name, '测试售后仓');
        assert.equal(refund?.return_address?.detail, '测试路 1 号');

        const searchResponse = await invoke('/admin/api/refunds', {
            admin,
            query: { keyword: trackingNo }
        });
        assert.equal(searchResponse.statusCode, 200, searchResponse.body?.message || JSON.stringify(searchResponse.body));
        const list = searchResponse.body.data?.list || searchResponse.body.data?.data?.list || [];
        assert.ok(list.some((row) => String(row.id || row._id) === refundId), 'expected return tracking keyword to find refund');
    } finally {
        cleanup();
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

test('GET /admin/api/finance/overview includes upgrade piggy bank summary', async () => {
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const tempPrefix = 'test-finance-piggy';
    const userId = `${tempPrefix}-user`;
    const userOpenid = `${tempPrefix}-openid`;
    const removeTemps = () => {
        dataStore.saveCollection?.(
            'users',
            dataStore.getCollection('users').filter((row) => !String(row?._id || row?.id).startsWith(tempPrefix))
        );
        dataStore.saveCollection?.(
            'upgrade_piggy_bank_logs',
            dataStore.getCollection('upgrade_piggy_bank_logs').filter((row) => !String(row?._id || row?.id).startsWith(tempPrefix))
        );
    };

    removeTemps();
    dataStore.saveCollection?.(
        'users',
        [
            ...dataStore.getCollection('users'),
            {
                _id: userId,
                id: userId,
                openid: userOpenid,
                nickname: 'piggy finance account',
                role_level: 2,
                status: 1
            }
        ]
    );
    dataStore.saveCollection?.(
        'upgrade_piggy_bank_logs',
        [
            ...dataStore.getCollection('upgrade_piggy_bank_logs'),
            {
                _id: `${tempPrefix}-locked`,
                openid: userOpenid,
                user_id: userId,
                status: 'locked',
                incremental_amount: 12.5,
                created_at: '2026-04-24T10:00:00+08:00'
            },
            {
                _id: `${tempPrefix}-unlocked`,
                openid: userOpenid,
                user_id: userId,
                status: 'unlocked',
                incremental_amount: 8,
                created_at: '2026-04-24T10:05:00+08:00'
            },
            {
                _id: `${tempPrefix}-reversed`,
                openid: userOpenid,
                user_id: userId,
                status: 'reversed',
                incremental_amount: 3,
                created_at: '2026-04-24T10:10:00+08:00'
            },
            {
                _id: `${tempPrefix}-clawed`,
                openid: userOpenid,
                user_id: userId,
                status: 'clawed_back',
                incremental_amount: 2,
                created_at: '2026-04-24T10:15:00+08:00'
            }
        ]
    );

    try {
        const response = await invoke('/admin/api/finance/overview', { admin });
        assert.equal(response.statusCode, 200);
        const piggyBank = response.body.data?.upgrade_piggy_bank || {};
        assert.equal(Number(piggyBank.locked_amount), 12.5);
        assert.equal(Number(piggyBank.unlocked_amount), 8);
        assert.equal(Number(piggyBank.reversed_amount), 3);
        assert.equal(Number(piggyBank.clawed_back_amount), 2);
        assert.equal(Number(piggyBank.total_count), 4);
        assert.equal(piggyBank.top_users?.[0]?.user_id, userId);
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

test('GET /admin/api/logistics/order/:id returns normalized stored logistics aliases and traces', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const tempPrefix = 'test-admin-logistics-alias';
    const orderId = `${tempPrefix}-order`;
    const orderNo = `${tempPrefix}-no`;
    const trackingNo = `${tempPrefix}-tracking`;
    const cleanup = () => {
        dataStore.saveCollection?.('orders', dataStore.getCollection('orders')
            .filter((row) => String(row._id || row.id || row.order_no) !== orderId && String(row.order_no || '') !== orderNo));
    };

    cleanup();
    dataStore.saveCollection?.('orders', dataStore.getCollection('orders').concat({
        _id: orderId,
        id: orderId,
        order_no: orderNo,
        openid: `${tempPrefix}-openid`,
        status: 'shipped',
        pay_amount: 20,
        total_amount: 20,
        shipping_company: '中通快递',
        shipping_tracking_no: trackingNo,
        created_at: '2026-04-24T00:00:00.000Z',
        paid_at: '2026-04-24T00:01:00.000Z',
        shipped_at: '2026-04-24T00:02:00.000Z',
        shipping_traces: [
            { time: '2026-04-24T00:03:00.000Z', status_text: '已揽收', status: 'collecting' },
            { time: '2026-04-24T00:04:00.000Z', desc: '运输中', status: 'in_transit' }
        ]
    }));

    try {
        const detailResponse = await invoke(`/admin/api/orders/${orderId}`, { admin });
        assert.equal(detailResponse.statusCode, 200, detailResponse.body?.message || JSON.stringify(detailResponse.body));
        assert.equal(detailResponse.body.data?.tracking_no, trackingNo);
        assert.equal(detailResponse.body.data?.logistics_company, '中通快递');
        assert.equal(detailResponse.body.data?._logistics?.traces?.[0]?.desc, '运输中');

        const response = await invoke(`/admin/api/logistics/order/${orderNo}`, { admin });
        assert.equal(response.statusCode, 200, response.body?.message || JSON.stringify(response.body));
        assert.equal(response.body.data?.order_id, orderId);
        assert.equal(response.body.data?.order_no, orderNo);
        assert.equal(response.body.data?.tracking_no, trackingNo);
        assert.equal(response.body.data?.logistics_company, '中通快递');
        assert.equal(response.body.data?.status, 'in_transit');
        assert.equal(response.body.data?.statusText, '运输中');
        assert.equal(response.body.data?.traces?.length, 2);
        assert.equal(response.body.data?.traces?.[0]?.desc, '运输中');
    } finally {
        cleanup();
    }
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

test('PUT /admin/api/withdrawals/:id/complete rejects records with existing WeChat transfer markers', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const rows = dataStore.getCollection('withdrawals');
    const tempId = 'test-withdrawal-repeat-transfer';
    rows.push({
        _id: tempId,
        id: tempId,
        openid: 'test-withdrawal-openid',
        status: 'approved',
        type: 'wechat',
        amount: 10,
        actual_amount: 10,
        wx_out_batch_no: 'WDBEXISTINGBATCH',
        created_at: '2026-04-25T00:00:00.000Z',
        updated_at: '2026-04-25T00:00:00.000Z'
    });
    dataStore.saveCollection('withdrawals', rows);

    const response = await invoke(`/admin/api/withdrawals/${tempId}/complete`, {
        method: 'PUT',
        admin,
        body: { remark: '测试重复打款拦截' }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.match(response.body.message || '', /已发起微信提现/);
});

test('PUT /admin/api/withdrawals/:id/reject rejects approved records after WeChat transfer request starts', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const dataStore = app.locals.dataStore;
    const rows = dataStore.getCollection('withdrawals');
    const tempId = 'test-withdrawal-reject-started';
    rows.push({
        _id: tempId,
        id: tempId,
        openid: 'test-withdrawal-openid',
        status: 'approved',
        type: 'wechat',
        amount: 10,
        actual_amount: 10,
        wx_transfer_requested_at: '2026-04-25T00:00:00.000Z',
        created_at: '2026-04-25T00:00:00.000Z',
        updated_at: '2026-04-25T00:00:00.000Z'
    });
    dataStore.saveCollection('withdrawals', rows);

    const response = await invoke(`/admin/api/withdrawals/${tempId}/reject`, {
        method: 'PUT',
        admin,
        body: { reason: '测试已发起打款后禁止驳回' }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.match(response.body.message || '', /已发起微信提现/);
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

test('GET /admin/api/commissions respects start_date and end_date', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const commissions = app.locals.dataStore.getCollection('commissions');
    const oldCommission = {
        _id: 'test-commission-date-old',
        id: 999309,
        openid: 'test-openid-commission-date-old',
        user_id: 999310,
        order_id: 'ORDER-COMMISSION-DATE-OLD',
        order_no: 'ORDER-COMMISSION-DATE-OLD',
        amount: 8,
        status: 'pending_approval',
        type: 'direct',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z'
    };
    const newCommission = {
        _id: 'test-commission-date-new',
        id: 999311,
        openid: 'test-openid-commission-date-new',
        user_id: 999312,
        order_id: 'ORDER-COMMISSION-DATE-NEW',
        order_no: 'ORDER-COMMISSION-DATE-NEW',
        amount: 9,
        status: 'pending_approval',
        type: 'direct',
        created_at: '2026-05-02T00:00:00.000Z',
        updated_at: '2026-05-02T00:00:00.000Z'
    };
    commissions.push(oldCommission, newCommission);
    app.locals.dataStore.saveCollection?.('commissions', commissions);

    try {
        const response = await invoke('/admin/api/commissions?start_date=2026-05-01&end_date=2026-05-03&limit=100', {
            method: 'GET',
            admin
        });

        assert.equal(response.statusCode, 200);
        const list = response.body.data?.list || response.body.data?.data?.list || [];
        assert.equal(list.some((row) => String(row.id) === String(newCommission.id)), true);
        assert.equal(list.some((row) => String(row.id) === String(oldCommission.id)), false);
    } finally {
        app.locals.dataStore.saveCollection?.(
            'commissions',
            app.locals.dataStore.getCollection('commissions')
                .filter((row) => ![oldCommission.id, newCommission.id].some((id) => String(row.id) === String(id)))
        );
    }
});

test('POST /admin/api/refunds/batch-approve approves pending refunds', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const refunds = app.locals.dataStore.getCollection('refunds');
    const tempRefund = {
        _id: 'test-refund-batch-approve',
        id: 999313,
        order_id: 'ORDER-REFUND-BATCH-APPROVE',
        order_no: 'ORDER-REFUND-BATCH-APPROVE',
        amount: 18,
        status: 'pending',
        reason: 'test',
        created_at: '2026-05-02T00:00:00.000Z',
        updated_at: '2026-05-02T00:00:00.000Z'
    };
    refunds.push(tempRefund);
    app.locals.dataStore.saveCollection?.('refunds', refunds);

    try {
        const response = await invoke('/admin/api/refunds/batch-approve', {
            method: 'POST',
            admin,
            body: { ids: [tempRefund.id] }
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.data?.data?.affected, 1);
        const updatedRefund = app.locals.dataStore.getCollection('refunds').find((row) => String(row.id) === String(tempRefund.id));
        assert.equal(updatedRefund.status, 'approved');
    } finally {
        app.locals.dataStore.saveCollection?.(
            'refunds',
            app.locals.dataStore.getCollection('refunds').filter((row) => String(row.id) !== String(tempRefund.id))
        );
    }
});

test('POST /admin/api/withdrawals/batch-approve approves pending withdrawals', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const withdrawals = app.locals.dataStore.getCollection('withdrawals');
    const tempWithdrawal = {
        _id: 'test-withdrawal-batch-approve',
        id: 999314,
        openid: 'test-openid-withdrawal-batch-approve',
        user_id: 999315,
        amount: 20,
        actual_amount: 20,
        status: 'pending',
        method: 'wechat',
        created_at: '2026-05-02T00:00:00.000Z',
        updated_at: '2026-05-02T00:00:00.000Z'
    };
    withdrawals.push(tempWithdrawal);
    app.locals.dataStore.saveCollection?.('withdrawals', withdrawals);

    try {
        const response = await invoke('/admin/api/withdrawals/batch-approve', {
            method: 'POST',
            admin,
            body: { ids: [tempWithdrawal.id] }
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.data?.data?.affected, 1);
        const updatedWithdrawal = app.locals.dataStore.getCollection('withdrawals').find((row) => String(row.id) === String(tempWithdrawal.id));
        assert.equal(updatedWithdrawal.status, 'approved');
    } finally {
        app.locals.dataStore.saveCollection?.(
            'withdrawals',
            app.locals.dataStore.getCollection('withdrawals').filter((row) => String(row.id) !== String(tempWithdrawal.id))
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
