// pages/index/index.js
const { get, post } = require('../../utils/request');
const { parseImages } = require('../../utils/dataFormatter');
const { DEFAULTS } = require('../../config/constants');
const app = getApp();

Page({
    data: {
        banners: [],
        products: [],
        categories: [],
        topCategories: [], // 快捷入口（金刚区）
        currentCategory: 0, // 默认选中第一个（精选推荐）
        loading: true,
        isScrolled: false,
        statusBarHeight: 20,
        // 新增：配置相关
        pageConfig: {},
        homeSections: []
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
            // 优化：使用一个API获取所有首页配置
            const homeConfigRes = await get('/homepage-config').catch(() => null);

            let banners = [];
            let quickEntries = [];
            let configs = {};

            if (homeConfigRes && homeConfigRes.data) {
                // 后端返回的完整配置
                configs = homeConfigRes.data.configs || {};
                quickEntries = homeConfigRes.data.quickEntries || [];

                // 如果后端没有banner数据，使用独立接口获取
                if (!homeConfigRes.data.banners || homeConfigRes.data.banners.length === 0) {
                    const bannerRes = await get('/content/banners', { position: 'home' }).catch(() => ({ data: [] }));
                    banners = bannerRes.data || [];
                } else {
                    banners = homeConfigRes.data.banners || [];
                }
            } else {
                // 降级：使用原有方式获取
                const bannersRes = await get('/content/banners', { position: 'home' }).catch(() => ({ data: [] }));
                banners = bannersRes.data || [];
                const entriesRes = await get('/quick-entries', { position: 'home', limit: 6 }).catch(() => ({ data: [] }));
                quickEntries = entriesRes.data || [];
            }

            // 获取分类和商品
            const [productsRes, categoriesRes] = await Promise.all([
                get('/products', { limit: configs.products_per_page || 20 }).catch(() => ({ data: { list: [] } })),
                get('/categories').catch(() => ({ data: [] }))
            ]);

            const categories = categoriesRes.data || [];

            // 使用后端返回的快捷入口数据，不再硬编码
            const topCategories = quickEntries.length > 0 ? quickEntries.slice(0, 6) : this._getDefaultQuickEntries(categories);

            // 处理商品数据并分列
            const rawProducts = productsRes.data && productsRes.data.list ? productsRes.data.list : (productsRes.data || []);
            const { products, leftProducts, rightProducts } = this._processAndSplitProducts(rawProducts);

            this.setData({
                banners,
                products,
                leftProducts,
                rightProducts,
                categories,
                topCategories,
                pageConfig: configs,
                loading: false
            });
        } catch (err) {
            console.error('加载失败:', err);
            this.setData({ loading: false });
        }
    },

    // 降级方案：如果后端没有配置，使用默认快捷入口
    _getDefaultQuickEntries(categories) {
        const defaultNav = [
            { id: '__hot', name: '热门推荐', icon: '/assets/icons/hot.svg', bg_color: '#FEF3C7', link_type: 'action', link_value: 'hot' },
            { id: '__new', name: '新品上市', icon: '/assets/icons/sparkle.svg', bg_color: '#FCE7F3', link_type: 'action', link_value: 'new' },
            { id: '__sale', name: '限时特惠', icon: '/assets/icons/tag.svg', bg_color: '#DCFCE7', link_type: 'action', link_value: 'sale' }
        ];

        const result = [];
        for (let i = 0; i < 6; i++) {
            if (i < categories.length && i < 3) {
                result.push({
                    id: categories[i].id,
                    name: categories[i].name,
                    icon: categories[i].icon || defaultNav[i].icon,
                    bg_color: defaultNav[i].bg_color,
                    link_type: 'category',
                    link_value: categories[i].id
                });
            } else if (i < defaultNav.length) {
                result.push(defaultNav[i]);
            }
        }
        return result;
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
        const item = e.currentTarget.dataset.item;
        if (!item) return;

        const { link_type, link_value, id } = item;

        // 根据链接类型处理跳转
        switch (link_type) {
            case 'category':
                // 分类ID跳转
                const categoryId = link_value || id;
                if (typeof categoryId === 'string' && categoryId.startsWith('__')) {
                    wx.switchTab({ url: '/pages/category/category' });
                } else {
                    this.setData({ currentCategory: categoryId, loading: true });
                    this.loadProducts(categoryId);
                }
                break;
            case 'page':
                // 页面路径跳转
                if (link_value) {
                    // 判断是否为tabbar页面
                    const tabPages = ['/pages/index/index', '/pages/category/category', '/pages/cart/cart', '/pages/user/user'];
                    if (tabPages.includes(link_value)) {
                        wx.switchTab({ url: link_value });
                    } else {
                        wx.navigateTo({ url: link_value });
                    }
                }
                break;
            case 'product':
                // 商品详情
                if (link_value) {
                    wx.navigateTo({ url: '/pages/product/detail?id=' + link_value });
                }
                break;
            case 'url':
                // 外部链接（小程序内使用web-view）
                if (link_value) {
                    wx.navigateTo({ url: '/pages/webview/webview?url=' + encodeURIComponent(link_value) });
                }
                break;
            case 'action':
                // 特殊动作（如筛选）
                if (link_value === 'hot' || link_value === 'new' || link_value === 'sale') {
                    wx.switchTab({ url: '/pages/category/category' });
                }
                break;
            default:
                // 默认跳转到分类页
                wx.switchTab({ url: '/pages/category/category' });
        }
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
