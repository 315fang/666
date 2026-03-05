// pages/coupon/list.js
const { get } = require('../../utils/request');
const app = getApp();

Page({
    data: {
        statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
        activeTab: 'unused',
        coupons: [],
        unusedCount: 0,
        loading: true
    },

    onLoad() {
        this.loadCoupons();
    },

    onShow() {
        this.loadCoupons();
    },

    switchTab(e) {
        const tab = e.currentTarget.dataset.tab;
        if (tab === this.data.activeTab) return;
        this.setData({ activeTab: tab, coupons: [], loading: true });
        this.loadCoupons(tab);
    },

    async loadCoupons(status) {
        const tab = status || this.data.activeTab;
        if (!app.globalData.isLoggedIn) {
            this.setData({ loading: false });
            return;
        }
        try {
            const res = await get('/coupons/mine', { status: tab });
            if (res.code === 0) {
                const coupons = res.data || [];
                this.setData({ coupons, loading: false });
                // 更新未使用数量角标
                if (tab === 'unused') {
                    this.setData({ unusedCount: coupons.length });
                }
            }
        } catch (e) {
            this.setData({ loading: false });
        }
    },

    onUse(e) {
        wx.showToast({ title: '下单时可在结算页直接选择优惠券', icon: 'none', duration: 2500 });
    },

    onBack() {
        wx.navigateBack();
    }
});
