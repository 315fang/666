'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const {
    CloudBaseError, cloudFunctionWrapper
} = require('./shared/errors');
const {
    success, badRequest, notFound, serverError
} = require('./shared/response');
const { toNumber, toArray, getAllRecords } = require('./shared/utils');

// 异步处理包装
const asyncHandler = (handler) => async (...args) => {
    try {
        return await handler(...args);
    } catch (err) {
        if (err instanceof CloudBaseError) throw err;
        if (err && typeof err === 'object' && 'code' in err && 'success' in err && 'message' in err) throw err;
        throw serverError(err.message || '操作失败');
    }
};

// 辅助函数
function isOnSale(status) {
    return status === true || status === 1 || status === '1' || status === 'active' || status === 'on_sale';
}

async function queryActiveProducts() {
    try {
        const candidates = [{ status: true }, { status: 1 }, { status: '1' }, { status: 'active' }, { status: 'on_sale' }];
        const groups = await Promise.all(candidates.map((w) => db.collection('products').where(w).limit(100).get().catch(() => ({ data: [] }))));
        const map = new Map();
        groups.forEach((g) => (g.data || []).forEach((item) => map.set(item._id, item)));
        return Array.from(map.values());
    } catch (err) {
        console.error('[products] queryActiveProducts 失败:', err.message);
        return [];
    }
}

