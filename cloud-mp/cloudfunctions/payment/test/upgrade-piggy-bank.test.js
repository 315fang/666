'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildIncrementalBuckets,
    createUpgradePiggyBankForOrder,
    reverseUpgradePiggyBankForRefund,
    unlockUpgradePiggyBankForRole
} = require('../upgrade-piggy-bank');

function createFakeDb(seed = {}) {
    const collections = {
        users: seed.users || [],
        products: seed.products || [],
        upgrade_piggy_bank_logs: seed.upgrade_piggy_bank_logs || [],
        commissions: seed.commissions || [],
        wallet_logs: seed.wallet_logs || [],
        orders: seed.orders || []
    };
    const command = {
        inc: (value) => ({ __op: 'inc', value }),
        gte: (value) => ({ __op: 'gte', value }),
        exists: (value) => ({ __op: 'exists', value })
    };

    function matches(row, criteria = {}) {
        return Object.keys(criteria).every((key) => {
            const expected = criteria[key];
            if (expected && expected.__op === 'gte') {
                return Number(row[key] || 0) >= Number(expected.value || 0);
            }
            if (expected && expected.__op === 'exists') {
                const exists = Object.prototype.hasOwnProperty.call(row, key);
                return expected.value ? exists : !exists;
            }
            return String(row[key]) === String(expected);
        });
    }

    function applyPatch(row, patch = {}) {
        Object.keys(patch).forEach((key) => {
            const value = patch[key];
            if (value && value.__op === 'inc') {
                row[key] = Number(row[key] || 0) + value.value;
            } else {
                row[key] = value;
            }
        });
    }

    function findById(name, id) {
        return (collections[name] || []).find((row) => String(row._id || row.id || row.openid) === String(id));
    }

    return {
        collections,
        command,
        db: {
            serverDate() {
                return '2026-04-25T00:00:00.000Z';
            },
            collection(name) {
                if (!collections[name]) collections[name] = [];
                return {
                    where(criteria) {
                        let limitCount = Infinity;
                        return {
                            limit(n) {
                                limitCount = n;
                                return this;
                            },
                            async get() {
                                return { data: collections[name].filter((row) => matches(row, criteria)).slice(0, limitCount) };
                            },
                            async update({ data }) {
                                const rows = collections[name].filter((row) => matches(row, criteria));
                                rows.forEach((row) => applyPatch(row, data));
                                return { stats: { updated: rows.length } };
                            }
                        };
                    },
                    doc(id) {
                        return {
                            async get() {
                                return { data: findById(name, id) || null };
                            },
                            async update({ data }) {
                                const row = findById(name, id);
                                if (!row) throw new Error(`missing ${name}/${id}`);
                                applyPatch(row, data);
                                return { stats: { updated: 1 } };
                            }
                        };
                    },
                    async add({ data }) {
                        const row = { ...data, _id: `${name}-${collections[name].length + 1}` };
                        collections[name].push(row);
                        return { _id: row._id };
                    }
                };
            }
        }
    };
}

function createContext(seed = {}, overrides = {}) {
    const fake = createFakeDb(seed);
    const findUserByAny = async (value) => {
        if (!value) return null;
        return fake.collections.users.find((user) => {
            return String(user.openid) === String(value)
                || String(user._id) === String(value)
                || String(user.id) === String(value);
        }) || null;
    };
    const getDocByIdOrLegacy = async (collectionName, id) => {
        return fake.collections[collectionName].find((row) => {
            return String(row._id) === String(id) || String(row.id) === String(id);
        }) || null;
    };
    return {
        ...fake,
        context: {
            db: fake.db,
            command: fake.command,
            findUserByAny,
            getDocByIdOrLegacy,
            ...overrides
        }
    };
}

function runtimeConfig(overrides = {}) {
    return {
        piggyBank: {
            enabled: true,
            include_team_direct: true,
            include_team_indirect: true,
            include_self_purchase: true,
            max_target_level: 5,
            min_incremental_amount: 0.01,
            unlock_to_commission_balance: true,
            ...(overrides.piggyBank || {})
        },
        commissionConfig: {
            direct_pct_by_role: { 1: 20, 2: 30, 3: 40, 4: 50, 5: 60 },
            indirect_pct_by_role: { 3: 0, 4: 10, 5: 20 }
        },
        commissionMatrix: {
            1: { 0: 20, 1: 5 },
            2: { 0: 30, 1: 10 },
            3: { 0: 40, 1: 20 },
            4: { 0: 50, 1: 30 },
            5: { 0: 60, 1: 40 }
        },
        bundleCommissionMatrix: {},
        costSplit: { direct_sales_pct: 40 },
        ...overrides
    };
}

