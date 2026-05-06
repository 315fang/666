const { get } = require('../../utils/request');
const { cachedGet } = require('../../utils/requestCache');
const { resolveProductImage, resolveProductDisplayPrice, genHeatLabel, normalizeAssetUrl } = require('../../utils/dataFormatter');
const {
    pickDirectAssetUrl,
    pickPreferredAssetRef,
    warmRenderableImageUrls,
    resolveRenderableImageUrl
} = require('../../utils/cloudAssetRuntime');
const { getMiniProgramConfig } = require('../../utils/miniProgramConfig');
const app = getApp();

const CATEGORY_BACKGROUND_BATCH_SIZE = 2;
const CATEGORY_PRODUCTS_PAGE_SIZE = 100;
const CATEGORY_PRODUCTS_MAX_PAGES = 50;
const CATEGORY_PRODUCTS_CACHE_TTL = 2 * 60 * 1000;
const PRODUCT_PLACEHOLDER = '/assets/images/placeholder.svg';

function getPointDeductionRule() {
    const config = getMiniProgramConfig();
    const rule = config.point_rule_config || {};
    const deduction = rule.deduction || rule.redeem || {};
    const yuanPerPoint = Number(
        deduction.yuan_per_point
        ?? deduction.value_per_point
        ?? rule.yuan_per_point
        ?? rule.point_value
        ?? 0.1
    );
    const maxRatio = Number(
        deduction.max_order_ratio
        ?? deduction.max_deduction_ratio
        ?? rule.max_order_ratio
        ?? rule.max_deduction_ratio
        ?? 0.7
    );
    return {
        yuanPerPoint: Number.isFinite(yuanPerPoint) && yuanPerPoint > 0 ? yuanPerPoint : 0.1,
        maxRatio: Number.isFinite(maxRatio) && maxRatio > 0 ? Math.max(0.7, Math.min(1, maxRatio)) : 0.7
    };
}

// 生成规格摘要文本
function buildSpecSummary(item) {
    const defaultSpecText = String(item && item.default_spec_text || '').trim();
    if (defaultSpecText) return defaultSpecText;
    if (!item.skus || !item.skus.length) return '';
    const specMap = {};
    item.skus.forEach((sku) => {
        const skuSpecs = Array.isArray(sku.specs) && sku.specs.length > 0
            ? sku.specs
            : (sku.spec_name && sku.spec_value ? [{ name: sku.spec_name, value: sku.spec_value }] : []);
        skuSpecs.forEach((s) => {
            if (s.name && s.value) {
                if (!specMap[s.name]) specMap[s.name] = new Set();
                specMap[s.name].add(s.value);
            }
        });
    });
    return Object.keys(specMap).map((name) => Array.from(specMap[name]).join('/')).join(' · ');
}

function matchesCategoryId(item = {}, categoryId) {
    const normalizedCategoryId = String(categoryId == null ? '' : categoryId).trim();
    if (!normalizedCategoryId) return true;
    const productCategoryId = String(item.category_id ?? item.categoryId ?? '').trim();
    return productCategoryId === normalizedCategoryId;
}

function dedupeProductsById(list = []) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter((item) => {
        const id = item && (item.id ?? item._id ?? item._legacy_id);
        const key = String(id == null ? '' : id).trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function groupProductsByCategoryId(list = []) {
    const grouped = new Map();
    (Array.isArray(list) ? list : []).forEach((item) => {
        const categoryId = String(item && (item.category_id ?? item.categoryId ?? '')).trim();
        if (!categoryId) return;
        if (!grouped.has(categoryId)) grouped.set(categoryId, []);
        grouped.get(categoryId).push(item);
    });
    return grouped;
}

function getProductIdKey(item = {}) {
    const id = item.id ?? item._id ?? item._legacy_id;
    return String(id == null ? '' : id).trim();
}

function mergeProductLists(existing = [], incoming = []) {
    const seen = new Set();
    const merged = [];
    [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])].forEach((item) => {
        const key = getProductIdKey(item);
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(item);
    });
    return merged;
}

