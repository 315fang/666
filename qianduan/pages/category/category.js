// pages/category/category.js
const { get, post } = require('../../utils/request');
const { getFirstImage } = require('../../utils/image');

Page({
    data: {
        categories: [],
        products: [],
        currentCategory: '',
        currentCategoryName: '全部商品',
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
            const rawProducts = res.data?.list || res.data || [];

            // 处理商品数据，确保图片字段正确
            const newProducts = rawProducts.map(item => {
                return {
                    ...item,
                    image: getFirstImage(item.images, '/assets/images/placeholder.svg'),
                    price: item.retail_price || item.price || 0
                };
            });

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

    // 分类切换 (WXML用onCategoryTap)
    onCategoryTap(e) {
        const categoryId = e.currentTarget.dataset.id;
        const category = this.data.categories.find(c => c.id === categoryId);

        this.setData({
            currentCategory: categoryId,
            currentCategoryName: category?.name || '全部商品',
            page: 1,
            hasMore: true
        });
        this.loadProducts();
    },

    // 分类切换别名
    onCategoryChange(e) {
        this.onCategoryTap(e);
    },

    // 排序切换 (WXML用onSortChange)
    onSortChange(e) {
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

    // 排序切换别名
    onSort(e) {
        this.onSortChange(e);
    },

    // 加载更多
    onLoadMore() {
        if (!this.data.hasMore || this.data.loading) return;
        this.setData({ page: this.data.page + 1 });
        this.loadProducts(true);
    },

    // 商品点击
    onProductTap(e) {
        const dataset = e.currentTarget.dataset;
        const productId = dataset.id || (dataset.item && dataset.item.id);
        
        if (productId) {
            wx.navigateTo({ url: `/pages/product/detail?id=${productId}` });
        } else {
            console.error('onProductTap: Product ID not found', dataset);
        }
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
