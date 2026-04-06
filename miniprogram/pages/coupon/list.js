// pages/coupon/list.js
const { get } = require('../../utils/request');
const app = getApp();

// 格式化日期：将 ISO 字符串转为 YYYY.MM.DD
function formatExpire(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}.${m}.${day}`;
    } catch (e) {
        return dateStr;
    }
}

Page({
    data: {
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        activeTab: 'unused',
        coupons: [],
        unusedCount: 0,
        loading: true,
        notLoggedIn: false
    },

    onLoad() {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44
        });
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
            this.setData({ loading: false, notLoggedIn: true });
            return;
        }
        this.setData({ notLoggedIn: false });
        try {
            const res = await get('/coupons/mine', { status: tab });
            if (res.code === 0) {
                // 在 JS 中格式化日期，WXML 不支持管道过滤器
                const coupons = (res.data || []).map(c => {
                    let discount_text = '';
                    if (c.coupon_type === 'percent') {
                        const raw = parseFloat((c.coupon_value * 10).toFixed(1));
                        discount_text = (raw % 1 === 0 ? raw.toFixed(0) : raw.toFixed(1)) + '折';
                    }
                    return {
                        ...c,
                        expire_at_formatted: formatExpire(c.expire_at),
                        discount_text
                    };
                });
                this.setData({ coupons, loading: false });
                if (tab === 'unused') {
                    this.setData({ unusedCount: coupons.length });
                }
            } else {
                this.setData({ loading: false });
            }
        } catch (e) {
            this.setData({ loading: false });
        }
    },

    onUse(e) {
        wx.showToast({ title: '下单时可在结算页直接选择优惠券', icon: 'none', duration: 2500 });
    },

    onGoLogin() {
        wx.switchTab({ url: '/pages/user/user' });
    },

    onBack() {
        const { safeBack } = require('../../utils/navigator');
        safeBack('/pages/user/user');
    }
});