function buildProductListParams(page, includeTotal) {
    return {
        page,
        limit: CATEGORY_PRODUCTS_PAGE_SIZE,
        sort: 'manual_weight',
        view: 'card',
        include_skus: 0,
        include_total: includeTotal ? 1 : 0
    };
}

function pickMappedProductImage(item) {
    const directUrl = pickDirectAssetUrl({
        display_image: item?.display_image || '',
        image_url: item?.image_url || '',
        preview_images: item?.preview_images || item?.previewImages || '',
        image: item?.image || '',
        cover_image: item?.cover_image || ''
    });
    if (directUrl) return directUrl;

    return pickPreferredAssetRef({
        file_id: item?.file_id || item?.fileId || '',
        image_ref: item?.image_ref || '',
        display_image: item?.display_image || '',
        image: item?.image || '',
        image_url: item?.image_url || '',
        cover_image: item?.cover_image || '',
        url: resolveProductImage(item)
    }) || normalizeAssetUrl(resolveProductImage(item));
}

function buildProductImageSources(item = {}) {
    return [
        {
            file_id: item.image_ref || item.file_id || item.fileId || '',
            image: item.display_image || item.image || '',
            image_url: item.image_url || '',
            cover_image: item.cover_image || ''
        },
        item.preview_images,
        item.previewImages,
        item.images,
        resolveProductImage(item, '')
    ];
}

function mapProductsForCategory(page, list) {
    const pointBalance = page.data.userPointBalance || 0;
    const bestCoupon = page.data.userBestCoupon || 0;
    const showPreview = page.data.pricePreviewEnabled;
    const roleLevel = app.globalData.userInfo?.role_level || 0;

    return (list || []).map((item) => {
        const retailPrice = parseFloat(resolveProductDisplayPrice(item, roleLevel) || 0);
        const marketPrice = parseFloat(item.market_price || 0);
        const sales = Number(item.purchase_count || item.sales_count || 0);
        let lowestTip = '';

        if (showPreview && (pointBalance > 0 || bestCoupon > 0)) {
            const { yuanPerPoint, maxRatio } = getPointDeductionRule();
            const afterCoupon = Math.max(0, retailPrice - bestCoupon);
            const pointDeduct = Math.min(pointBalance * yuanPerPoint, afterCoupon * maxRatio);
            const lowest = Math.max(0, afterCoupon - pointDeduct);
            if (lowest < retailPrice) {
                lowestTip = lowest.toFixed(1);
            }
        }

        return {
            ...item,
            image: pickMappedProductImage(item),
            image_sources: buildProductImageSources(item),
            specSummary: buildSpecSummary(item),
            price: retailPrice,
            market_price: marketPrice > retailPrice ? marketPrice : 0,
            heat_label: genHeatLabel(item),
            sales_label: sales > 0 ? `月售${sales}` : '',
            discount_label: marketPrice > retailPrice
                ? (retailPrice / marketPrice * 10).toFixed(1) + '折'
                : '',
            lowestTip,
            role_level_price: retailPrice
        };
    });
}

async function mapProductsForCategoryAsync(page, list) {
    const mapped = mapProductsForCategory(page, list);
    await warmRenderableImageUrls(mapped);
    return Promise.all(mapped.map(async (item) => ({
        ...item,
        image: await resolveRenderableImageUrl({
            file_id: item.image_ref || item.file_id || item.fileId || '',
            image: item.display_image || item.image,
            image_url: item.image_url || '',
            cover_image: item.cover_image || ''
        }, PRODUCT_PLACEHOLDER)
    })));
}

async function fetchCategoryProducts(page, categoryId) {
    try {
        const res = await cachedGet(get, '/products', {
            category_id: categoryId,
            page: 1,
            limit: CATEGORY_PRODUCTS_PAGE_SIZE,
            view: 'card',
            include_skus: 0,
            include_total: 1
        }, {
            cacheTTL: CATEGORY_PRODUCTS_CACHE_TTL,
            showError: false,
            maxRetries: 0,
            timeout: 10000
        });
        const list = res?.data?.list || res?.data || [];
        const normalizedList = dedupeProductsById(list).filter((item) => matchesCategoryId(item, categoryId));
        return {
            catId: categoryId,
            products: await mapProductsForCategoryAsync(page, normalizedList)
        };
    } catch (err) {
        console.warn('[CategoryProducts] fetchCategoryProducts failed:', categoryId, err);
        return { catId: categoryId, products: [] };
    }
}

