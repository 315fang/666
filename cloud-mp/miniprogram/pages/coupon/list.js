// pages/coupon/list.js
const { get, del } = require('../../utils/request');
const app = getApp();
const COUPON_DELETE_WIDTH_RPX = 128;
const COUPON_DELETE_THRESHOLD_RPX = 64;

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

function couponExpireMs(c = {}) {
    const raw = c.expire_at || c.expires_at || c.end_at || c.valid_until;
    if (!raw) return NaN;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : NaN;
}

function buildCouponView(c = {}) {
    let discount_text = '';
    if (c.coupon_type === 'percent') {
        const value = Number(c.coupon_value || c.value || 0);
        const raw = value <= 1 ? value * 10 : value;
        discount_text = (raw % 1 === 0 ? raw.toFixed(0) : raw.toFixed(1)) + '折';
    }

    const expireMs = couponExpireMs(c);
    const isExpired = Number.isFinite(expireMs) && expireMs <= Date.now();

    const exchangeMeta = c.exchange_meta && typeof c.exchange_meta === 'object' ? c.exchange_meta : {};
    const allowedProductIds = Array.isArray(exchangeMeta.allowed_product_ids) ? exchangeMeta.allowed_product_ids : [];
    const isExchange = String(c.coupon_type || c.type || '').toLowerCase() === 'exchange';

    return {
        ...c,
        id: c.id || c._id || c.coupon_id,
        user_coupon_id: c.user_coupon_id || c._id || c.id || '',
        coupon_name: c.coupon_name || c.name || '券包',
        coupon_type: c.coupon_type || c.type || 'fixed',
        coupon_value: c.coupon_value != null ? c.coupon_value : (c.value || 0),
        min_purchase: c.min_purchase != null ? c.min_purchase : 0,
        scope: c.scope || 'all',
        expire_at_formatted: formatExpire(c.expire_at || c.expires_at || c.end_at || c.valid_until),
        is_expired: isExpired,
        discount_text,
        is_exchange: isExchange,
        exchange_meta: exchangeMeta,
        exchange_ready: isExchange && exchangeMeta.bind_status !== 'pending_bind' && allowedProductIds.length > 0,
        exchange_value_text: isExchange ? String(exchangeMeta.coupon_product_value || c.coupon_value || '资格') : '',
        exchange_scope_text: isExchange ? (allowedProductIds.length > 0 ? `可兑换 ${allowedProductIds.length} 个指定商品` : '待绑定兑换商品') : '',
        exchange_desc: isExchange ? (exchangeMeta.title || c.coupon_name || '兑换券') : '',
        action_text: isExchange ? '去兑换' : '使用',
        slideX: 0
    };
}

function pxToRpx(px) {
    let windowWidth = 375;
    try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        windowWidth = info.windowWidth || windowWidth;
    } catch (_) {}
    return px * 750 / windowWidth;
}

Page({
    data: {
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
        this._couponSwipe = null;
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
                let coupons = extractCouponList(res).map(buildCouponView);
                if (tab === 'unused') {
                    coupons = coupons.filter((item) => !item.is_expired);
                }
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
        this.closeCouponSlides();
        if (!coupon.is_exchange) {
            wx.switchTab({ url: '/pages/category/category' });
            return;
        }
        if (!coupon.exchange_ready) {
            wx.showToast({ title: '该兑换券暂不可兑换', icon: 'none', duration: 2500 });
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

    onOpenCouponCenter() {
        wx.navigateTo({ url: '/pages/coupon/center' });
    },

    setCouponSlide(index, slideX) {
        if (index < 0 || index >= this.data.coupons.length) return;
        this.setData({ [`coupons[${index}].slideX`]: slideX });
    },

    closeCouponSlides(exceptIndex = -1) {
        const patch = {};
        (this.data.coupons || []).forEach((coupon, index) => {
            if (index !== exceptIndex && coupon.slideX) {
                patch[`coupons[${index}].slideX`] = 0;
            }
        });
        if (Object.keys(patch).length) this.setData(patch);
    },

    onCouponTouchStart(e) {
        const index = Number(e.currentTarget.dataset.index);
        const touch = e.touches && e.touches[0];
        if (!touch || !Number.isFinite(index)) return;
        this.closeCouponSlides(index);
        this._couponSwipe = {
            index,
            startX: touch.clientX,
            startY: touch.clientY,
            startSlideX: Number((this.data.coupons[index] && this.data.coupons[index].slideX) || 0),
            swiping: false
        };
    },

    onCouponTouchMove(e) {
        const state = this._couponSwipe;
        const touch = e.touches && e.touches[0];
        if (!state || !touch) return;

        const deltaX = pxToRpx(touch.clientX - state.startX);
        const deltaY = pxToRpx(touch.clientY - state.startY);
        if (!state.swiping) {
            if (Math.abs(deltaX) < 10) return;
            if (Math.abs(deltaY) > Math.abs(deltaX)) return;
            state.swiping = true;
        }

        const nextX = Math.max(-COUPON_DELETE_WIDTH_RPX, Math.min(0, state.startSlideX + deltaX));
        this.setCouponSlide(state.index, Math.round(nextX));
    },

    onCouponTouchEnd() {
        const state = this._couponSwipe;
        if (!state) return;
        const coupon = this.data.coupons[state.index] || {};
        const nextX = Number(coupon.slideX || 0) <= -COUPON_DELETE_THRESHOLD_RPX ? -COUPON_DELETE_WIDTH_RPX : 0;
        this.setCouponSlide(state.index, nextX);
        this._couponSwipe = null;
    },

    onDeleteCoupon(e) {
        const id = e.currentTarget.dataset.id;
        const index = Number(e.currentTarget.dataset.index);
        if (!id || !Number.isFinite(index)) {
            wx.showToast({ title: '券包信息异常', icon: 'none' });
            return;
        }

        wx.showModal({
            title: '删除券包',
            content: '删除后该券包将不再显示。',
            confirmText: '删除',
            confirmColor: '#dc2626',
            success: (res) => {
                if (!res.confirm) {
                    this.setCouponSlide(index, 0);
                    return;
                }
                this.deleteCouponById(id, index);
            }
        });
    },

    async deleteCouponById(id, index) {
        if (this._couponDeleting) return;
        this._couponDeleting = true;
        wx.showLoading({ title: '删除中', mask: true });
        try {
            const res = await del(`/coupons/mine/${id}`, {}, { showError: false });
            if (res && res.code === 0) {
                const coupons = (this.data.coupons || []).slice();
                const removeIndex = coupons.findIndex((coupon) => String(coupon.user_coupon_id) === String(id));
                coupons.splice(removeIndex >= 0 ? removeIndex : index, 1);
                const patch = { coupons };
                if (this.data.activeTab === 'unused') {
                    patch.unusedCount = Math.max(0, Number(this.data.unusedCount || 0) - 1);
                }
                this.setData(patch);
                wx.showToast({ title: '已删除', icon: 'success' });
                return;
            }
            throw new Error((res && (res.message || res.msg)) || '删除失败');
        } catch (err) {
            this.setCouponSlide(index, 0);
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        } finally {
            wx.hideLoading();
            this._couponDeleting = false;
        }
    },

    onBack() {
        const { safeBack } = require('../../utils/navigator');
        safeBack('/pages/user/user');
    }
});
