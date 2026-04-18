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

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function isCloudFileId(value) {
    return /^cloud:\/\//i.test(pickString(value));
}

function parseAssetArray(value) {
    if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && item !== '');
    if (!hasValue(value)) return [];
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed[0] === '[') {
            try {
                const parsed = JSON.parse(trimmed);
                return Array.isArray(parsed) ? parsed.filter((item) => item !== null && item !== undefined && item !== '') : [parsed];
            } catch (_) {
                return [trimmed];
            }
        }
        return [trimmed];
    }
    return [value];
}

function extractAssetRef(value) {
    if (!hasValue(value)) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
        const fileId = pickString(value.file_id || value.fileId);
        if (isCloudFileId(fileId)) return fileId;
        const direct = pickString(
            value.url
            || value.image_url
            || value.imageUrl
            || value.temp_url
            || value.image
            || value.cover_image
            || value.coverImage
            || value.cover
            || value.cover_url
            || value.coverUrl
            || value.thumb
            || value.thumbnail
        );
        if (isCloudFileId(direct)) return direct;
        return direct || fileId;
    }
    return pickString(value);
}

function collectCloudFileIdsFromValue(value) {
    return parseAssetArray(value)
        .map((entry) => extractAssetRef(entry))
        .filter(isCloudFileId);
}

async function batchResolveCloudAssetUrls(fileIds = []) {
    const uniqueIds = [...new Set((Array.isArray(fileIds) ? fileIds : []).filter(isCloudFileId))];
    const resolved = new Map();
    if (!uniqueIds.length || !cloud?.getTempFileURL) return resolved;

    for (let i = 0; i < uniqueIds.length; i += 50) {
        const chunk = uniqueIds.slice(i, i + 50);
        const result = await cloud.getTempFileURL({ fileList: chunk }).catch(() => ({ fileList: [] }));
        (result.fileList || []).forEach((file) => {
            if (!file || !file.fileID) return;
            resolved.set(file.fileID, pickString(file.tempFileURL || file.download_url || file.fileID));
        });
    }
    return resolved;
}

function resolveAssetEntry(value, resolvedMap = new Map(), options = {}) {
    const ref = extractAssetRef(value);
    if (!ref) return '';
    if (isCloudFileId(ref)) {
        if (options && options.preferCloudId) {
            return ref;
        }
        return pickString(resolvedMap.get(ref), ref);
    }
    return ref;
}

function resolveAssetList(value, resolvedMap = new Map(), options = {}) {
    const seen = new Set();
    return parseAssetArray(value)
        .map((entry) => resolveAssetEntry(entry, resolvedMap, options))
        .filter((url) => {
            if (!url || seen.has(url)) return false;
            seen.add(url);
            return true;
        });
}

function resolvePrimaryAsset(record = {}, resolvedMap = new Map(), options = {}) {
    const galleryImages = resolveAssetList(record.images, resolvedMap, options);
    if (galleryImages.length) return galleryImages[0];
    return resolveAssetEntry(
        record.image
        || record.image_url
        || record.imageUrl
        || record.cover_image
        || record.coverImage
        || record.cover
        || record.cover_url
        || record.coverUrl
        || record.file_id
        || record.fileId
        || record.thumb
        || record.thumbnail,
        resolvedMap,
        options
    );
}

function collectProductAssetFileIds(product = {}, skus = []) {
    return [
        ...collectCloudFileIdsFromValue(product.images),
        ...collectCloudFileIdsFromValue(product.detail_images),
        ...collectCloudFileIdsFromValue(product.image),
        ...collectCloudFileIdsFromValue(product.image_url),
        ...collectCloudFileIdsFromValue(product.cover_image),
        ...collectCloudFileIdsFromValue(product.coverImage),
        ...collectCloudFileIdsFromValue(product.file_id),
        ...collectCloudFileIdsFromValue(product.fileId),
        ...(Array.isArray(skus) ? skus.flatMap((sku) => ([
            ...collectCloudFileIdsFromValue(sku.image),
            ...collectCloudFileIdsFromValue(sku.images),
            ...collectCloudFileIdsFromValue(sku.file_id),
            ...collectCloudFileIdsFromValue(sku.fileId)
        ])) : [])
    ];
}

function resolveActiveProductQuery(categoryId) {
    const query = db.collection('products').where(_.or([
        { status: true },
        { status: 1 },
        { status: '1' },
        { status: 'active' },
        { status: 'on_sale' }
    ]));
    if (categoryId) {
        query.where({ category_id: categoryId });
    }
    return query;
}

async function queryActiveProducts(size = 200) {
    const { list } = await queryActiveProductsPage({ page: 1, limit: size, sort: 'manual_weight' });
    return list;
}

