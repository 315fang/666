'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('group expired refund policy includes historical paid and refunding states', () => {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => ({
                    command: {
                        in: (value) => value,
                        remove: () => ({})
                    },
                    collection: () => ({
                        doc: () => ({
                            update: async () => ({ stats: { updated: 0 } }),
                            get: async () => ({ data: null })
                        }),
                        where: () => ({
                            limit: () => ({
                                get: async () => ({ data: [] })
                            }),
                            update: async () => ({ stats: { updated: 0 } }),
                            orderBy: () => ({
                                limit: () => ({
                                    get: async () => ({ data: [] })
                                })
                            })
                        }),
                        add: async () => ({ _id: 'mock-id' })
                    })
                }),
                callFunction: async () => ({ result: { code: 0, data: {} } })
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../../order-timeout-cancel/shared/system-refund');
    delete require.cache[modulePath];
    const systemRefund = require('../../order-timeout-cancel/shared/system-refund');
    try {
        assert.deepEqual(systemRefund.GROUP_EXPIRED_REFUNDABLE_ORDER_STATUSES, [
            'pending_group',
            'paid',
            'pickup_pending',
            'refunding'
        ]);
        assert.equal(systemRefund.__test__.isGroupExpiredRefundCandidate({
            _id: 'o1',
            openid: 'buyer',
            status: 'paid'
        }), true);
        assert.equal(systemRefund.__test__.isGroupExpiredRefundCandidate({
            _id: 'o2',
            openid: 'buyer',
            status: 'shipped'
        }), false);
    } finally {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    }
});

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createMemoryDb(seed = {}) {
    const data = {};
    for (const [name, rows] of Object.entries(seed)) {
        data[name] = clone(rows);
    }

    const command = {
        in: (values) => ({ __op: 'in', values }),
        inc: (value) => ({ __op: 'inc', value }),
        remove: () => ({ __op: 'remove' }),
        or: (conditions) => ({ __op: 'or', conditions }),
        gte: (value) => ({ __op: 'gte', value })
    };

    const ensureCollection = (name) => {
        if (!data[name]) data[name] = [];
        return data[name];
    };

    const matchesValue = (actual, expected) => {
        if (expected && typeof expected === 'object' && expected.__op === 'in') {
            return expected.values.includes(actual);
        }
        if (expected && typeof expected === 'object' && expected.__op === 'gte') {
            return actual >= expected.value;
        }
        return actual === expected;
    };

    const matchesQuery = (row, query = {}) => {
        if (query && query.__op === 'or') {
            return query.conditions.some((condition) => matchesQuery(row, condition));
        }
        return Object.entries(query || {}).every(([key, expected]) => matchesValue(row[key], expected));
    };

    const applyPatch = (row, patch = {}) => {
        for (const [key, value] of Object.entries(patch)) {
            if (value && typeof value === 'object' && value.__op === 'inc') {
                row[key] = (Number(row[key]) || 0) + value.value;
            } else if (value && typeof value === 'object' && value.__op === 'remove') {
                delete row[key];
            } else {
                row[key] = value;
            }
        }
    };

    const makeQuery = (name, query = {}) => ({
        limit() {
            return this;
        },
        orderBy() {
            return this;
        },
        field() {
            return this;
        },
        async get() {
            return { data: ensureCollection(name).filter((row) => matchesQuery(row, query)).map(clone) };
        },
        async update({ data: patch } = {}) {
            let updated = 0;
            for (const row of ensureCollection(name)) {
                if (!matchesQuery(row, query)) continue;
                applyPatch(row, patch);
                updated += 1;
            }
            return { stats: { updated } };
        }
    });

    const db = {
        command,
        serverDate: () => 'SERVER_DATE',
        collection(name) {
            return {
                doc(id) {
                    return {
                        async get() {
                            return { data: ensureCollection(name).find((row) => String(row._id || row.id) === String(id)) || null };
                        },
                        async update({ data: patch } = {}) {
                            const row = ensureCollection(name).find((item) => String(item._id || item.id) === String(id));
                            if (!row) return { stats: { updated: 0 } };
                            applyPatch(row, patch);
                            return { stats: { updated: 1 } };
                        },
                        async set({ data: patch } = {}) {
                            const rows = ensureCollection(name);
                            const existing = rows.find((row) => String(row._id || row.id) === String(id));
                            if (existing) {
                                Object.assign(existing, patch, { _id: existing._id || id, id: existing.id || id });
                            } else {
                                rows.push({ _id: id, id, ...patch });
                            }
                            return { _id: id };
                        }
                    };
                },
                where(query) {
                    return makeQuery(name, query);
                },
                async add({ data: patch } = {}) {
                    const id = patch && patch._id ? patch._id : `${name}-${ensureCollection(name).length + 1}`;
                    ensureCollection(name).push({ _id: id, id, ...patch });
                    return { _id: id };
                }
            };
        },
        data
    };

    return db;
}

