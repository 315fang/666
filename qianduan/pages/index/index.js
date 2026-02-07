// pages/index/index.js
const { get } = require('../../utils/request');

Page({
    data: {
        banners: [],
        products: [],
        categories: [],
        currentCategory: '',
        loading: true
    },

    onLoad() {
        this.loadData();
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

            const bannersRes = results[0];
            const productsRes = results[1];
            const categoriesRes = results[2];

            this.setData({
                banners: bannersRes.data || [],
                products: productsRes.data && productsRes.data.list ? productsRes.data.list : (productsRes.data || []),
                categories: categoriesRes.data || [],
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

    // Banner点击
    onBannerTap(e) {
        const banner = e.currentTarget.dataset.item;
        if (banner.link_type === 'product' && banner.link_value) {
            wx.navigateTo({ url: '/pages/product/detail?id=' + banner.link_value });
        }
    },

    // 分类切换
    onCategoryTap(e) {
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
            this.setData({
                products: res.data && res.data.list ? res.data.list : (res.data || []),
                loading: false
            });
        } catch (err) {
            console.error('加载商品失败:', err);
            this.setData({ loading: false });
        }
    },

    // 商品点击
    onProductTap(e) {
        const product = e.currentTarget.dataset.item;
        wx.navigateTo({ url: '/pages/product/detail?id=' + product.id });
    }
});