async function queryActiveProductsPage(params = {}) {
    const pageSize = Math.max(1, toNumber(params.limit || params.size, 20));
    const page = Math.max(1, toNumber(params.page, 1));
    const start = (page - 1) * pageSize;
    const sort = String(params.sort || '').trim().toLowerCase();
    const sortField = sort === 'hot' || sort === 'sales' ? 'sales_count' : 'manual_weight';
    const categoryId = params.category_id ? String(params.category_id) : '';
    const countQuery = resolveActiveProductQuery(categoryId);
    const listQuery = resolveActiveProductQuery(categoryId);

    try {
        const countRes = await countQuery.count().catch(() => ({ total: 0 }));
        const listRes = await listQuery
            .orderBy(sortField, 'desc')
            .skip(start)
            .limit(pageSize)
            .get()
            .catch(() => ({ data: [] }));

        return {
            list: listRes.data || [],
            total: toNumber(countRes.total, 0),
            page,
            limit: pageSize
        };
    } catch (err) {
        console.error('[products] queryActiveProductsPage 失败:', err && err.message ? err.message : err);
        try {
            const fallback = await db.collection('products')
                .where({ status: true })
                .orderBy(sortField, 'desc')
                .skip(start)
                .limit(pageSize)
                .get()
                .catch(() => ({ data: [] }));
            return { list: fallback.data || [], total: 0, page, limit: pageSize };
        } catch (fallbackErr) {
            console.error('[products] queryActiveProductsPage 回退失败:', fallbackErr && fallbackErr.message ? fallbackErr.message : fallbackErr);
            return { list: [], total: 0, page, limit: pageSize };
        }
    }
}

