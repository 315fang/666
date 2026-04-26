const { get, post } = require('../../utils/request');
const { hasLoginSession, ensureLogin } = require('../../utils/auth');

function formatCouponValue(coupon = {}) {
    const type = coupon.coupon_type || coupon.type || 'fixed';
    const value = Number(coupon.coupon_value != null ? coupon.coupon_value : coupon.value || 0);
    if (type === 'percent') {
        const raw = value <= 1 ? value * 10 : value;
        return `${raw % 1 === 0 ? raw.toFixed(0) : raw.toFixed(1)}折`;
    }
    return `¥${value.toFixed(value % 1 === 0 ? 0 : 1)}`;
}

function formatCouponThreshold(coupon = {}) {
    const minPurchase = Number(coupon.min_purchase || 0);
    if (minPurchase > 0) return `满 ${minPurchase} 元可用`;
    return '无门槛可用';
}

function formatExpire(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}.${m}.${day}`;
    } catch (_) {
        return '';
    }
}

function buildClaimAction(coupon = {}) {
    switch (coupon.claim_status) {
        case 'already_owned':
            return { text: '已领取', disabled: false, mode: 'open-mine' };
        case 'inactive':
            return { text: '已结束', disabled: true, mode: 'disabled' };
        case 'out_of_stock':
            return { text: '已抢完', disabled: true, mode: 'disabled' };
        case 'daily_exhausted':
            return { text: '今日已领完', disabled: true, mode: 'disabled' };
        case 'not_started':
            return { text: '未到时间', disabled: true, mode: 'disabled' };
        case 'time_ended':
            return { text: '已结束', disabled: true, mode: 'disabled' };
        default:
            return { text: '立即领取', disabled: false, mode: 'claim' };
    }
}

function buildQuotaText(coupon = {}) {
    if (Number(coupon.daily_claim_limit) === -1) return '今日不限量';
    const limit = Math.max(0, Number(coupon.daily_claim_limit || 0));
    const claimed = Math.max(0, Number(coupon.claimed_today_count || 0));
    return `今日剩余 ${Math.max(0, limit - claimed)} / ${limit}`;
}

function buildStockText(coupon = {}) {
    if (Number(coupon.stock) === -1) return '总库存不限';
    return `总库存剩余 ${Math.max(0, Number(coupon.stock_remaining || 0))}`;
}

function normalizeCenterCoupon(coupon = {}) {
    const action = buildClaimAction(coupon);
    const id = String(coupon.id || coupon.coupon_id || '');
    return {
        ...coupon,
        id,
        value_text: formatCouponValue(coupon),
        threshold_text: formatCouponThreshold(coupon),
        quota_text: buildQuotaText(coupon),
        stock_text: buildStockText(coupon),
        claim_hint: coupon.claim_message || `领取后 ${coupon.valid_days || 30} 天内有效`,
        action_text: action.text,
        action_disabled: action.disabled,
        action_mode: action.mode,
        card_muted: !coupon.can_claim
    };
}

function normalizeOwnedCoupon(coupon = {}) {
    const id = String(coupon.id || coupon._id || coupon.coupon_id || '');
    return {
        ...coupon,
        id,
        value_text: formatCouponValue(coupon),
        threshold_text: formatCouponThreshold(coupon),
        expire_text: formatExpire(coupon.expire_at || coupon.expires_at || coupon.end_at || coupon.valid_until)
    };
}

Page({
    data: {
        loading: true,
        coupons: [],
        mineCoupons: [],
        unusedCount: 0,
        claimableCount: 0,
        isLoggedIn: false,
        claimingCouponId: ''
    },

    onLoad() {
        this.loadPage();
    },

    onShow() {
        this.setData({ isLoggedIn: hasLoginSession() });
        if (this._loadedOnce) {
            this.loadPage();
        }
        this._loadedOnce = true;
    },

    async loadPage() {
        this.setData({
            loading: true,
            isLoggedIn: hasLoginSession()
        });
        try {
            const res = await get('/coupons/center', {}, { showError: false });
            const list = Array.isArray(res.list)
                ? res.list
                : (Array.isArray(res.data && res.data.list) ? res.data.list : []);
            const mine = Array.isArray(res.mine)
                ? res.mine
                : (Array.isArray(res.data && res.data.mine) ? res.data.mine : []);
            const coupons = list.map(normalizeCenterCoupon);
            const mineCoupons = mine.map(normalizeOwnedCoupon);
            this.setData({
                loading: false,
                coupons,
                mineCoupons,
                unusedCount: Number(res.unused_count || (res.data && res.data.unused_count) || mineCoupons.length || 0),
                claimableCount: coupons.filter((item) => item.can_claim).length
            });
        } catch (err) {
            console.error('[CouponCenter] load failed:', err);
            this.setData({
                loading: false,
                coupons: [],
                mineCoupons: [],
                unusedCount: 0,
                claimableCount: 0
            });
        }
    },

    async onClaimCoupon(e) {
        const couponId = String(e.currentTarget.dataset.id || '').trim();
        if (!couponId) return;
        const coupon = (this.data.coupons || []).find((item) => String(item.id) === couponId) || null;
        if (!coupon) return;

        if (coupon.action_mode === 'open-mine') {
            this.onOpenMyCoupons();
            return;
        }
        if (coupon.action_disabled || coupon.action_mode !== 'claim') {
            if (coupon.claim_hint) {
                wx.showToast({ title: coupon.claim_hint, icon: 'none' });
            }
            return;
        }

        if (this.data.claimingCouponId === couponId) return;

        if (!hasLoginSession()) {
            try {
                await ensureLogin({ ignorePendingInviteCode: true, message: '请先登录' });
            } catch (_) {
                wx.showToast({ title: '请先登录', icon: 'none' });
                return;
            }
        }

        this.setData({ claimingCouponId: couponId });

        try {
            const res = await post('/coupons/claim', { coupon_id: couponId }, { showError: false });
            if (res && res.success === false) {
                wx.showToast({ title: res.message || '领取失败', icon: 'none' });
            } else {
                wx.showToast({ title: '领取成功', icon: 'success' });
            }
            await this.loadPage();
        } catch (err) {
            wx.showToast({ title: err.message || '领取失败', icon: 'none' });
        } finally {
            this.setData({ claimingCouponId: '' });
        }
    },

    onOpenMyCoupons() {
        wx.navigateTo({ url: '/pages/coupon/list' });
    },

    onOpenCouponPack() {
        if (this.data.mineCoupons.length > 0) {
            this.onOpenMyCoupons();
            return;
        }
        if (!hasLoginSession()) {
            wx.switchTab({ url: '/pages/user/user' });
            return;
        }
        wx.showToast({ title: '请先领取优惠券', icon: 'none' });
    },

    onShareAppMessage() {
        return {
            title: '优惠券中心',
            path: '/pages/coupon/center'
        };
    }
});
