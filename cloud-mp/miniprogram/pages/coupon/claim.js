// pages/coupon/claim.js
const { get, post } = require('../../utils/request');
const app = getApp();

function parseScene(scene) {
    const result = {};
    if (!scene) return result;
    scene.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k) result[decodeURIComponent(k)] = v ? decodeURIComponent(v) : '';
    });
    return result;
}

function couponValueText(coupon) {
    if (!coupon) return '';
    const type = coupon.type || coupon.coupon_type || 'fixed';
    const val = Number(coupon.value ?? coupon.coupon_value ?? 0);
    if (type === 'percent') {
        const discount = val <= 1 ? (val * 10) : val;
        return (discount % 1 === 0 ? discount.toFixed(0) : discount.toFixed(1)) + '折';
    }
    return '¥' + val.toFixed(2).replace(/\.00$/, '');
}

Page({
    data: {
        couponId: '',
        coupon: null,
        loading: true,
        claiming: false,
        // 'idle' | 'success' | 'already_owned' | 'out_of_stock' | 'inactive' | 'error'
        claimStatus: 'idle',
        claimMsg: '',
        valueText: '',
        minPurchaseText: ''
    },

    onLoad(options) {
        console.log('[coupon-claim] onLoad options:', JSON.stringify(options));
        wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage']
        });
        const rawScene = options.scene ? decodeURIComponent(options.scene) : '';
        const parsed = parseScene(rawScene);
        const couponId = String(options.id || parsed.id || parsed.cid || options.coupon_id || '');
        console.log('[coupon-claim] parsed scene:', rawScene, '→', parsed, '→ couponId:', couponId);
        if (!couponId) {
            this.setData({ loading: false, claimStatus: 'error', claimMsg: '无效的优惠券链接' });
            return;
        }
        this.setData({ couponId });
        this.loadCouponInfo(couponId);
    },

    async loadCouponInfo(couponId) {
        this.setData({ loading: true });
        try {
            const res = await get('/coupons/info', { coupon_id: couponId });
            const found = res && (res.found !== false);
            const coupon = res && res.coupon;
            if (!found || !coupon) {
                this.setData({ loading: false, claimStatus: 'error', claimMsg: '优惠券不存在或已下架' });
                return;
            }
            if (Number(coupon.is_active) === 0) {
                this.setData({ loading: false, coupon, claimStatus: 'inactive', claimMsg: '此活动已结束' });
                return;
            }
            if (coupon.stock !== -1 && Number(coupon.stock) <= 0) {
                this.setData({ loading: false, coupon, claimStatus: 'out_of_stock', claimMsg: '此券已被领完' });
                return;
            }
            this.setData({
                loading: false,
                coupon,
                claimStatus: 'idle',
                valueText: couponValueText(coupon),
                minPurchaseText: Number(coupon.min_purchase) > 0 ? `满 ${coupon.min_purchase} 元可用` : '无门槛'
            });
        } catch (e) {
            this.setData({ loading: false, claimStatus: 'error', claimMsg: '加载失败，请稍后重试' });
        }
    },

    async claimCoupon() {
        const { couponId, claimStatus, claiming } = this.data;
        if (claiming || claimStatus === 'success' || claimStatus === 'already_owned') return;

        // 检查登录状态
        if (!app.globalData.isLoggedIn) {
            try {
                await app.wxLogin(true);
            } catch (_e) {
                wx.showToast({ title: '请先登录', icon: 'none' });
                return;
            }
        }

        this.setData({ claiming: true });
        try {
            const res = await post('/coupons/claim', { coupon_id: couponId });
            if (res && res.success === false) {
                const msg = res.message || '';
                if (msg.includes('已领取')) {
                    this.setData({ claimStatus: 'already_owned', claimMsg: '你已领过此券，快去使用吧' });
                } else if (msg.includes('库存') || msg.includes('售罄')) {
                    this.setData({ claimStatus: 'out_of_stock', claimMsg: '此券已被领完' });
                } else {
                    this.setData({ claimStatus: 'error', claimMsg: msg || '领取失败，请稍后重试' });
                }
            } else {
                this.setData({ claimStatus: 'success', claimMsg: '领取成功！快去使用吧' });
                wx.showToast({ title: '领取成功', icon: 'success' });
            }
        } catch (e) {
            const msg = (e && e.message) || '';
            if (msg.includes('已领取')) {
                this.setData({ claimStatus: 'already_owned', claimMsg: '你已领过此券，快去使用吧' });
            } else {
                this.setData({ claimStatus: 'error', claimMsg: msg || '领取失败，请稍后重试' });
            }
        } finally {
            this.setData({ claiming: false });
        }
    },

    goToCouponList() {
        wx.switchTab({ url: '/pages/user/user' }).catch(() => {
            wx.navigateTo({ url: '/pages/coupon/list' });
        });
    },

    onShareAppMessage() {
        const { coupon, couponId } = this.data;
        return {
            title: coupon ? `${coupon.name} — 限时领取！` : '领取优惠券',
            path: `/pages/coupon/claim?id=${couponId}`
        };
    }
});
