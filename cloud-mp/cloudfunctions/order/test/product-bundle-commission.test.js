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

test('bundle fixed commission snapshot records fixed mode and item totals', () => {
    const { module, restore } = loadOrderCreateModule();
    try {
        const snapshot = module.buildBundleCommissionSnapshot([
            {
                refund_item_key: 'product-1::nosku::0',
                product_id: 'product-1',
                sku_id: '',
                bundle_group_key: 'main',
                bundle_group_title: '主选',
                bundle_commission_pool_amount: 80,
                direct_commission_fixed_amount: 55,
                indirect_commission_fixed_amount: 25
            }
        ], true);
        assert.equal(snapshot.mode, 'fixed');
        assert.equal(snapshot.source, 'bundle_option_fixed');
        assert.equal(snapshot.version, 'fixed_bundle_v1');
        assert.equal(snapshot.total_pool_amount, 80);
        assert.equal(snapshot.direct_fixed_amount, 55);
        assert.equal(snapshot.indirect_fixed_amount, 25);
        assert.deepEqual(snapshot.items[0], {
            item_key: 'product-1::nosku::0',
            product_id: 'product-1',
            sku_id: '',
            group_key: 'main',
            group_title: '主选',
            pool_amount: 80,
            direct_fixed_amount: 55,
            indirect_fixed_amount: 25
        });
    } finally {
        restore();
    }
});