test('buildIncrementalBuckets stores only step-by-step deltas', () => {
    const buckets = buildIncrementalBuckets({
        currentRoleLevel: 1,
        maxTargetLevel: 4,
        minIncrementalAmount: 0.01,
        amountForRole: (role) => ({ 1: 20, 2: 30, 3: 40, 4: 55 })[role] || 0
    });
    assert.deepEqual(buckets.map((item) => item.incremental_amount), [10, 10, 15]);
    assert.deepEqual(buckets.map((item) => [item.from_role_level, item.target_role_level]), [[1, 2], [2, 3], [3, 4]]);
});

test('direct team order creates target-level piggy bank deltas', async () => {
    const { context, collections } = createContext({
        users: [
            { _id: 'buyer', openid: 'buyer-openid', role_level: 0 },
            { _id: 'parent', openid: 'parent-openid', role_level: 1, piggy_bank_locked_amount: 0 }
        ],
        products: [{ _id: 'product-1' }],
        orders: [{ _id: 'order-1' }]
    });

    const result = await createUpgradePiggyBankForOrder(context, 'order-1', {
        _id: 'order-1',
        openid: 'buyer-openid',
        direct_referrer_openid: 'parent-openid',
        order_no: 'NO1',
        pay_amount: 100,
        items: [{ product_id: 'product-1', subtotal: 100 }]
    }, runtimeConfig({ piggyBank: { max_target_level: 3, include_self_purchase: false } }));

    assert.equal(result.created, 2);
    assert.equal(result.amount, 20);
    assert.deepEqual(collections.upgrade_piggy_bank_logs.map((row) => row.incremental_amount), [10, 10]);
    assert.equal(collections.users[1].piggy_bank_locked_amount, 20);
});

test('indirect team order uses level-difference matrix deltas', async () => {
    const { context, collections } = createContext({
        users: [
            { _id: 'buyer', openid: 'buyer-openid', role_level: 1 },
            { _id: 'parent', openid: 'parent-openid', role_level: 3 },
            { _id: 'grand', openid: 'grand-openid', role_level: 3, piggy_bank_locked_amount: 0 }
        ],
        products: [{ _id: 'product-1' }],
        orders: [{ _id: 'order-2' }]
    });

    await createUpgradePiggyBankForOrder(context, 'order-2', {
        _id: 'order-2',
        openid: 'buyer-openid',
        direct_referrer_openid: 'parent-openid',
        indirect_referrer_openid: 'grand-openid',
        order_no: 'NO2',
        pay_amount: 100,
        items: [{ product_id: 'product-1', subtotal: 100 }]
    }, runtimeConfig({ piggyBank: { max_target_level: 4, include_self_purchase: false } }));

    const grandRows = collections.upgrade_piggy_bank_logs.filter((row) => row.openid === 'grand-openid');
    assert.equal(grandRows.length, 1);
    assert.equal(grandRows[0].target_role_level, 4);
    assert.equal(grandRows[0].incremental_amount, 10);
});

test('fixed product commission creates no piggy bank delta', async () => {
    const { context, collections } = createContext({
        users: [
            { _id: 'buyer', openid: 'buyer-openid', role_level: 0 },
            { _id: 'parent', openid: 'parent-openid', role_level: 1, piggy_bank_locked_amount: 0 }
        ],
        products: [{ _id: 'product-1', commission_amount_1: 20 }],
        orders: [{ _id: 'order-3' }]
    });

    const result = await createUpgradePiggyBankForOrder(context, 'order-3', {
        _id: 'order-3',
        openid: 'buyer-openid',
        direct_referrer_openid: 'parent-openid',
        pay_amount: 100,
        items: [{ product_id: 'product-1', subtotal: 100 }]
    }, runtimeConfig({ piggyBank: { max_target_level: 3, include_self_purchase: false } }));

    assert.equal(result.created, 0);
    assert.equal(collections.upgrade_piggy_bank_logs.length, 0);
});

