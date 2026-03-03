// pages/index/index.js - 镜像商城首页 V2 组件化渲染
const { get } = require('../../utils/request');
const { ErrorHandler } = require('../../utils/errorHandler');
const app = getApp();

Page({
    data: {
        // 用户信息
        userInfo: null,
        isLoggedIn: false,

        // ★ 核心动态区块渲染数据
        sections: [],

        // 导航栏滚动状态
        navScrolled: false,
        statusBarHeight: 20,
        showSurprise: false
    },

    onLoad(options) {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20
        });

        // 获取并检查邀请码
        const inviterId = options.inviter_id || options.scene;
        if (inviterId) {
            this.handleShareEntry(inviterId);
        } else if (app.globalData.pendingInviterId) {
            this.handleShareEntry(app.globalData.pendingInviterId);
            app.globalData.pendingInviterId = null;
        }

        // 绑定预加载回调
        if (app.globalData.homeDataPromise) {
            app.homeDataCallback = (data) => {
                this._renderHomeData(data);
            };
            app.globalData.homeDataPromise.then(data => {
                if (data) this._renderHomeData(data);
            });
        }
    },

    onShow() {
        this.loadData();
        this.loadUserInfo();
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    },

    onPullDownRefresh() {
        this.setData({ refreshing: true });
        Promise.all([
            this.loadData(true),
            this.loadUserInfo()
        ]).finally(() => {
            this.setData({ refreshing: false });
            wx.stopPullDownRefresh();
        });
    },

    onPageScroll(e) {
        const scrolled = e.scrollTop > 50;
        if (scrolled !== this.data.navScrolled) {
            this.setData({ navScrolled: scrolled });
        }
    },

    async loadData(forceRefresh = false) {
        try {
            let data = null;

            if (!forceRefresh) {
                // 1. 先读全局预拉取缓存
                data = app.globalData.homePageData;

                // 2. 没拿到就读持久化 Storage
                if (!data) {
                    const CACHE_KEY = 'home_page_data_cache';
                    const cached = wx.getStorageSync(CACHE_KEY);
                    if (cached && cached.expireAt > Date.now()) {
                        data = cached.data;
                        app.globalData.homePageData = data;
                    }
                }
            }

            // 3. 实在没有才发网路请求
            if (!data || Object.keys(data).length === 0) {
                const res = await get('/homepage-config').catch(() => ({ data: {} }));
                data = res.data || {};
            }

            this._renderHomeData(data);
        } catch (error) {
            console.error('[Index] 获取首页配置失败:', error);
        }
    },

    _renderHomeData(data) {
        if (!data) return;
        let finalSections = data.sections || [];

        // 数据注水：给 quick-entry / banner / feature-cards 塞入对应数据
        if (finalSections.length > 0) {
            finalSections.forEach(sec => {
                if (sec.section_type === 'quick-entry' && sec.config) {
                    sec.config.entries = data.quickEntries || [];
                }
                if (sec.section_type === 'feature-cards' && sec.config && (!sec.config.cards || sec.config.cards.length === 0)) {
                    sec.config.cards = data.featureCards || [];
                }
                if (sec.section_type === 'banner' && sec.config && (!sec.config.images || sec.config.images.length === 0)) {
                    sec.config.images = (data.banners || []).map(b => b.image_url);
                }
            });
        } else {
            // 默认降级兜底：无配置时生成默认骨架
            finalSections = [
                {
                    id: 'mock_banner',
                    section_type: 'banner',
                    is_visible: true,
                    config: { images: (data.banners && data.banners.length > 0) ? data.banners.map(b => b.image_url) : ['https://images.unsplash.com/photo-1612817288484-6f916006741a?w=1000'] }
                },
                {
                    id: 'mock_quick',
                    section_type: 'quick-entry',
                    is_visible: !!data.quickEntries?.length,
                    config: { entries: data.quickEntries || [], columns: 4, style: 'icon-text' }
                },
                {
                    id: 'mock_feature',
                    section_type: 'feature-cards',
                    is_visible: !!data.featureCards?.length,
                    title: '特色专区',
                    config: { cards: data.featureCards || [], columns: 2 }
                },
                {
                    id: 'mock_grid',
                    section_type: 'product-grid',
                    is_visible: true,
                    title: '星品挚选',
                    subtitle: 'TOP STAR PRODUCTS',
                    config: { limit: 10, columns: 2, cardStyle: 'card' }
                }
            ];
        }

        // 过滤出启用的区块并排序
        finalSections = finalSections
            .filter(s => s.is_visible)
            .sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0));

        this.setData({ sections: finalSections });
    },

    async loadUserInfo() {
        const isLoggedIn = app.globalData.isLoggedIn;
        this.setData({ isLoggedIn });
        if (!isLoggedIn) {
            this.setData({ userInfo: null });
            return;
        }
        try {
            const res = await get('/user/profile');
            if (res.code === 0 && res.data) {
                this.setData({ userInfo: res.data });
            }
        } catch (err) {
            console.error('加载用户信息失败:', err);
        }
    },

    handleShareEntry(inviterId) {
        wx.navigateTo({ url: `/pages/questionnaire/fill?inviter_id=${inviterId}` });
    },

    onSearchTap() {
        wx.navigateTo({ url: '/pages/search/search' });
    },

    // 接收 section-renderer 冒泡上来的点击事件
    onSectionTap(e) {
        const detail = e.detail;
        const item = detail.item;

        // 商品卡片跳转
        if (item.product && item.product.id) {
            wx.navigateTo({ url: `/pages/product/detail?id=${item.product.id}` });
            return;
        }

        // 链接跳转
        if (item.url) {
            const url = item.url;
            const type = item.type || 'page';

            if (type === 'page') {
                const tabPages = ['/pages/index/index', '/pages/category/category', '/pages/activity/activity', '/pages/user/user'];
                if (tabPages.includes(url)) {
                    wx.switchTab({ url });
                } else {
                    wx.navigateTo({ url });
                }
            } else if (type === 'miniprogram') {
                wx.navigateToMiniProgram({
                    appId: url,
                    envVersion: 'release'
                });
            } else if (type === 'h5') {
                // 如果有 webview 页面则跳 webview
                // wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` });
            }
        }
    },

    // 底部彩蛋
    onSurpriseTap() {
        this.setData({ showSurprise: !this.data.showSurprise });
        wx.vibrateShort();
    }
});
