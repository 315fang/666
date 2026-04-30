'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function createDbMock() {
    const command = {
        in: (values) => ({ __op: 'in', values }),
        inc: (value) => ({ __op: 'inc', value }),
        or: (conditions) => ({ __op: 'or', conditions })
    };
    return {
        command,
        serverDate: () => new Date('2026-04-29T00:00:00.000Z'),
        collection: () => ({
            doc: () => ({
                get: async () => ({ data: null }),
                update: async () => ({ stats: { updated: 0 } }),
                remove: async () => ({ stats: { removed: 0 } })
            }),
            where: () => ({
                limit: () => ({ get: async () => ({ data: [] }) }),
                get: async () => ({ data: [] })
            }),
            add: async () => ({ _id: 'unused' })
        })
    };
}

function loadOrderCreateModule() {
    const originalLoad = Module._load;
    const db = createDbMock();
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                database: () => db,
                DYNAMIC_CURRENT_ENV: 'test-env'
            };
        }
        if (request === './product-bundle') {
            return {
                resolveBundleContext: async () => ({
                    bundle_id: 'bundle-1',
                    bundle_price: 399,
                    bundle: {
                        _id: 'bundle-1',
                        title: '399 选 3',
                        scene_type: 'flex_bundle'
                    },
                    selections: [],
                    normalized_items: [{
                        product_id: '1',
                        sku_id: '',
                        quantity: 1
                    }]
                })
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../order-create');
    delete require.cache[modulePath];
    try {
        return {
            module: require('../order-create'),
            restore: () => {
                Module._load = originalLoad;
                delete require.cache[modulePath];
            }
        };
    } catch (error) {
        Module._load = originalLoad;
        delete require.cache[modulePath];
        throw error;
    }
}

function createBundleOrder(overrides = {}) {
    return {
        items: [{ product_id: '1', quantity: 1 }],
        bundle_context: {
            bundle_id: 'bundle-1',
            selected_items: [{ group_key: 'main', product_id: '1', quantity: 1 }]
        },
        ...overrides
    };
}

test('createOrder rejects coupon, points and goods-fund deductions on bundle orders', async () => {
    const { module, restore } = loadOrderCreateModule();
    try {
        await assert.rejects(
            () => module.createOrder('openid-1', createBundleOrder({ coupon_id: 'coupon-1' })),
            /组合订单不能叠加普通优惠券/
        );
        await assert.rejects(
            () => module.createOrder('openid-1', createBundleOrder({ points_to_use: 10 })),
            /组合订单不能使用积分抵扣/
        );
        await assert.rejects(
            () => module.createOrder('openid-1', createBundleOrder({ use_goods_fund: true })),
            /组合订单不支持货款余额支付/
        );
    } finally {
        restore();
    }
});