test('self purchase no longer creates piggy bank buckets', async () => {
    const { context, collections } = createContext({
        users: [
            { _id: 'buyer', openid: 'buyer-openid', role_level: 2, piggy_bank_locked_amount: 0 }
        ],
        orders: [{ _id: 'order-4' }]
    });

    await createUpgradePiggyBankForOrder(context, 'order-4', {
        _id: 'order-4',
        openid: 'buyer-openid',
        pay_amount: 100,
        items: [{ subtotal: 100 }]
    }, runtimeConfig({ piggyBank: { max_target_level: 4 } }));

    assert.equal(collections.upgrade_piggy_bank_logs.length, 0);
    assert.equal(collections.users[0].piggy_bank_locked_amount, 0);
});

test('createUpgradePiggyBankForOrder is idempotent per order user source and target level', async () => {
    const { context, collections } = createContext({
        users: [
            { _id: 'buyer', openid: 'buyer-openid', role_level: 0 },
            { _id: 'parent', openid: 'parent-openid', role_level: 1, piggy_bank_locked_amount: 0 }
        ],
        products: [{ _id: 'product-1' }],
        orders: [{ _id: 'order-5' }]
    });
    const order = {
        _id: 'order-5',
        openid: 'buyer-openid',
        direct_referrer_openid: 'parent-openid',
        pay_amount: 100,
        items: [{ product_id: 'product-1', subtotal: 100 }]
    };

    await createUpgradePiggyBankForOrder(context, 'order-5', order, runtimeConfig({ piggyBank: { max_target_level: 2, include_self_purchase: false } }));
    await createUpgradePiggyBankForOrder(context, 'order-5', order, runtimeConfig({ piggyBank: { max_target_level: 2, include_self_purchase: false } }));

    assert.equal(collections.upgrade_piggy_bank_logs.length, 1);
    assert.equal(collections.users[1].piggy_bank_locked_amount, 10);
});

test('unlockUpgradePiggyBankForRole settles locked buckets into commission balance', async () => {
    const { context, collections } = createContext({
        users: [{ _id: 'u1', openid: 'u-openid', commission_balance: 0, balance: 0, total_earned: 0, piggy_bank_locked_amount: 30, piggy_bank_unlocked_amount: 0 }],
        upgrade_piggy_bank_logs: [
            { _id: 'p1', openid: 'u-openid', target_role_level: 2, incremental_amount: 10, status: 'locked' },
            { _id: 'p2', openid: 'u-openid', target_role_level: 3, incremental_amount: 20, status: 'locked' }
        ]
    });

    const result = await unlockUpgradePiggyBankForRole(context, {
        openid: 'u-openid',
        targetRoleLevel: 2,
        triggerOrderId: 'upgrade-order',
        config: { unlock_to_commission_balance: true }
    });

    assert.equal(result.amount, 10);
    assert.equal(collections.users[0].commission_balance, 10);
    assert.equal(collections.users[0].piggy_bank_locked_amount, 20);
    assert.equal(collections.users[0].piggy_bank_unlocked_amount, 10);
    assert.equal(collections.upgrade_piggy_bank_logs[0].status, 'unlocked');
    assert.equal(collections.upgrade_piggy_bank_logs[1].status, 'locked');
    assert.equal(collections.commissions[0].type, 'upgrade_piggy_bank_unlock');
});

test('reverseUpgradePiggyBankForRefund reverses locked rows and claws back unlocked rows', async () => {
    const { context, collections } = createContext({
        users: [{ _id: 'u1', openid: 'u-openid', commission_balance: 50, balance: 50, total_earned: 50, piggy_bank_locked_amount: 10, piggy_bank_unlocked_amount: 20, piggy_bank_reversed_amount: 0 }],
        upgrade_piggy_bank_logs: [
            { _id: 'p1', openid: 'u-openid', order_id: 'order-6', incremental_amount: 10, status: 'locked' },
            { _id: 'p2', openid: 'u-openid', order_id: 'order-6', incremental_amount: 20, status: 'unlocked' }
        ]
    });

    const result = await reverseUpgradePiggyBankForRefund(context, 'order-6');

    assert.equal(result.changed, 2);
    assert.equal(collections.upgrade_piggy_bank_logs[0].status, 'reversed');
    assert.equal(collections.upgrade_piggy_bank_logs[1].status, 'clawed_back');
    assert.equal(collections.users[0].commission_balance, 30);
    assert.equal(collections.users[0].piggy_bank_locked_amount, 0);
    assert.equal(collections.users[0].piggy_bank_unlocked_amount, 0);
    assert.equal(collections.users[0].piggy_bank_reversed_amount, 30);
});
