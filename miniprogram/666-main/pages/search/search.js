// pages/search/search.js
const { get } = require('../../utils/request');
const { SEARCH_CONFIG } = require('../../config/constants');
const { ErrorHandler, showError } = require('../../utils/errorHandler');
const { processProducts } = require('../../utils/dataFormatter');

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
        // 使用常量配置加载搜索历史
        const history = wx.getStorageSync(SEARCH_CONFIG.STORAGE_KEY) || [];
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
            showError('请输入搜索内容');
            return;
        }
        this.doSearch(keyword);
    },

    // 执行搜索
    async doSearch(keyword) {
        // 使用常量配置保存搜索历史（去重，最多配置的条数）
        let history = this.data.history.filter(h => h !== keyword);
        history.unshift(keyword);
        if (history.length > SEARCH_CONFIG.MAX_HISTORY) {
            history = history.slice(0, SEARCH_CONFIG.MAX_HISTORY);
        }
        this.setData({ history });
        wx.setStorageSync(SEARCH_CONFIG.STORAGE_KEY, history);

        // 发起搜索请求
        this.setData({ loading: true, hasSearched: true });

        try {
            const res = await get('/products', { keyword, limit: 50 });
            const rawProducts = res.data?.list || res.data || [];

            // 使用工具函数处理商品数据
            const products = processProducts(rawProducts);

            this.setData({ products, loading: false });
        } catch (err) {
            ErrorHandler.handle(err, {
                customMessage: '搜索失败，请稍后重试'
            });
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
                    wx.removeStorageSync(SEARCH_CONFIG.STORAGE_KEY);
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
