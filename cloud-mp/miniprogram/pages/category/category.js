// pages/category/category.js - 分类页
// 结构：二级商城（侧边栏分类 → 商品列表）+ 分页加载
// 联动：当前版本 scroll sync（calculateCategoryHeights + onRightScroll + leftToView）
// 购物袋：当前版本改进逻辑（items / summary.total_amount + cart_ids 结算）

const { get } = require('../../utils/request');
const { cachedGet } = require('../../utils/requestCache');
const { normalizeProductId } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');
const { warmRenderableImageUrls, resolveRenderableImageUrl } = require('../../utils/cloudAssetRuntime');
const navigator = require('../../utils/navigator');
const { syncCustomTabBar } = require('../../utils/miniProgramConfig');
const { syncPageTabBar, restorePageTabBar } = require('../../utils/tabBarHelper');
const {
    loadAllCategoryProducts,
    prefetchCategoryProductFirstPage,
    ensureCategoryProductsLoaded,
    refreshPricePreviewHints
} = require('./categoryProductLoader');
const { imageLazyLoader } = require('../../utils/imageLazyLoader');
const { loadPricePreviewData } = require('./categoryPricePreview');
const {
    updateCartData,
    openCartPopup,
    closeCartPopup,
    toggleCartPopupItem,
    calcCartPopupTotal,
    popupCheckout,
    syncPopupSelection,
    togglePopupSelectAll,
    clearCartPopup,
    changeCartItemQty
} = require('./categoryCart');

const CATEGORY_PRICE_PREVIEW_TTL = 60 * 1000;
const PRODUCT_PLACEHOLDER = '/assets/images/placeholder.svg';
const BUNDLE_ZONE_ID = 'bundle-zone';
const BUNDLE_ZONE_NAME = '特惠组合';
const HOT_ZONE_NAME = '爆单专区';
const PRODUCT_IMAGE_MAX_RETRY = 2;

function getCategoryId(category = {}) {
    return String(category.id != null ? category.id : (category._id != null ? category._id : '')).trim();
}

function getCategoryName(category = {}) {
    return String(category.name || category.title || '').trim();
}

function normalizeDisplayCategory(category = {}) {
    const id = getCategoryId(category);
    return id && category.id == null ? { ...category, id } : category;
}

function isHotZoneCategory(category = {}) {
    return getCategoryName(category) === HOT_ZONE_NAME;
}

function getProductIdKey(product = {}) {
    const id = product.id ?? product._id ?? product._legacy_id;
    return String(id == null ? '' : id).trim();
}

function sameProductId(product = {}, productId) {
    return getProductIdKey(product) === String(productId == null ? '' : productId).trim();
}

function collectProductImageRecoverySources(product = {}) {
    const sources = [];
    const push = (value) => {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(push);
            return;
        }
        sources.push(value);
    };

    push(product.image_ref || product.file_id || product.fileId);
    push({
        file_id: product.image_ref || product.file_id || product.fileId || '',
        image: '',
        image_url: '',
        cover_image: product.cover_image || '',
        preview_images: product.preview_images || product.previewImages || '',
        images: product.images || ''
    });
    push(product.image_sources);
    push(product.preview_images || product.previewImages);
    push(product.images);
    push(product.display_image || product.image || product.image_url);

    return sources;
}

function sortDisplayCategories(categories = []) {
    const rows = (Array.isArray(categories) ? categories : [])
        .map((item) => normalizeDisplayCategory(item))
        .filter((item) => !!getCategoryId(item));
    const hotIndex = rows.findIndex(isHotZoneCategory);
    if (hotIndex <= 0) return rows;
    const next = rows.slice();
    const [hot] = next.splice(hotIndex, 1);
    return [hot, ...next];
}

function splitDisplayCategories(categories = []) {
    const rows = sortDisplayCategories(categories);
    if (rows.length && isHotZoneCategory(rows[0])) {
        return {
            leadCategory: rows[0],
            restCategories: rows.slice(1)
        };
    }
    return {
        leadCategory: null,
        restCategories: rows
    };
}

