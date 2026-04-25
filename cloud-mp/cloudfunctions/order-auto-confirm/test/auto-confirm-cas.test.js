'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadAutoConfirm(db) {
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
    }
}

function createDb(options = {}) {
    const state = {
        refundWhere: null,
        orderUpdateWhere: null,
        orderUpdateData: null,
        commissionQueryCount: 0,
        ...options
    };
    const command = {
        lte: (value) => ({ op: 'lte', value }),
        in: (value) => ({ op: 'in', value }),
        and: (value) => ({ op: 'and', value }),
        or: (value) => ({ op: 'or', value })
    };
    const db = {
        command,
        serverDate: () => new Date('2026-04-25T00:00:00.000Z'),
        collection: (name) => ({
            where: (query) => ({
                limit: () => ({
                    get: async () => {
                        if (name === 'orders') return { data: state.orders || [] };
                        if (name === 'refunds') {
                            state.refundWhere = query;
                            return { data: state.refunds || [] };
                        }
                        return { data: [] };
                    }
                }),
                get: async () => {
                    if (name === 'commissions') {
                        state.commissionQueryCount += 1;
                        return { data: state.commissions || [] };
                    }
                    return { data: [] };
                },
                update: async ({ data }) => {
                    if (name === 'orders') {
                        state.orderUpdateWhere = query;
                        state.orderUpdateData = data;
                        return { stats: { updated: state.orderUpdateCount ?? 1 } };
                    }
                    return { stats: { updated: 0 } };
                }
            }),
            doc: (id) => ({
                update: async ({ data }) => {
                    state.docUpdates = state.docUpdates || [];
                    state.docUpdates.push({ collection: name, id, data });
                    return { stats: { updated: 1 } };
                }
            })
        })
    };
    return { db, state };
}

test('auto confirm skips completion side effects when shipped CAS misses', async () => {
    const { db, state } = createDb({
        orders: [{ _id: 'order-1', order_no: 'NO-1', status: 'shipped' }],
        refunds: [],
        orderUpdateCount: 0
    });
    const autoConfirm = loadAutoConfirm(db);

    const result = await autoConfirm.main();

    assert.equal(result.confirmed, 0);
    assert.deepEqual(state.orderUpdateWhere, { _id: 'order-1', status: 'shipped' });
    assert.equal(state.commissionQueryCount, 0);
});

test('auto confirm checks active refunds by both order id and order no', async () => {
    const { db, state } = createDb({
        orders: [{ _id: 'order-1', order_no: 'NO-1', status: 'shipped' }],
        refunds: [{ _id: 'refund-1', order_no: 'NO-1', status: 'pending' }]
    });
    const autoConfirm = loadAutoConfirm(db);

    const result = await autoConfirm.main();

    assert.equal(result.confirmed, 0);
    assert.match(JSON.stringify(state.refundWhere), /NO-1/);
    assert.equal(state.orderUpdateWhere, null);
});
