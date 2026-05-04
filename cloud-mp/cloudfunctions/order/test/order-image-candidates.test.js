'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function createWxServerSdkMock(collections) {
    const command = {
        in: (values) => ({ __op: 'in', values: Array.isArray(values) ? values : [] }),
        or: (conditions) => ({ __op: 'or', conditions: Array.isArray(conditions) ? conditions : [] })
    };

    function valueMatches(actual, expected) {
        if (expected && expected.__op === 'in') {
            return expected.values.map(String).includes(String(actual));
        }
        if (expected && expected.__op === 'or') {
            return expected.conditions.some((condition) => matches(actual, condition));
        }
        return String(actual) === String(expected);
    }

    function matches(row = {}, query = {}) {
        if (query && query.__op === 'or') {
            return query.conditions.some((condition) => matches(row, condition));
        }
        return Object.entries(query || {}).every(([key, expected]) => valueMatches(row[key], expected));
    }

    function createQuery(name, query = {}, state = {}) {
        const applyQuery = () => {
            let rows = (collections[name] || []).filter((row) => matches(row, query));
            if (state.orderByField) {
                rows = [...rows].sort((left, right) => {
                    const direction = state.orderByDirection === 'desc' ? -1 : 1;
                    return String(left[state.orderByField] || '').localeCompare(String(right[state.orderByField] || '')) * direction;
                });
            }
            const start = state.skip || 0;
            const end = state.limit ? start + state.limit : undefined;
            return rows.slice(start, end);
        };
        return {
            where: (nextQuery) => createQuery(name, nextQuery, state),
            orderBy: (field, direction) => createQuery(name, query, { ...state, orderByField: field, orderByDirection: direction }),
            skip: (value) => createQuery(name, query, { ...state, skip: Number(value) || 0 }),
            limit: (value) => createQuery(name, query, { ...state, limit: Number(value) || 0 }),
            get: async () => ({ data: applyQuery() }),
            count: async () => ({ total: (collections[name] || []).filter((row) => matches(row, query)).length })
        };
    }

    return {
        init: () => {},
        database: () => ({
            command,
            collection: (name) => ({
                doc: (id) => ({
                    get: async () => ({
                        data: (collections[name] || []).find((row) => String(row._id) === String(id)) || null
                    })
                }),
                where: (query) => createQuery(name, query),
                orderBy: (field, direction) => createQuery(name).orderBy(field, direction),
                skip: (value) => createQuery(name).skip(value),
                limit: (value) => createQuery(name).limit(value),
                get: async () => ({ data: collections[name] || [] }),
                count: async () => ({ total: (collections[name] || []).length })
            })
        }),
        DYNAMIC_CURRENT_ENV: 'test-env'
    };
}

function loadOrderQueryModule(collections) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return createWxServerSdkMock(collections);
        }
        return originalLoad(request, parent, isMain);
    };
    const modulePath = require.resolve('../order-query');
    delete require.cache[modulePath];
    return {
        module: require('../order-query'),
        restore: () => {
            Module._load = originalLoad;
            delete require.cache[modulePath];
        }
    };
}

test('order detail carries product image candidates for expired snapshot images', async () => {
    const expiredSnapshot = 'https://example.com/order-item.jpg?sign=old&t=1';
    const collections = {
        orders: [{
            _id: 'order-1',
            order_no: 'ORDER-1',
            openid: 'openid-1',
            status: 'paid',
            product_id: 'product-1',
            total_amount: 180,
            pay_amount: 180,
            created_at: '2026-04-25T10:00:00.000Z',
            items: [
                {
                    product_id: 'product-1',
                    sku_id: 'sku-1',
                    name: '缺图商品',
                    snapshot_name: '缺图商品',
                    image: expiredSnapshot,
                    snapshot_image: expiredSnapshot,
                    price: 219,
                    unit_price: 219,
                    qty: 1,
                    item_amount: 100
                },
                {
                    product_id: 'product-2',
                    name: '第二件商品',
                    snapshot_name: '第二件商品',
                    qty: 1,
                    item_amount: 80
                }
            ]
        }],
        products: [
            {
                _id: 'product-1',
                id: 'product-1',
                name: '缺图商品',
                images: ['cloud://test-env/product-1-cover']
            },
            {
                _id: 'product-2',
                id: 'product-2',
                name: '第二件商品',
                images: ['cloud://test-env/product-2-cover']
            }
        ],
        skus: [{
            _id: 'sku-1',
            id: 'sku-1',
            image: 'cloud://test-env/sku-1-cover'
        }],
        users: [{ _id: 'user-1', openid: 'openid-1' }],
        commissions: [],
        stations: [],
        reviews: [],
        admin_singletons: []
    };

    const { module, restore } = loadOrderQueryModule(collections);
    try {
        const order = await module.getOrderDetail('openid-1', 'order-1');
        assert.ok(order.product.image_candidates.includes('cloud://test-env/product-1-cover'));
        assert.ok(order.items[0].product.image_candidates.includes('cloud://test-env/sku-1-cover'));
        assert.ok(order.items[0].product.image_candidates.includes('cloud://test-env/product-1-cover'));
        assert.equal(order.items[0].display_unit_price, '219.00');
        assert.ok(order.items[1].product.image_candidates.includes('cloud://test-env/product-2-cover'));
        assert.equal(order.items[1].product.images[0], 'cloud://test-env/product-2-cover');
    } finally {
        restore();
    }
});

