'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createWxServerSdkMock(collections, stats) {
    const command = {
        in: (values) => ({ __op: 'in', values: Array.isArray(values) ? values : [] }),
        or: (conditions) => ({ __op: 'or', conditions: Array.isArray(conditions) ? conditions : [] }),
        and: (conditions) => ({ __op: 'and', conditions: Array.isArray(conditions) ? conditions : [] })
    };

    function matchesCondition(row = {}, condition = {}) {
        if (!condition || !Object.keys(condition).length) return true;
        if (condition.__op === 'or') {
            return condition.conditions.some((item) => matchesCondition(row, item));
        }
        if (condition.__op === 'and') {
            return condition.conditions.every((item) => matchesCondition(row, item));
        }
        return Object.entries(condition).every(([key, expected]) => {
            const actual = row[key];
            if (expected && expected.__op === 'in') {
                return expected.values.map(String).includes(String(actual));
            }
            return String(actual) === String(expected);
        });
    }

    function createQuery(name, condition = {}) {
        let sortField = '';
        let sortDirection = 'asc';
        let skipCount = 0;
        let limitCount = null;

        const readRows = () => {
            let rows = (collections[name] || []).filter((row) => matchesCondition(row, condition));
            if (sortField) {
                rows = rows.slice().sort((a, b) => {
                    const left = Number(a && a[sortField]) || 0;
                    const right = Number(b && b[sortField]) || 0;
                    return sortDirection === 'desc' ? right - left : left - right;
                });
            }
            if (skipCount) rows = rows.slice(skipCount);
            if (limitCount !== null) rows = rows.slice(0, limitCount);
            return rows.map(clone);
        };

        const queryApi = {
            where: (nextCondition) => createQuery(name, nextCondition),
            orderBy: (field, direction) => {
                sortField = field;
                sortDirection = direction || 'asc';
                return queryApi;
            },
            skip: (count) => {
                skipCount = Math.max(0, Number(count) || 0);
                return queryApi;
            },
            limit: (count) => {
                limitCount = Math.max(0, Number(count) || 0);
                return queryApi;
            },
            get: async () => {
                stats.getCalls[name] = (stats.getCalls[name] || 0) + 1;
                return { data: readRows() };
            },
            count: async () => {
                stats.countCalls[name] = (stats.countCalls[name] || 0) + 1;
                return { total: readRows().length };
            }
        };
        return queryApi;
    }

    function collection(name) {
        return {
            doc: (id) => ({
                get: async () => ({
                    data: clone((collections[name] || []).find((row) => String(row._id) === String(id)) || null)
                })
            }),
            where: (query) => createQuery(name, query),
            orderBy: (...args) => createQuery(name).orderBy(...args),
            skip: (...args) => createQuery(name).skip(...args),
            limit: (...args) => createQuery(name).limit(...args),
            get: () => createQuery(name).get(),
            count: () => createQuery(name).count()
        };
    }

    return {
        init: () => {},
        database: () => ({ command, collection }),
        getTempFileURL: async ({ fileList }) => {
            stats.tempFileRequests.push(...(Array.isArray(fileList) ? fileList : []));
            return {
                fileList: (Array.isArray(fileList) ? fileList : []).map((fileID) => ({
                    fileID,
                    tempFileURL: `https://temp.example/${encodeURIComponent(fileID)}`
                }))
            };
        },
        DYNAMIC_CURRENT_ENV: 'test-env'
    };
}

function createCollections(overrides = {}) {
    return {
        products: [
            {
                _id: 'product-1',
                id: 1,
                _legacy_id: 101,
                category_id: 'cat-a',
                name: '商品 A',
                status: 1,
                manual_weight: 20,
                retail_price: 12,
                market_price: 20,
                stock: 8,
                sales_count: 5,
                product_tag: 'hot',
                default_spec_text: '默认规格',
                images: ['cloud://env/product-1-cover', 'cloud://env/product-1-second'],
                detail_images: ['cloud://env/product-1-detail']
            },
            {
                _id: 'product-2',
                id: 2,
                category_id: 'cat-b',
                name: '商品 B',
                status: 1,
                manual_weight: 10,
                retail_price: 15,
                images: ['cloud://env/product-2-cover']
            }
        ],
        skus: [
            {
                _id: 'sku-1',
                product_id: 'product-1',
                retail_price: 12,
                stock: 4,
                specs: [{ name: '颜色', value: '红色' }],
                image: 'cloud://env/sku-1'
            }
        ],
        product_bundles: [],
        ...overrides
    };
}

function loadProductsFunction(collections = createCollections()) {
    const stats = { tempFileRequests: [], getCalls: {}, countCalls: {} };
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return createWxServerSdkMock(collections, stats);
        }
        return originalLoad(request, parent, isMain);
    };
    const modulePath = require.resolve('../index');
    const bundlePath = require.resolve('../product-bundles');
    delete require.cache[modulePath];
    delete require.cache[bundlePath];
    return {
        mod: require('../index'),
        stats,
        restore: () => {
            Module._load = originalLoad;
            delete require.cache[modulePath];
            delete require.cache[bundlePath];
        }
    };
}

test('products list keeps default full shape with skus and detail images', async () => {
    const { mod, restore } = loadProductsFunction();
    try {
        const result = await mod.main({ action: 'list', page: 1, limit: 1 });
        assert.equal(result.code, 0);
        assert.equal(result.data.total, 2);
        assert.equal(result.data.list.length, 1);
        assert.ok(Array.isArray(result.data.list[0].images));
        assert.ok(Array.isArray(result.data.list[0].detail_images));
        assert.ok(Array.isArray(result.data.list[0].skus));
        assert.equal(result.data.list[0].specSummary, '红色');
    } finally {
        restore();
    }
});

