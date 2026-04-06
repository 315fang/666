// pages/category/category.js - 分类页
// 结构：二级商城（侧边栏分类 → 商品列表）+ 分页加载
// 联动：当前版本 scroll sync（calculateCategoryHeights + onRightScroll + leftToView）
// 购物袋：当前版本改进逻辑（items / summary.total_amount + cart_ids 结算）
const { get, post } = require('../../utils/request');
const { cachedGet } = require('../../utils/requestCache');
const { normalizeProductId } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');
const { requireLogin } = require('../../utils/auth');
const { getApiBaseUrl } = require('../../config/env');
const navigator = require('../../utils/navigator');
const { syncPageTabBar, restorePageTabBar } = require('../../utils/tabBarHelper');
const {
    loadCategoryProductsBatch,
    queueRemainingCategoryLoads,
    ensureCategoryProductsLoaded,
    refreshPricePreviewHints
} = require('./categoryProductLoader');
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

function normalizeAssetUrl(url = '') {
    const raw = String(url || '');
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) {
        const apiBase = getApiBaseUrl().replace(/\/api\/?$/, '');
        return `${apiBase}${raw}`;
    }
    return raw;
}

const CATEGORY_INITIAL_BATCH_SIZE = 2;
const CATEGORY_PRICE_PREVIEW_TTL = 60 * 1000;

