const { request } = require('../../utils/request');

Page({
    data: {
        loading: true,
        pageKey: '',
        blocks: [],
        pageTitle: ''
    },

    onLoad(options) {
        const { key = 'default', title } = options;
        this.setData({ pageKey: key });
        if (title) {
            wx.setNavigationBarTitle({ title: decodeURIComponent(title) });
        }
        this.loadPage(key);
    },

    async loadPage(key) {
        this.setData({ loading: true });
        try {
            const res = await request({
                url: `/custom-pages/${encodeURIComponent(key)}`,
                method: 'GET'
            });
            const page = res.data || {};
            if (page.title) {
                wx.setNavigationBarTitle({ title: page.title });
            }
            this.setData({
                blocks: page.blocks || [],
                pageTitle: page.title || ''
            });
        } catch (e) {
            // 加载失败时展示空状态，不中断页面
        } finally {
            this.setData({ loading: false });
        }
    },

    onBannerTap(e) {
        const { link } = e.currentTarget.dataset;
        if (link) this._navigate(link);
    },

    onProductTap(e) {
        const { id } = e.currentTarget.dataset;
        if (id) {
            wx.navigateTo({ url: `/pages/product/detail?id=${id}` });
        }
    },

    onImageTap(e) {
        const { link } = e.currentTarget.dataset;
        if (link) this._navigate(link);
    },

    onButtonTap(e) {
        const { link } = e.currentTarget.dataset;
        if (link) this._navigate(link);
    },

    // 统一导航：支持小程序内部路径和 http 外链（外链仅允许受信任域名）
    _navigate(link) {
        if (!link) return;
        if (link.startsWith('http')) {
            // 安全校验：只允许跳转到业务白名单域名，防止钓鱼
            try {
                const url = new URL(link);
                const allowedHosts = (wx.getStorageSync('trusted_domains') || '').split(',').map(s => s.trim()).filter(Boolean);
                const appHost = wx.getStorageSync('app_host') || '';
                const trusted = [...allowedHosts, appHost].filter(Boolean);
                if (trusted.length && !trusted.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
                    wx.showModal({
                        title: '外部链接',
                        content: '即将跳转到外部页面，是否继续？',
                        success: ({ confirm }) => {
                            if (confirm) {
                                wx.navigateTo({ url: `/pages/feed/index?url=${encodeURIComponent(link)}` });
                            }
                        }
                    });
                    return;
                }
            } catch (e) {
                return; // 无效 URL 直接忽略
            }
            wx.navigateTo({ url: `/pages/feed/index?url=${encodeURIComponent(link)}` });
        } else if (link.startsWith('/pages/')) {
            wx.navigateTo({ url: link });
        }
    },

    onShareAppMessage() {
        return {
            title: this.data.pageTitle || '精选内容',
            path: `/pages/custom-page/index?key=${this.data.pageKey}`
        };
    }
});