function extractProductsPayload(res) {
    const data = res && res.data;
    const list = Array.isArray(data && data.list)
        ? data.list
        : (Array.isArray(res && res.list) ? res.list : (Array.isArray(data) ? data : []));
    const totalRaw = (data && data.total != null ? data.total : undefined)
        ?? (res && res.total != null ? res.total : undefined);
    const total = Number(totalRaw);
    return {
        list,
        total: Number.isFinite(total) ? total : null
    };
}

async function fetchProductPage(page, options = {}) {
    const { forceRefresh = false, includeTotal = false } = options;
    const res = await cachedGet(get, '/products', buildProductListParams(page, includeTotal), {
        cacheTTL: forceRefresh ? 0 : CATEGORY_PRODUCTS_CACHE_TTL,
        showError: false,
        maxRetries: 0,
        timeout: 12000
    });
    return extractProductsPayload(res);
}

function prefetchCategoryProductFirstPage(forceRefresh = false) {
    return fetchProductPage(1, { forceRefresh, includeTotal: true });
}

async function applyProductRowsToPage(page, rows, categoryIds, loadToken, options = {}) {
    const { setLoadingFalse = false, markCompleteIds = [] } = options;
    const safeIds = Array.isArray(categoryIds) ? categoryIds.filter(Boolean).map(String) : [];
    if (page._categoryLoadToken !== loadToken) {
        return [];
    }

    const productsByCategoryId = groupProductsByCategoryId(dedupeProductsById(rows));
    const targetIds = safeIds.filter((categoryId) => productsByCategoryId.has(String(categoryId)));
    const results = await Promise.all(targetIds.map(async (categoryId) => {
        const normalizedList = productsByCategoryId.get(String(categoryId)) || [];
        return {
            catId: String(categoryId),
            products: await mapProductsForCategoryAsync(page, normalizedList)
        };
    }));

    if (page._categoryLoadToken !== loadToken) {
        return results;
    }

    const nextAllProducts = { ...(page.data.allProducts || {}) };
    const nextLoadedCategories = { ...(page.data.loadedCategories || {}) };
    results.forEach((result) => {
        nextAllProducts[result.catId] = mergeProductLists(nextAllProducts[result.catId], result.products);
        nextLoadedCategories[result.catId] = true;
    });
    markCompleteIds.forEach((categoryId) => {
        if (!categoryId) return;
        const key = String(categoryId);
        if (!nextAllProducts[key]) nextAllProducts[key] = [];
        nextLoadedCategories[key] = true;
    });

    await new Promise((resolve) => page.setData({
        allProducts: nextAllProducts,
        visibleProducts: nextAllProducts,
        loadedCategories: nextLoadedCategories,
        ...(setLoadingFalse ? { loading: false } : {}),
        ...(typeof page._buildRenderedSectionState === 'function'
            ? page._buildRenderedSectionState({ loadedCategories: nextLoadedCategories })
            : {})
    }, resolve));

    if (typeof page._scheduleHeightCalc === 'function') {
        page._scheduleHeightCalc();
    }
    return results;
}

function finishProductHydration(page, categoryIds, loadToken) {
    if (page._categoryLoadToken !== loadToken) return;
    const nextAllProducts = { ...(page.data.allProducts || {}) };
    const nextLoadedCategories = { ...(page.data.loadedCategories || {}) };
    (Array.isArray(categoryIds) ? categoryIds : []).forEach((categoryId) => {
        if (!categoryId) return;
        const key = String(categoryId);
        if (!nextAllProducts[key]) nextAllProducts[key] = [];
        nextLoadedCategories[key] = true;
    });
    page.setData({
        allProducts: nextAllProducts,
        visibleProducts: nextAllProducts,
        loadedCategories: nextLoadedCategories,
        loading: false,
        ...(typeof page._buildRenderedSectionState === 'function'
            ? page._buildRenderedSectionState({ loadedCategories: nextLoadedCategories })
            : {})
    });
    if (typeof page._scheduleHeightCalc === 'function') {
        page._scheduleHeightCalc();
    }
}

