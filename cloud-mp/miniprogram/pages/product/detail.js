// pages/product/detail.js
const { get, post } = require('../../utils/request');
const { normalizeActivityList, resolveSlashResumePayload } = require('./utils/activityHelpers');
const { normalizeProductId } = require('../../utils/dataFormatter');
const { USER_ROLES } = require('../../config/constants');
const { safeBack } = require('../../utils/navigator');
const { requireLogin, ensureLogin, getLoginState } = require('../../utils/auth');
const { fetchLimitedSpotContext, normalizeLimitedSpotMode } = require('../../utils/limitedSpot');
const { getMiniProgramConfig } = require('../../utils/miniProgramConfig');
const { loadProduct, resolveDetailImageList, resolvePayableUnitPrice, buildSkuText, PRODUCT_PLACEHOLDER } = require('./productDetailData');
const { refreshFavoriteState, toggleFavorite } = require('./productDetailFavorite');
const {
    normalizeProductLaunchOptions,
    captureShareInvite,
    buildProductSharePayload,
    openProductPoster
} = require('./productDetailShare');
const {
    onSpecSelect,
    getMaxStock,
    onMinus,
    onPlus,
    onQtyInput,
    onBuyNow,
    addToCart
} = require('./productDetailActions');
const app = getApp();

function normalizeUserMessage(message, fallback) {
    const text = message ? String(message).trim() : '';
    if (!text || text === 'ok') return fallback;
    return text;
}

function extractResultList(payload) {
    if (Array.isArray(payload && payload.list)) return payload.list;
    if (Array.isArray(payload && payload.data)) return payload.data;
    if (payload && payload.data && Array.isArray(payload.data.list)) return payload.data.list;
    return [];
}

function extractCartItems(payload) {
    if (!payload) return [];
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.list)) return payload.list;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
    if (payload.data && Array.isArray(payload.data.list)) return payload.data.list;
    return [];
}

function countCartQuantity(items = []) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
        const quantity = Number(item.quantity != null ? item.quantity : item.qty);
        return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
    }, 0);
}

function formatLimitedSpotMoney(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount < 0) return '0.00';
    return amount.toFixed(2);
}

const DEFAULT_PURCHASE_POINTS_BY_ROLE = {
    0: 50,
    1: 100,
    2: 150,
    3: 300,
    4: 400,
    5: 500,
    6: 500
};

function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function resolveBenefitRoleLevel(roleLevel) {
    const normalized = Math.max(0, Math.floor(toFiniteNumber(roleLevel, 0)));
    return normalized >= 5 ? 5 : normalized;
}

function getPurchasePointsPerHundred(roleLevel) {
    const config = getMiniProgramConfig();
    const rule = config.point_rule_config || {};
    const multipliers = {
        ...DEFAULT_PURCHASE_POINTS_BY_ROLE,
        ...(rule.purchase_multiplier_by_role || {})
    };
    const benefitRole = resolveBenefitRoleLevel(roleLevel);
    return Math.max(0, toFiniteNumber(multipliers[benefitRole], toFiniteNumber(multipliers[0], 0)));
}

function formatCouponValue(coupon = {}) {
    const type = String(coupon.coupon_type || coupon.type || '').toLowerCase();
    const value = toFiniteNumber(coupon.coupon_value != null ? coupon.coupon_value : coupon.value, 0);
    if (type === 'percent') {
        const discount = value <= 1 ? value * 10 : value;
        return `${discount % 1 === 0 ? discount.toFixed(0) : discount.toFixed(1)}折券`;
    }
    if (type === 'exchange') return '兑换券';
    return `¥${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}券`;
}

function formatCouponThreshold(coupon = {}) {
    const minPurchase = toFiniteNumber(coupon.min_purchase, 0);
    return minPurchase > 0 ? `满${minPurchase % 1 === 0 ? minPurchase.toFixed(0) : minPurchase.toFixed(2)}可用` : '无门槛';
}

function getCouponDisplayKey(coupon = {}) {
    const rawType = String(coupon.coupon_type || coupon.type || 'fixed').toLowerCase();
    const type = rawType === 'no_threshold' ? 'fixed' : rawType;
    const value = toFiniteNumber(coupon.coupon_value != null ? coupon.coupon_value : coupon.value, 0);
    const minPurchase = toFiniteNumber(coupon.min_purchase, 0);
    return [
        type || 'fixed',
        value.toFixed(4),
        minPurchase.toFixed(2)
    ].join(':');
}

function getCouponDiscountAmount(coupon = {}, amount = 0) {
    const orderAmount = Math.max(0, toFiniteNumber(amount, 0));
    const type = String(coupon.coupon_type || coupon.type || '').toLowerCase();
    const value = toFiniteNumber(coupon.coupon_value != null ? coupon.coupon_value : coupon.value, 0);
    if (orderAmount <= 0 || value <= 0) return 0;
    if (type === 'percent') {
        const rate = value <= 1 ? value : value / 10;
        return Math.max(0, Math.min(orderAmount, orderAmount * (1 - rate)));
    }
    if (type === 'fixed' || type === 'no_threshold' || !type) {
        return Math.max(0, Math.min(orderAmount, value));
    }
    return 0;
}

function extractCouponList(payload) {
    if (!payload) return [];
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && Array.isArray(payload.data.list)) return payload.data.list;
    if (Array.isArray(payload.list)) return payload.list;
    return [];
}

function normalizeIdText(value) {
    return value === null || value === undefined || value === '' ? '' : String(value);
}

function couponAppliesToProduct(coupon = {}, product = {}) {
    const scope = String(coupon.scope || 'all').toLowerCase();
    const scopeIds = Array.isArray(coupon.scope_ids)
        ? coupon.scope_ids.map(normalizeIdText).filter(Boolean)
        : [];
    if (!scope || scope === 'all' || scopeIds.length === 0) return true;
    const category = product.category && typeof product.category === 'object' ? product.category : {};
    const productIds = [product.id, product._id, product.product_id]
        .map(normalizeIdText)
        .filter(Boolean);
    const categoryIds = [product.category_id, product.categoryId, product.category_key, category.id, category._id]
        .map(normalizeIdText)
        .filter(Boolean);
    if (scope === 'product') return productIds.some((id) => scopeIds.includes(id));
    if (scope === 'category') return categoryIds.some((id) => scopeIds.includes(id));
    return true;
}

function buildPosterCouponOption(coupon = {}) {
    const id = coupon.id || coupon.coupon_id || coupon._id || '';
    return {
        ...coupon,
        id,
        coupon_id: coupon.coupon_id || id,
        name: coupon.name || coupon.coupon_name || '优惠券',
        coupon_name: coupon.coupon_name || coupon.name || '优惠券',
        valueText: formatCouponValue(coupon),
        thresholdText: formatCouponThreshold(coupon),
        poster_badge_text: coupon.poster_badge_text || '',
        displayName: coupon.poster_badge_text || coupon.coupon_name || coupon.name || '优惠券'
    };
}

function resolveShareCouponButtonText({ claimed, unavailable, isLoggedIn, status, message }) {
    if (claimed) return '已领取';
    if (!isLoggedIn && !unavailable) return '登录领取';
    if (!unavailable) return '立即领取';
    const text = String(message || '').trim();
    if (status === 'not_started' || text.includes('未开始')) return '未开始';
    if (status === 'daily_exhausted' || status === 'out_of_stock' || text.includes('领完')) return '已领完';
    return '已结束';
}

function buildShareCouponBarView(coupon = {}, { status = 'idle', message = '', canClaim = true, isLoggedIn = false } = {}) {
    const normalized = buildPosterCouponOption(coupon);
    const claimed = status === 'already_owned' || status === 'claimed' || status === 'success';
    const unavailable = canClaim === false && !claimed;
    const displayMessage = claimed
        ? (message || '已领取，可下单使用')
        : (message || (isLoggedIn ? '扫码福利，已为你锁定' : '登录后放入卡包'));
    return {
        coupon: normalized,
        title: normalized.poster_badge_text || normalized.coupon_name || normalized.name,
        status,
        message,
        can_claim: canClaim !== false,
        claimed,
        button_disabled: claimed || unavailable,
        button_text: resolveShareCouponButtonText({ claimed, unavailable, isLoggedIn, status, message }),
        valueText: formatCouponValue(coupon),
        thresholdText: formatCouponThreshold(coupon),
        display_desc: displayMessage || formatCouponThreshold(coupon)
    };
}