Page({
    data: {
        categories: [],
        leadCategory: null,
        renderedCategories: [],
        renderedSectionIds: [],
        sidebarCategories: [],
        currentCategory: '',
        headerTopPadding: 20,

        // 连续滚动联动
        toView: '',
        leftToView: '',
        categoryHeights: [],
        isManualClick: false,
        productBundles: [],

        // 全分类商品（categoryId -> product[]）
        allProducts: {},
        visibleProducts: {},
        loadedCategories: {},
        loading: false,

        // 购物袋
        cartCount: 0,
        cartTotal: '0.00',
        _cartItemIds: '',
        userPointBalance: 0,
        userBestCoupon: 0,
        pricePreviewEnabled: false,
        showCartPopup: false,
        cartPopupItems: [],
        cartPopupSelectedIds: [],
        cartPopupTotal: '0.00',
        cartPopupAllSelected: true,

        statusBarHeight: 20,

        // 顶部广告轮播（后台 position=category）
        categoryBanners: []
    },

    onShow() {
        syncCustomTabBar(this);
        this.updateCartData();
        this._loadPricePreviewData();
        this._syncOverlayTabBar();
        this._applyPendingCategoryFocus();
    },

    onHide() {
        this._restoreNativeTabBar();
        this._clearCategoryTimers();
    },

    onUnload() {
        this._restoreNativeTabBar();
        this._clearCategoryTimers();
    },

    onLoad() {
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const headerTopPadding = (windowInfo.statusBarHeight || 20) + 6;
        this.setData({
            statusBarHeight: windowInfo.statusBarHeight || 20,
            headerTopPadding
        });
        this._categoryFirstProductPagePromise = prefetchCategoryProductFirstPage(false).catch(() => null);
        this.loadCategoryBanners();
        this.loadProductBundles();
        this.loadSidebarCategories();
    },

    onPullDownRefresh() {
        Promise.all([
            this.loadCategoryBanners(),
            this.loadProductBundles(true),
            this.loadAllProducts({
                forceRefresh: true,
                initialCategoryId: this.data.currentCategory
            })
        ]).finally(() => {
            wx.stopPullDownRefresh();
        });
    },

    /** 后台「内容管理 → Banner → 分类页」对应接口 GET /api/banners?position=category */
    async loadCategoryBanners() {
        const mapBanners = async (list) => {
            const rows = Array.isArray(list) ? list : [];
            await warmRenderableImageUrls(rows);
            const mapped = await Promise.all(rows.map(async (b) => ({
                id: b.id,
                image: await resolveRenderableImageUrl(b, ''),
                title: b.title || '',
                subtitle: b.subtitle || '',
                link_type: b.link_type || 'none',
                link_value: b.link_value != null ? String(b.link_value) : ''
            })));
            return mapped.filter((b) => !!(b.image || b.title || b.subtitle));
        };
        try {
            const res = await cachedGet(get, '/banners', { position: 'category' }, {
                cacheTTL: 3 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            });
            const raw = res?.data?.list ?? res?.list ?? res?.data ?? [];
            const list = Array.isArray(raw) ? raw : [];
            this.setData({ categoryBanners: await mapBanners(list) });
        } catch (e) {
            console.log('[Category] 分类页 Banner 加载失败', e);
            this.setData({ categoryBanners: [] });
        }
    },

    onCategoryBannerTap(e) {
        const item = e.currentTarget.dataset.item;
        if (!item) return;
        navigator.navigate(item.link_type, item.link_value);
    },

    onOpenSearch() {
        wx.navigateTo({ url: '/pages/search/search' });
    },

    /**
     * Banner 跳转类型 category：navigator 写入 category_focus_id 后 switchTab，此处选中对应左侧分类
     */
    _applyPendingCategoryFocus() {
        let id = '';
        try {
            id = wx.getStorageSync('category_focus_id');
        } catch (e) {
            return;
        }
        if (!id) return;
        const categories = this.data.categories || [];
        const exists = id === BUNDLE_ZONE_ID
            ? (this.data.productBundles || []).length > 0
            : categories.some((c) => getCategoryId(c) === String(id));
        if (!exists) return;
        try {
            wx.removeStorageSync('category_focus_id');
        } catch (e) { /* ignore */ }
        this.setData({
            currentCategory: id,
            ...this._buildRenderedSectionState({ currentCategory: id }),
            toView: 'cat-' + id,
            leftToView: 'left-' + id,
            isManualClick: true
        });
        this._scheduleHeightCalc();
        this.ensureCategoryProductsLoaded(id);
        this._primeNeighborCategories(id);
        setTimeout(() => {
            this.setData({ isManualClick: false });
        }, 800);
    },

    async loadSidebarCategories() {
        try {
            const catRes = await cachedGet(get, '/categories', {}, {
                cacheTTL: 5 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            });
            let allCats = catRes.list || catRes.data?.list || catRes.data || [];
            const filteredCats = sortDisplayCategories(Array.isArray(allCats) && allCats.length > 0 ? allCats : []);

            if (filteredCats.length > 0) {
                const currentCategory = getCategoryId(filteredCats[0]);
                await new Promise((resolve) => this.setData({
                    categories: filteredCats,
                    ...this._buildRenderedSectionState({
                        categories: filteredCats,
                        loadedCategories: {},
                        currentCategory,
                        productBundles: this.data.productBundles
                    }),
                    sidebarCategories: this._buildSidebarCategories(filteredCats, this.data.productBundles),
                    currentCategory,
                    loadedCategories: {},
                    allProducts: {},
                    visibleProducts: {}
                }, resolve));
                this._applyPendingCategoryFocus();
                await this.loadAllProducts({
                    forceRefresh: true,
                    initialCategoryId: this.data.currentCategory || filteredCats[0].id
                });
            } else {
                this.setData({
                    categories: [],
                    ...this._buildRenderedSectionState({ categories: [], loadedCategories: {}, currentCategory: '' }),
                    sidebarCategories: this._buildSidebarCategories([])
                });
            }
        } catch (err) {
            ErrorHandler.handle(err, { customMessage: '加载分类失败' });
        }
    },

    _buildSidebarCategories(categories) {
        const bundles = Array.isArray(arguments[1]) ? arguments[1] : (this.data.productBundles || []);
        const base = sortDisplayCategories(Array.isArray(categories) ? categories : []);
        if (!bundles.length) return base;
        const bundleEntry = { id: BUNDLE_ZONE_ID, name: BUNDLE_ZONE_NAME, _virtual: true };
        if (base.length && isHotZoneCategory(base[0])) {
            return [base[0], bundleEntry, ...base.slice(1)];
        }
        return [bundleEntry, ...base];
    },

    _buildLeadCategory(categories) {
        return splitDisplayCategories(categories).leadCategory;
    },

    _buildRenderedCategories(categories, loadedCategories, currentCategory) {
        return splitDisplayCategories(categories).restCategories;
    },

    _buildRenderedSectionIds(categories, loadedCategories, currentCategory, productBundles) {
        const ids = [];
        const { leadCategory, restCategories } = splitDisplayCategories(categories);
        if (leadCategory) {
            const id = getCategoryId(leadCategory);
            if (id) ids.push(id);
        }
        if (Array.isArray(productBundles) && productBundles.length > 0) {
            ids.push(BUNDLE_ZONE_ID);
        }
        restCategories.forEach((item) => {
            const id = getCategoryId(item);
            if (id) ids.push(id);
        });
        return ids;
    },

    _buildRenderedSectionState(patch = {}) {
        const categories = patch.categories !== undefined ? patch.categories : this.data.categories;
        const loadedCategories = patch.loadedCategories !== undefined ? patch.loadedCategories : this.data.loadedCategories;
        const currentCategory = patch.currentCategory !== undefined ? patch.currentCategory : this.data.currentCategory;
        const productBundles = patch.productBundles !== undefined ? patch.productBundles : this.data.productBundles;
        return {
            leadCategory: this._buildLeadCategory(categories),
            renderedCategories: this._buildRenderedCategories(categories, loadedCategories, currentCategory),
            renderedSectionIds: this._buildRenderedSectionIds(categories, loadedCategories, currentCategory, productBundles)
        };
    },

    _getNextCategoryId(currentCategory) {
        const categories = Array.isArray(this.data.categories) ? this.data.categories : [];
        if (!categories.length) return '';
        const sectionIds = this._buildRenderedSectionIds(categories, {}, currentCategory, this.data.productBundles);
        const currentId = String(currentCategory || '').trim();
        const currentIndex = sectionIds.findIndex((id) => String(id) === currentId);
        if (currentIndex === -1) return '';
        for (let i = currentIndex + 1; i < sectionIds.length; i += 1) {
            if (sectionIds[i] !== BUNDLE_ZONE_ID) return sectionIds[i];
        }
        return '';
    },

    _primeNeighborCategories(currentCategory) {
        const nextCategoryId = this._getNextCategoryId(currentCategory);
        if (!nextCategoryId || nextCategoryId === BUNDLE_ZONE_ID) return;
        this.ensureCategoryProductsLoaded(nextCategoryId);
    },

    async loadProductBundles(forceRefresh = false) {
        try {
            const res = await cachedGet(get, '/product-bundles', { page: 1, limit: 20 }, {
                cacheTTL: 0,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            });
            const raw = res?.data?.list || res?.list || [];
            const coverSources = (Array.isArray(raw) ? raw : []).map((item) => ({
                file_id: item.cover_file_id || '',
                image: item.cover_preview_url || item.cover_image || ''
            }));
            await warmRenderableImageUrls(coverSources);
            const productBundles = await Promise.all((Array.isArray(raw) ? raw : []).map(async (item) => ({
                ...item,
                cover_preview_url: await resolveRenderableImageUrl({
                    file_id: item.cover_file_id || '',
                    image: item.cover_preview_url || item.cover_image || ''
                }, '')
            })));
            this.setData({
                productBundles,
                ...this._buildRenderedSectionState({ productBundles }),
                sidebarCategories: this._buildSidebarCategories(this.data.categories, productBundles)
            });
            this._scheduleHeightCalc();
            this._applyPendingCategoryFocus();
        } catch (e) {
            if (forceRefresh) {
                this.setData({
                    productBundles: [],
                    ...this._buildRenderedSectionState({ productBundles: [] }),
                    sidebarCategories: this._buildSidebarCategories(this.data.categories, [])
                });
            }
        }
    },

    async loadAllProducts(options = {}) {
        const { forceRefresh = false, initialCategoryId } = options;
        const categories = this.data.categories || [];

        if (!categories.length) {
            this.setData({
                allProducts: {},
                visibleProducts: {},
                loadedCategories: {},
                ...this._buildRenderedSectionState({ categories: [], loadedCategories: {} }),
                loading: false
            });
            return;
        }

        const loadToken = Date.now();
        this._categoryLoadToken = loadToken;
        this._pendingCategoryLoadIds = new Set();

        await new Promise((resolve) => this.setData({
            loading: true,
            allProducts: forceRefresh ? {} : (this.data.allProducts || {}),
            visibleProducts: forceRefresh ? {} : (this.data.visibleProducts || {}),
            loadedCategories: forceRefresh ? {} : (this.data.loadedCategories || {})
        }, resolve));

        const orderedIds = categories
            .map(cat => cat && (cat.id || cat._id))
            .filter(Boolean);
        const preferredId = initialCategoryId || this.data.currentCategory || orderedIds[0];

        try {
            const firstPagePromise = forceRefresh ? null : this._categoryFirstProductPagePromise;
            this._categoryFirstProductPagePromise = null;
            await loadAllCategoryProducts(this, orderedIds, loadToken, {
                forceRefresh,
                setLoadingFalse: true,
                firstPagePromise
            });
            if (preferredId && this.data.currentCategory !== preferredId) {
                this.setData({
                    currentCategory: preferredId,
                    ...this._buildRenderedSectionState({ currentCategory: preferredId })
                });
            }
            this._preloadInitialProductImages();
        } catch (err) {
            console.error('加载商品失败:', err);
            if (this._categoryLoadToken === loadToken) {
                this.setData({ loading: false });
            }
        }
    },

    _mapProductsForCategory(list) {
        const { mapProductsForCategory } = require('./categoryProductLoader');
        return mapProductsForCategory(this, list);
    },

    ensureCategoryProductsLoaded(categoryId) {
        return ensureCategoryProductsLoaded(this, categoryId);
    },

    _scheduleHeightCalc() {
        clearTimeout(this._heightCalcTimer);
        this._heightCalcTimer = setTimeout(() => {
            this.calculateCategoryHeights();
        }, 120);
    },

    _clearCategoryTimers() {
        clearTimeout(this._heightCalcTimer);
    },

    _preloadInitialProductImages() {
        const allProducts = this.data.allProducts || {};
        const currentCategory = this.data.currentCategory;
        const images = [];
        const addImages = (list = [], limit = 8) => {
            (Array.isArray(list) ? list : []).slice(0, limit).forEach((item) => {
                const image = String(item && item.image || '').trim();
                if (image && image !== PRODUCT_PLACEHOLDER && !image.startsWith('/assets/')) {
                    images.push(image);
                }
            });
        };

        if (currentCategory && allProducts[currentCategory]) {
            addImages(allProducts[currentCategory], 10);
        }
        Object.keys(allProducts).forEach((categoryId) => {
            if (images.length >= 14 || categoryId === currentCategory) return;
            addImages(allProducts[categoryId], 2);
        });

        const uniqueImages = [...new Set(images)].slice(0, 14);
        if (!uniqueImages.length) return;
        imageLazyLoader.preloadImages(uniqueImages, 3).catch(() => {});
    },

    // ===== 侧边栏点击 =====

    onCategoryTap(e) {

        const categoryId = e.currentTarget.dataset.id;
        this.setData({
            currentCategory: categoryId,
            ...this._buildRenderedSectionState({ currentCategory: categoryId }),
            toView: 'cat-' + categoryId,
            leftToView: 'left-' + categoryId,
            isManualClick: true
        });
        this._scheduleHeightCalc();
        if (categoryId !== BUNDLE_ZONE_ID) {
            this.ensureCategoryProductsLoaded(categoryId);
        }
        this._primeNeighborCategories(categoryId);
        setTimeout(() => { this.setData({ isManualClick: false }); }, 800);
    },

    _rebuildVisibleProducts() {
        const allProducts = this.data.allProducts || {};
        const nextVisibleProducts = {};

        Object.keys(allProducts).forEach((categoryId) => {
            const list = Array.isArray(allProducts[categoryId]) ? allProducts[categoryId] : [];
            nextVisibleProducts[categoryId] = list;
        });

        this.setData({
            visibleProducts: nextVisibleProducts,
            ...this._buildRenderedSectionState()
        });
    },

    // ===== 右侧滚动联动左侧菜单（来自当前版本）=====

    onRightScroll(e) {
        if (this.data.isManualClick) return;
        const scrollTop = e.detail.scrollTop;
        const { categoryHeights, renderedSectionIds } = this.data;
        if (!categoryHeights || categoryHeights.length === 0) return;

        for (let i = categoryHeights.length - 1; i >= 0; i--) {
            if (scrollTop >= categoryHeights[i] - 50) {
                const catId = renderedSectionIds[i];
                if (catId && this.data.currentCategory !== catId) {
                    this.setData({
                        currentCategory: catId,
                        ...this._buildRenderedSectionState({ currentCategory: catId }),
                        leftToView: 'left-' + catId
                    });
                    this._primeNeighborCategories(catId);
                }
                break;
            }
        }
    },

    calculateCategoryHeights() {
        const query = wx.createSelectorQuery().in(this);
        query.selectAll('.cat-section-anchor').boundingClientRect();
        query.select('.right-content').scrollOffset();
        query.exec((res) => {
            if (!res[0] || res[0].length === 0) return;
            const scrollTop = res[1]?.scrollTop || 0;
            const heights = res[0].map(rect => rect.top + scrollTop - res[0][0].top);
            this.setData({ categoryHeights: heights });
        });
    },

    _syncOverlayTabBar() {
        const shouldHide = !!this.data.showCartPopup;
        syncPageTabBar(this, shouldHide);
    },

    _restoreNativeTabBar() {
        restorePageTabBar(this);
    },

    onOpenProductDetail(e) {

        const rawId = e.currentTarget.dataset.id;
        const id = normalizeProductId(rawId);
        if (id === null || id === undefined || id === '') {
            wx.showToast({ title: '商品信息异常', icon: 'none' });
            return;
        }
        wx.navigateTo({
            url: `/pages/product/detail?id=${encodeURIComponent(String(id))}`
        });
    },

    onOpenBundleDetail(e) {
        const id = String(e.currentTarget.dataset.id || '').trim();
        if (!id) return;
        wx.navigateTo({
            url: `/pages/product-bundle/detail?id=${encodeURIComponent(id)}`
        });
    },

    async onProductImageError(e) {
        const categoryId = e.currentTarget.dataset.categoryId;
        const productId = e.currentTarget.dataset.id;
        const retryKey = `${categoryId || 'all'}:${productId || ''}`;
        this._productImageRetryCounts = this._productImageRetryCounts || {};
        const retryCount = Number(this._productImageRetryCounts[retryKey] || 0);

        const allProducts = { ...(this.data.allProducts || {}) };
        let targetProduct = null;
        Object.keys(allProducts).some((key) => {
            const list = Array.isArray(allProducts[key]) ? allProducts[key] : [];
            targetProduct = list.find((product) => sameProductId(product, productId));
            return !!targetProduct;
        });

        if (targetProduct && targetProduct.image !== PRODUCT_PLACEHOLDER && retryCount < PRODUCT_IMAGE_MAX_RETRY) {
            this._productImageRetryCounts[retryKey] = retryCount + 1;
            const sources = collectProductImageRecoverySources(targetProduct);
            for (let i = 0; i < sources.length; i += 1) {
                const nextImage = await resolveRenderableImageUrl(sources[i], '', { forceRefresh: true }).catch(() => '');
                if (!nextImage || nextImage === PRODUCT_PLACEHOLDER || nextImage === targetProduct.image) continue;
                const patched = this._patchProductImage(productId, categoryId, nextImage, false);
                if (patched) return;
            }
        }

        this._patchProductImage(productId, categoryId, PRODUCT_PLACEHOLDER, true);
    },

    _patchProductImage(productId, categoryId, image, isFallback = false) {
        const allProducts = { ...(this.data.allProducts || {}) };
        let changed = false;

        Object.keys(allProducts).forEach((key) => {
            const list = Array.isArray(allProducts[key]) ? allProducts[key] : [];
            allProducts[key] = list.map((product) => {
                if (!sameProductId(product, productId)) return product;
                if (product.image === image) return product;
                changed = true;
                return {
                    ...product,
                    image,
                    display_image: image,
                    image_missing: !!isFallback
                };
            });
        });

        if (!changed) return false;

        const visibleProducts = { ...(this.data.visibleProducts || {}) };
        if (categoryId && Array.isArray(visibleProducts[categoryId])) {
            visibleProducts[categoryId] = visibleProducts[categoryId].map((product) => (
                sameProductId(product, productId)
                    ? { ...product, image, display_image: image, image_missing: !!isFallback }
                    : product
            ));
        }

        this.setData({
            allProducts,
            visibleProducts
        });
        return true;
    },

    stopProp() { },

    // ===== 购物袋逻辑（来自当前版本，适配 items + summary.total_amount）=====

    // 私有方法：统一解析后端购物袋响应中的商品列表
    _parseCartItems(res) {
        return require('./categoryCart').parseCartItems(res);
    },

    async updateCartData(forceRefresh = false) {
        return updateCartData(this, forceRefresh);
    },

    onToggleCartPopup() {
        if (this.data.cartCount <= 0) {
            wx.showToast({ title: '先挑选几件好物', icon: 'none' });
            return;
        }
        this.openCartPopup();
    },

    onCheckout() {

        const { cartCount, _cartItemIds } = this.data;
        if (cartCount > 0 && _cartItemIds) {
            // 带上购物袋商品 ID 结算（来自当前版本）
            wx.navigateTo({
                url: `/pages/order/confirm?from=cart&cart_ids=${encodeURIComponent(_cartItemIds)}`
            });
        } else {
            wx.showToast({ title: '请先选购商品', icon: 'none' });
        }
    },

    async openCartPopup() {
        return openCartPopup(this);
    },

    closeCartPopup() {
        return closeCartPopup(this);
    },

    onToggleCartPopupItem(e) {
        const index = e.currentTarget.dataset.index;
        return toggleCartPopupItem(this, index);
    },

    calcCartPopupTotal() {
        return calcCartPopupTotal(this);
    },

    onPopupCheckout() {
        return popupCheckout(this);
    },

    _syncPopupSelection() {
        return syncPopupSelection(this);
    },

    onPopupToggleAll() {
        return togglePopupSelectAll(this);
    },

    onPopupClearAll() {
        return clearCartPopup(this);
    },

    async onPopupMinus(e) {
        const index = e.currentTarget.dataset.index;
        const item = this.data.cartPopupItems[index];
        if (!item) return;
        return changeCartItemQty(this, index, item.quantity - 1);
    },

    async onPopupPlus(e) {
        const index = e.currentTarget.dataset.index;
        const item = this.data.cartPopupItems[index];
        if (!item) return;
        return changeCartItemQty(this, index, item.quantity + 1);
    },

    async _loadPricePreviewData(forceRefresh = false) {
        return loadPricePreviewData(this, forceRefresh, CATEGORY_PRICE_PREVIEW_TTL);
    },

    _refreshPricePreviewHints() {
        const result = refreshPricePreviewHints(this);
        this._rebuildVisibleProducts();
        return result;
    }
});