Page({
    data: {
        categories: [],
        currentCategory: '',
        headerTopPadding: 20,

        // 连续滚动联动
        toView: '',
        leftToView: '',
        categoryHeights: [],
        isManualClick: false,

        // 全分类商品（categoryId -> product[]）
        allProducts: {},
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
        this.loadCategoryBanners();
        this.loadSidebarCategories();
    },

    onPullDownRefresh() {
        Promise.all([
            this.loadCategoryBanners(),
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
        const mapBanners = (list) => (list || [])
            .map((b) => ({
                id: b.id,
                image: normalizeAssetUrl(b.image_url),
                link_type: b.link_type || 'none',
                link_value: b.link_value != null ? String(b.link_value) : ''
            }))
            .filter((b) => !!b.image);
        try {
            const res = await cachedGet(get, '/banners', { position: 'category' }, {
                cacheTTL: 3 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            });
            const raw = res?.data ?? res?.list ?? [];
            const list = Array.isArray(raw) ? raw : [];
            this.setData({ categoryBanners: mapBanners(list) });
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
        if (!categories.length) return;
        const exists = categories.some((c) => String(c.id) === String(id));
        if (!exists) return;
        try {
            wx.removeStorageSync('category_focus_id');
        } catch (e) { /* ignore */ }
        this.setData({
            currentCategory: id,
            toView: 'cat-' + id,
            leftToView: 'left-' + id,
            isManualClick: true
        });
        this.ensureCategoryProductsLoaded(id);
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
            let allCats = catRes.data || [];
            const filteredCats = Array.isArray(allCats) && allCats.length > 0 ? allCats : [];

            if (filteredCats.length > 0) {
                await new Promise((resolve) => this.setData({
                    categories: filteredCats,
                    currentCategory: filteredCats[0].id,
                    loadedCategories: {},
                    allProducts: {}
                }, resolve));
                this._applyPendingCategoryFocus();
                await this.loadAllProducts({
                    forceRefresh: true,
                    initialCategoryId: this.data.currentCategory || filteredCats[0].id
                });
            } else {
                this.setData({ categories: [] });
            }
        } catch (err) {
            ErrorHandler.handle(err, { customMessage: '加载分类失败' });
        }
    },

    async loadAllProducts(options = {}) {
        const { forceRefresh = false, initialCategoryId } = options;
        const categories = this.data.categories || [];

        if (!categories.length) {
            this.setData({ allProducts: {}, loadedCategories: {}, loading: false });
            return;
        }

        const loadToken = Date.now();
        this._categoryLoadToken = loadToken;
        this._pendingCategoryLoadIds = new Set();

        await new Promise((resolve) => this.setData({
            loading: true,
            allProducts: forceRefresh ? {} : (this.data.allProducts || {}),
            loadedCategories: forceRefresh ? {} : (this.data.loadedCategories || {})
        }, resolve));

        const orderedIds = categories.map(cat => cat.id);
        const firstBatchIds = [];
        const preferredId = initialCategoryId || this.data.currentCategory || orderedIds[0];

        if (preferredId) {
            firstBatchIds.push(preferredId);
        }

        orderedIds.forEach((categoryId) => {
            if (firstBatchIds.length < CATEGORY_INITIAL_BATCH_SIZE && !firstBatchIds.includes(categoryId)) {
                firstBatchIds.push(categoryId);
            }
        });

        try {
            await this._loadCategoryProductsBatch(firstBatchIds, loadToken, { setLoadingFalse: true });
            const remainingIds = orderedIds.filter(categoryId => !firstBatchIds.includes(categoryId));
            this._queueRemainingCategoryLoads(remainingIds, loadToken);
        } catch (err) {
            console.error('加载商品失败:', err);
            if (this._categoryLoadToken === loadToken) {
                this.setData({ loading: false });
            }
        }
    },

    async _loadCategoryProductsBatch(categoryIds, loadToken, options = {}) {
        return loadCategoryProductsBatch(this, categoryIds, loadToken, options);
    },

    async _fetchCategoryProducts(categoryId) {
        return loadCategoryProductsBatch(this, [categoryId], this._categoryLoadToken || Date.now())
            .then((results) => Array.isArray(results) && results[0] ? results[0] : { catId: categoryId, products: [] });
    },

    _mapProductsForCategory(list) {
        const { mapProductsForCategory } = require('./categoryProductLoader');
        return mapProductsForCategory(this, list);
    },

    _queueRemainingCategoryLoads(categoryIds, loadToken) {
        return queueRemainingCategoryLoads(this, categoryIds, loadToken);
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

    // ===== 侧边栏点击 =====

    onCategoryTap(e) {
        const categoryId = e.currentTarget.dataset.id;
        this.setData({
            currentCategory: categoryId,
            toView: 'cat-' + categoryId,
            leftToView: 'left-' + categoryId,
            isManualClick: true
        });
        this.ensureCategoryProductsLoaded(categoryId);
        setTimeout(() => { this.setData({ isManualClick: false }); }, 800);
    },

    // ===== 右侧滚动联动左侧菜单（来自当前版本）=====

    onRightScroll(e) {
        if (this.data.isManualClick) return;
        const scrollTop = e.detail.scrollTop;
        const { categoryHeights, categories } = this.data;
        if (!categoryHeights || categoryHeights.length === 0) return;

        for (let i = categoryHeights.length - 1; i >= 0; i--) {
            if (scrollTop >= categoryHeights[i] - 50) {
                const catId = categories[i]?.id;
                if (catId && this.data.currentCategory !== catId) {
                    this.setData({
                        currentCategory: catId,
                        leftToView: 'left-' + catId
                    });
                }
                break;
            }
        }
    },

    calculateCategoryHeights() {
        const query = wx.createSelectorQuery().in(this);
        query.selectAll('.cat-section').boundingClientRect();
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
                url: `/pages/order/confirm?from=cart&cart_ids=${_cartItemIds}`
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
        if (!forceRefresh && this._pricePreviewPromise) {
            return this._pricePreviewPromise;
        }

        if (!forceRefresh && this._lastPricePreviewLoadedAt && (Date.now() - this._lastPricePreviewLoadedAt) < CATEGORY_PRICE_PREVIEW_TTL) {
            return;
        }

        this._pricePreviewPromise = (async () => {
            const [toggleRes, pointRes, couponRes] = await Promise.all([
                get('/configs').catch(() => null),
                get('/points/account').catch(() => null),
                get('/coupons/available?amount=0').catch(() => null)
            ]);
            let enabled = false;
            let couponEnabled = true;
            if (toggleRes && toggleRes.code === 0 && toggleRes.data) {
                const toggles = toggleRes.data.feature_toggles || toggleRes.data;
                if (Array.isArray(toggles)) {
                    const t = toggles.find(f => f.key === 'price_preview');
                    enabled = t ? t.enabled : false;
                    const c = toggles.find(f => f.key === 'coupon');
                    couponEnabled = c ? c.enabled : true;
                } else if (typeof toggles === 'object') {
                    enabled = !!toggles.price_preview;
                    couponEnabled = toggles.coupon !== undefined ? !!toggles.coupon : true;
                }
            }
            const pb = (pointRes && pointRes.code === 0 && pointRes.data) ? (pointRes.data.balance_points || 0) : 0;
            let bestCoupon = 0;
            if (couponEnabled && couponRes && couponRes.code === 0 && couponRes.data) {
                const coupons = couponRes.data || [];
                coupons.forEach(c => {
                    if (c.coupon_type === 'fixed' || c.coupon_type === 'no_threshold') {
                        bestCoupon = Math.max(bestCoupon, parseFloat(c.coupon_value || 0));
                    }
                });
            }
            const shouldRefreshTips = enabled !== this.data.pricePreviewEnabled
                || pb !== this.data.userPointBalance
                || bestCoupon !== this.data.userBestCoupon;

            await new Promise((resolve) => this.setData({
                pricePreviewEnabled: enabled,
                userPointBalance: pb,
                userBestCoupon: bestCoupon
            }, resolve));

            if (shouldRefreshTips) {
                this._refreshPricePreviewHints();
            }

            this._lastPricePreviewLoadedAt = Date.now();
        })().catch(() => {
            // 静默失败
        }).finally(() => {
            this._pricePreviewPromise = null;
        });

        return this._pricePreviewPromise;
    },

    _refreshPricePreviewHints() {
        return refreshPricePreviewHints(this);
    }
});