async function getProductById(id) {
    const num = toNumber(id, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('products').where({ id: num }).limit(1).get() : Promise.resolve({ data: [] }),
        db.collection('products').doc(String(id)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function firstNumber(values) {
    for (const value of values) {
        if (!hasValue(value)) continue;
        const num = toNumber(value, NaN);
        if (Number.isFinite(num)) return num;
    }
    return null;
}

function centsToYuan(value, fallback = 0) {
    if (!hasValue(value)) return fallback;
    const num = toNumber(value, NaN);
    return Number.isFinite(num) ? num / 100 : fallback;
}

function resolveProductPrice(p) {
    const legacyPrice = firstNumber([p.retail_price, p.price]);
    if (legacyPrice !== null) return legacyPrice;
    return centsToYuan(p.min_price, 0);
}

function resolveProductOriginalPrice(p, price) {
    const legacyOriginal = firstNumber([p.market_price]);
    if (legacyOriginal !== null) return legacyOriginal;
    if (hasValue(p.retail_price) && hasValue(p.original_price)) {
        return toNumber(p.original_price, price);
    }
    if (hasValue(p.original_price)) return centsToYuan(p.original_price, price);
    return price;
}

function resolveSkuPrice(sku) {
    const legacyPrice = firstNumber([sku.retail_price]);
    if (legacyPrice !== null) return legacyPrice;
    return centsToYuan(sku.price, 0);
}

function resolveSkuOriginalPrice(sku, price) {
    const legacyOriginal = firstNumber([sku.market_price]);
    if (legacyOriginal !== null) return legacyOriginal;
    if (hasValue(sku.retail_price) && hasValue(sku.original_price)) {
        return toNumber(sku.original_price, price);
    }
    if (hasValue(sku.original_price)) return centsToYuan(sku.original_price, price);
    return price;
}

function normalizeSku(sku) {
    const price = resolveSkuPrice(sku);
    const originalPrice = resolveSkuOriginalPrice(sku, price);
    const specs = Array.isArray(sku.specs) && sku.specs.length > 0
        ? sku.specs
        : (sku.spec_name && sku.spec_value
            ? [{ name: sku.spec_name, value: sku.spec_value }]
            : (sku.spec ? [{ name: '规格', value: sku.spec }] : []));

    return {
        ...sku,
        id: sku.id || sku._legacy_id || sku._id,
        price,
        retail_price: price,
        min_price: price,
        original_price: originalPrice,
        market_price: originalPrice,
        displayPrice: price.toFixed(2),
        stock: toNumber(sku.stock, 0),
        specs,
        spec_name: specs.length >= 1 ? specs[0].name : (sku.spec_name || ''),
        spec_value: specs.length >= 1 ? specs[0].value : (sku.spec_value || sku.spec || '')
    };
}

function formatProduct(p) {
    const price = resolveProductPrice(p);
    const originalPrice = resolveProductOriginalPrice(p, price);
    return {
        ...p,
        id: p.id || p._id,
        price,
        retail_price: price,
        min_price: price,
        displayPrice: price.toFixed(2),
        original_price: originalPrice,
        market_price: originalPrice,
        image: toArray(p.images)[0] || '',
        images: toArray(p.images),
        is_on_sale: isOnSale(p.status),
        stock: toNumber(p.stock, 0),
        sales_count: toNumber(p.sales_count || p.purchase_count, 0)
    };
}

// 主处理函数
const handleAction = {
    'list': asyncHandler(async (params) => {
        const pageSize = Math.max(1, toNumber(params.limit || params.size, 20));
        let list = await queryActiveProducts();
        if (params.category_id) {
            list = list.filter((p) => String(p.category_id) === String(params.category_id));
        }
        list = list.sort((a, b) => toNumber(b.manual_weight, 0) - toNumber(a.manual_weight, 0)).map(formatProduct);

        // 为列表商品添加规格摘要（安全查询，失败不影响主流程）
        let skuList = [];
        try {
            skuList = await getAllRecords(db, 'skus');
        } catch (e) {
            console.warn('[products/list] 查询 SKU 失败，跳过规格摘要:', e.message);
        }

        if (skuList.length > 0) {
            list = list.map((product) => {
                const productIdStr = String(product._id || product.id);
                const legacyIdStr = product._legacy_id ? String(product._legacy_id) : '';
                const productSkus = skuList.filter((sku) => {
                    const pid = String(sku.product_id);
                    return pid === productIdStr || (legacyIdStr && pid === legacyIdStr) || pid === String(product.id);
                });
                if (productSkus.length > 0) {
                    const specMap = {};
                    productSkus.forEach((sku) => {
                        const specs = Array.isArray(sku.specs) && sku.specs.length > 0
                            ? sku.specs
                            : (sku.spec_name && sku.spec_value ? [{ name: sku.spec_name, value: sku.spec_value }] : []);
                        specs.forEach((s) => {
                            if (s.name && s.value) {
                                if (!specMap[s.name]) specMap[s.name] = new Set();
                                specMap[s.name].add(s.value);
                            }
                        });
                    });
                    const specSummary = Object.keys(specMap).map((name) => Array.from(specMap[name]).join('/')).join(' · ');
                    if (specSummary) product.specSummary = specSummary;
                    product.skus = productSkus.map(normalizeSku);
                }
                return product;
            });
        }

        const page = Math.max(1, toNumber(params.page, 1));
        const start = (page - 1) * pageSize;
        return success({ list: list.slice(start, start + pageSize), page, size: pageSize, total: list.length });
    }),

    'detail': asyncHandler(async (params) => {
        if (!params.product_id) throw badRequest('缺少商品 ID');
        const product = await getProductById(params.product_id);
        if (!product) throw notFound('商品不存在');

        // 查询关联 SKU（安全查询，失败不影响主流程）
        let skus = [];
        let specSummary = '';
        try {
            const skuList = await getAllRecords(db, 'skus');
            const productIdStr = String(product._id || product.id);
            skus = skuList.filter((sku) => {
                const pid = String(sku.product_id);
                return pid === productIdStr || pid === String(product.id) || (product._legacy_id && pid === String(product._legacy_id));
            }).map(normalizeSku);

            // 生成规格摘要
            const specMap = {};
            skus.forEach((sku) => {
                const skuSpecs = sku.specs || [];
                skuSpecs.forEach((s) => {
                    if (s.name && s.value) {
                        if (!specMap[s.name]) specMap[s.name] = new Set();
                        specMap[s.name].add(s.value);
                    }
                });
            });
            specSummary = Object.keys(specMap).map((name) => Array.from(specMap[name]).join('/')).join(' · ');
        } catch (e) {
            console.warn('[products/detail] 查询 SKU 失败，跳过规格信息:', e.message);
        }

        const result = formatProduct(product);
        if (skus.length > 0) result.skus = skus;
        if (specSummary) result.specSummary = specSummary;
        return success(result);
    }),

    'categories': asyncHandler(async (params) => {
        const res = await db.collection('categories').where({ status: _.in([true, 1, '1']) }).orderBy('sort_order', 'asc').get().catch(() => ({ data: [] }));
        return success({ list: res.data.map((c) => ({ ...c, id: c.id || c._id })) });
    }),

    'search': asyncHandler(async (params) => {
        if (!params.keyword) throw badRequest('缺少搜索关键词');
        const pageSize = Math.max(1, toNumber(params.limit || params.size, 20));
        let list = await queryActiveProducts();
        const search = String(params.keyword).trim().toLowerCase();
        list = list.filter((p) => {
            const text = `${p.name || ''} ${p.description || ''}`.toLowerCase();
            return text.includes(search);
        }).map(formatProduct);
        const page = Math.max(1, toNumber(params.page, 1));
        const start = (page - 1) * pageSize;
        return success({ list: list.slice(start, start + pageSize), page, size: pageSize, total: list.length, keyword: search });
    }),

    'reviews': asyncHandler(async (params) => {
        if (!params.product_id) throw badRequest('缺少商品 ID');
        const pageSize = Math.max(1, toNumber(params.limit || params.size, 10));
        const rows = await db.collection('reviews').where({ product_id: params.product_id }).orderBy('created_at', 'desc').limit(100).get().catch(() => ({ data: [] }));
        
        const reviews = rows.data || [];
        if (reviews.length === 0) {
            const page = Math.max(1, toNumber(params.page, 1));
            return success({ list: [], page, size: pageSize, total: 0 });
        }

        const reviewerIds = [...new Set(reviews.map((r) => r.openid).filter(Boolean))];
        const reviewerMap = {};
        if (reviewerIds.length) {
            const users = await db.collection('users').where({ openid: _.in(reviewerIds) }).limit(100).get().catch(() => ({ data: [] }));
            (users.data || []).forEach((u) => { reviewerMap[u.openid] = u; });
        }

        const list = reviews.map((r) => {
            const u = reviewerMap[r.openid];
            return {
                ...r, id: r.id || r._id, rating: toNumber(r.rating, 5),
                reviewer_nickname: u?.nickName || u?.nickname || '用户',
                reviewer_avatar: u?.avatarUrl || u?.avatar_url || ''
            };
        });

        const page = Math.max(1, toNumber(params.page, 1));
        const start = (page - 1) * pageSize;
        return success({ list: list.slice(start, start + pageSize), page, size: pageSize, total: list.length });
    })
};

exports.main = cloudFunctionWrapper(async (event) => {
    const { action, ...params } = event;
    const handler = handleAction[action];

    if (!handler) {
        throw badRequest(`未知 action: ${action}`);
    }

    return handler(params);
});
