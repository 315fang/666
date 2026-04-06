// pages/product/reviews.js — 商品全部评价列表
const { get } = require('../../utils/request');

Page({
    data: {
        productId: null,
        list: [],
        loading: false,
        page: 1,
        limit: 10,
        hasMore: false,
        filter: 'all'   // all | featured | image
    },

    onLoad(options) {
        const productId = options.product_id;
        if (!productId) {
            wx.showToast({ title: '参数错误', icon: 'none' });
            return;
        }
        this.setData({ productId });
        this.loadReviews(true);
    },

    onFilterChange(e) {
        const val = e.currentTarget.dataset.val;
        if (val === this.data.filter) return;
        this.setData({ filter: val, page: 1, list: [], hasMore: false });
        this.loadReviews(true);
    },

    async loadReviews(reset = false) {
        if (this.data.loading) return;
        const page = reset ? 1 : this.data.page;
        this.setData({ loading: true });
        try {
            const params = { page, limit: this.data.limit };
            if (this.data.filter === 'featured') params.featured = 1;
            if (this.data.filter === 'image') params.has_image = 1;

            const res = await get(`/products/${this.data.productId}/reviews`, params);
            if (res.code === 0) {
                const newList = res.data.list || [];
                const pagination = res.data.pagination || {};
                const total = pagination.total != null ? Number(pagination.total) : Number(res.data.total || 0);
                const list = reset ? newList : [...this.data.list, ...newList];
                this.setData({
                    list,
                    page: page + 1,
                    hasMore: pagination.has_more === true || (total > 0 ? list.length < total : newList.length >= this.data.limit)
                });
            }
        } catch (e) {
            console.error('加载评价失败:', e);
        } finally {
            this.setData({ loading: false });
        }
    },

    loadMore() {
        if (!this.data.hasMore || this.data.loading) return;
        this.loadReviews(false);
    },

    onPreviewImage(e) {
        const images = e.currentTarget.dataset.images || [];
        const index = Number(e.currentTarget.dataset.index || 0);
        if (!images.length) return;
        wx.previewImage({ current: images[index] || images[0], urls: images });
    }
});
