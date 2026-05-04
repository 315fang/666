'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function clone(row) {
    return row && typeof row === 'object' ? { ...row } : row;
}

function matchesExpected(actual, expected) {
    if (expected && expected.__op === 'neq') return actual !== expected.value;
    if (expected && expected.__op === 'or') {
        return expected.conditions.some((condition) => matchesQuery({ value: actual }, { value: condition }));
    }
    return String(actual) === String(expected);
}

function matchesQuery(row, query = {}) {
    if (query && query.__op === 'or') {
        return query.conditions.some((condition) => matchesQuery(row, condition));
    }
    return Object.entries(query || {}).every(([key, expected]) => matchesExpected(row[key], expected));
}

function applyPatch(row, data = {}) {
    Object.entries(data).forEach(([key, value]) => {
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

function createCollection(name, rows = [], options = {}) {
    function createQuery(query = {}, limitCount = Infinity) {
        const scopedRows = () => rows.filter((row) => matchesQuery(row, query));
        return {
            where: (nextQuery = {}) => createQuery(nextQuery.__op === 'or' ? nextQuery : { ...query, ...nextQuery }, limitCount),
            limit: (nextLimit) => createQuery(query, nextLimit),
            get: async () => ({ data: scopedRows().slice(0, limitCount).map(clone) }),
            update: async ({ data } = {}) => {
                if (name === 'orders' && options.failReviewClaim && query.reviewed && query.reviewed.__op === 'neq') {
                    return { stats: { updated: 0 } };
                }
                const matched = scopedRows();
                matched.forEach((row) => applyPatch(row, data));
                return { stats: { updated: matched.length } };
            }
        };
    }
    return {
        ...createQuery(),
        doc: (id) => ({
            get: async () => ({ data: clone(rows.find((row) => String(row._id) === String(id)) || null) }),
            update: async ({ data } = {}) => {
                const row = rows.find((item) => String(item._id) === String(id));
                if (row) applyPatch(row, data);
                return { stats: { updated: row ? 1 : 0 } };
            },
            remove: async () => {
                const index = rows.findIndex((item) => String(item._id) === String(id));
                if (index >= 0) rows.splice(index, 1);
                return { stats: { removed: index >= 0 ? 1 : 0 } };
            }
        }),
        add: async ({ data } = {}) => {
            const row = { _id: `${name}-${rows.length + 1}`, ...data };
            rows.push(row);
            return { _id: row._id };
        }
    };
}

function createDb(options = {}) {
    const collections = {
        orders: [{
            _id: 'order-1',
            openid: 'buyer-openid',
            status: 'completed',
            items: [{ product_id: 'product-1', name: '商品1' }],
            reviewed: false
        }],
        reviews: [],
        users: [{ _id: 'user-1', openid: 'buyer-openid', points: 5, growth_value: 99 }],
        point_logs: [],
        configs: [],
        app_configs: []
    };
    const db = {
        command: {
            inc: (value) => ({ __op: 'inc', value }),
            neq: (value) => ({ __op: 'neq', value }),
            or: (conditions) => ({ __op: 'or', conditions }),
            in: (values) => ({ __op: 'in', values }),
            gte: (value) => ({ __op: 'gte', value }),
            remove: () => ({ __op: 'remove' })
        },
        serverDate: () => new Date('2026-05-04T00:00:00.000Z'),
        collection: (name) => createCollection(name, collections[name] || [], options)
    };
    return { db, collections };
}

function loadOrderLifecycle(db) {
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

    const modules = [
        require.resolve('../order-lifecycle'),
        require.resolve('../order-query'),
        require.resolve('../order-coupon'),
        require.resolve('../pickup-station-stock')
    ];
    modules.forEach((modulePath) => { delete require.cache[modulePath]; });
    try {
        return require('../order-lifecycle');
    } finally {
        Module._load = originalLoad;
        modules.forEach((modulePath) => { delete require.cache[modulePath]; });
    }
}

test('review reward marks order once and awards points without touching growth', async () => {
    const { db, collections } = createDb();
    const lifecycle = loadOrderLifecycle(db);

    const result = await lifecycle.reviewOrder('buyer-openid', 'order-1', {
        rating: 5,
        content: '不错',
        images: []
    });

    assert.equal(result.success, true);
    assert.equal(result.bonus_points, 10);
    assert.equal(collections.orders[0].reviewed, true);
    assert.equal(collections.users[0].points, 15);
    assert.equal(collections.users[0].growth_value, 99);
    assert.equal(collections.point_logs[0].source, 'review');
});

test('review reward claim failure removes transient reviews and does not award points', async () => {
    const { db, collections } = createDb({ failReviewClaim: true });
    const lifecycle = loadOrderLifecycle(db);

    await assert.rejects(
        () => lifecycle.reviewOrder('buyer-openid', 'order-1', {
            rating: 5,
            content: '并发评价',
            images: []
        }),
        /该订单已评价/
    );

    assert.equal(collections.reviews.length, 0);
    assert.equal(collections.users[0].points, 5);
    assert.equal(collections.users[0].growth_value, 99);
    assert.equal(collections.point_logs.length, 0);
});