function buildShareCouponFallbackBar({ couponId = '', ticketId = '', status = 'checking', message = '正在确认优惠券状态' } = {}) {
    const isChecking = status === 'checking';
    return {
        coupon: {
            id: couponId || ticketId,
            coupon_id: couponId,
            ticket_id: ticketId,
            name: '扫码优惠券',
            coupon_name: '扫码优惠券'
        },
        title: '扫码优惠券',
        status,
        message,
        can_claim: false,
        claimed: false,
        button_disabled: true,
        button_text: isChecking ? '校验中' : '不可领取',
        valueText: '券',
        thresholdText: '扫码福利',
        display_desc: message
    };
}

function appendDetailQueryParam(params, key, value) {
    if (value === null || value === undefined || value === '') return;
    params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
}

function buildProductDetailRelaunchUrl(productId, options = {}) {
    const params = [];
    appendDetailQueryParam(params, 'id', productId);
    appendDetailQueryParam(params, 'exchange_coupon_id', options.exchange_coupon_id);
    appendDetailQueryParam(params, 'cid', options.coupon_id || options.cid);
    appendDetailQueryParam(params, 'ticket', options.ticket || options.ticket_id || options.t);
    appendDetailQueryParam(params, 'invite', options.invite);
    appendDetailQueryParam(params, 'limited_spot_card_id', options.limited_spot_card_id);
    appendDetailQueryParam(params, 'limited_spot_offer_id', options.limited_spot_offer_id);
    appendDetailQueryParam(params, 'limited_sale_slot_id', options.limited_sale_slot_id);
    appendDetailQueryParam(params, 'limited_sale_item_id', options.limited_sale_item_id);
    appendDetailQueryParam(params, 'limited_spot_mode', options.limited_spot_mode);
    return `/pages/product/detail?${params.join('&')}`;
}

function isSameProductId(productId, candidate) {
    if (productId === null || productId === undefined || productId === '') return false;
    const expected = String(productId);
    const values = [
        candidate,
        candidate && candidate.id,
        candidate && candidate._id,
        candidate && candidate.product_id,
        candidate && candidate.productId
    ].filter((value) => value !== null && value !== undefined && value !== '').map((value) => String(value));
    return values.includes(expected);
}

function describeGroupRecord(record) {
    const status = record && record.groupOrder && record.groupOrder.status || '';
    if (status === 'open') {
        return {
            title: '你已参与该商品拼团',
            desc: '可查看成团进度，也可继续邀请好友参团。',
            actionText: '查看拼团'
        };
    }
    if (status === 'success') {
        return {
            title: '该商品拼团已成团',
            desc: '可查看订单和拼团详情。',
            actionText: '查看详情'
        };
    }
    return {
        title: '你已参与过该商品拼团',
        desc: '可前往“我的拼团”查看记录。',
        actionText: '我的拼团'
    };
}

function describeSlashRecord(record) {
    const status = record && record.status || '';
    if (status === 'active') {
        return {
            title: '你已发起该商品砍价',
            desc: '可查看当前进度，并继续邀请好友帮砍。',
            actionText: '查看砍价'
        };
    }
    if (status === 'success') {
        return {
            title: '该商品砍价已到底价',
            desc: '可查看详情并完成下单。',
            actionText: '查看详情'
        };
    }
    return {
        title: '你已参与过该商品砍价',
        desc: '可前往“我的砍价”查看记录。',
        actionText: '我的砍价'
    };
}