async function withSystemRefund(seed, fn) {
    const db = createMemoryDb(seed);
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => db,
                callFunction: async () => ({ result: { code: 0, data: {} } })
            };
        }
        if (request === '../wechat-pay-v3') {
            return {
                createRefund: async () => ({ refund_id: 'wx-refund-id', status: 'SUCCESS' }),
                loadPrivateKey: async () => 'PRIVATE_KEY'
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../../order-timeout-cancel/shared/system-refund');
    delete require.cache[modulePath];
    const systemRefund = require('../../order-timeout-cancel/shared/system-refund');
    try {
        await fn(systemRefund, db);
    } finally {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    }
}

async function withTimeoutCancel(seed, fn) {
    const db = createMemoryDb(seed);
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => db,
                callFunction: async () => ({ result: { code: 0, data: { scanned: 0, completed: 0, errors: [] } } })
            };
        }
        if (request === './shared/group-expiry') {
            return {
                processExpiredGroups: async () => ({ expiredGroups: 0, refundedOrders: 0, errors: [] }),
                recoverExpiredGroupRefundOrders: async () => ({ recoveredOrders: 0, errors: [] })
            };
        }
        if (request === './shared/system-refund') {
            return {
                recoverGroupExpiredRefunds: async () => ({ scanned: 0, synced: 0, retried: 0, completed: 0, errors: [] })
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../../order-timeout-cancel/index');
    const previousToken = process.env.ORDER_INTERNAL_TOKEN;
    process.env.ORDER_INTERNAL_TOKEN = 'test-token';
    delete require.cache[modulePath];
    const timeoutCancel = require('../../order-timeout-cancel/index');
    try {
        await fn(timeoutCancel, db);
    } finally {
        if (previousToken === undefined) delete process.env.ORDER_INTERNAL_TOKEN;
        else process.env.ORDER_INTERNAL_TOKEN = previousToken;
        Module._load = originalLoad;
        delete require.cache[modulePath];
    }
}

test('system refund uses growth snapshot basis and debt-based commission clawback', async () => {
    const order = {
        _id: 'order-1',
        order_no: 'ORD-1',
        openid: 'buyer-openid',
        status: 'paid',
        payment_method: 'goods_fund',
        pay_amount: 100,
        points_earned: 10,
        growth_earned: 20,
        quantity: 1,
        items: [
            {
                product_id: 'product-1',
                sku_id: 'sku-1',
                qty: 1,
                item_amount: 100,
                cash_paid_allocated_amount: 100
            }
        ]
    };

    await withSystemRefund({
        orders: [clone(order)],
        refunds: [{ _id: 'refund-1', status: 'approved', order_id: 'order-1' }],
        users: [
            {
                _id: 'buyer-id',
                id: 'buyer-id',
                openid: 'buyer-openid',
                agent_wallet_balance: 0,
                wallet_balance: 0,
                points: 40,
                growth_value: 30,
                total_spent: 100,
                order_count: 1
            },
            {
                _id: 'agent-id',
                id: 'agent-id',
                openid: 'agent-openid',
                balance: 2,
                commission_balance: 2,
                total_earned: 2,
                debt_amount: 1
            }
        ],
        wallet_accounts: [
            { _id: 'wallet-buyer-id', id: 'wallet-buyer-id', user_id: 'buyer-id', openid: 'buyer-openid', balance: 0, account_type: 'goods_fund' }
        ],
        commissions: [
            { _id: 'commission-approved', order_id: 'order-1', status: 'approved', amount: 3, openid: 'approved-agent-openid' },
            { _id: 'commission-settled', order_id: 'order-1', order_no: 'ORD-1', status: 'settled', amount: 7, openid: 'agent-openid' }
        ]
    }, async (systemRefund, db) => {
        const result = await systemRefund.__test__.processInternalRefund(order, {
            paymentMethod: 'goods_fund',
            refundChannel: 'goods_fund',
            refundTargetText: 'goods fund',
            refundId: 'refund-1',
            refundAmount: 100,
            refundRecord: {
                _id: 'refund-1',
                amount: 100,
                refund_amount: 100,
                refund_quantity_effective: 1,
                refund_items: [
                    { refund_item_key: 'product-1::sku-1::0', quantity: 1, cash_refund_amount: 100 }
                ]
            }
        });

        assert.equal(result.refunded, true);

        const buyer = db.data.users.find((row) => row.openid === 'buyer-openid');
        assert.equal(buyer.agent_wallet_balance, 100);
        assert.equal(buyer.wallet_balance, 100);
        assert.equal(buyer.points, 30);
        assert.equal(buyer.growth_value, 10);
        assert.equal(buyer.total_spent, 0);
        assert.equal(buyer.order_count, 0);

        const refund = db.data.refunds.find((row) => row._id === 'refund-1');
        assert.equal(refund.status, 'completed');
        assert.equal(refund.reward_points_clawback_amount, 10);
        assert.equal(refund.growth_clawback_amount, 20);
        assert.equal(refund.growth_clawback_basis, 'order_growth_earned');
        assert.equal(refund.buyer_assets_reversed_at, 'SERVER_DATE');

        const approved = db.data.commissions.find((row) => row._id === 'commission-approved');
        assert.equal(approved.status, 'cancelled');
        assert.equal(approved.commission_cancel_scope, 'whole_order_on_any_refund');
        assert.equal(approved.commission_cancel_policy, 'partial_refund_policy_v1');

        const settled = db.data.commissions.find((row) => row._id === 'commission-settled');
        assert.equal(settled.status, 'cancelled');
        assert.equal(settled.clawback_debited, 2);
        assert.equal(settled.clawback_debt_added, 5);
        assert.equal(settled.commission_cancel_policy, 'partial_refund_policy_v1');

        const agent = db.data.users.find((row) => row.openid === 'agent-openid');
        assert.equal(agent.commission_balance, 0);
        assert.equal(agent.balance, 0);
        assert.equal(agent.total_earned, 0);
        assert.equal(agent.debt_amount, 6);
    });
});

test('timeout cancel refunds points without changing growth value', async () => {
    await withTimeoutCancel({
        admin_singletons: [],
        slash_records: [],
        orders: [
            {
                _id: 'timeout-order-1',
                status: 'pending_payment',
                openid: 'buyer-openid',
                created_at: '2020-01-01T00:00:00.000Z',
                points_used: 25
            }
        ],
        users: [
            { _id: 'buyer-id', openid: 'buyer-openid', points: 10, growth_value: 99 }
        ]
    }, async (timeoutCancel, db) => {
        const result = await timeoutCancel.main({}, {});
        assert.equal(result.cancelled, 1);

        const buyer = db.data.users.find((row) => row.openid === 'buyer-openid');
        assert.equal(buyer.points, 35);
        assert.equal(buyer.growth_value, 99);
    });
});
