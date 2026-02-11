// pages/index/index.js
const { get, post } = require('../../utils/request');
const { parseImages } = require('../../utils/dataFormatter');
const { DEFAULTS } = require('../../config/constants');
const app = getApp();

// Figma Design Colors: Blue-50, Pink-50, Indigo-50
const NAV_COLORS = ['#EFF6FF', '#FDF2F8', '#EEF2FF'];
const NAV_ICONS = ['/assets/icons/hot.svg', '/assets/icons/crown.svg', '/assets/icons/gift.svg'];

Page({
    data: {
        banners: [],
        products: [],
        categories: [],
        topCategories: [],
        currentCategory: '',
        loading: true,
        isScrolled: false, // For header transition
        statusBarHeight: 20 // Default fallback
    },

    onPageScroll(e) {
        // Toggle header style on scroll
        const isScrolled = e.scrollTop > 50;
        if (isScrolled !== this.data.isScrolled) {
            this.setData({ isScrolled });
        }
    },

    onLoad(options) {
        // 获取状态栏高度用于自定义导航栏
        const sysInfo = wx.getSystemInfoSync();
        this.setData({
            statusBarHeight: sysInfo.statusBarHeight
        });

        // 关键：接收分享进来的邀请码
        if (options.share_id) {
            console.log('通过分享进入，邀请人ID:', options.share_id);
            wx.setStorageSync('distributor_id', options.share_id);

            // 如果已登录但还没有上级，尝试绑定
            if (app.globalData.isLoggedIn) {
                this.tryBindParent(options.share_id);
            }
        }

        this.loadData();
    },

    // 尝试绑定上级（改进版：提供用户反馈）
    async tryBindParent(parentId) {
        try {
            const res = await post('/bind-parent', { parent_id: parseInt(parentId) });
            if (res.code === 0) {
                console.log('绑定上级成功');
                // 显示成功提示
                wx.showToast({
                    title: '已加入团队',
                    icon: 'success',
                    duration: 2000
                });
            }
        } catch (err) {
            // 已有上级会返回错误，静默处理
            console.log('绑定上级:', err.message || '已有上级');
        }
    },

    onPullDownRefresh() {
        this.loadData().then(() => {
            wx.stopPullDownRefresh();
        });
    },

    async loadData() {
        this.setData({ loading: true });

        try {
            const results = await Promise.all([
                get('/content/banners', { position: 'home' }).catch(() => ({ data: [] })),
                get('/products', { limit: 10 }).catch(() => ({ data: { list: [] } })),
                get('/categories').catch(() => ({ data: [] }))
            ]);

            const categories = results[2].data || [];

            // 金刚区：取前3个分类，不足用默认补齐
            const defaultNav = [
                { id: '__hot', name: '热门推荐', icon: '/assets/icons/hot.svg', bgColor: '#FEF3C7' },
                { id: '__new', name: '新品上市', icon: '/assets/icons/sparkle.svg', bgColor: '#FCE7F3' },
                { id: '__sale', name: '限时特惠', icon: '/assets/icons/tag.svg', bgColor: '#DCFCE7' }
            ];
            const topCategories = [];
            for (let i = 0; i < 3; i++) {
                if (i < categories.length) {
                    topCategories.push({
                        id: categories[i].id,
                        name: categories[i].name,
                        icon: categories[i].icon || NAV_ICONS[i],
                        bgColor: NAV_COLORS[i]
                    });
                } else {
                    topCategories.push(defaultNav[i]);
                }
            }

            // 处理商品数据并分列
            const rawProducts = results[1].data && results[1].data.list ? results[1].data.list : (results[1].data || []);
            const { products, leftProducts, rightProducts } = this._processAndSplitProducts(rawProducts);

            this.setData({
                banners: results[0].data || [],
                products,
                leftProducts,
                rightProducts,
                categories,
                topCategories,
                loading: false
            });
        } catch (err) {
            console.error('加载失败:', err);
            this.setData({ loading: false });
        }
    },

    // 搜索
    onSearchTap() {
        wx.navigateTo({ url: '/pages/search/search' });
    },

    // 扫码
    onScanTap() {
        wx.scanCode({
            success: (res) => {
                console.log('扫码结果:', res);
                // 尝试跳转商品详情或搜索
                if (res.path) {
                    wx.navigateTo({ url: '/' + res.path });
                } else if (res.result) {
                    wx.navigateTo({ url: '/pages/search/search?q=' + res.result });
                }
            }
        });
    },

    // Banner点击
    onBannerTap(e) {
        const banner = e.currentTarget.dataset.item;
        if (banner.link_type === 'product' && banner.link_value) {
            wx.navigateTo({ url: '/pages/product/detail?id=' + banner.link_value });
        }
    },

    // 分类切换（金刚区）
    onCategoryTap(e) {
        const categoryId = e.currentTarget.dataset.id;
        if (typeof categoryId === 'string' && categoryId.startsWith('__')) {
            wx.switchTab({ url: '/pages/category/category' });
            return;
        }
        this.setData({ currentCategory: categoryId, loading: true });
        this.loadProducts(categoryId);
    },

    // 分类Tab切换（胶囊分类栏）
    onCategoryChange(e) {
        const categoryId = e.currentTarget.dataset.id;
        this.setData({ currentCategory: categoryId, loading: true });
        this.loadProducts(categoryId);
    },

    // 加载商品
    async loadProducts(categoryId) {
        try {
            const params = { limit: 20 };
            if (categoryId) params.category_id = categoryId;

            const res = await get('/products', params);
            const rawProducts = res.data && res.data.list ? res.data.list : (res.data || []);
            const { products, leftProducts, rightProducts } = this._processAndSplitProducts(rawProducts);

            this.setData({
                products,
                leftProducts,
                rightProducts,
                loading: false
            });
        } catch (err) {
            console.error('加载商品失败:', err);
            this.setData({ loading: false });
        }
    },

    // 私有方法：处理商品数据并分为左右两列
    _processAndSplitProducts(rawProducts) {
        const products = rawProducts.map(item => {
            const images = parseImages(item.images);
            return {
                ...item,
                image: images.length > 0 ? images[0] : DEFAULTS.PLACEHOLDER,
                price: item.retail_price || item.price || 0
            };
        });

        const leftProducts = [];
        const rightProducts = [];
        products.forEach((item, index) => {
            if (index % 2 === 0) {
                leftProducts.push(item);
            } else {
                rightProducts.push(item);
            }
        });

        return { products, leftProducts, rightProducts };
    },

    // 商品点击
    onProductTap(e) {
        const dataset = e.currentTarget.dataset;
        const productId = dataset.id || dataset.item?.id;
        if (productId) {
            wx.navigateTo({ url: '/pages/product/detail?id=' + productId });
        }
    },

    // 分享（带邀请码）
    onShareAppMessage() {
        const userInfo = app.globalData.userInfo;
        const inviteCode = userInfo ? (userInfo.invite_code || userInfo.id) : '';
        return {
            title: '臻选 · 精选全球好物',
            path: `/pages/index/index?share_id=${inviteCode}`,
            imageUrl: ''
        };
    }
});
