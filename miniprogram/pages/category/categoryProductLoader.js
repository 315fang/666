const { get } = require('../../utils/request');
const { cachedGet } = require('../../utils/requestCache');
const { getFirstImage, genHeatLabel } = require('../../utils/dataFormatter');

const CATEGORY_BACKGROUND_BATCH_SIZE = 2;
const CATEGORY_PRODUCTS_CACHE_TTL = 2 * 60 * 1000;

function mapProductsForCategory(page, list) {
    const pointBalance = page.data.userPointBalance || 0;
    const bestCoupon = page.data.userBestCoupon || 0;
    const showPreview = page.data.pricePreviewEnabled;
    const activityProductMaps = page.data.activityProductMaps || {};
    const groupMap = activityProductMaps.group || {};
    const slashMap = activityProductMaps.slash || {};

    return (list || []).map((item) => {
        const retailPrice = parseFloat(item.retail_price || item.price || 0);
        const marketPrice = parseFloat(item.market_price || 0);
        const sales = Number(item.purchase_count || item.sales_count || 0);
        const groupActivity = groupMap[item.id] || null;
        const slashActivity = slashMap[item.id] || null;
        let lowestTip = '';

        if (showPreview && (pointBalance > 0 || bestCoupon > 0)) {
            const afterCoupon = Math.max(0, retailPrice - bestCoupon);
            const pointDeduct = Math.min(pointBalance * 0.01, afterCoupon * 0.5);
            const lowest = Math.max(0, afterCoupon - pointDeduct);
            if (lowest < retailPrice) {
                lowestTip = lowest.toFixed(1);
            }
        }

        return {
            ...item,
            image: getFirstImage(item.images),
            price: retailPrice,
            market_price: marketPrice > retailPrice ? marketPrice : 0,
            heat_label: genHeatLabel(item),
            sales_label: sales > 0 ? `月售${sales}` : '',
            discount_label: marketPrice > retailPrice
                ? (retailPrice / marketPrice * 10).toFixed(1) + '折'
                : '',
            lowestTip,
            groupActivity,
            slashActivity,
            hasGroupActivity: !!groupActivity,
            hasSlashActivity: !!slashActivity,
            groupPrice: groupActivity ? parseFloat(groupActivity.group_price || 0) : 0,
            slashFloorPrice: slashActivity ? parseFloat(slashActivity.floor_price || 0) : 0
        };
    });
}

async function fetchCategoryProducts(page, categoryId) {
    try {
        const res = await cachedGet(get, '/products', { category_id: categoryId, page: 1, limit: 50 }, {
            cacheTTL: CATEGORY_PRODUCTS_CACHE_TTL,
            showError: false,
            maxRetries: 0,
            timeout: 10000
        });
        const list = res?.data?.list || res?.data || [];
        return {
            catId: categoryId,
            products: mapProductsForCategory(page, Array.isArray(list) ? list : [])
        };
    } catch (_err) {
        return { catId: categoryId, products: [] };
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
        nextAllProducts[categoryId] = mapProductsForCategory(page, currentProducts[categoryId] || []);
    });

    page.setData({ allProducts: nextAllProducts });
}

module.exports = {
    mapProductsForCategory,
    loadCategoryProductsBatch,
    queueRemainingCategoryLoads,
    ensureCategoryProductsLoaded,
    refreshPricePreviewHints
};
