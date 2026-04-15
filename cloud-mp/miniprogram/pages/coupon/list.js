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

function extractCouponList(res) {
    if (!res) return [];
    const data = res.data;
    const list = Array.isArray(res.list)
        ? res.list
        : (data && Array.isArray(data.list) ? data.list : data);
    return Array.isArray(list) ? list : [];
}

function buildCouponView(c = {}) {
    let discount_text = '';
    if (c.coupon_type === 'percent') {
        const value = Number(c.coupon_value || c.value || 0);
        const raw = value <= 1 ? value * 10 : value;
        discount_text = (raw % 1 === 0 ? raw.toFixed(0) : raw.toFixed(1)) + '折';
    }

    const exchangeMeta = c.exchange_meta && typeof c.exchange_meta === 'object' ? c.exchange_meta : {};
    const allowedProductIds = Array.isArray(exchangeMeta.allowed_product_ids) ? exchangeMeta.allowed_product_ids : [];
    const isExchange = String(c.coupon_type || c.type || '').toLowerCase() === 'exchange';

    return {
        ...c,
        id: c.id || c._id || c.coupon_id,
        coupon_name: c.coupon_name || c.name || '优惠券',
        coupon_type: c.coupon_type || c.type || 'fixed',
        coupon_value: c.coupon_value != null ? c.coupon_value : (c.value || 0),
        min_purchase: c.min_purchase != null ? c.min_purchase : 0,
        scope: c.scope || 'all',
        expire_at_formatted: formatExpire(c.expire_at || c.expires_at || c.end_at || c.valid_until),
        discount_text,
        is_exchange: isExchange,
        exchange_meta: exchangeMeta,
        exchange_ready: isExchange && exchangeMeta.bind_status !== 'pending_bind' && allowedProductIds.length > 0,
        exchange_value_text: isExchange ? String(exchangeMeta.coupon_product_value || c.coupon_value || '资格') : '',
        exchange_scope_text: isExchange ? (allowedProductIds.length > 0 ? `可兑换 ${allowedProductIds.length} 个指定商品` : '待绑定兑换商品') : '',
        exchange_desc: isExchange ? (exchangeMeta.title || c.coupon_name || '兑换券') : '',
        action_text: isExchange ? '去兑换' : '使用'
    };
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
                const coupons = extractCouponList(res).map(buildCouponView);
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
        const coupon = e.currentTarget.dataset.coupon || {};
        if (!coupon.is_exchange) {
            wx.showToast({ title: '下单时可在结算页直接选择优惠券', icon: 'none', duration: 2500 });
            return;
        }
        if (!coupon.exchange_ready) {
            wx.showToast({ title: '该兑换券尚未绑定商品，请联系管理员', icon: 'none', duration: 2500 });
            return;
        }
        const couponId = coupon._id || coupon.id || coupon.coupon_id;
        const productIds = Array.isArray(coupon.exchange_meta?.allowed_product_ids) ? coupon.exchange_meta.allowed_product_ids : [];
        wx.setStorageSync('activeExchangeCoupon', coupon);
        if (productIds.length === 1) {
            wx.navigateTo({ url: `/pages/product/detail?id=${encodeURIComponent(productIds[0])}&exchange_coupon_id=${encodeURIComponent(couponId)}` });
            return;
        }
        wx.navigateTo({ url: `/pages/coupon/exchange?coupon_id=${encodeURIComponent(couponId)}` });
    },

    onGoLogin() {
        wx.switchTab({ url: '/pages/user/user' });
    },

    onBack() {
        const { safeBack } = require('../../utils/navigator');
        safeBack('/pages/user/user');
    }
});
