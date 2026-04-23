'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadOrderCreateModule() {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                database: () => ({
                    command: {
                        in: () => ({}),
                        or: () => ({}),
                        and: () => ({}),
                        gte: () => ({})
                    },
                    collection: () => ({
                        doc: () => ({ get: async () => ({ data: null }) }),
                        where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
                        add: async () => ({ _id: 'mock-id' })
                    }),
                    serverDate: () => new Date()
                }),
                DYNAMIC_CURRENT_ENV: 'test-env'
            };
        }
        return originalLoad(request, parent, isMain);
    };
    const modulePath = require.resolve('../order-create');
    delete require.cache[modulePath];
    return {
        module: require('../order-create'),
        restore: () => {
            Module._load = originalLoad;
            delete require.cache[modulePath];
        }
    };
}

test('bundle fixed commission uses solo map when only one referrer exists', () => {
    const { module, restore } = loadOrderCreateModule();
    try {
        const lowRole = module.resolveBundleFixedCommissionAmounts({
            commission_pool_amount: 80,
            solo_commission_fixed_by_role: { 3: 60, 5: 80 },
            direct_commission_fixed_by_role: { 3: 40, 5: 50 },
            indirect_commission_fixed_by_role: { 5: 30 }
        }, 3, 0, false);
        assert.deepEqual(lowRole, { direct: 60, indirect: 0 });

        const highRole = module.resolveBundleFixedCommissionAmounts({
            commission_pool_amount: 80,
            solo_commission_fixed_by_role: { 3: 60, 5: 80 }
        }, 5, 0, false);
        assert.deepEqual(highRole, { direct: 80, indirect: 0 });
    } finally {
        restore();
    }
});

test('bundle fixed commission caps two-level split by the commission pool', () => {
    const { module, restore } = loadOrderCreateModule();
    try {
        const result = module.resolveBundleFixedCommissionAmounts({
            commission_pool_amount: 80,
            direct_commission_fixed_by_role: { 3: 55 },
            indirect_commission_fixed_by_role: { 5: 40 }
        }, 3, 5, true);
        assert.deepEqual(result, { direct: 55, indirect: 25 });
    } finally {
        restore();
    }
});