test('products include_skus=0 skips full sku payload', async () => {
    const { mod, stats, restore } = loadProductsFunction();
    try {
        const result = await mod.main({ action: 'list', page: 1, limit: 1, include_skus: 0 });
        assert.equal(result.code, 0);
        assert.equal(stats.getCalls.skus || 0, 0);
        assert.equal(result.data.list[0].skus, undefined);
    } finally {
        restore();
    }
});

test('products card view only resolves first list image and omits heavy fields', async () => {
    const { mod, stats, restore } = loadProductsFunction();
    try {
        const result = await mod.main({
            action: 'list',
            view: 'card',
            include_skus: 0,
            include_total: 1,
            page: 1,
            limit: 1
        });
        assert.equal(result.code, 0);
        const item = result.data.list[0];
        assert.equal(item.name, '商品 A');
        assert.equal(item.specSummary, '默认规格');
        assert.equal(item.images, undefined);
        assert.equal(item.detail_images, undefined);
        assert.equal(item.skus, undefined);
        assert.deepEqual(stats.tempFileRequests, ['cloud://env/product-1-cover']);
        assert.match(item.display_image, /^https:\/\/temp\.example\//);
        assert.deepEqual(item.preview_images, [item.display_image]);
    } finally {
        restore();
    }
});

test('products ignore persisted signed image urls and recover from cloud file id', async () => {
    const collections = createCollections({
        products: [
            {
                _id: 'product-temp',
                id: 88,
                category_id: 'cat-a',
                name: '临时图商品',
                status: 1,
                manual_weight: 1,
                retail_price: 99,
                images: ['https://abc.tcb.qcloud.la/materials/old.jpg?sign=expired&t=9999999999'],
                preview_images: ['https://abc.tcb.qcloud.la/materials/old-preview.jpg?sign=expired&t=9999999999'],
                file_id: 'cloud://env/product-temp-cover'
            }
        ],
        skus: []
    });
    const { mod, stats, restore } = loadProductsFunction(collections);
    try {
        const cardResult = await mod.main({
            action: 'list',
            view: 'card',
            include_skus: 0,
            include_total: 1,
            page: 1,
            limit: 1
        });
        assert.equal(cardResult.code, 0);
        assert.deepEqual(stats.tempFileRequests, ['cloud://env/product-temp-cover']);
        assert.equal(cardResult.data.list[0].image_ref, 'cloud://env/product-temp-cover');
        assert.match(cardResult.data.list[0].display_image, /^https:\/\/temp\.example\//);

        const detailResult = await mod.main({ action: 'detail', product_id: 88 });
        assert.equal(detailResult.code, 0);
        assert.deepEqual(detailResult.data.images, ['cloud://env/product-temp-cover']);
        assert.match(detailResult.data.preview_images[0], /^https:\/\/temp\.example\//);
    } finally {
        restore();
    }
});

test('products recover display assets from image_ref and empty preview arrays', async () => {
    const collections = createCollections({
        products: [
            {
                _id: 'product-image-ref',
                id: 89,
                category_id: 'cat-a',
                name: '持久引用商品',
                status: 1,
                manual_weight: 1,
                retail_price: 129,
                images: [],
                preview_images: [],
                image_ref: 'cloud://env/product-image-ref-cover',
                detail_images: ['cloud://env/product-image-ref-detail'],
                preview_detail_images: []
            }
        ],
        skus: []
    });
    const { mod, stats, restore } = loadProductsFunction(collections);
    try {
        const cardResult = await mod.main({
            action: 'list',
            view: 'card',
            include_skus: 0,
            include_total: 1,
            page: 1,
            limit: 1
        });
        assert.equal(cardResult.code, 0);
        assert.equal(cardResult.data.list[0].image_ref, 'cloud://env/product-image-ref-cover');
        assert.match(cardResult.data.list[0].display_image, /^https:\/\/temp\.example\//);

        const detailResult = await mod.main({ action: 'detail', product_id: 89 });
        assert.equal(detailResult.code, 0);
        assert.deepEqual(detailResult.data.images, ['cloud://env/product-image-ref-cover']);
        assert.match(detailResult.data.preview_images[0], /^https:\/\/temp\.example\//);
        assert.deepEqual(detailResult.data.detail_images, ['cloud://env/product-image-ref-detail']);
        assert.match(detailResult.data.preview_detail_images[0], /^https:\/\/temp\.example\//);
        assert.deepEqual(
            [...new Set(stats.tempFileRequests)].sort(),
            ['cloud://env/product-image-ref-cover', 'cloud://env/product-image-ref-detail'].sort()
        );
    } finally {
        restore();
    }
});

test('products include_total controls count behavior', async () => {
    const { mod, stats, restore } = loadProductsFunction();
    try {
        const withoutTotal = await mod.main({
            action: 'list',
            view: 'card',
            include_skus: 0,
            include_total: 0,
            page: 1,
            limit: 1
        });
        assert.equal(withoutTotal.code, 0);
        assert.equal(withoutTotal.data.total, undefined);
        assert.equal(stats.countCalls.products || 0, 0);

        const withTotal = await mod.main({
            action: 'list',
            view: 'card',
            include_skus: 0,
            include_total: 1,
            page: 1,
            limit: 1
        });
        assert.equal(withTotal.data.total, 2);
        assert.equal(stats.countCalls.products, 1);
    } finally {
        restore();
    }
});
