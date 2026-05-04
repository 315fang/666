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

function getEnabledAdmin() {
    const admins = app.locals.dataStore.getCollection('admins');
    const admin = admins.find((row) => row && (row.status === 1 || row.status === true || row.status === '1'));
    assert.ok(admin, 'expected at least one enabled admin in seed data');
    return admin;
}

function createAdminToken(admin) {
    return jwt.sign(
        { id: admin.id || admin._legacy_id, username: admin.username, role: admin.role },
        jwtSecret,
        { expiresIn: '1h' }
    );
}

async function invoke(path, { method = 'GET', body, admin } = {}) {
    await ensureReady();
    const request = createRequest({
        method,
        url: path,
        originalUrl: path,
        path,
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

test('refund complete uses growth_earned snapshot and debt-based commission clawback', async () => {
    await ensureReady();
    const admin = getEnabledAdmin();
    const store = app.locals.dataStore;
    const users = store.getCollection('users');
    const orders = store.getCollection('orders');
    const refunds = store.getCollection('refunds');
    const commissions = store.getCollection('commissions');

    const buyer = {
        _id: 'test-refund-settlement-buyer',
        id: 991001,
        openid: 'test-refund-settlement-buyer-openid',
        nickname: 'refund-buyer',
        points: 3,
        growth_value: 100,
        total_spent: 100,
        order_count: 1,
        balance: 0,
        commission_balance: 0,
        total_earned: 0,
        debt_amount: 0,
        created_at: '2026-05-04T00:00:00.000Z',
        updated_at: '2026-05-04T00:00:00.000Z'
    };
    const agent = {
        _id: 'test-refund-settlement-agent',
        id: 991002,
        openid: 'test-refund-settlement-agent-openid',
        nickname: 'refund-agent',
        points: 0,
        growth_value: 0,
        balance: 5,
        commission_balance: 5,
        total_earned: 5,
        debt_amount: 0,
        created_at: '2026-05-04T00:00:00.000Z',
        updated_at: '2026-05-04T00:00:00.000Z'
    };
    const order = {
        _id: 'test-refund-settlement-order',
        id: 991003,
        order_no: 'TEST-REFUND-SETTLEMENT',
        openid: buyer.openid,
        status: 'paid',
        payment_method: 'wallet',
        pay_amount: 100,
        actual_price: 100,
        total_amount: 100,
        points_earned: 10,
        growth_earned: 20,
        quantity: 2,
        refunded_cash_total: 0,
        refunded_quantity_total: 0,
        items: [{
            refund_item_key: 'product-1::nosku::0',
            product_id: 'product-1',
            sku_id: '',
            quantity: 2,
            item_amount: 100,
            cash_paid_allocated_amount: 100,
            refunded_quantity: 0,
            refunded_cash_amount: 0,
            refund_basis_version: 'snapshot_v1'
        }],
        created_at: '2026-05-04T00:00:00.000Z',
        updated_at: '2026-05-04T00:00:00.000Z'
    };
    const refund = {
        _id: 'test-refund-settlement-refund',
        id: 991004,
        order_id: order._id,
        order_no: order.order_no,
        openid: buyer.openid,
        refund_no: 'TEST-REFUND-SETTLEMENT-RF',
        status: 'approved',
        amount: 50,
        refund_amount: 50,
        type: 'refund_only',
        payment_method: 'wallet',
        refund_quantity_effective: 1,
        refund_items: [{
            refund_item_key: 'product-1::nosku::0',
            product_id: 'product-1',
            sku_id: '',
            quantity: 1,
            cash_refund_amount: 50
        }],
        created_at: '2026-05-04T00:00:00.000Z',
        updated_at: '2026-05-04T00:00:00.000Z'
    };
    const commission = {
        _id: 'test-refund-settlement-commission',
        id: 991005,
        order_id: order._id,
        order_no: order.order_no,
        openid: agent.openid,
        user_id: agent.id,
        amount: 12,
        status: 'settled',
        type: 'direct',
        created_at: '2026-05-04T00:00:00.000Z',
        updated_at: '2026-05-04T00:00:00.000Z'
    };

    users.push(buyer, agent);
    orders.push(order);
    refunds.push(refund);
    commissions.push(commission);
    store.saveCollection?.('users', users);
    store.saveCollection?.('orders', orders);
    store.saveCollection?.('refunds', refunds);
    store.saveCollection?.('commissions', commissions);

    try {
        const response = await invoke(`/admin/api/refunds/${refund.id}/complete`, {
            method: 'PUT',
            admin,
            body: {}
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.success, true);

        const updatedBuyer = store.getCollection('users').find((row) => String(row.id) === String(buyer.id));
        const updatedAgent = store.getCollection('users').find((row) => String(row.id) === String(agent.id));
        const updatedRefund = store.getCollection('refunds').find((row) => String(row.id) === String(refund.id));
        const updatedCommission = store.getCollection('commissions').find((row) => String(row.id) === String(commission.id));

        assert.equal(updatedBuyer.points, -2);
        assert.equal(updatedBuyer.growth_value, 90);
        assert.equal(updatedRefund.growth_clawback_amount, 10);
        assert.equal(updatedRefund.growth_clawback_basis, 'order_growth_earned');
        assert.equal(updatedAgent.balance, 0);
        assert.equal(updatedAgent.commission_balance, 0);
        assert.equal(updatedAgent.debt_amount, 7);
        assert.equal(updatedCommission.status, 'cancelled');
        assert.equal(updatedCommission.clawback_debited, 5);
        assert.equal(updatedCommission.clawback_debt_added, 7);
        assert.equal(updatedCommission.commission_cancel_scope, 'whole_order_on_any_refund');
    } finally {
        store.saveCollection?.('users', store.getCollection('users').filter((row) => ![buyer.id, agent.id].some((id) => String(row.id) === String(id))));
        store.saveCollection?.('orders', store.getCollection('orders').filter((row) => String(row.id) !== String(order.id)));
        store.saveCollection?.('refunds', store.getCollection('refunds').filter((row) => String(row.id) !== String(refund.id)));
        store.saveCollection?.('commissions', store.getCollection('commissions').filter((row) => String(row.id) !== String(commission.id)));
    }
});