async function getProductById(id) {
    const raw = String(id || '').trim();
    if (!raw) return null;
    const num = toNumber(raw, NaN);
    const [legacy, legacyString, legacyId, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('products').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('products').where({ id: raw }).limit(1).get().catch(() => ({ data: [] })),
        Number.isFinite(num)
            ? db.collection('products').where({ _legacy_id: _.in([num, raw]) }).limit(1).get().catch(() => ({ data: [] }))
            : db.collection('products').where({ _legacy_id: raw }).limit(1).get().catch(() => ({ data: [] })),
        db.collection('products').doc(raw).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || legacyString.data[0] || legacyId.data[0] || doc.data || null;
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

function normalizeSku(sku, resolvedMap = new Map()) {
    const price = resolveSkuPrice(sku);
    const originalPrice = resolveSkuOriginalPrice(sku, price);
    const specs = Array.isArray(sku.specs) && sku.specs.length > 0
        ? sku.specs
        : (sku.spec_name && sku.spec_value
            ? [{ name: sku.spec_name, value: sku.spec_value }]
            : (sku.spec ? [{ name: '规格', value: sku.spec }] : []));
    const skuImages = [
        ...resolveAssetList(sku.images, resolvedMap, { preferCloudId: true }),
        ...resolveAssetList([sku.image, sku.file_id, sku.fileId, sku.image_url, sku.cover_image], resolvedMap, { preferCloudId: true })
    ].filter((url, index, list) => !!url && list.indexOf(url) === index);
    const primaryImage = skuImages[0] || '';
    const previewImages = [
        ...resolveAssetList(sku.images, resolvedMap),
        ...resolveAssetList([sku.image, sku.file_id, sku.fileId, sku.image_url, sku.cover_image], resolvedMap)
    ].filter((url, index, list) => !!url && list.indexOf(url) === index);

    return {
        ...sku,
        id: sku.id || sku._legacy_id || sku._id,
        image: primaryImage,
        images: skuImages,
        preview_images: previewImages,
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

function formatProduct(p, resolvedMap = new Map()) {
    const price = resolveProductPrice(p);
    const originalPrice = resolveProductOriginalPrice(p, price);
    const images = resolveAssetList(p.images, resolvedMap, { preferCloudId: true });
    const detailImages = resolveAssetList(p.detail_images, resolvedMap, { preferCloudId: true });
    const previewImages = resolveAssetList(p.images, resolvedMap);
    const previewDetailImages = resolveAssetList(p.detail_images, resolvedMap);
    const primaryImage = images[0] || resolvePrimaryAsset(p, resolvedMap, { preferCloudId: true }) || '';
    const primaryPreviewImage = previewImages[0] || resolvePrimaryAsset(p, resolvedMap) || '';
    return {
        ...p,
        id: p.id || p._id,
        price,
        retail_price: price,
        min_price: price,
        displayPrice: price.toFixed(2),
        original_price: originalPrice,
        market_price: originalPrice,
        image: primaryImage,
        image_url: primaryPreviewImage || primaryImage,
        cover_image: primaryImage,
        images: images.length ? images : (primaryImage ? [primaryImage] : []),
        preview_images: previewImages.length ? previewImages : (primaryPreviewImage ? [primaryPreviewImage] : []),
        detail_images: detailImages,
        preview_detail_images: previewDetailImages,
        is_on_sale: isOnSale(p.status),
        stock: toNumber(p.stock, 0),
        sales_count: toNumber(p.sales_count || p.purchase_count, 0)
    };
}

// 主处理函数
const handleAction = {
    'list': asyncHandler(async (params) => {
        const { list: rawList, total, page, limit } = await queryActiveProductsPage(params);
        let list = rawList.slice();

        // 为列表商品按 product_id 查询 SKU（仅查询当前页的商品，避免拉全表）
        let skuList = [];
        try {
            const productIds = list.map((p) => p._id || p.id).filter(Boolean);
            const productIdStrs = [...new Set(productIds.map(String))];
            if (productIdStrs.length > 0) {
                // 微信云开发 _.in() 最多支持 100 个元素
                const chunks = [];
                for (let i = 0; i < productIdStrs.length; i += 100) {
                    chunks.push(productIdStrs.slice(i, i + 100));
                }
                const chunkResults = await Promise.all(chunks.map((ids) =>
                    db.collection('skus').where({ product_id: _.in(ids) }).limit(500).get().catch(() => ({ data: [] }))
                ));
                skuList = chunkResults.flatMap((r) => r.data || []);
            }
        } catch (e) {
            console.warn('[products/list] 查询 SKU 失败，跳过规格摘要:', e.message);
        }

        const assetUrlMap = await batchResolveCloudAssetUrls(rawList.flatMap((product) => collectProductAssetFileIds(product, skuList)));
        list = rawList.map((item) => formatProduct(item, assetUrlMap));

        if (skuList.length > 0) {
            const skuMap = {};
            skuList.forEach((sku) => {
                const pid = String(sku.product_id || '');
                if (!pid) return;
                if (!skuMap[pid]) skuMap[pid] = [];
                skuMap[pid].push(sku);
            });

            list = list.map((product) => {
                const productIdStr = String(product._id || product.id);
                const legacyIdStr = product._legacy_id ? String(product._legacy_id) : '';
                const productSkus = [
                    ...(skuMap[productIdStr] || []),
                    ...(legacyIdStr && skuMap[legacyIdStr] ? skuMap[legacyIdStr] : []),
                    ...(product.id && skuMap[String(product.id)] ? skuMap[String(product.id)] : [])
                ];
                const uniqueSkuMap = {};
                const uniqueSkus = [];
                productSkus.forEach((sku) => {
                    const key = sku._id || sku.id || `${sku.product_id}:${sku.name}:${sku.code || ''}`;
                    if (uniqueSkuMap[key]) return;
                    uniqueSkuMap[key] = true;
                    uniqueSkus.push(normalizeSku(sku, assetUrlMap));
                });

                if (uniqueSkus.length > 0) {
                    const specMap = {};
                    uniqueSkus.forEach((sku) => {
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
                    product.skus = uniqueSkus;
                }
                return product;
            });
        }

        const listTotal = total || list.length;
        return success({ list, page, size: limit, total: listTotal });
    }),

    'detail': asyncHandler(async (params) => {
        if (!params.product_id) throw badRequest('缺少商品 ID');
        const product = await getProductById(params.product_id);
        if (!product) throw notFound('商品不存在');

        // 查询关联 SKU（按 product_id 精确查询，避免拉全表）
        let skus = [];
        let specSummary = '';
        try {
            const productIdStr = String(product._id || product.id);
            const queryIds = [productIdStr];
            if (product.id && String(product.id) !== productIdStr) queryIds.push(String(product.id));
            if (product._legacy_id) queryIds.push(String(product._legacy_id));
            const skuRes = await db.collection('skus').where({ product_id: _.in(queryIds) }).limit(100).get().catch(() => ({ data: [] }));
            const skuList = skuRes.data || [];
            skus = skuList.filter((sku) => {
                const pid = String(sku.product_id);
                return queryIds.includes(pid);
            });

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

        const assetUrlMap = await batchResolveCloudAssetUrls(collectProductAssetFileIds(product, skus));
        const normalizedSkus = skus.map((sku) => normalizeSku(sku, assetUrlMap));
        const result = formatProduct(product, assetUrlMap);
        if (normalizedSkus.length > 0) result.skus = normalizedSkus;
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
        });
        const assetUrlMap = await batchResolveCloudAssetUrls(list.flatMap((product) => collectProductAssetFileIds(product)));
        list = list.map((item) => formatProduct(item, assetUrlMap));
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
