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
        const coupon = e.currentTarget.dataset.coupon;
        // 跳转到商品页，带上优惠券ID参数
        wx.switchTab({ url: '/pages/category/category' });
        // 把选中的券存到全局，结算页会读取
        app.globalData.selectedCoupon = coupon;
        wx.showToast({ title: '已选择优惠券，去下单时使用', icon: 'none', duration: 2500 });
    },

    onBack() {
        wx.navigateBack();
    }
});
