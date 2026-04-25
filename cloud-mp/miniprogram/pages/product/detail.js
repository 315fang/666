// pages/product/detail.js
const { get, post } = require('../../utils/request');
const { normalizeActivityList, resolveSlashResumePayload } = require('./utils/activityHelpers');
const { normalizeProductId } = require('../../utils/dataFormatter');
const { USER_ROLES } = require('../../config/constants');
const { safeBack } = require('../../utils/navigator');
const { requireLogin } = require('../../utils/auth');
const { fetchLimitedSpotContext, normalizeLimitedSpotMode } = require('../../utils/limitedSpot');
const { loadProduct, resolveDetailImageList, resolvePayableUnitPrice, buildSkuText } = require('./productDetailData');
const { refreshFavoriteState, toggleFavorite } = require('./productDetailFavorite');
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

function formatLimitedSpotMoney(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount < 0) return '0.00';
    return amount.toFixed(2);
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
        limitedSpotLockedSkuId: ''
    },

    onLoad(options) {
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
                    url: `/pages/product/detail?id=${encodeURIComponent(rid)}`,
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
            limitedSpotCardId,
            limitedSpotOfferId,
            limitedSpotSource,
            limitedSpotMode: normalizeLimitedSpotMode(options.limited_spot_mode || '', null)
        });
        this.loadProduct(normalizedId);
    },

    onShow() {
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
        this._scheduleDetailSectionObserver();
        return result;
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
        return onMinus(this);
    },

    // 数量增加 (Renamed to match WXML: onPlus)
    onPlus() {
        if (this.data.limitedSpotOffer) {
            this.setData({ quantity: 1 });
            return;
        }
        if (this.data.exchangeMode) return;
        return onPlus(this);
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
        return onQtyInput(this, e);
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

    // 分享商品详情
    onShareAppMessage() {
        const { product } = this.data;
        let path = `/pages/product/detail?id=${product.id}`;
        if (this.data.limitedSpotCardId && this.data.limitedSpotOfferId) {
            if (this.data.limitedSpotSource === 'limited_spot') {
                path += `&limited_spot_card_id=${encodeURIComponent(this.data.limitedSpotCardId)}&limited_spot_offer_id=${encodeURIComponent(this.data.limitedSpotOfferId)}&limited_spot_mode=${encodeURIComponent(this.data.limitedSpotMode || 'money')}`;
            } else {
                path += `&limited_sale_slot_id=${encodeURIComponent(this.data.limitedSpotCardId)}&limited_sale_item_id=${encodeURIComponent(this.data.limitedSpotOfferId)}&limited_spot_mode=${encodeURIComponent(this.data.limitedSpotMode || 'money')}`;
            }
        }
        return {
            title: product.name,
            path,
            imageUrl: (product.images && product.images[0]) || ''
        };
    }
});
