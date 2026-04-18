const { get } = require('../../utils/request');
const { cachedGet } = require('../../utils/requestCache');
const { resolveProductImage, resolveProductDisplayPrice, genHeatLabel } = require('../../utils/dataFormatter');
const { getMiniProgramConfig } = require('../../utils/miniProgramConfig');
const app = getApp();

const CATEGORY_BACKGROUND_BATCH_SIZE = 2;
const CATEGORY_PRODUCTS_CACHE_TTL = 2 * 60 * 1000;

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

function mapProductsForCategory(page, list) {
    const pointBalance = page.data.userPointBalance || 0;
    const bestCoupon = page.data.userBestCoupon || 0;
    const showPreview = page.data.pricePreviewEnabled;
    const activityProductMaps = page.data.activityProductMaps || {};
    const groupMap = activityProductMaps.group || {};
    const slashMap = activityProductMaps.slash || {};
    const roleLevel = app.globalData.userInfo?.role_level || 0;

    return (list || []).map((item) => {
        const retailPrice = parseFloat(resolveProductDisplayPrice(item, roleLevel) || 0);
        const marketPrice = parseFloat(item.market_price || 0);
        const sales = Number(item.purchase_count || item.sales_count || 0);
        const groupActivity = groupMap[item.id] || null;
        const slashActivity = slashMap[item.id] || null;
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
            image: resolveProductImage(item),
            specSummary: buildSpecSummary(item),
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
            slashFloorPrice: slashActivity ? parseFloat(slashActivity.floor_price || 0) : 0,
            role_level_price: retailPrice
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
        const normalizedList = dedupeProductsById(list).filter((item) => matchesCategoryId(item, categoryId));
        return {
            catId: categoryId,
            products: mapProductsForCategory(page, normalizedList)
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
