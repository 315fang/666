// pages/user/user.js
const app = getApp();
const { get } = require('../../utils/request');

Page({
    data: {
        userInfo: null,
        isLoggedIn: false,
        orderCounts: {
            pending: 0,
            paid: 0,
            shipped: 0
        }
    },

    onShow() {
        this.loadUserInfo();
    },

    loadUserInfo() {
        const userInfo = app.globalData.userInfo;
        const isLoggedIn = app.globalData.isLoggedIn;

        this.setData({ userInfo, isLoggedIn });

        if (isLoggedIn) {
            this.loadOrderCounts();
        }
    },

    async loadOrderCounts() {
        try {
            const results = await Promise.all([
                get('/orders', { status: 'pending', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } })),
                get('/orders', { status: 'paid', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } })),
                get('/orders', { status: 'shipped', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } }))
            ]);

            this.setData({
                'orderCounts.pending': (results[0].data && results[0].data.pagination && results[0].data.pagination.total) || 0,
                'orderCounts.paid': (results[1].data && results[1].data.pagination && results[1].data.pagination.total) || 0,
                'orderCounts.shipped': (results[2].data && results[2].data.pagination && results[2].data.pagination.total) || 0
            });
        } catch (err) {
            console.error('加载订单数量失败:', err);
        }
    },

    async onLogin() {
        try {
            wx.showLoading({ title: '登录中...' });
            await app.wxLogin();
            wx.hideLoading();
            this.loadUserInfo();
            wx.showToast({ title: '登录成功', icon: 'success' });
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '登录失败', icon: 'none' });
        }
    },

    onOrderAllTap() {
        wx.navigateTo({ url: '/pages/order/list' });
    },

    onOrderTap(e) {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        const status = e.currentTarget.dataset.status;
        wx.navigateTo({ url: '/pages/order/list?status=' + status });
    },

    onMenuTap(e) {
        const url = e.currentTarget.dataset.url;
        if (url) {
            wx.navigateTo({ url: url });
        } else {
            wx.showToast({ title: '即将开放', icon: 'none' });
        }
    }
});