Page({
    data: {
        id: null,
        product: {},
        skus: [],
        selectedSku: null,
        selectedSkuText: '',
        selectedSpecs: {},
        quantity: 1,
        currentImage: 0,
        imageCount: 0,
        cartCount: 0,
        isFavorite: false,
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        reviews: [],
        reviewTotal: 0,
        reviewTags: [],
        reviewsLoaded: false,
        reviewsLoadError: false,
        discount: 10,
        currentPrice: '',
        currentStock: 0,
        isOutOfStock: false,
        detailImageList: [],
        detailImageSourceList: [],
        detailImagesLoaded: false,
        detailImagesLoading: false,
        hasRichDetail: false,
        roleLevel: USER_ROLES.GUEST,
        isAgent: false,
        commission: '0.00',
        pageLoading: true,
        servicePledges: [],
        groupActivity: null,
        slashActivity: null,
        currentGroupRecord: null,
        currentSlashRecord: null,
        availablePurchaseModes: [{ key: 'normal', label: '普通购买', hint: '加入购物袋后可一并结算' }],
        purchaseMode: 'normal',
        purchaseModeHint: '加入购物袋后可一并结算',
        actionLeftLabel: '加入购物袋',
        actionRightLabel: '立即购买',
        exchangeMode: false,
        exchangeCouponId: '',
        exchangeTitle: '',
        limitedSpotCardId: '',
        limitedSpotOfferId: '',
        limitedSpotSource: '',
        limitedSpotMode: '',
        limitedSpotCard: null,
        limitedSpotOffer: null,
        limitedSpotTitle: '',
        limitedSpotOriginalPrice: '',
        limitedSpotLockedSkuId: '',
        productCouponChips: [],
        posterCouponOptions: [],
        selectedPosterCouponId: '',
        selectedPosterCoupon: null,
        posterCouponLoading: false,
        posterCouponTip: '',
        showPosterCouponPicker: false,
        shareCouponId: '',
        shareTicketId: '',
        shareCouponBar: null,
        shareCouponClaiming: false,
        estimatedPoints: 0,
        showSharePanel: false,
        showTimelineTip: false
    },

    onLoad(options) {
        options = captureShareInvite(app, normalizeProductLaunchOptions(options || {}));
        // Get status bar height for nav
        const roleLevel = app.globalData.userInfo?.role_level || 0;

        this.setData({
            statusBarHeight: app.globalData.statusBarHeight,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44,
            roleLevel
        });

        if (!options.id) {
            this.setData({ pageLoading: false });
            wx.showToast({ title: '商品参数错误', icon: 'none' });
            return;
        }

        const normalizedId = normalizeProductId(options.id);

        // 视频号直播商品、商品橱窗等：apiCategory 为 nativeFunctionalized 时，微信会套一层原生购买壳并出现「查看完整详情」。
        // 对同一路径 reLaunch 一次，多数环境下可回到全屏自有详情页（仅一次，避免循环）。不处理 embedded，以免误伤「半屏打开小程序」宿主场景。
        let apiCategory = '';
        try {
            if (typeof wx.getEnterOptionsSync === 'function') {
                apiCategory = wx.getEnterOptionsSync().apiCategory || '';
            }
        } catch (_) {
            /* ignore */
        }

        if (apiCategory === 'nativeFunctionalized') {
            const rid = String(normalizedId);
            const prev = app.globalData.productDetailNfRelaunchKey;
            if (prev !== rid) {
                app.globalData.productDetailNfRelaunchKey = rid;
                wx.reLaunch({
                    url: buildProductDetailRelaunchUrl(rid, options),
                    fail: () => {
                        app.globalData.productDetailNfRelaunchKey = '';
                        this.setData({ id: normalizedId });
                        this.loadProduct(normalizedId);
                    }
                });
                return;
            }
            app.globalData.productDetailNfRelaunchKey = '';
        }

        const exchangeCouponId = options.exchange_coupon_id ? String(options.exchange_coupon_id) : '';
        const shareCouponId = options.coupon_id || options.cid ? String(options.coupon_id || options.cid) : '';
        const shareTicketId = options.ticket || options.ticket_id || options.t ? String(options.ticket || options.ticket_id || options.t) : '';
        const initialShareCouponBar = shareCouponId || shareTicketId
            ? buildShareCouponFallbackBar({
                couponId: shareCouponId,
                ticketId: shareTicketId,
                message: '正在确认扫码优惠券'
            })
            : null;
        const limitedSpotCardId = options.limited_sale_slot_id
            ? String(options.limited_sale_slot_id)
            : (options.limited_spot_card_id ? String(options.limited_spot_card_id) : '');
        const limitedSpotOfferId = options.limited_sale_item_id
            ? String(options.limited_sale_item_id)
            : (options.limited_spot_offer_id ? String(options.limited_spot_offer_id) : '');
        const limitedSpotSource = options.limited_sale_slot_id || options.limited_sale_item_id
            ? 'limited_sale'
            : ((options.limited_spot_card_id || options.limited_spot_offer_id) ? 'limited_spot' : '');
        let exchangeTitle = '';
        if (exchangeCouponId) {
            const activeExchangeCoupon = wx.getStorageSync('activeExchangeCoupon');
            if (activeExchangeCoupon && String(activeExchangeCoupon._id || activeExchangeCoupon.id || activeExchangeCoupon.coupon_id || '') === exchangeCouponId) {
                exchangeTitle = activeExchangeCoupon.exchange_meta?.title || activeExchangeCoupon.coupon_name || '';
            }
        }
        this.setData({
            id: normalizedId,
            exchangeMode: !!exchangeCouponId,
            exchangeCouponId,
            exchangeTitle,
            shareCouponId,
            shareTicketId,
            shareCouponBar: initialShareCouponBar,
            limitedSpotCardId,
            limitedSpotOfferId,
            limitedSpotSource,
            limitedSpotMode: normalizeLimitedSpotMode(options.limited_spot_mode || '', null)
        });
        this.loadProduct(normalizedId);
    },

    onShow() {
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
        this.loadCartSummary();
        if (this.data.product && this.data.product.id != null) {
            this.refreshFavoriteState();
            this.loadUserActivitySnapshot(this.data.product.id);
        }
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
        this._scheduleDetailSectionObserver();
    },

    onUnload() {
        if (this._benefitsRefreshTimer) {
            clearTimeout(this._benefitsRefreshTimer);
            this._benefitsRefreshTimer = null;
        }
        if (this._timelineTipTimer) {
            clearTimeout(this._timelineTipTimer);
            this._timelineTipTimer = null;
        }
        this._clearDetailSectionObserver();
    },

    onPageScroll(e) {
        if (Number(e?.scrollTop || 0) > 500) {
            this.loadDetailImages();
        }
    },

    // 加载商品详情
    async loadProduct(id) {
        const result = await loadProduct(this, id);
        this.schedulePurchaseBenefitsRefresh({ reloadCoupons: true });
        this.loadPosterCouponOptions();
        this.loadShareCouponPrompt();
        this._scheduleDetailSectionObserver();
        return result;
    },

    getCurrentPurchaseAmount() {
        if (this.data.limitedSpotOffer) {
            return this.data.limitedSpotMode === 'money'
                ? toFiniteNumber(this.data.limitedSpotOffer.money_price, 0)
                : 0;
        }
        if (this.data.exchangeMode) return 0;
        const unitPrice = toFiniteNumber(this.data.currentPrice || this.data.product.displayPrice || this.data.product.price, 0);
        const quantity = Math.max(1, Math.floor(toFiniteNumber(this.data.quantity, 1)));
        return Math.max(0, unitPrice * quantity);
    },

    isProductCouponEnabled() {
        const product = this.data.product || {};
        const productTag = String(product.product_tag || '').trim().toLowerCase();
        if (this.data.exchangeMode || this.data.limitedSpotOffer) return false;
        if (product.is_explosive || productTag === 'hot') return false;
        return product.enable_coupon == null || product.enable_coupon === true || product.enable_coupon === 1 || product.enable_coupon === '1';
    },

    isProductPointsEnabled() {
        const product = this.data.product || {};
        const productTag = String(product.product_tag || '').trim().toLowerCase();
        if (this.data.exchangeMode || this.data.limitedSpotOffer) return false;
        if (product.is_explosive || productTag === 'hot') return false;
        return product.allow_points == null || product.allow_points === true || product.allow_points === 1 || product.allow_points === '1';
    },

    buildCouponQueryContext(amount) {
        const product = this.data.product || {};
        const productIds = [product.id, product._id, product.product_id]
            .filter((value) => value !== null && value !== undefined && value !== '')
            .map((value) => String(value));
        const category = product.category && typeof product.category === 'object' ? product.category : {};
        const categoryIds = [product.category_id, product.categoryId, product.category_key, category.id, category._id]
            .filter((value) => value !== null && value !== undefined && value !== '')
            .map((value) => String(value));
        return {
            amount: amount.toFixed(2),
            product_ids: [...new Set(productIds)].join(','),
            category_ids: [...new Set(categoryIds)].join(',')
        };
    },

    buildCouponChips(coupons = [], amount = 0) {
        const seenDisplayKeys = new Set();
        return coupons
            .filter((coupon) => String(coupon.coupon_type || coupon.type || '').toLowerCase() !== 'exchange')
            .map((coupon) => ({
                coupon,
                discountAmount: getCouponDiscountAmount(coupon, amount)
            }))
            .filter((item) => item.discountAmount > 0)
            .sort((a, b) => {
                if (b.discountAmount !== a.discountAmount) return b.discountAmount - a.discountAmount;
                return toFiniteNumber(a.coupon.min_purchase, 0) - toFiniteNumber(b.coupon.min_purchase, 0);
            })
            .filter(({ coupon }) => {
                const key = getCouponDisplayKey(coupon);
                if (seenDisplayKeys.has(key)) return false;
                seenDisplayKeys.add(key);
                return true;
            })
            .map(({ coupon }) => ({
                id: coupon._id || coupon.id || coupon.coupon_id || `${coupon.coupon_name || coupon.name}:${coupon.coupon_value}`,
                valueText: formatCouponValue(coupon),
                thresholdText: formatCouponThreshold(coupon)
            }));
    },

    buildPosterCouponOptions(coupons = []) {
        const product = this.data.product || {};
        const seenDisplayKeys = new Set();
        return (Array.isArray(coupons) ? coupons : [])
            .filter((coupon) => String(coupon.coupon_type || coupon.type || '').toLowerCase() !== 'exchange')
            .filter((coupon) => coupon.share_poster_enabled === 1 || coupon.share_poster_enabled === true || coupon.share_poster_enabled === '1')
            .filter((coupon) => couponAppliesToProduct(coupon, product))
            .filter((coupon) => {
                const key = getCouponDisplayKey(coupon);
                if (seenDisplayKeys.has(key)) return false;
                seenDisplayKeys.add(key);
                return true;
            })
            .map(buildPosterCouponOption)
            .filter((coupon) => coupon.id)
            .slice(0, 6);
    },

    async loadPosterCouponOptions() {
        if (!this.data.product || !(this.data.product.id || this.data.product._id)) return;
        if (!this.isProductCouponEnabled()) {
            this.setData({
                posterCouponOptions: [],
                selectedPosterCouponId: '',
                selectedPosterCoupon: null,
                posterCouponTip: '',
                showPosterCouponPicker: false
            });
            return;
        }
        this.setData({ posterCouponLoading: true, posterCouponTip: '', showPosterCouponPicker: true });
        try {
            const res = await get('/coupons/center', { share_poster: 1 }, { showError: false, maxRetries: 0 });
            const coupons = extractCouponList(res);
            const posterCouponOptions = this.buildPosterCouponOptions(coupons);
            const selectedId = String(this.data.selectedPosterCouponId || '');
            const selectedPosterCoupon = posterCouponOptions.find((coupon) => String(coupon.id) === selectedId) || null;
            const selectedKey = selectedPosterCoupon ? String(selectedPosterCoupon.id) : '';
            this.setData({
                posterCouponOptions: posterCouponOptions.map((coupon) => ({
                    ...coupon,
                    selected: String(coupon.id) === selectedKey
                })),
                selectedPosterCouponId: selectedKey,
                selectedPosterCoupon,
                posterCouponTip: posterCouponOptions.length ? '' : '暂无可用于海报分享的优惠券',
                showPosterCouponPicker: posterCouponOptions.length > 0
            });
        } catch (_err) {
            this.setData({
                posterCouponOptions: [],
                selectedPosterCouponId: '',
                selectedPosterCoupon: null,
                posterCouponTip: '',
                showPosterCouponPicker: false
            });
        } finally {
            this.setData({ posterCouponLoading: false });
        }
    },

    async loadShareCouponPrompt() {
        const couponId = String(this.data.shareCouponId || '').trim();
        const ticketId = String(this.data.shareTicketId || '').trim();
        if (!couponId && !ticketId) return;
        const fallbackBar = (status, message) => buildShareCouponFallbackBar({
            couponId,
            ticketId,
            status,
            message
        });
        try {
            const query = ticketId ? { ticket: ticketId } : { coupon_id: couponId };
            const res = await get('/coupons/info', query, { showError: false, maxRetries: 0 });
            const coupon = res && res.coupon;
            if (!coupon) {
                this.setData({
                    shareCouponBar: fallbackBar('invalid', '这张扫码券暂不可领取')
                });
                return;
            }
            const status = String(res.claim_status || '').trim() || 'idle';
            const message = String(res.claim_message || '').trim();
            const loginState = getLoginState();
            const shareCouponBar = buildShareCouponBarView(coupon, {
                status,
                message,
                canClaim: res.can_claim !== false,
                isLoggedIn: !!loginState.isLoggedIn
            });
            this.setData({
                shareCouponBar
            });
            this.autoClaimShareCouponIfNeeded();
        } catch (_err) {
            this.setData({
                shareCouponBar: fallbackBar('error', '优惠券状态加载失败')
            });
        }
    },

    onSelectPosterCoupon(e) {
        const couponId = String(e.currentTarget.dataset.couponId || '');
        const selectedPosterCoupon = (this.data.posterCouponOptions || []).find((coupon) => String(coupon.id) === couponId) || null;
        const alreadySelected = selectedPosterCoupon && String(this.data.selectedPosterCouponId || '') === String(selectedPosterCoupon.id);
        const nextSelectedId = alreadySelected || !selectedPosterCoupon ? '' : String(selectedPosterCoupon.id);
        this.setData({
            selectedPosterCouponId: nextSelectedId,
            selectedPosterCoupon: nextSelectedId ? selectedPosterCoupon : null,
            posterCouponOptions: (this.data.posterCouponOptions || []).map((coupon) => ({
                ...coupon,
                selected: String(coupon.id) === nextSelectedId
            }))
        });
    },

    clearPosterCoupon() {
        this.setData({
            selectedPosterCouponId: '',
            selectedPosterCoupon: null,
            posterCouponOptions: (this.data.posterCouponOptions || []).map((coupon) => ({
                ...coupon,
                selected: false
            }))
        });
    },

    getShareCouponClaimKey() {
        const couponId = String(this.data.shareCouponId || '').trim();
        const ticketId = String(this.data.shareTicketId || '').trim();
        if (ticketId) return `ticket:${ticketId}`;
        if (couponId) return `coupon:${couponId}`;
        return '';
    },

    async autoClaimShareCouponIfNeeded() {
        const bar = this.data.shareCouponBar;
        if (!bar || bar.claimed || bar.can_claim === false) return;
        const loginState = getLoginState();
        if (!loginState.isLoggedIn) return;
        const key = this.getShareCouponClaimKey();
        if (!key || this._autoClaimShareCouponKey === key) return;
        this._autoClaimShareCouponKey = key;
        await this.claimShareCoupon({ auto: true });
    },

    async claimShareCoupon(options = {}) {
        const auto = !!(options && options.auto);
        const couponId = String(this.data.shareCouponId || '').trim();
        const ticketId = String(this.data.shareTicketId || '').trim();
        const bar = this.data.shareCouponBar;
        if (this.data.shareCouponClaiming || !bar || (!couponId && !ticketId)) return;
        if (bar.claimed || bar.status === 'success') return;
        if (bar.can_claim === false) {
            wx.showToast({ title: bar.message || '当前不可领取', icon: 'none' });
            return;
        }
        try {
            await ensureLogin({ message: '请先登录领取优惠券' });
        } catch (_err) {
            if (auto) return;
            wx.showToast({ title: '请先登录领取优惠券', icon: 'none' });
            return;
        }
        this.setData({
            shareCouponClaiming: true,
            'shareCouponBar.button_text': '领取中'
        });
        try {
            const payload = ticketId ? { ticket: ticketId } : { coupon_id: couponId };
            const res = await post('/coupons/claim', payload, { showError: false, maxRetries: 0 });
            if (res && res.success === false) {
                const msg = String(res.message || '领取失败，请稍后重试');
                this.setData({
                    'shareCouponBar.status': msg.includes('已领取') ? 'already_owned' : 'error',
                    'shareCouponBar.claimed': msg.includes('已领取'),
                    'shareCouponBar.message': msg,
                    'shareCouponBar.display_desc': msg,
                    'shareCouponBar.button_disabled': msg.includes('已领取'),
                    'shareCouponBar.button_text': msg.includes('已领取') ? '已领取' : '领取'
                });
                wx.showToast({ title: msg.length > 10 ? '优惠券暂不可领' : msg, icon: 'none' });
                return;
            }
            this.setData({
                'shareCouponBar.status': 'success',
                'shareCouponBar.claimed': true,
                'shareCouponBar.can_claim': false,
                'shareCouponBar.message': '已领取，可下单使用',
                'shareCouponBar.display_desc': '已领取，可下单使用',
                'shareCouponBar.button_disabled': true,
                'shareCouponBar.button_text': '已领取'
            });
            wx.showToast({ title: auto ? '优惠券已领取' : '领取成功', icon: 'success' });
            this.schedulePurchaseBenefitsRefresh({ reloadCoupons: true });
        } catch (err) {
            const msg = normalizeUserMessage(err && err.message, '领取失败，请稍后重试');
            this.setData({
                'shareCouponBar.status': msg.includes('已领取') ? 'already_owned' : 'error',
                'shareCouponBar.claimed': msg.includes('已领取'),
                'shareCouponBar.message': msg,
                'shareCouponBar.display_desc': msg,
                'shareCouponBar.button_disabled': msg.includes('已领取'),
                'shareCouponBar.button_text': msg.includes('已领取') ? '已领取' : '领取'
            });
            wx.showToast({ title: msg.length > 10 ? '优惠券暂不可领' : msg, icon: 'none' });
        } finally {
            this.setData({ shareCouponClaiming: false });
        }
    },

    async onClaimShareCoupon() {
        return this.claimShareCoupon();
    },

    calculateEstimatedPoints(amount) {
        if (!this.isProductPointsEnabled() || amount <= 0) return 0;
        const pointsPerHundred = getPurchasePointsPerHundred(this.data.roleLevel);
        return Math.max(0, Math.floor((amount * pointsPerHundred) / 100));
    },

    schedulePurchaseBenefitsRefresh(options = {}) {
        if (this._benefitsRefreshTimer) {
            clearTimeout(this._benefitsRefreshTimer);
            this._benefitsRefreshTimer = null;
        }
        this._benefitsRefreshTimer = setTimeout(() => {
            this._benefitsRefreshTimer = null;
            this.refreshPurchaseBenefits(options);
        }, 180);
    },

    async refreshPurchaseBenefits({ reloadCoupons = false } = {}) {
        if (!this.data.product || !(this.data.product.id || this.data.product._id)) return;
        const amount = this.getCurrentPurchaseAmount();
        const estimatedPoints = this.calculateEstimatedPoints(amount);

        if (!this.isProductCouponEnabled() || amount <= 0) {
            this._availableProductCoupons = [];
            this.setData({ productCouponChips: [], estimatedPoints });
            return;
        }

        if (!reloadCoupons) {
            this.setData({
                productCouponChips: this.buildCouponChips(this._availableProductCoupons || [], amount),
                estimatedPoints
            });
            return;
        }

        try {
            const res = await get('/coupons/available', this.buildCouponQueryContext(amount), { showError: false });
            const coupons = extractCouponList(res);
            this._availableProductCoupons = coupons;
            this.setData({
                productCouponChips: this.buildCouponChips(coupons, amount),
                estimatedPoints
            });
        } catch (_err) {
            this._availableProductCoupons = [];
            this.setData({ productCouponChips: [], estimatedPoints });
        }
    },

    _clearDetailSectionObserver() {
        if (this._detailSectionObserverTimer) {
            clearTimeout(this._detailSectionObserverTimer);
            this._detailSectionObserverTimer = null;
        }
        if (this._detailSectionObserver) {
            this._detailSectionObserver.disconnect();
            this._detailSectionObserver = null;
        }
    },

    _scheduleDetailSectionObserver() {
        if (this._detailSectionObserverTimer) {
            clearTimeout(this._detailSectionObserverTimer);
            this._detailSectionObserverTimer = null;
        }
        const attachObserver = () => {
            this._detailSectionObserverTimer = null;
            this._observeDetailSection({ reset: true });
        };
        if (typeof wx.nextTick === 'function') {
            wx.nextTick(attachObserver);
        } else {
            this._detailSectionObserverTimer = setTimeout(attachObserver, 0);
        }
    },

    _observeDetailSection({ reset = false } = {}) {
        if (this.data.pageLoading || this.data.detailImagesLoaded || this.data.detailImagesLoading) return;
        const sources = this.data.detailImageSourceList || [];
        if (!sources.length) return;
        if (reset && this._detailSectionObserver) {
            this._detailSectionObserver.disconnect();
            this._detailSectionObserver = null;
        }
        if (this._detailSectionObserver) return;
        if (typeof wx.createIntersectionObserver !== 'function') {
            this.loadDetailImages();
            return;
        }
        const observer = wx.createIntersectionObserver(this);
        observer.relativeToViewport({ bottom: 300 }).observe('.detail-section', () => {
            this.loadDetailImages();
            if (this._detailSectionObserver) {
                this._detailSectionObserver.disconnect();
                this._detailSectionObserver = null;
            }
        });
        this._detailSectionObserver = observer;
    },

    async loadDetailImages() {
        if (this.data.detailImagesLoaded || this.data.detailImagesLoading) return;
        const sources = this.data.detailImageSourceList || [];
        if (!sources.length) {
            this.setData({ detailImagesLoaded: true, detailImagesLoading: false });
            return;
        }

        this.setData({ detailImagesLoading: true });
        try {
            const detailImageList = await resolveDetailImageList(sources);
            this.setData({
                detailImageList,
                detailImagesLoaded: true,
                detailImagesLoading: false
            });
        } catch (error) {
            console.warn('[ProductDetail] 详情图片解析失败', error);
            this.setData({
                detailImagesLoaded: true,
                detailImagesLoading: false
            });
        }
    },

    applyLimitedSpotSkuLock(offer) {
        if (!offer || !offer.sku_id) {
            this.setData({ limitedSpotLockedSkuId: '' });
            return;
        }
        const targetSku = (this.data.skus || []).find((sku) => String(sku.id || sku._id) === String(offer.sku_id));
        if (!targetSku) {
            this.setData({ limitedSpotLockedSkuId: String(offer.sku_id) });
            return;
        }
        const selectedSpecs = {};
        const skuSpecs = Array.isArray(targetSku.specs) && targetSku.specs.length > 0
            ? targetSku.specs
            : (targetSku.spec_name && targetSku.spec_value ? [{ name: targetSku.spec_name, value: targetSku.spec_value }] : []);
        skuSpecs.forEach((spec) => {
            if (spec && spec.name) selectedSpecs[spec.name] = spec.value;
        });
        this.setData({
            limitedSpotLockedSkuId: String(targetSku.id || targetSku._id || offer.sku_id),
            selectedSku: targetSku,
            selectedSpecs,
            selectedSkuText: buildSkuText(targetSku),
            quantity: 1
        });
    },

    async loadLimitedSpotContext(productId) {
        if (!(this.data.limitedSpotCardId && this.data.limitedSpotOfferId)) {
            this.setData({
                limitedSpotCard: null,
                limitedSpotOffer: null,
                limitedSpotTitle: '',
                limitedSpotOriginalPrice: '',
                limitedSpotLockedSkuId: ''
            });
            return false;
        }
        try {
            const { card, offer } = await fetchLimitedSpotContext(this.data.limitedSpotCardId, this.data.limitedSpotOfferId);
            const offerProductId = String(offer.product && (offer.product.id || offer.product._id) || offer.product_id || '');
            if (offerProductId && String(productId) !== offerProductId) {
                throw new Error('活动商品与详情页不匹配');
            }
            const limitedSpotMode = normalizeLimitedSpotMode(this.data.limitedSpotMode, offer);
            const activityOutOfStock = !!offer.sold_out;
            this.setData({
                limitedSpotCard: card,
                limitedSpotOffer: offer,
                limitedSpotMode,
                limitedSpotTitle: card && card.title ? card.title : '限时专享商品',
                limitedSpotOriginalPrice: formatLimitedSpotMoney(
                    (offer.product && (offer.product.market_price || offer.product.retail_price || offer.product.price))
                    || this.data.product.market_price
                    || this.data.product.displayPrice
                ),
                currentStock: Math.max(0, Number(offer.remaining || 0)),
                isOutOfStock: this.data.isOutOfStock || activityOutOfStock
            });
            this.applyLimitedSpotSkuLock(offer);
            this.syncPurchaseActionState();
            return true;
        } catch (err) {
            console.error('加载限时专享上下文失败:', err);
            this.setData({
                limitedSpotCard: null,
                limitedSpotOffer: null,
                limitedSpotTitle: '',
                limitedSpotOriginalPrice: '',
                limitedSpotLockedSkuId: ''
            });
            wx.showToast({ title: err.message || '活动暂不可参与', icon: 'none' });
            return false;
        }
    },

    async loadActivityState(productId) {
        const normalizedId = normalizeProductId(productId || this.data.id);
        if (normalizedId === null || normalizedId === undefined || normalizedId === '') return;
        if (this.data.limitedSpotCardId && this.data.limitedSpotOfferId) {
            const loaded = await this.loadLimitedSpotContext(normalizedId);
            if (loaded) {
                return;
            }
        }
        if (this.data.exchangeMode) {
            this.setData({
                groupActivity: null,
                slashActivity: null,
                currentGroupRecord: null,
                currentSlashRecord: null,
                availablePurchaseModes: [{ key: 'normal', label: '兑换商品', hint: '使用兑换券提交 0 元订单' }],
                purchaseMode: 'normal'
            }, () => this.syncPurchaseActionState());
            return;
        }
        // 普通商品详情页只保留正常购买。
        // 拼团、砍价分别从各自活动页 / 详情页发起，不在商品详情页混合展示。
        this.setData({
            groupActivity: null,
            slashActivity: null,
            currentGroupRecord: null,
            currentSlashRecord: null,
            availablePurchaseModes: [{ key: 'normal', label: '普通购买', hint: '加入购物袋后可与其他商品一起结算' }],
            purchaseMode: 'normal'
        }, () => this.syncPurchaseActionState());
    },

    findProductActivity(list, productId) {
        const normalizedId = String(productId);
        const activities = Array.isArray(list) ? list : [];
        return activities.find((activity) => {
            const activityProductId = activity && activity.product && activity.product.id;
            return activityProductId != null && String(activityProductId) === normalizedId;
        }) || null;
    },

    buildPurchaseModes(groupActivity, slashActivity) {
        const modes = [
            { key: 'normal', label: '普通购买', hint: '加入购物袋后可与其他商品一起结算' }
        ];

        if (groupActivity) {
            const groupPrice = parseFloat(groupActivity.group_price || 0);
            modes.push({
                key: 'group',
                label: '拼团购买',
                hint: groupPrice > 0 ? `发起拼团价 ¥${groupPrice.toFixed(2)}` : '立即购买或发起拼团'
            });
        }

        if (slashActivity) {
            const floorPrice = parseFloat(slashActivity.floor_price || 0);
            modes.push({
                key: 'slash',
                label: '砍价购买',
                hint: floorPrice > 0 ? `最低可砍至 ¥${floorPrice.toFixed(2)}` : '立即购买或发起砍价'
            });
        }

        return modes;
    },

    findCurrentGroupRecord(list, productId) {
        const matched = extractResultList(list).filter((item) => isSameProductId(productId, item && item.groupOrder && item.groupOrder.product));
        return matched.find((item) => item && item.group_no && item.groupOrder && item.groupOrder.status === 'open')
            || matched.find((item) => item && item.group_no)
            || matched[0]
            || null;
    },

    findCurrentSlashRecord(list, productId) {
        const matched = extractResultList(list).filter((item) => isSameProductId(productId, item && (item.product || { id: item.product_id })));
        return matched.find((item) => item && item.slash_no && item.status === 'active')
            || matched.find((item) => item && item.slash_no)
            || matched[0]
            || null;
    },

    async loadUserActivitySnapshot(productId) {
        const normalizedId = normalizeProductId(productId || this.data.id);
        if (normalizedId === null || normalizedId === undefined || normalizedId === '') return;
        if (!app.globalData.isLoggedIn || (!this.data.groupActivity && !this.data.slashActivity)) {
            if (this.data.currentGroupRecord || this.data.currentSlashRecord) {
                this.setData({ currentGroupRecord: null, currentSlashRecord: null }, () => this.syncPurchaseActionState());
            }
            return;
        }

        try {
            const [groupRes, slashRes] = await Promise.all([
                this.data.groupActivity ? get('/group/my', { page: 1, pageSize: 20 }, { showError: false }).catch(() => null) : Promise.resolve(null),
                this.data.slashActivity ? get('/slash/my/list', { page: 1, pageSize: 20 }, { showError: false }).catch(() => null) : Promise.resolve(null)
            ]);
            const currentGroupRecord = this.findCurrentGroupRecord(groupRes, normalizedId);
            const currentSlashRecord = this.findCurrentSlashRecord(slashRes, normalizedId);
            this.setData({ currentGroupRecord, currentSlashRecord }, () => this.syncPurchaseActionState());
        } catch (_) {
            this.setData({ currentGroupRecord: null, currentSlashRecord: null }, () => this.syncPurchaseActionState());
        }
    },

    syncPurchaseActionState() {
        const limitedSpotOffer = this.data.limitedSpotOffer;
        if (limitedSpotOffer) {
            const modes = [];
            if (limitedSpotOffer.enable_money !== false) {
                modes.push({
                    key: 'limited_money',
                    label: '现金秒杀',
                    hint: `活动价 ¥${formatLimitedSpotMoney(limitedSpotOffer.money_price)}`
                });
            }
            if (limitedSpotOffer.enable_points !== false) {
                modes.push({
                    key: 'limited_points',
                    label: '积分兑换',
                    hint: `${Number(limitedSpotOffer.points_price || 0)} 积分兑换`
                });
            }
            const rawMode = normalizeLimitedSpotMode(this.data.limitedSpotMode, limitedSpotOffer);
            const purchaseMode = rawMode === 'points' ? 'limited_points' : 'limited_money';
            const availableModes = modes.length ? modes : [{
                key: 'limited_money',
                label: '限时专享',
                    hint: '活动暂不可购买'
            }];
            const currentMeta = availableModes.find((item) => item.key === purchaseMode) || availableModes[0];
            const effectiveMode = currentMeta && currentMeta.key ? currentMeta.key : 'limited_money';
            this.setData({
                availablePurchaseModes: availableModes,
                purchaseMode: effectiveMode,
                limitedSpotMode: effectiveMode === 'limited_points' ? 'points' : 'money',
                purchaseModeHint: currentMeta.hint,
                actionLeftLabel: '不可加购',
                actionRightLabel: effectiveMode === 'limited_points' ? '立即兑换' : '立即秒杀',
                activityStatusCard: null,
                activityQuickLinks: []
            });
            this.schedulePurchaseBenefitsRefresh({ reloadCoupons: true });
            return;
        }
        if (this.data.exchangeMode) {
            this.setData({
                purchaseModeHint: '使用兑换券提交 0 元订单',
                actionLeftLabel: '不可加购',
                actionRightLabel: '立即兑换',
                activityStatusCard: {
                    badge: '兑换券',
                    title: this.data.exchangeTitle || '支持兑换券兑换',
                    desc: '提交后生成 0 元订单，可正常发货和售后。'
                },
                activityQuickLinks: []
            });
            this.schedulePurchaseBenefitsRefresh({ reloadCoupons: true });
            return;
        }
        const mode = this.data.purchaseMode || 'normal';
        const groupRecord = this.data.currentGroupRecord;
        const slashRecord = this.data.currentSlashRecord;
        const groupCopy = describeGroupRecord(groupRecord);
        const slashCopy = describeSlashRecord(slashRecord);
        const hasCurrentGroup = !!(groupRecord && groupRecord.group_no);
        const hasCurrentSlash = !!(slashRecord && slashRecord.slash_no);
        const modeMeta = {
            normal: {
                purchaseModeHint: '加入购物袋后可一并结算',
                actionLeftLabel: '加入购物袋',
                actionRightLabel: '立即购买',
                activityStatusCard: null,
                activityQuickLinks: []
            },
            group: {
                purchaseModeHint: this.getPurchaseHint('group'),
                actionLeftLabel: '立即购买',
                actionRightLabel: hasCurrentGroup ? groupCopy.actionText : '去下单拼团',
                activityStatusCard: {
                    badge: hasCurrentGroup ? '我的拼团' : '拼团说明',
                    title: hasCurrentGroup ? groupCopy.title : '支付后可查看拼团进度',
                    desc: hasCurrentGroup ? groupCopy.desc : '支付完成后，系统会为你建立或加入对应拼团。'
                },
                activityQuickLinks: hasCurrentGroup
                    ? [{
                        key: 'current-group',
                        label: groupCopy.actionText,
                        desc: '查看当前拼团进度'
                    }, {
                        key: 'my-group',
                        label: '我的拼团',
                        desc: '查看我参与过的拼团'
                    }]
                    : [{
                        key: 'my-group',
                        label: '我的拼团',
                        desc: '查看我参与过的拼团'
                    }]
            },
            slash: {
                purchaseModeHint: this.getPurchaseHint('slash'),
                actionLeftLabel: '立即购买',
                actionRightLabel: hasCurrentSlash ? slashCopy.actionText : '发起砍价',
                activityStatusCard: {
                    badge: hasCurrentSlash ? '我的砍价' : '砍价说明',
                    title: hasCurrentSlash ? slashCopy.title : '发起后会自动进入你的砍价详情',
                    desc: hasCurrentSlash ? slashCopy.desc : '如已发起过同款砍价，将直接带你查看原记录。'
                },
                activityQuickLinks: hasCurrentSlash
                    ? [{
                        key: 'current-slash',
                        label: slashCopy.actionText,
                        desc: '查看当前砍价进度'
                    }, {
                        key: 'my-slash',
                        label: '我的砍价',
                        desc: '查看我发起过的砍价'
                    }]
                    : [{
                        key: 'my-slash',
                        label: '我的砍价',
                        desc: '查看我发起过的砍价'
                    }]
            }
        };
        const current = modeMeta[mode] || modeMeta.normal;
        this.setData(current);
        this.schedulePurchaseBenefitsRefresh({ reloadCoupons: true });
    },

    getPurchaseHint(mode) {
        if (mode === 'group') {
            if (this.data.currentGroupRecord && this.data.currentGroupRecord.group_no) {
                return '可查看拼团进度';
            }
            const groupPrice = parseFloat(this.data.groupActivity && this.data.groupActivity.group_price || 0);
            return groupPrice > 0 ? `拼团价 ¥${groupPrice.toFixed(2)}` : '可发起拼团';
        }
        if (mode === 'slash') {
            if (this.data.currentSlashRecord && this.data.currentSlashRecord.slash_no) {
                return '可查看砍价进度';
            }
            const floorPrice = parseFloat(this.data.slashActivity && this.data.slashActivity.floor_price || 0);
            return floorPrice > 0 ? `最低可砍至 ¥${floorPrice.toFixed(2)}` : '可发起砍价';
        }
        return '加入购物袋后可一并结算';
    },

    // 加载评价
    async loadReviews() {
        this.setData({
            reviewsLoaded: false,
            reviewsLoadError: false
        });
        try {
            const res = await get(`/products/${this.data.id}/reviews`, { limit: 2 }).catch(() => null);
            if (res && res.data) {
                const reviews = res.data.list || [];
                const reviewTotal = res.data.pagination?.total || res.data.total || reviews.length;
                // 生成评价标签
                const reviewTags = this.generateReviewTags(reviews);
                this.setData({
                    reviews,
                    reviewTotal,
                    reviewTags,
                    reviewsLoaded: true,
                    reviewsLoadError: false
                });
                return;
            }
            this.setData({
                reviews: [],
                reviewTotal: 0,
                reviewTags: [],
                reviewsLoaded: true,
                reviewsLoadError: true
            });
        } catch (err) {
            console.log('加载评价失败', err);
            this.setData({
                reviews: [],
                reviewTotal: 0,
                reviewTags: [],
                reviewsLoaded: true,
                reviewsLoadError: true
            });
        }
    },

    // 生成评价标签
    generateReviewTags(reviews) {
        const tags = [];
        const keywords = ['质量好', '物流快', '包装精美', '性价比高', '颜色正', '尺码准'];
        reviews.forEach((r, i) => {
            if (i < 3) tags.push(keywords[i % keywords.length]);
        });
        return tags;
    },

    // 加载佣金预览
    async loadCommissionPreview() {
        try {
            const { id, selectedSku, quantity } = this.data;
            const params = {
                product_id: id,
                quantity: quantity || 1
            };

            if (selectedSku) {
                params.sku_id = selectedSku.id;
            }

            const res = await get('/commissions/preview', params);

            if (res.code === 0) {
                const data = res.data || res;
                const commissions = Array.isArray(data.commissions) ? data.commissions : [];

                // 计算我可以获得的佣金
                const myCommission = commissions
                    .filter(c => c.level === 0 || c.level === 1)
                    .reduce((sum, c) => sum + c.amount, 0);

                this.setData({
                    commission: myCommission.toFixed(2),
                    commissionDetail: data,
                    showCommissionTip: true
                });
            }
        } catch (err) {
            console.error('加载佣金预览失败:', err);
            // 不影响主流程，静默失败
        }
    },

    // 获取购物袋数量
    async loadCartSummary() {
        try {
            const res = await get('/cart', {}, {
                showError: false,
                maxRetries: 0,
                preventDuplicate: true
            });
            this.setData({ cartCount: countCartQuantity(extractCartItems(res)) });
        } catch (_) {
            this.setData({ cartCount: 0 });
        }
    },

    onOpenCart() {
        wx.navigateTo({ url: '/pages/cart/cart' });
    },

    // 图片切换
    onImageChange(e) {
        this.setData({ currentImage: e.detail.current });
    },

    // 图片预览
    onPreviewImage(e) {
        const images = this.data.product.images || [];
        const index = Number(e.currentTarget.dataset.index || 0);
        if (!images.length) return;
        wx.previewImage({
            current: images[index] || images[0],
            urls: images
        });
    },

    onPreviewDetailImage(e) {
        const images = this.data.detailImageList || [];
        const index = Number(e.currentTarget.dataset.index || 0);
        if (!images.length) return;
        wx.previewImage({
            current: images[index] || images[0],
            urls: images
        });
    },

    onGalleryImageError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const product = this.data.product || {};
        const originalImages = Array.isArray(product.images) ? product.images : [];
        if (originalImages[index] !== PRODUCT_PLACEHOLDER && originalImages.length <= 1) {
            this.setData({
                'product.images': [PRODUCT_PLACEHOLDER],
                imageCount: 1,
                currentImage: 0
            });
            return;
        }
        const images = Array.isArray(product.images)
            ? product.images.filter((_, currentIndex) => currentIndex !== index)
            : [];
        this.setData({
            'product.images': images,
            imageCount: images.length || 0,
            currentImage: Math.min(this.data.currentImage || 0, Math.max(images.length - 1, 0))
        });
    },

    onDetailImageError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const images = Array.isArray(this.data.detailImageList)
            ? this.data.detailImageList.filter((_, i) => i !== index)
            : [];
        this.setData({ detailImageList: images });
    },

    onReviewAvatarError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const reviews = Array.isArray(this.data.reviews) ? this.data.reviews.slice() : [];
        const current = reviews[index];
        if (!current) return;
        reviews[index] = {
            ...current,
            user: {
                ...(current.user || {}),
                avatar: '/assets/icons/user.svg',
                avatar_url: '/assets/icons/user.svg',
                nick_name: (current.user && current.user.nick_name) || '用户',
                nickname: (current.user && current.user.nickname) || '用户'
            }
        };
        this.setData({ reviews });
    },

    // 返回 (Renamed to match WXML: onBackTap)
    onBackTap() {
        safeBack();
    },

    async refreshFavoriteState() {
        return refreshFavoriteState(this);
    },

    async onToggleFavorite() {
        return toggleFavorite(this);
    },

    // 选择规格
    onSpecSelect(e) {
        if (this.data.limitedSpotLockedSkuId) {
            wx.showToast({ title: '活动商品规格已锁定', icon: 'none' });
            return;
        }
        const result = onSpecSelect(this, e, resolvePayableUnitPrice);
        this.syncPurchaseActionState();
        this.schedulePurchaseBenefitsRefresh({ reloadCoupons: true });
        return result;
    },

    // 判断规格值是否可选（库存为0则灰化）
    isSpecValueDisabled(specName, specValue) {
        const { skus, selectedSpecs } = this.data;
        if (!skus || skus.length === 0) return false;

        // 构建临时选中状态
        const tempSpecs = { ...selectedSpecs, [specName]: specValue };

        // 检查是否存在匹配的 SKU 且有库存
        const matchedSku = skus.find((sku) => {
            const skuSpecs = Array.isArray(sku.specs) && sku.specs.length > 0
                ? sku.specs
                : (sku.spec_name && sku.spec_value ? [{ name: sku.spec_name, value: sku.spec_value }] : []);
            if (skuSpecs.length === 0) return false;
            return skuSpecs.every((s) => tempSpecs[s.name] === s.value);
        });

        if (matchedSku) {
            return (matchedSku.stock || 0) <= 0;
        }
        return false;
    },

    getMaxStock() {
        return getMaxStock(this);
    },

    // 数量减少 (Renamed to match WXML: onMinus)
    onMinus() {
        if (this.data.limitedSpotOffer) {
            this.setData({ quantity: 1 });
            return;
        }
        if (this.data.exchangeMode) return;
        const result = onMinus(this);
        this.schedulePurchaseBenefitsRefresh({ reloadCoupons: true });
        return result;
    },

    // 数量增加 (Renamed to match WXML: onPlus)
    onPlus() {
        if (this.data.limitedSpotOffer) {
            this.setData({ quantity: 1 });
            return;
        }
        if (this.data.exchangeMode) return;
        const result = onPlus(this);
        this.schedulePurchaseBenefitsRefresh({ reloadCoupons: true });
        return result;
    },

    // Quantity Input (Added)
    onQtyInput(e) {
        if (this.data.limitedSpotOffer) {
            this.setData({ quantity: 1 });
            return;
        }
        if (this.data.exchangeMode) {
            this.setData({ quantity: 1 })
            return
        }
        const result = onQtyInput(this, e);
        this.schedulePurchaseBenefitsRefresh({ reloadCoupons: true });
        return result;
    },

    // 加入购物袋入口（防重复点击）
    onAddToCart() {
        if (this.data.exchangeMode) {
            wx.showToast({ title: '兑换商品不能加入购物袋', icon: 'none' });
            return;
        }
        if (this._addingToCart) return;
        if (this.data.isOutOfStock) {
            wx.showToast({ title: '商品暂时缺货', icon: 'none' });
            return;
        }
        this.addToCart();
    },

    onBuyNow() {
        return onBuyNow(this, resolvePayableUnitPrice);
    },

    onPurchaseModeChange(e) {
        const mode = e.currentTarget.dataset.mode || 'normal';
        if (mode === this.data.purchaseMode) return;
        const patch = { purchaseMode: mode };
        if (mode === 'limited_money') patch.limitedSpotMode = 'money';
        if (mode === 'limited_points') patch.limitedSpotMode = 'points';
        this.setData(patch, () => this.syncPurchaseActionState());
    },

    onActivityQuickActionTap(e) {
        const action = e.currentTarget.dataset.action;
        if (action === 'current-group') {
            return this.openCurrentGroup();
        }
        if (action === 'current-slash') {
            return this.openCurrentSlash();
        }
        if (action === 'my-group') {
            return this.openMyGroupList();
        }
        if (action === 'my-slash') {
            return this.openMySlashList();
        }
    },

    openCurrentGroup() {
        const record = this.data.currentGroupRecord;
        if (!record || !record.group_no) {
            return this.openMyGroupList();
        }
        wx.navigateTo({ url: `/pages/group/detail?group_no=${record.group_no}` });
    },

    openCurrentSlash() {
        const record = this.data.currentSlashRecord;
        if (!record || !record.slash_no) {
            return this.openMySlashList();
        }
        wx.navigateTo({ url: `/pages/slash/detail?slash_no=${record.slash_no}` });
    },

    openMyGroupList() {
        if (!requireLogin()) return;
        wx.navigateTo({ url: '/pages/group/list?tab=my' });
    },

    openMySlashList() {
        if (!requireLogin()) return;
        wx.navigateTo({ url: '/pages/slash/list?tab=my' });
    },

    onLeftActionTap() {
        if (this.data.limitedSpotOffer) {
            wx.showToast({ title: '活动商品不支持加入购物袋', icon: 'none' });
            return;
        }
        if (this.data.exchangeMode) {
            wx.showToast({ title: '兑换商品请直接点击立即兑换', icon: 'none' });
            return;
        }
        if (this.data.purchaseMode === 'normal') {
            return this.onAddToCart();
        }
        return this.onBuyNow();
    },

    onRightActionTap() {
        if (this.data.purchaseMode === 'group') {
            return this.onStartGroup();
        }
        if (this.data.purchaseMode === 'slash') {
            return this.onStartSlash();
        }
        return this.onBuyNow();
    },

    async onStartGroup() {
        const activity = this.data.groupActivity;
        if (!activity) {
            wx.showToast({ title: '暂无拼团活动', icon: 'none' });
            return;
        }
        if (!requireLogin()) return;

        try {
            const hasSkuOptions = Array.isArray(this.data.skus) && this.data.skus.length > 0;
            const selectedSkuId = this.data.selectedSku && this.data.selectedSku.id;
            const activitySkuId = activity.sku_id != null && activity.sku_id !== '' ? activity.sku_id : null;
            if (hasSkuOptions && selectedSkuId == null && activitySkuId == null) {
                wx.showToast({ title: '请选择商品规格', icon: 'none' });
                return;
            }
            const product = this.data.product || {};
            const price = parseFloat(activity.group_price || activity.price || product.retail_price || product.price || this.data.currentPrice || 0);
            const skuId = selectedSkuId != null && selectedSkuId !== '' ? selectedSkuId : activitySkuId;
            const buyInfo = {
                product_id: normalizeProductId(product.id || this.data.id),
                category_id: product.category_id || null,
                sku_id: skuId || null,
                quantity: this.data.quantity || 1,
                price,
                name: product.name || activity.name || '拼团商品',
                image: product.images && product.images[0] || '',
                spec: this.data.selectedSkuText || (skuId ? '拼团·指定规格' : '拼团特惠'),
                type: 'group',
                group_activity_id: activity._id || activity.id,
                supports_pickup: product.supports_pickup ? 1 : 0
            };
            wx.setStorageSync('directBuyInfo', buyInfo);
            wx.navigateTo({ url: '/pages/order/confirm?from=direct' });
        } catch (err) {
            wx.showToast({ title: err && err.message ? String(err.message) : '网络错误', icon: 'none' });
        }
    },

    async onStartSlash() {
        const activity = this.data.slashActivity;
        if (!activity) {
            wx.showToast({ title: '暂无砍价活动', icon: 'none' });
            return;
        }
        if (!requireLogin()) return;

        try {
            const hasSkuOptions = Array.isArray(this.data.skus) && this.data.skus.length > 0;
            const selectedSkuId = this.data.selectedSku && this.data.selectedSku.id;
            const activitySkuId = activity.sku_id != null && activity.sku_id !== '' ? activity.sku_id : null;
            if (hasSkuOptions && selectedSkuId == null && activitySkuId == null) {
                wx.showToast({ title: '请选择商品规格', icon: 'none' });
                return;
            }
            const payload = { activity_id: activity.id };
            if (selectedSkuId != null && selectedSkuId !== '') {
                payload.sku_id = selectedSkuId;
            } else if (activitySkuId != null) {
                payload.sku_id = activitySkuId;
            }
            const res = await post('/slash/start', payload);
            const resume = resolveSlashResumePayload(res);
            if ((res.code === 0 || res.code === 1) && resume.resumable) {
                wx.navigateTo({ url: `/pages/slash/detail?slash_no=${resume.slashNo}` });
                return;
            }
            if (res.code === 0 || res.code === 1) {
                wx.showToast({ title: normalizeUserMessage(res.message, '砍价已发起，可前往“我的砍价”查看'), icon: 'none' });
                setTimeout(() => this.openMySlashList(), 500);
                return;
            }
            wx.showToast({ title: normalizeUserMessage(res.message, '发起砍价失败'), icon: 'none' });
        } catch (err) {
            const message = err && err.message ? String(err.message) : '';
            if (message.includes('已发起过砍价')) {
                wx.showToast({ title: '该砍价已发起，正在为你打开', icon: 'none' });
                this.loadUserActivitySnapshot(this.data.id);
                setTimeout(() => {
                    if (this.data.currentSlashRecord && this.data.currentSlashRecord.slash_no) {
                        this.openCurrentSlash();
                        return;
                    }
                    this.openMySlashList();
                }, 500);
                return;
            }
            wx.showToast({ title: normalizeUserMessage(message, '网络错误，请稍后重试'), icon: 'none' });
        }
    },

    // 加入购物袋
    async addToCart() {
        return addToCart(this);
    },

    // 触发飞入购物袋动画（使用 brand-animation 组件）
    triggerFlyAnim() {
        if (!this.brandAnimation) {
            this.brandAnimation = this.selectComponent('#brandAnimation');
        }
        if (!this.brandAnimation) return;

        const sysInfo = wx.getSystemInfoSync();
        // 起点：商品图中心
        const startX = sysInfo.windowWidth / 2;
        const startY = sysInfo.windowHeight * 0.3;

        // 终点：查询购物袋图标位置
        const query = wx.createSelectorQuery().in(this);
        query.select('.fly-cart-target').boundingClientRect((rect) => {
            const endX = rect ? rect.left + rect.width / 2 : sysInfo.windowWidth * 0.35;
            const endY = rect ? rect.top + rect.height / 2 : sysInfo.windowHeight - 50;

            const image = this.data.product.images && this.data.product.images[0] || '';
            this.brandAnimation.flyToCart(startX, startY, endX, endY, image);
        }).exec();
    },

    // 联系客服
    onCustomerService() {
        wx.showToast({ title: '请点击客服按钮', icon: 'none' });
    },

    // 代理商采购入仓
    onAgentRestock() {
        wx.navigateTo({ url: '/pages/distribution/stock-logs' });
    },

    onOpenSharePanel() {
        this.setData({ showSharePanel: true, showTimelineTip: false });
    },

    onCloseSharePanel() {
        if (this._timelineTipTimer) {
            clearTimeout(this._timelineTipTimer);
            this._timelineTipTimer = null;
        }
        this.setData({ showSharePanel: false, showTimelineTip: false });
    },

    onShareTimelineTap() {
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
        if (this._timelineTipTimer) clearTimeout(this._timelineTipTimer);
        this.setData({ showTimelineTip: true });
        this._timelineTipTimer = setTimeout(() => {
            this._timelineTipTimer = null;
            this.setData({ showTimelineTip: false });
        }, 3600);
    },

    onCreateProductPoster() {
        this.setData({ showSharePanel: false });
        openProductPoster(this);
    },

    // 分享商品详情
    onShareAppMessage() {
        this.setData({ showSharePanel: false });
        return buildProductSharePayload(this);
    },

    onShareTimeline() {
        const payload = buildProductSharePayload(this);
        return {
            title: payload.title,
            query: payload.query,
            imageUrl: payload.imageUrl
        };
    }
});