test('shipped order tab also returns pickup orders waiting for verification', async () => {
    const collections = {
        orders: [
            {
                _id: 'express-shipped',
                order_no: 'EXPRESS-SHIPPED',
                openid: 'openid-1',
                status: 'shipped',
                product_id: 'product-1',
                quantity: 1,
                total_amount: 88,
                pay_amount: 88,
                created_at: '2026-05-02T10:00:00.000Z',
                items: []
            },
            {
                _id: 'pickup-pending',
                order_no: 'PICKUP-PENDING',
                openid: 'openid-1',
                status: 'pickup_pending',
                delivery_type: 'pickup',
                product_id: 'product-1',
                quantity: 1,
                total_amount: 66,
                pay_amount: 66,
                created_at: '2026-05-03T10:00:00.000Z',
                items: []
            },
            {
                _id: 'paid-order',
                order_no: 'PAID-ORDER',
                openid: 'openid-1',
                status: 'paid',
                product_id: 'product-1',
                quantity: 1,
                total_amount: 55,
                pay_amount: 55,
                created_at: '2026-05-04T10:00:00.000Z',
                items: []
            }
        ],
        products: [],
        commissions: [],
        reviews: [],
        configs: [],
        app_configs: []
    };
    const { module: orderQuery, restore } = loadOrderQueryModule(collections);
    try {
        assert.deepEqual(orderQuery.resolveOrderStatusesForQuery('shipped'), ['shipped', 'pickup_pending']);
        const result = await orderQuery.queryOrders('openid-1', { status: 'shipped', page: 1, limit: 10 });
        assert.deepEqual(result.list.map((order) => order.id), ['pickup-pending', 'express-shipped']);
        assert.equal(result.pagination.total, 2);
        assert.equal(result.list[0].status_text, '待核销');
    } finally {
        restore();
    }
});

test('order detail keeps large integer yuan pay amount for bundle orders', async () => {
    const collections = {
        orders: [{
            _id: 'bundle-order-1',
            order_no: 'BUNDLE-ORDER-1',
            openid: 'openid-1',
            status: 'paid',
            type: 'bundle',
            product_id: 'product-1',
            total_amount: 16350,
            original_amount: 16350,
            bundle_discount: 12351,
            pay_amount: 3999,
            refunded_cash_total: 0,
            bundle_meta: {
                title: '测试组合',
                bundle_price: 3999
            },
            created_at: '2026-04-25T10:00:00.000Z',
            items: [
                {
                    product_id: 'product-1',
                    name: '组合商品A',
                    snapshot_name: '组合商品A',
                    price: 219,
                    unit_price: 219,
                    qty: 20,
                    item_amount: 4380
                },
                {
                    product_id: 'product-2',
                    name: '组合商品B',
                    snapshot_name: '组合商品B',
                    price: 399,
                    unit_price: 399,
                    qty: 30,
                    item_amount: 11970
                }
            ]
        }],
        products: [
            { _id: 'product-1', id: 'product-1', name: '组合商品A', images: ['cloud://test-env/a'] },
            { _id: 'product-2', id: 'product-2', name: '组合商品B', images: ['cloud://test-env/b'] }
        ],
        skus: [],
        users: [{ _id: 'user-1', openid: 'openid-1' }],
        commissions: [],
        stations: [],
        reviews: [],
        admin_singletons: []
    };

    const { module, restore } = loadOrderQueryModule(collections);
    try {
        const order = await module.getOrderDetail('openid-1', 'bundle-order-1');
        assert.equal(order.total_amount, 16350);
        assert.equal(order.original_amount, 16350);
        assert.equal(order.bundle_discount, 12351);
        assert.equal(order.pay_amount, 3999);
        assert.equal(order.actual_price, 3999);
        assert.equal(order.remaining_refundable_cash, 3999);
        assert.equal(order.display_pay_amount, '3999.00');
        assert.equal(order.display_remaining_refundable_cash, '3999.00');
    } finally {
        restore();
    }
});
