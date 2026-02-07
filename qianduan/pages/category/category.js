// pages/category/category.js
const { get, post } = require('../../utils/request');

Page({
    data: {
        categories: [],
        products: [],
        currentCategory: '',
        sortBy: 'default',
        sortOrder: 'desc',
        loading: false,
        hasMore: true,
        page: 1,
        limit: 10
    },

    onLoad() {
        this.loadCategories();
        this.loadProducts();
    },

    onPullDownRefresh() {
        this.setData({ page: 1, hasMore: true });
        this.loadProducts().then(() => {
            wx.stopPullDownRefresh();
        });
    },

    // 加载分类
    async loadCategories() {
        try {
            const res = await get('/categories');
            this.setData({ categories: res.data || [] });
        } catch (err) {
            console.error('加载分类失败:', err);
        }
    },

    // 加载商品
    async loadProducts(append = false) {
        if (this.data.loading) return;

        this.setData({ loading: true });

        try {
            const { currentCategory, sortBy, sortOrder, page, limit } = this.data;
            const params = { page, limit };

            if (currentCategory) params.category_id = currentCategory;
            if (sortBy !== 'default') {
                params.sort = sortBy;
                params.order = sortOrder;
            }

            const res = await get('/products', params);
            const newProducts = res.data?.list || res.data || [];

            this.setData({
                products: append ? [...this.data.products, ...newProducts] : newProducts,
                hasMore: newProducts.length >= limit,
                loading: false
            });
        } catch (err) {
            console.error('加载商品失败:', err);
            this.setData({ loading: false });
        }
    },

    // 搜索点击
    onSearchTap() {
        wx.navigateTo({ url: '/pages/search/search' });
    },

    // 分类切换
    onCategoryChange(e) {
        const categoryId = e.currentTarget.dataset.id;
        this.setData({
            currentCategory: categoryId,
            page: 1,
            hasMore: true
        });
        this.loadProducts();
    },

    // 排序切换
    onSort(e) {
        const sort = e.currentTarget.dataset.sort;
        let { sortBy, sortOrder } = this.data;

        if (sort === sortBy && sort === 'price') {
            sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            sortBy = sort;
            sortOrder = sort === 'price' ? 'asc' : 'desc';
        }

        this.setData({ sortBy, sortOrder, page: 1, hasMore: true });
        this.loadProducts();
    },

    // 加载更多
    onLoadMore() {
        if (!this.data.hasMore || this.data.loading) return;
        this.setData({ page: this.data.page + 1 });
        this.loadProducts(true);
    },

    // 商品点击
    onProductTap(e) {
        const product = e.currentTarget.dataset.item;
        wx.navigateTo({ url: `/pages/product/detail?id=${product.id}` });
    },

    // 快速加购
    async onQuickAdd(e) {
        const product = e.currentTarget.dataset.item;

        try {
            wx.showLoading({ title: '加入购物车...' });

            await post('/cart', {
                product_id: product.id,
                quantity: 1
            });

            wx.hideLoading();
            wx.showToast({ title: '已加入购物车', icon: 'success' });
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '加入失败', icon: 'none' });
            console.error('加入购物车失败:', err);
        }
    }
});
