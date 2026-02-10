// pages/search/search.js
const { get } = require('../../utils/request');

Page({
    data: {
        keyword: '',
        products: [],
        history: [],
        hotKeywords: ['精选好物', '护肤套装', '家居好物', '送礼佳品'],
        loading: false,
        hasSearched: false
    },

    onLoad() {
        // 加载搜索历史
        const history = wx.getStorageSync('searchHistory') || [];
        this.setData({ history });
    },

    onInput(e) {
        this.setData({ keyword: e.detail.value });
    },

    onClear() {
        this.setData({ keyword: '', hasSearched: false, products: [] });
    },

    onCancel() {
        wx.navigateBack();
    },

    // 点击历史/热门标签
    onHistoryTap(e) {
        const keyword = e.currentTarget.dataset.keyword;
        this.setData({ keyword });
        this.doSearch(keyword);
    },

    // 键盘确认搜索
    onSearch() {
        const keyword = this.data.keyword.trim();
        if (!keyword) {
            wx.showToast({ title: '请输入搜索内容', icon: 'none' });
            return;
        }
        this.doSearch(keyword);
    },

    // 执行搜索
    async doSearch(keyword) {
        // 保存搜索历史（去重，最多10条）
        let history = this.data.history.filter(h => h !== keyword);
        history.unshift(keyword);
        if (history.length > 10) history = history.slice(0, 10);
        this.setData({ history });
        wx.setStorageSync('searchHistory', history);

        // 发起搜索请求
        this.setData({ loading: true, hasSearched: true });

        try {
            const res = await get('/products', { keyword, limit: 50 });
            const products = res.data?.list || res.data || [];
            this.setData({ products, loading: false });
        } catch (err) {
            console.error('搜索失败:', err);
            this.setData({ loading: false, products: [] });
        }
    },

    // 清空历史
    onClearHistory() {
        wx.showModal({
            title: '提示',
            content: '确认清空搜索历史？',
            success: (res) => {
                if (res.confirm) {
                    this.setData({ history: [] });
                    wx.removeStorageSync('searchHistory');
                }
            }
        });
    },

    // 商品点击
    onProductTap(e) {
        const product = e.currentTarget.dataset.item;
        wx.navigateTo({ url: `/pages/product/detail?id=${product.id}` });
    }
});
