const { get, post } = require('../../utils/request');
const { cachedGet } = require('../../utils/requestCache');
const { parseImages, processProduct, genHeatLabel } = require('../../utils/dataFormatter');
const { isDevelopment, getApiBaseUrl } = require('../../config/env');
const navigator = require('../../utils/navigator');
const { syncPageTabBar, restorePageTabBar } = require('../../utils/tabBarHelper');
const { fetchUserProfile, truncateNickname, calcGrowthPercent } = require('../../utils/userProfile');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { consumePendingRegisterPrompt } = require('../../utils/lightPrompt');
const { fetchPointSummary, checkinPoints } = require('../../utils/points');
const app = getApp();

const INDEX_USER_INFO_TTL = 15 * 1000;

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
        loading: true,
        showPopupAd: false,
        popupAd: {},
        regLightTipShow: false,
        regLightTipTitle: '',
        regLightTipContent: ''
    },

    onLoad(options) {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44
        });

        // 小程序码 scene / 分享链接 invite：写入待绑定会员码，登录时由 app.wxLogin 带给后端
        try {
            if (options && options.invite) {
                wx.setStorageSync('pending_invite_code', String(options.invite).trim().toUpperCase());
            }
            if (options && options.scene != null && options.scene !== '') {
                let raw = options.scene;
                if (typeof raw === 'number') raw = String(raw);
                try {
                    raw = decodeURIComponent(raw);
                } catch (e) { /* 保持原样 */ }
                let code = '';
                const m = String(raw).match(/^i=([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8})$/i);
                if (m) code = m[1];
                else if (/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/i.test(String(raw))) code = String(raw);
                if (code) wx.setStorageSync('pending_invite_code', code.toUpperCase());
            }
        } catch (e) { /* ignore */ }

        if (app.globalData.homeDataPromise) {
            app.globalData.homeDataPromise.then((data) => {
                if (data) this._applyHomeConfig(data);
            });
        }

        this.loadData();
    },

    onShow() {
        this.loadUserInfo();
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
        this._syncPopupAdTabBar();
        this._tryPendingRegisterLightTip();
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
        this.setData({ loading: true });
        try {
            let data = null;

            if (!forceRefresh) {
                data = app.globalData.homePageData;
                if (!data) {
                    const cached = wx.getStorageSync('home_config_cache');
                    if (cached && cached.expireAt > Date.now()) {
                        data = cached.data;
                        app.globalData.homePageData = data;
                    }
                }
                if (!data && app.globalData.homeDataPromise) {
                    data = await app.globalData.homeDataPromise.catch(() => null);
                }
            }

            if (!data || Object.keys(data).length === 0) {
                const pageRes = await get('/page-content/home').catch(() => null);
                const unifiedPayload = pageRes?.data?.resources?.legacy_payload || null;
                if (unifiedPayload && Object.keys(unifiedPayload).length) {
                    data = unifiedPayload;
                    this.homeResources = pageRes?.data?.resources || null;
                    this.setData({ pageLayout: pageRes?.data?.layout || null });
                } else {
                    const res = await get('/homepage-config').catch(() => ({ data: {} }));
                    data = res.data || {};
                }
            }

            this._applyHomeConfig(data);

            this.loadFeaturedProducts();
            this.loadPosters();
            this.loadBubbles();
        } catch (err) {
            console.error('[Index] 获取首页配置失败:', err);
            this.setData({ loading: false });
        }
    },

    async loadFeaturedProducts() {
        try {
            const layoutBoardProducts = this.homeResources?.boards?.['home.featuredProducts']?.products;
            let list = Array.isArray(layoutBoardProducts) ? layoutBoardProducts : [];

            // 优先读取首页精选商品榜；若 page-content 未返回则回退 boards 接口
            let boardProducts = list;
            if (!boardProducts.length) {
                const boardRes = await cachedGet(get, '/boards/map', {
                    scene: 'home',
                    keys: 'home.featuredProducts'
                }, {
                    cacheTTL: 2 * 60 * 1000,
                    showError: false,
                    maxRetries: 0,
                    timeout: 10000
                }).catch(() => null);
                boardProducts = boardRes?.data?.['home.featuredProducts']?.products;
            }
            list = Array.isArray(boardProducts) ? boardProducts : [];

            if (!list.length) {
                const res = await cachedGet(get, '/products', { page: 1, limit: 6, sort: 'hot' }, {
                    cacheTTL: 2 * 60 * 1000,
                    showError: false,
                    maxRetries: 0,
                    timeout: 10000
                });
                const listRaw = res?.list || res?.data?.list || (Array.isArray(res?.data) ? res.data : []);
                list = Array.isArray(listRaw) ? listRaw : [];
            }

            const roleLevel = app.globalData.userInfo?.role_level || 0;
            const products = list.map(p => {
                const processed = processProduct(p, roleLevel);
                const discountLabel = (p.market_price && p.retail_price && parseFloat(p.market_price) > parseFloat(p.retail_price))
                    ? (Math.round(parseFloat(p.retail_price) / parseFloat(p.market_price) * 10)) + '折'
                    : '';
                const heatLabel = genHeatLabel(p);
                return { ...processed, discount_label: discountLabel, heat_label: heatLabel };
            });
            this.setData({ featuredProducts: products });
        } catch (err) {
            console.error('[Index] 加载精选商品失败:', err);
        }
    },

    async loadPosters() {
        const mapBanners = (list) => (list || []).map(b => ({
            id: b.id,
            image: normalizeAssetUrl(b.image_url),
            title: b.title || '',
            subtitle: b.subtitle || '',
            link_type: b.link_type || 'none',
            link_value: b.link_value || ''
        }));
        try {
            const layoutBanners = this.homeResources?.banners || null;
            if (layoutBanners) {
                this.setData({
                    midPosters: mapBanners(layoutBanners.home_mid || []),
                    bottomPosters: mapBanners(layoutBanners.home_bottom || [])
                });
                return;
            }

            const [midRes, bottomRes] = await Promise.all([
                cachedGet(get, '/banners', { position: 'home_mid' }, {
                    cacheTTL: 5 * 60 * 1000,
                    showError: false,
                    maxRetries: 0,
                    timeout: 10000
                }).catch(() => ({ data: [] })),
                cachedGet(get, '/banners', { position: 'home_bottom' }, {
                    cacheTTL: 5 * 60 * 1000,
                    showError: false,
                    maxRetries: 0,
                    timeout: 10000
                }).catch(() => ({ data: [] }))
            ]);
            this.setData({
                midPosters: mapBanners(midRes?.data || midRes?.list || []),
                bottomPosters: mapBanners(bottomRes?.data || bottomRes?.list || [])
            });
        } catch (e) {
            console.log('[Index] 海报加载失败，不影响主页渲染');
        }
    },

    async loadBubbles() {
        try {
            const res = await cachedGet(get, '/activity/bubbles', { limit: 10 }, {
                cacheTTL: 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            });
            const list = res?.data || [];
            if (!Array.isArray(list) || list.length === 0) return;
            const bubbles = list.map(b => {
                // 优先使用后端格式化好的 text，降级用本地拼接
                if (b.text) return b.text;
                const action = { order: '购买了', group_buy: '拼团了', slash: '砍价了', lottery: '抽中了' }[b.type] || '购买了';
                return `${b.nickname} ${action} ${b.product_name}`;
            });
            this.setData({ bubbles, currentBubble: bubbles[0] });
            this._bubbleIdx = 0;
            this._startBubbleRotation();
        } catch (_) {}
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
            coverImage: normalizeAssetUrl(activity.image || activity.image_url || ''),
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
        if (!data) return;
        app.globalData.homePageData = data;
        const brandConfig = getConfigSection('brand_config');

        const bannerList = Array.isArray(data.banners)
            ? data.banners
            : (Array.isArray(data.banners?.home) ? data.banners.home : []);
        const dbBanners = bannerList;

        // Banner 兜底：只要有文字配置就能渲染（图走渐变 fallback），不再依赖 mock 占位图
        const defaultBrandBanners = [
            {
                id: '__default_1',
                image: '',
                title: '品牌甄选',
                subtitle: '发现值得信赖的好物',
                link_type: 'none',
                link_value: ''
            }
        ];
        const heroBanners = dbBanners.length > 0
            ? dbBanners.map((b) => ({
                id: b.id,
                image: normalizeAssetUrl(b.image_url || ''),
                title: b.title || '',
                subtitle: b.subtitle || '',
                link_type: b.link_type || 'none',
                link_value: b.link_value || ''
            }))
            : defaultBrandBanners;

        const configs = data.configs || {};
        const showBrandLogo = configs.show_brand_logo !== 'false' && configs.show_brand_logo !== false;
        this.setData({
            homeConfigs: configs,
            showBrandLogo: showBrandLogo,
            brandLogo: configs.brand_logo || '',
            navBrandTitle: configs.nav_brand_title || brandConfig.nav_brand_title || '问兰镜像',
            navBrandSub: configs.nav_brand_sub || brandConfig.nav_brand_sub || '品牌甄选',
            latestActivity: this._normalizeLatestActivity(data.latestActivity || {}),
            heroBanners,
            loading: false
        });

        // 弹窗广告
        const popupAd = data.popupAd || {};
        if (popupAd.enabled && popupAd.image_url) {
            this._checkAndShowPopupAd({
                ...popupAd,
                image_url: normalizeAssetUrl(popupAd.image_url)
            });
        }
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

                this.setData({
                    userInfo: info,
                    truncatedName: truncateNickname(info.nickname),
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
        switch (item.link_type) {
            case 'page':
                if (item.link_value) wx.navigateTo({ url: item.link_value });
                else wx.switchTab({ url: '/pages/activity/activity' });
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
        // 与商务中心/团队一致：分享参数中携带会员码；落地页与 app 启动写入 pending_invite_code，登录时绑 parent_id
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