function hydrateRemainingProductPages(page, categoryIds, loadToken, options = {}) {
    const { forceRefresh = false, firstPageCount = 0, total = null } = options;
    Promise.resolve().then(async () => {
        let fetchedCount = Math.max(0, Number(firstPageCount) || 0);
        let hydrateFailed = false;
        const totalNumber = Number(total);
        const isTotalKnown = Number.isFinite(totalNumber) && totalNumber > 0;
        const isTruncated = isTotalKnown && totalNumber > CATEGORY_PRODUCTS_MAX_PAGES * CATEGORY_PRODUCTS_PAGE_SIZE;
        const totalPages = isTotalKnown
            ? Math.min(CATEGORY_PRODUCTS_MAX_PAGES, Math.ceil(totalNumber / CATEGORY_PRODUCTS_PAGE_SIZE))
            : CATEGORY_PRODUCTS_MAX_PAGES;

        for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
            if (page._categoryLoadToken !== loadToken) return;
            const payload = await fetchProductPage(pageNumber, { forceRefresh, includeTotal: false }).catch((err) => {
                console.warn('[CategoryProducts] hydrate page failed:', pageNumber, err);
                hydrateFailed = true;
                return { list: [], total: null };
            });
            if (page._categoryLoadToken !== loadToken) return;
            const list = Array.isArray(payload.list) ? payload.list : [];
            if (!list.length) break;
            fetchedCount += list.length;
            await applyProductRowsToPage(page, list, categoryIds, loadToken);
            if (list.length < CATEGORY_PRODUCTS_PAGE_SIZE) break;
            if (isTotalKnown && fetchedCount >= totalNumber) break;
        }

        if (hydrateFailed || isTruncated) {
            if (page._categoryLoadToken === loadToken) {
                page.setData({ loading: false });
            }
            return;
        }
        finishProductHydration(page, categoryIds, loadToken);
    });
}

async function loadAllCategoryProducts(page, categoryIds, loadToken, options = {}) {
    const { forceRefresh = false, setLoadingFalse = true, firstPagePromise = null } = options;
    const safeIds = Array.isArray(categoryIds) ? categoryIds.filter(Boolean) : [];
    if (!safeIds.length) {
        if (setLoadingFalse && page._categoryLoadToken === loadToken) {
            page.setData({ loading: false });
        }
        return [];
    }

    try {
        let firstPage = firstPagePromise
            ? await firstPagePromise
            : await fetchProductPage(1, { forceRefresh, includeTotal: true });
        if (!firstPage) {
            firstPage = await fetchProductPage(1, { forceRefresh, includeTotal: true });
        }
        const results = await applyProductRowsToPage(page, firstPage.list, safeIds, loadToken, { setLoadingFalse });
        if (page._categoryLoadToken !== loadToken) {
            return results;
        }
        if ((firstPage.list || []).length < CATEGORY_PRODUCTS_PAGE_SIZE || (Number.isFinite(Number(firstPage.total)) && (firstPage.list || []).length >= Number(firstPage.total))) {
            finishProductHydration(page, safeIds, loadToken);
        } else {
            hydrateRemainingProductPages(page, safeIds, loadToken, {
                forceRefresh,
                firstPageCount: (firstPage.list || []).length,
                total: firstPage.total
            });
        }
        return results;
    } catch (err) {
        console.warn('[CategoryProducts] loadAllCategoryProducts failed:', err);
        if (page._categoryLoadToken === loadToken && setLoadingFalse) {
            page.setData({ loading: false });
        }
        return [];
    }
}

