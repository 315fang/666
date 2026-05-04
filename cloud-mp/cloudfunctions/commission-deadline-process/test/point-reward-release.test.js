'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function clone(row) {
    return row && typeof row === 'object' ? { ...row } : row;
}

function matchesExpected(actual, expected) {
    if (expected && expected.__op === 'in') {
        return expected.values.map(String).includes(String(actual));
    }
    if (expected && expected.__op === 'lte') {
        return new Date(actual).getTime() <= new Date(expected.value).getTime();
    }
    if (expected && expected.__op === 'exists') {
        return expected.value ? actual !== undefined : actual === undefined;
    }
    return String(actual) === String(expected);
}

function matchesQuery(row = {}, query = {}) {
    return Object.entries(query || {}).every(([key, expected]) => matchesExpected(row[key], expected));
}

function applyPatch(row, data = {}) {
    Object.entries(data || {}).forEach(([key, value]) => {
        if (value && value.__op === 'inc') {
            row[key] = Number(row[key] || 0) + value.value;
            return;
        }
        if (value && value.__op === 'remove') {
            delete row[key];
            return;
        }
        row[key] = value;
    });
}

function createCollection(rows = []) {
    function query(where = {}, limitCount = Infinity) {
        const scopedRows = () => rows.filter((row) => matchesQuery(row, where));
        return {
            limit: (nextLimit) => query(where, nextLimit),
            get: async () => ({ data: scopedRows().slice(0, limitCount).map(clone) }),
            update: async ({ data } = {}) => {
                const matched = scopedRows();
                matched.forEach((row) => applyPatch(row, data));
                return { stats: { updated: matched.length } };
            }
        };
    }
    return {
        where: (where) => query(where),
        doc: (id) => ({
            get: async () => ({ data: clone(rows.find((row) => String(row._id || row.id) === String(id)) || null) }),
            update: async ({ data } = {}) => {
                const row = rows.find((item) => String(item._id || item.id) === String(id));
                if (row) applyPatch(row, data);
                return { stats: { updated: row ? 1 : 0 } };
            }
        })
    };
}

function createDb(collections) {
    return {
        command: {
            inc: (value) => ({ __op: 'inc', value }),
            in: (values) => ({ __op: 'in', values }),
            lte: (value) => ({ __op: 'lte', value }),
            exists: (value) => ({ __op: 'exists', value }),
            remove: () => ({ __op: 'remove' })
        },
        serverDate: () => new Date('2026-05-04T00:00:00.000Z'),
        collection: (name) => createCollection(collections[name] || [])
    };
}

function loadDeadlineProcess(db) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => db
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../index');
    delete require.cache[modulePath];
    try {
        return require('../index');
    } finally {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    }
}

function baseCollections(overrides = {}) {
    return {
        commissions: [],
        refunds: [],
        users: [{ _id: 'user-1', openid: 'buyer-openid', points: overrides.userPoints ?? -2 }],
        orders: [{
            _id: 'order-1',
            order_no: 'ORD-1',
            openid: 'buyer-openid',
            status: overrides.orderStatus || 'completed',
            pay_amount: 100,
            points_earned: 10,
            reward_points_released_total: 0,
            refunded_cash_total: overrides.refundedCash || 0,
            confirmed_at: '2026-05-01T00:00:00.000Z'
        }],
        point_logs: [{
            _id: 'point-log-1',
            openid: 'buyer-openid',
            type: 'earn',
            source: 'order_pay',
            status: 'frozen',
            order_id: 'order-1',
            amount: 10,
            original_amount: 10,
            release_at: new Date('2026-05-03T00:00:00.000Z')
        }]
    };
}

test('deadline process releases frozen order points after completion and refund window', async () => {
    const collections = baseCollections();
    const mod = loadDeadlineProcess(createDb(collections));

    const result = await mod.main();

    assert.equal(result.pointsReleased, 10);
    assert.equal(collections.users[0].points, 8);
    assert.equal(collections.point_logs[0].status, 'released');
    assert.equal(collections.point_logs[0].released_amount, 10);
    assert.equal(collections.orders[0].reward_points_released_total, 10);
    assert.equal(collections.orders[0].points_award_status, 'released');
});

test('deadline process releases only the non-refunded portion of frozen order points', async () => {
    const collections = baseCollections({ userPoints: 0, refundedCash: 40 });
    const mod = loadDeadlineProcess(createDb(collections));

    const result = await mod.main();

    assert.equal(result.pointsReleased, 6);
    assert.equal(collections.users[0].points, 6);
    assert.equal(collections.point_logs[0].status, 'released');
    assert.equal(collections.point_logs[0].amount, 6);
    assert.equal(collections.point_logs[0].cancelled_amount, 4);
    assert.equal(collections.orders[0].reward_points_released_total, 6);
    assert.equal(collections.orders[0].points_award_status, 'partially_released');
});

test('deadline process waits for order completion before releasing partial-refund points', async () => {
    const collections = baseCollections({ userPoints: 0, refundedCash: 40 });
    collections.orders[0].status = 'paid';
    delete collections.orders[0].confirmed_at;
    const mod = loadDeadlineProcess(createDb(collections));

    const result = await mod.main();

    assert.equal(result.pointsReleased, 0);
    assert.equal(collections.users[0].points, 0);
    assert.equal(collections.point_logs[0].status, 'frozen');
    assert.equal(collections.orders[0].reward_points_released_total, 0);
});

test('deadline process cancels frozen order points for refunded orders', async () => {
    const collections = baseCollections({ userPoints: 0, orderStatus: 'refunded', refundedCash: 100 });
    const mod = loadDeadlineProcess(createDb(collections));

    const result = await mod.main();

    assert.equal(result.pointsReleased, 0);
    assert.equal(result.pointsCancelled, 10);
    assert.equal(collections.users[0].points, 0);
    assert.equal(collections.point_logs[0].status, 'cancelled');
    assert.equal(collections.point_logs[0].amount, 0);
    assert.equal(collections.orders[0].reward_points_released_total, 0);
    assert.equal(collections.orders[0].points_award_status, 'cancelled');
});
