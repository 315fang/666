'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function createWxServerSdkMock(collections) {
    const command = {
        in: (values) => ({ __op: 'in', values: Array.isArray(values) ? values : [] })
    };

    function matches(row = {}, query = {}) {
        return Object.entries(query || {}).every(([key, expected]) => {
            const actual = row[key];
            if (expected && expected.__op === 'in') {
                return expected.values.map(String).includes(String(actual));
            }
            return String(actual) === String(expected);
        });
    }

    function collection(name) {
        return {
            doc: (id) => ({
                get: async () => ({
                    data: (collections[name] || []).find((row) => String(row._id) === String(id)) || null
                })
            }),
            where: (query) => {
                const rows = () => (collections[name] || []).filter((row) => matches(row, query));
                return {
                    limit: () => ({ get: async () => ({ data: rows() }) }),
                    get: async () => ({ data: rows() })
                };
            }
        };
    }

    return {
        database: () => ({ command, collection }),
        DYNAMIC_CURRENT_ENV: 'test-env'
    };
}

function createCollections(overrides = {}) {
    return {
        product_bundles: [{
            _id: 'bundle-1',
            id: 1,
            title: 'Bundle',
            status: 1,
            publish_status: 'published',
            bundle_price: 80,
            groups: [{
                group_key: 'main',
                group_title: '主选',
                min_select: 1,
                max_select: 1,
                options: [{
                    option_key: 'a',
                    product_id: '1',
                    sku_id: '',
                    default_qty: 1,
                    enabled: 1,
                    commission_pool_amount: 80,
                    solo_commission_fixed_by_role: { 3: 60, 5: 80 },
                    direct_commission_fixed_by_role: { 3: 40 },
                    indirect_commission_fixed_by_role: { 5: 40 }
                }]
            }]
        }],
        products: [{
            _id: 'product-1',
            id: 1,
            name: '商品 A',
            status: 1,
            retail_price: 120
        }],
        skus: [],
        ...overrides
    };
}

function loadProductBundleModule(collections) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return createWxServerSdkMock(collections);
        }
        return originalLoad(request, parent, isMain);
    };
    const modulePath = require.resolve('../product-bundle');
    delete require.cache[modulePath];
    return {
        module: require('../product-bundle'),
        restore: () => {
            Module._load = originalLoad;
            delete require.cache[modulePath];
        }
    };
}

test('resolveBundleContext rejects unpublished bundles', async () => {
    const collections = createCollections({
        product_bundles: [{
            ...createCollections().product_bundles[0],
            publish_status: 'draft'
        }]
    });
    const { module, restore } = loadProductBundleModule(collections);
    try {
        await assert.rejects(
            () => module.resolveBundleContext({
                bundle_id: 'bundle-1',
                selected_items: [{ group_key: 'main', product_id: '1', quantity: 1 }]
            }),
            /未发布/
        );
    } finally {
        restore();
    }
});

test('resolveBundleContext rejects off-sale bundle products', async () => {
    const collections = createCollections({
        products: [{ ...createCollections().products[0], status: 0 }]
    });
    const { module, restore } = loadProductBundleModule(collections);
    try {
        await assert.rejects(
            () => module.resolveBundleContext({
                bundle_id: 'bundle-1',
                selected_items: [{ group_key: 'main', product_id: '1', quantity: 1 }]
            }),
            /已下架/
        );
    } finally {
        restore();
    }
});

test('resolveBundleContext carries commission pool and solo/split maps', async () => {
    const { module, restore } = loadProductBundleModule(createCollections());
    try {
        const context = await module.resolveBundleContext({
            bundle_id: 'bundle-1',
            selected_items: [{ group_key: 'main', product_id: '1', quantity: 1 }]
        });
        const item = context.normalized_items[0];
        assert.equal(item.commission_pool_amount, 80);
        assert.equal(item.solo_commission_fixed_by_role['3'], 60);
        assert.equal(item.solo_commission_fixed_by_role['5'], 80);
        assert.equal(item.direct_commission_fixed_by_role['3'], 40);
        assert.equal(item.indirect_commission_fixed_by_role['5'], 40);
    } finally {
        restore();
    }
});
