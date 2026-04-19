const { get, post } = require('../../utils/request');
const { parseImages, resolveProductImage } = require('../../utils/dataFormatter');
const { isDevelopment } = require('../../config/env');
const navigator = require('../../utils/navigator');
const { syncPageTabBar, restorePageTabBar } = require('../../utils/tabBarHelper');
const { fetchUserProfile, truncateNickname, calcGrowthPercent } = require('../../utils/userProfile');
const { consumePendingRegisterPrompt } = require('../../utils/lightPrompt');
const { fetchPointSummary, checkinPoints } = require('../../utils/points');
const {
    loadData: loadHomeData,
    loadFeaturedProducts: loadHomeFeaturedProducts,
    loadPosters: loadHomePosters,
    loadBubbles: loadHomeBubbles,
    loadCoupons: loadHomeCoupons,
    applyHomeConfig,
    normalizeAssetUrl,
    createEmptyBrandZone
} = require('./indexHomeLoader');
const app = getApp();

const INDEX_USER_INFO_TTL = 15 * 1000;

function parseScene(scene) {
    const result = {};
    if (!scene) return result;
    String(scene).split('&').forEach((pair) => {
        const [rawKey, rawValue] = pair.split('=');
        if (!rawKey) return;
        const key = decodeURIComponent(rawKey);
        const value = rawValue ? decodeURIComponent(rawValue) : '';
        result[key] = value;
    });
    return result;
}