async function loadCategoryProductsBatch(page, categoryIds, loadToken, options = {}) {
    const { setLoadingFalse = false } = options;
    const safeIds = Array.isArray(categoryIds) ? categoryIds.filter(Boolean) : [];
    if (!safeIds.length) {
        if (setLoadingFalse && page._categoryLoadToken === loadToken) {
            page.setData({ loading: false });
        }
        return [];
    }

    const pendingIds = [];
    const targetIds = safeIds.filter((categoryId) => {
        if (page.data.loadedCategories[categoryId]) return false;
        if (page._pendingCategoryLoadIds && page._pendingCategoryLoadIds.has(categoryId)) return false;
        pendingIds.push(categoryId);
        return true;
    });

    if (!targetIds.length) {
        if (setLoadingFalse && page._categoryLoadToken === loadToken) {
            page.setData({ loading: false });
        }
        return [];
    }

    targetIds.forEach((categoryId) => page._pendingCategoryLoadIds.add(categoryId));

    try {
        const results = await Promise.all(targetIds.map((categoryId) => fetchCategoryProducts(page, categoryId)));
        if (page._categoryLoadToken !== loadToken) {
            return results;
        }

        const nextAllProducts = { ...(page.data.allProducts || {}) };
        const nextLoadedCategories = { ...(page.data.loadedCategories || {}) };

        results.forEach((result) => {
            nextAllProducts[result.catId] = result.products;
            nextLoadedCategories[result.catId] = true;
        });

        await new Promise((resolve) => page.setData({
            allProducts: nextAllProducts,
            loadedCategories: nextLoadedCategories,
            ...(setLoadingFalse ? { loading: false } : {})
        }, resolve));

        if (typeof page._rebuildVisibleProducts === 'function') {
            page._rebuildVisibleProducts();
        }
        page._scheduleHeightCalc();
        return results;
    } finally {
        pendingIds.forEach((categoryId) => page._pendingCategoryLoadIds.delete(categoryId));
    }
}

function queueRemainingCategoryLoads(page, categoryIds, loadToken) {
    if (!Array.isArray(categoryIds) || !categoryIds.length) {
        return;
    }

    Promise.resolve().then(async () => {
        for (let i = 0; i < categoryIds.length; i += CATEGORY_BACKGROUND_BATCH_SIZE) {
            if (page._categoryLoadToken !== loadToken) {
                return;
            }
            const batchIds = categoryIds.slice(i, i + CATEGORY_BACKGROUND_BATCH_SIZE);
            await loadCategoryProductsBatch(page, batchIds, loadToken);
        }
    });
}

function ensureCategoryProductsLoaded(page, categoryId) {
    if (!categoryId || page.data.loadedCategories[categoryId]) {
        return;
    }

    const loadToken = page._categoryLoadToken || Date.now();
    if (!page._categoryLoadToken) {
        page._categoryLoadToken = loadToken;
    }

    loadCategoryProductsBatch(page, [categoryId], loadToken);
}

function refreshPricePreviewHints(page) {
    const currentProducts = page.data.allProducts || {};
    const categoryIds = Object.keys(currentProducts);
    if (!categoryIds.length) return;

    const nextAllProducts = {};
    categoryIds.forEach((categoryId) => {
        const previousList = currentProducts[categoryId] || [];
        const previousById = new Map((Array.isArray(previousList) ? previousList : []).map((item) => [getProductIdKey(item), item]));
        nextAllProducts[categoryId] = mapProductsForCategory(page, previousList).map((item) => {
            const previous = previousById.get(getProductIdKey(item)) || {};
            const previousImage = String(previous.image || '').trim();
            if (previousImage && previousImage !== PRODUCT_PLACEHOLDER && !/^cloud:\/\//i.test(previousImage)) {
                return { ...item, image: previousImage };
            }
            return item;
        });
    });

    page.setData({
        allProducts: nextAllProducts,
        visibleProducts: nextAllProducts
    });
}

module.exports = {
    mapProductsForCategory,
    prefetchCategoryProductFirstPage,
    loadAllCategoryProducts,
    loadCategoryProductsBatch,
    queueRemainingCategoryLoads,
    ensureCategoryProductsLoaded,
    refreshPricePreviewHints
};