function uniqueImageUrls(list = []) {
    const seen = new Set();
    return (Array.isArray(list) ? list : [])
        .map((item) => normalizeAssetUrl(item))
        .filter((url) => {
            if (/\/assets\/images\/placeholder\.svg(?:$|[?#])/i.test(String(url || ''))) return false;
            if (!url || seen.has(url)) return false;
            seen.add(url);
            return true;
        });
}

function collectFeaturedImageCandidates(product = {}) {
    return uniqueImageUrls([
        ...(Array.isArray(product.image_candidates) ? product.image_candidates : []),
        product.image_url,
        ...parseImages(product.preview_images),
        ...parseImages(product.previewImages),
        product.firstImage,
        resolveProductImage(product, ''),
        product.cover_image,
        product.coverImage,
        product.image,
        product.cover,
        product.cover_url,
        product.coverUrl,
        product.url,
        product.thumb,
        product.thumbnail,
        product.product_image,
        product.productImage,
        product.product_image_url,
        product.file_id,
        product.fileId,
        ...parseImages(product.images),
        ...parseImages(product.image),
        ...parseImages(product.cover_image)
    ]);
}

function findNextCandidateIndex(candidates = [], currentImage = '', currentIndex = -1) {
    const normalizedCurrent = normalizeAssetUrl(currentImage);
    for (let index = Math.max(0, currentIndex + 1); index < candidates.length; index += 1) {
        const candidate = candidates[index];
        if (!candidate) continue;
        if (!normalizedCurrent || candidate !== normalizedCurrent) return index;
    }
    return -1;
}

Page({
    data: {
        homeConfigs: {},
        heroBanners: [],
        midPosters: [],
        bottomPosters: [],
        pageLayout: null,
        showBrandLogo: true,
        brandLogo: '',
        bubbles: [],
        currentBubble: '',
        bubbleAnim: {},
        featuredProducts: [],
        featuredSections: [],
        userInfo: null,
        isLoggedIn: false,
        truncatedName: '',
        growthValue: 0,
        nextLevelThreshold: 500,
        growthPercent: 0,
        pointBalance: 0,
        todaySigned: false,
        latestActivity: {},
        navScrolled: false,
        navBrandTitle: '问兰镜像',
        navBrandSub: '品牌甄选',
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        heroViewportHeight: 0,
        loading: true,
        showPopupAd: false,
        popupAd: {},
        regLightTipShow: false,
        regLightTipTitle: '',
        regLightTipContent: '',
        homeCoupons: [],
        unusedCouponCount: 0,
        brandZone: createEmptyBrandZone()
    },

    onLoad(options) {
        this._assetRefreshInFlight = false;
        this._assetRefreshAttempted = false;
        this._skipNextHomeRefresh = true;
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const viewportHeight = windowInfo.windowHeight || windowInfo.screenHeight || 0;
        const heroPeekHeight = Math.max(160, Math.round(viewportHeight * 0.20));
        this.setData({
            heroViewportHeight: Math.max(480, viewportHeight - heroPeekHeight),
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44
        });

        // 小程序码 scene / 分享链接 invite：写入待绑定会员码，登录时由 app.wxLogin 带给后端
        app._captureInviteFromLaunch({ query: options || {} });
        this._resolveCouponEntry(options);

        if (app.globalData.homeDataPromise) {
            app.globalData.homeDataPromise.then((data) => {
                if (data) this._applyHomeConfig(data);
            });
        }

        this.loadData();
    },

    onShow() {
        this._consumeCouponEntry();
        this.loadUserInfo();
        this.loadCoupons();
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
        this._syncPopupAdTabBar();
        this._tryPendingRegisterLightTip();
        if (this._skipNextHomeRefresh) {
            this._skipNextHomeRefresh = false;
        } else {
            this.loadData(true);
        }
    },

    _tryPendingRegisterLightTip() {
        const p = consumePendingRegisterPrompt();
        if (!p) return;
        this.setData({
            regLightTipShow: true,
            regLightTipTitle: p.title,
            regLightTipContent: p.content || ''
        });
    },

    onRegLightTipClose() {
        this.setData({ regLightTipShow: false });
    },

    _resolveCouponEntry(options = {}) {
        const parsedScene = parseScene(options.scene ? decodeURIComponent(options.scene) : '');
        const couponId = String(options.coupon_id || options.id || parsedScene.cid || parsedScene.id || parsedScene.coupon_id || '').trim();
        console.log('[coupon-entry] resolve:', { raw: options.scene, couponId });
        this._pendingCouponClaimId = couponId || '';
        this._couponClaimConsumed = false;
    },

    _consumeCouponEntry() {
        if (!this._pendingCouponClaimId || this._couponClaimConsumed) return;
        this._couponClaimConsumed = true;
        const couponId = this._pendingCouponClaimId;
        this._pendingCouponClaimId = '';
        const claimUrl = `/pages/coupon/claim?id=${encodeURIComponent(couponId)}`;
        console.log('[coupon-entry] navigating to:', claimUrl);
        setTimeout(() => {
            wx.navigateTo({
                url: claimUrl,
                fail(err) {
                    console.error('[coupon-entry] navigateTo failed:', err);
                    // 子包页面不存在时降级为模态提示
                    wx.showModal({
                        title: '领取优惠券',
                        content: `优惠券 ID：${couponId}，领券页暂未就绪，请升级到最新版小程序后重试。`,
                        showCancel: false
                    });
                }
            });
        }, 800);
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
    },

    onPageScroll(e) {
        const scrolled = e.scrollTop > 40;
        if (scrolled !== this.data.navScrolled) {
            this.setData({ navScrolled: scrolled });
        }
    },

    onPullDownRefresh() {
        Promise.all([
            this.loadData(true),
            this.loadUserInfo(true)
        ]).finally(() => {
            wx.stopPullDownRefresh();
        });
    },

    async loadData(forceRefresh = false) {
        return loadHomeData(this, forceRefresh);
    },

    async loadFeaturedProducts() {
        return loadHomeFeaturedProducts(this);
    },

    async loadPosters() {
        return loadHomePosters(this);
    },

    async loadBubbles() {
        return loadHomeBubbles(this);
    },

    async loadCoupons() {
        return loadHomeCoupons(this);
    },

    onCouponTap() {
        wx.navigateTo({ url: '/pages/coupon/center' });
    },

    onClaimWelcomeCoupons() {
        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        const { post } = require('../../utils/request');
        wx.showLoading({ title: '领取中...' });
        post('/user/claim-welcome-coupons').then((res) => {
            wx.hideLoading();
            if (res.code === 0 && res.data && res.data.claimed_count > 0) {
                wx.showToast({ title: `成功领取${res.data.claimed_count}张优惠券`, icon: 'none', duration: 2000 });
                this.loadCoupons();
            } else if (res.code === 0) {
                wx.showToast({ title: '暂无可领取的优惠券', icon: 'none' });
            } else {
                wx.showToast({ title: res.message || '领取失败', icon: 'none' });
            }
        }).catch(() => {
            wx.hideLoading();
            wx.showToast({ title: '网络异常', icon: 'none' });
        });
    },

    onCouponItemTap(e) {
        if (!app.globalData.isLoggedIn) {
            wx.navigateTo({ url: '/pages/coupon/center' });
            return;
        }
        wx.navigateTo({ url: '/pages/coupon/list' });
    },

    _startBubbleRotation() {
        if (this._bubbleTimer) clearInterval(this._bubbleTimer);
        // 保存内层 timeout 句柄，以便 onHide/onUnload 时一并清除
        this._bubbleT1 = null;
        this._bubbleT2 = null;
        this._bubbleTimer = setInterval(() => {
            const { bubbles } = this.data;
            if (!bubbles.length) return;
            this._bubbleIdx = (this._bubbleIdx + 1) % bubbles.length;
            const anim = wx.createAnimation({ duration: 300, timingFunction: 'ease' });
            anim.opacity(0).translateY(-20).step();
            this.setData({ bubbleAnim: anim.export() });
            this._bubbleT1 = setTimeout(() => {
                this._bubbleT1 = null;
                const anim2 = wx.createAnimation({ duration: 0 });
                anim2.opacity(0).translateY(20).step();
                this.setData({ bubbleAnim: anim2.export(), currentBubble: this.data.bubbles[this._bubbleIdx] });
                this._bubbleT2 = setTimeout(() => {
                    this._bubbleT2 = null;
                    const anim3 = wx.createAnimation({ duration: 300, timingFunction: 'ease' });
                    anim3.opacity(1).translateY(0).step();
                    this.setData({ bubbleAnim: anim3.export() });
                }, 50);
            }, 300);
        }, 4000);
    },

    _clearBubbleTimers() {
        if (this._bubbleTimer) { clearInterval(this._bubbleTimer); this._bubbleTimer = null; }
        if (this._bubbleT1) { clearTimeout(this._bubbleT1); this._bubbleT1 = null; }
        if (this._bubbleT2) { clearTimeout(this._bubbleT2); this._bubbleT2 = null; }
    },

    _normalizeLatestActivity(activity = {}) {
        return {
            ...activity,
            coverImage: normalizeAssetUrl(activity.file_id || activity.image || activity.image_url || ''),
            displaySubtitle: activity.subtitle || activity.summary || ''
        };
    },

    onHide() {
        this._clearBubbleTimers();
        this._restoreNativeTabBar();
    },

    onUnload() {
        this._clearBubbleTimers();
        this._restoreNativeTabBar();
    },

    _applyHomeConfig(data) {
        return applyHomeConfig(this, data);
    },

    async loadUserInfo(forceRefresh = false) {
        const isLoggedIn = app.globalData.isLoggedIn;
        this.setData({ isLoggedIn });

        if (!isLoggedIn) {
            this.setData({
                userInfo: null,
                truncatedName: '',
                growthValue: 0,
                growthPercent: 0,
                pointBalance: 0
            });
            return;
        }

        if (!forceRefresh && this._userInfoPromise) {
            return this._userInfoPromise;
        }

        if (!forceRefresh && this._lastUserInfoLoadedAt && (Date.now() - this._lastUserInfoLoadedAt) < INDEX_USER_INFO_TTL) {
            return;
        }

        this._userInfoPromise = (async () => {
            const result = await fetchUserProfile();
            if (result) {
                const info = result.info;
                const growth = info.growth_value || 0;
                const threshold = info.next_level_threshold || 500;
                const displayName = info.nickName || info.nickname || '';

                this.setData({
                    userInfo: info,
                    truncatedName: truncateNickname(displayName),
                    growthValue: growth,
                    nextLevelThreshold: threshold,
                    growthPercent: calcGrowthPercent(growth, threshold)
                });
            }

            const { account } = await fetchPointSummary();
            this.setData({
                pointBalance: account.balance_points || 0,
                todaySigned: !!account.today_signed
            });
            this._lastUserInfoLoadedAt = Date.now();
        })().catch((err) => {
            console.error('加载用户信息失败:', err);
        }).finally(() => {
            this._userInfoPromise = null;
        });

        return this._userInfoPromise;
    },

    onMemberCardTap() {
        wx.switchTab({ url: '/pages/user/user' });
    },

    onPointsTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/points/index' });
    },

    async onSignInTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        if (this.data.todaySigned) {
            wx.showToast({ title: '今日已签到', icon: 'none' });
            return;
        }
        try {
            const res = await checkinPoints();
            if (res.code === 0) {
                const earned = res.data.points_earned || res.data.points || 0;
                wx.showToast({ title: `签到成功 +${earned}`, icon: 'success' });
                this.setData({
                    todaySigned: true,
                    pointBalance: res.account?.balance_points || res.data.balance_points || (this.data.pointBalance + earned)
                });
            } else {
                wx.showToast({ title: res.message || '签到失败', icon: 'none' });
            }
        } catch (e) {
            wx.showToast({ title: '签到失败，请重试', icon: 'none' });
        }
    },

    onExchangeTap() {
        wx.navigateTo({ url: '/pages/points/index' });
    },

    onActivityTap() {
        wx.switchTab({ url: '/pages/activity/activity' });
    },

    onBrandZoneOpen() {
        wx.navigateTo({ url: '/pages/index/brand-zone-detail' });
    },

    onLatestActivityTap() {
        const item = this.data.latestActivity || {};
        if (item.link_type && item.link_type !== 'none' && item.link_value) {
            navigator.navigate(item.link_type, item.link_value);
            return;
        }
        wx.switchTab({ url: '/pages/activity/activity' });
    },

    onFeatureCardTap(e) {
        const item = e.currentTarget.dataset.item;
        if (!item) return;
        const { isValidPagePath } = require('../../utils/navigator');
        switch (item.link_type) {
            case 'page':
                if (item.link_value && isValidPagePath(String(item.link_value))) {
                    wx.navigateTo({ url: item.link_value });
                } else if (!item.link_value) {
                    wx.switchTab({ url: '/pages/activity/activity' });
                } else {
                    console.warn('[Index] 功能卡片路径不在白名单:', item.link_value);
                }
                break;
            case 'copy':
                if (item.link_value) {
                    wx.setClipboardData({
                        data: item.link_value,
                        success: () => wx.showToast({ title: '内容已复制', icon: 'none', duration: 2500 })
                    });
                }
                break;
            default:
                wx.switchTab({ url: '/pages/activity/activity' });
        }
    },

    onSearchTap() {
        wx.navigateTo({ url: '/pages/search/search' });
    },

    onProductTap(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        wx.navigateTo({ url: `/pages/product/detail?id=${id}` });
    },

    async onFeaturedImageError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const featuredProducts = Array.isArray(this.data.featuredProducts)
            ? this.data.featuredProducts.slice()
            : [];
        const item = featuredProducts[index];
        if (!item) return;

        const currentImage = normalizeAssetUrl(item.cover_image || item.image || (Array.isArray(item.images) ? item.images[0] : ''));
        const candidates = collectFeaturedImageCandidates(item);
        const currentIndex = Math.max(
            Number.isFinite(Number(item.image_candidate_index)) ? Number(item.image_candidate_index) : -1,
            candidates.indexOf(currentImage)
        );
        const nextCandidateIndex = findNextCandidateIndex(candidates, currentImage, currentIndex);

        if (nextCandidateIndex !== -1) {
            const nextImage = candidates[nextCandidateIndex];
            featuredProducts[index] = {
                ...item,
                display_image: nextImage,
                cover_image: nextImage,
                image: nextImage,
                firstImage: nextImage,
                image_candidates: candidates,
                image_candidate_index: nextCandidateIndex,
                image_missing: false
            };
            this.setData({ featuredProducts });
            return;
        }

        const hydrated = await this._hydrateFeaturedProductImage(index, item, candidates, currentImage);
        if (hydrated) return;

        featuredProducts[index] = {
            ...item,
            display_image: '',
            cover_image: '',
            image: '',
            firstImage: '',
            image_candidates: candidates,
            image_candidate_index: candidates.length - 1,
            image_missing: true,
            _detailImageHydrated: true
        };
        this.setData({ featuredProducts });

        if (currentImage || candidates.length) {
            this.onAssetImageError({
                currentTarget: { dataset: { scene: 'featured-product' } },
                detail: e?.detail || {}
            });
        }
    },

    async _hydrateFeaturedProductImage(index, item, currentCandidates = [], currentImage = '') {
        const productId = item && (item.id || item._id || item._legacy_id);
        if (!productId || item._detailImageHydrated) return false;

        try {
            const detailRes = await get(`/products/${productId}`, {}, {
                showError: false,
                maxRetries: 0
            });
            const detail = detailRes && (detailRes.data || detailRes);
            if (!detail || typeof detail !== 'object') return false;

            const mergedCandidates = uniqueImageUrls([
                ...currentCandidates,
                ...collectFeaturedImageCandidates(detail)
            ]);
            const nextCandidateIndex = findNextCandidateIndex(mergedCandidates, currentImage, -1);
            const featuredProducts = Array.isArray(this.data.featuredProducts)
                ? this.data.featuredProducts.slice()
                : [];
            const currentItem = featuredProducts[index];
            if (!currentItem) return false;

            featuredProducts[index] = {
                ...currentItem,
                ...detail,
                images: parseImages(detail.images).length ? parseImages(detail.images) : currentItem.images,
                image_candidates: mergedCandidates,
                image_candidate_index: nextCandidateIndex,
                _detailImageHydrated: true,
                image_missing: nextCandidateIndex === -1
            };

            if (nextCandidateIndex !== -1) {
                const nextImage = mergedCandidates[nextCandidateIndex];
                featuredProducts[index] = {
                    ...featuredProducts[index],
                    display_image: nextImage,
                    cover_image: nextImage,
                    image: nextImage,
                    firstImage: nextImage
                };
            } else {
                featuredProducts[index] = {
                    ...featuredProducts[index],
                    display_image: '',
                    cover_image: '',
                    image: '',
                    firstImage: ''
                };
            }

            this.setData({ featuredProducts });
            return nextCandidateIndex !== -1;
        } catch (err) {
            console.warn('[Index] 商品详情补图失败:', productId, err && (err.message || err));
            return false;
        }
    },

    onGoCategory() {
        wx.switchTab({ url: '/pages/category/category' });
    },

    /**
     * Banner/海报点击导航
     * 支持 link_type: none | product | activity | group_buy | slash | lottery | page | url
     */
    onBannerTap(e) {
        const item = e.currentTarget.dataset.item;
        if (!item) return;
        navigator.navigate(item.link_type, item.link_value);
    },

    onAssetImageError(e) {
        const scene = e?.currentTarget?.dataset?.scene || 'unknown';
        console.warn('[Index] 图片加载失败，使用本地降级内容:', scene, e?.detail || {});

        if (scene === 'hero-banner') {
            const heroBanners = (this.data.heroBanners || []).map((item, index) => (
                index === Number(e?.currentTarget?.dataset?.index || 0)
                    ? { ...item, image: '' }
                    : item
            ));
            this.setData({ heroBanners });
            return;
        }

        if (scene === 'mid-poster' || scene === 'bottom-poster') {
            const key = scene === 'mid-poster' ? 'midPosters' : 'bottomPosters';
            const list = Array.isArray(this.data[key]) ? this.data[key].slice() : [];
            const index = Number(e?.currentTarget?.dataset?.index || 0);
            if (list[index]) {
                list[index] = { ...list[index], image: '' };
                this.setData({ [key]: list });
            }
            return;
        }

        if (scene === 'popup-ad') {
            this.setData({ showPopupAd: false });
        }
    },

    onBrandZoneImageError(e) {
        const scene = e?.currentTarget?.dataset?.scene || 'card';
        const index = Number(e?.currentTarget?.dataset?.index || 0);
        const brandZone = {
            ...createEmptyBrandZone(),
            ...(this.data.brandZone || {})
        };

        if (scene === 'cover') {
            brandZone.coverImage = '';
            this.setData({ brandZone });
            return;
        }

        if (scene === 'certification') {
            const certifications = Array.isArray(brandZone.certifications) ? brandZone.certifications.slice() : [];
            if (!certifications[index]) return;
            certifications[index] = { ...certifications[index], image: '' };
            brandZone.certifications = certifications;
            this.setData({ brandZone });
            return;
        }

        const cards = Array.isArray(brandZone.cards) ? brandZone.cards.slice() : [];
        if (!cards[index]) return;
        cards[index] = { ...cards[index], image: '' };
        brandZone.cards = cards;
        this.setData({ brandZone });
    },

    _syncPopupAdTabBar() {
        syncPageTabBar(this, !!this.data.showPopupAd);
    },

    _restoreNativeTabBar() {
        restorePageTabBar(this);
    },

    _checkAndShowPopupAd(popupAd) {
        const freq = popupAd.frequency || 'once_daily';
        const storageKey = 'popup_ad_shown';

        if (freq === 'once_daily') {
            const today = new Date().toDateString();
            const last = wx.getStorageSync(storageKey);
            if (last === today) return;
        } else if (freq === 'once_session') {
            if (this._popupAdShownThisSession) return;
        }

        this.setData({ showPopupAd: true, popupAd }, () => this._syncPopupAdTabBar());
    },

    onPopupAdTap() {
        const { popupAd } = this.data;
        this.onClosePopupAd();
        if (popupAd.link_type && popupAd.link_type !== 'none') {
            navigator.navigate(popupAd.link_type, popupAd.link_value);
        }
    },

    onClosePopupAd() {
        const { popupAd } = this.data;
        const freq = popupAd.frequency || 'once_daily';

        if (freq === 'once_daily') {
            wx.setStorageSync('popup_ad_shown', new Date().toDateString());
        }
        this._popupAdShownThisSession = true;
        this.setData({ showPopupAd: false }, () => this._syncPopupAdTabBar());
    },

    onShareAppMessage() {
        const shareTitle = app.globalData.shareTitle || '问兰 · 品牌甄选';
        // 分享参数中携带会员码；落地页写入 pending_invite_code，登录时绑 parent_id
        const code = this.data.userInfo?.invite_code || app.globalData.userInfo?.invite_code || '';
        return {
            title: shareTitle,
            path: `/pages/index/index${code ? `?invite=${encodeURIComponent(code)}` : ''}`
        };
    },

    /** 分享到朋友圈（需在 onShow 里 showShareMenu 含 shareTimeline） */
    onShareTimeline() {
        const brandName = app.globalData.brandName || '问兰';
        const code = this.data.userInfo?.invite_code || app.globalData.userInfo?.invite_code || '';
        return {
            title: `${brandName} · 品牌甄选`,
            query: code ? `invite=${encodeURIComponent(code)}` : '',
            imageUrl: ''
        };
    }
});
