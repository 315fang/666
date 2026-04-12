// pages/slash/detail.js - 砍价详情
const { get, post } = require('../../utils/request');
const { resolvePreferredSkuId, plainSummary } = require('../../utils/helpers');
const app = getApp();

function formatHelperList(helpers = []) {
    return helpers.map((item) => ({
        ...item,
        user: item.user || item.helper || null,
        cut_amount: item.cut_amount ?? item.slash_amount ?? 0
    }));
}

Page({
    data: {
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        slashNo: null,
        detail: null,
        loading: true,
        sharing: false,

        statusTextMap: {
            active: '进行中',
            success: '已到底价',
            expired: '已过期',
            purchased: '已购买'
        }
    },

    onLoad(options) {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44
        });
        if (options.slash_no) {
            this.setData({ slashNo: options.slash_no });
            this.loadDetail(options.slash_no);
        } else {
            wx.showToast({ title: '参数错误', icon: 'error' });
        }
    },

    onShow() {
        if (this.data.slashNo && !this.data.loading) {
            this.loadDetail(this.data.slashNo);
        }
    },

    onHide() {
        this._clearCountdown();
    },

    onUnload() {
        this._clearCountdown();
    },

    _clearCountdown() {
        if (this._countdownTimer) {
            clearInterval(this._countdownTimer);
            this._countdownTimer = null;
        }
    },

    _startCountdown() {
        this._clearCountdown();
        const { detail } = this.data;
        if (!detail || detail.status !== 'active' || detail._expired) return;

        this._countdownTimer = setInterval(() => {
            const d = this.data.detail;
            if (!d || d.status !== 'active' || d._expired) {
                this._clearCountdown();
                return;
            }

            let h = d._remainHours;
            let m = d._remainMins;
            let s = d._remainSecs;

            if (h === 0 && m === 0 && s === 0) {
                this._clearCountdown();
                this.setData({ 'detail._expired': true });
                return;
            }

            s -= 1;
            if (s < 0) { s = 59; m -= 1; }
            if (m < 0) { m = 59; h -= 1; }
            if (h < 0) { h = 0; m = 0; s = 0; }

            this.setData({
                'detail._remainHours': h,
                'detail._remainMins': m,
                'detail._remainSecs': s,
                'detail._remainMinsStr': String(m).padStart(2, '0'),
                'detail._remainSecsStr': String(s).padStart(2, '0')
            });
        }, 1000);
    },

    async loadDetail(slashNo) {
        this._clearCountdown();
        this.setData({ loading: true });
        try {
            const res = await get(`/slash/${slashNo}`);
            if (res.code === 0 && res.data) {
                const d = res.data;
                d.helpers = formatHelperList(d.helpers || []);
                const range = (d.original_price || 0) - (d.floor_price || 0);
                const cut = (d.original_price || 0) - (d.current_price || d.original_price);
                d._progressPct = range > 0 ? Math.min(100, Math.round(cut / range * 100)) : 0;
                const act = d.activity || {};
                const stockLimit = Number(act.stock_limit) || 0;
                const sold = Number(act.sold_count) || 0;
                d._stockRemain = Math.max(0, stockLimit - sold);
                d._soldPct = stockLimit > 0 ? Math.min(100, Math.round((sold / stockLimit) * 100)) : 0;
                d._soldCount = sold;
                d._maxHelpersText = act.max_helpers === -1 ? '不限人数' : `最多${act.max_helpers}人`;
                const minH = act.min_slash_per_helper != null ? act.min_slash_per_helper : '';
                const maxH = act.max_slash_per_helper != null ? act.max_slash_per_helper : '';
                d._slashRangeHint = minH !== '' && maxH !== '' ? `好友每次随机砍 ¥${minH} ~ ¥${maxH}` : '';
                d._productSummary = plainSummary(d.product?.description, 120);
                const origN = parseFloat(d.original_price) || 0;
                const curN = parseFloat(d.current_price) || 0;
                d._alreadySaved = origN > curN ? (origN - curN).toFixed(2) : '0.00';
                const floorN = parseFloat(d.floor_price) || 0;
                d._toFloor = curN > floorN ? (curN - floorN).toFixed(2) : '0.00';
                const rs = typeof d.remain_seconds === 'number' ? d.remain_seconds : null;
                const expireAt = d.expires_at || d.expire_at;
                if (rs != null && rs > 0) {
                    d._expired = false;
                    d._remainHours = Math.floor(rs / 3600);
                    d._remainMins = Math.floor((rs % 3600) / 60);
                    d._remainSecs = rs % 60;
                } else if (expireAt) {
                    const ms = new Date(expireAt) - Date.now();
                    d._expired = ms <= 0;
                    const totalSecs = ms > 0 ? Math.floor(ms / 1000) : 0;
                    d._remainHours = Math.floor(totalSecs / 3600);
                    d._remainMins = Math.floor((totalSecs % 3600) / 60);
                    d._remainSecs = totalSecs % 60;
                } else {
                    d._expired = false;
                    d._remainHours = 0;
                    d._remainMins = 0;
                    d._remainSecs = 0;
                }
                d._remainMinsStr = String(d._remainMins).padStart(2, '0');
                d._remainSecsStr = String(d._remainSecs).padStart(2, '0');
                this.setData({ detail: d, loading: false });
                this._startCountdown();
            } else {
                wx.showToast({ title: res.message || '加载失败', icon: 'none' });
                this.setData({ loading: false });
            }
        } catch (e) {
            console.error('[slash/detail] loadDetail error:', e);
            wx.showToast({ title: e?.message || '网络错误', icon: 'none' });
            this.setData({ loading: false });
        }
    },

    async onBuy() {
        const { detail } = this.data;
        if (!detail) return;
        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        if (detail.status === 'purchased') {
            wx.showToast({ title: '已购买该商品', icon: 'none' });
            return;
        }
        if (detail.status === 'expired' || detail._expired) {
            wx.showToast({ title: '砍价已过期', icon: 'none' });
            return;
        }
        if (!detail.product || !detail.product.id) return;

        const resolvedSkuId = resolvePreferredSkuId(detail);
        const buyInfo = {
            product_id: detail.product.id,
            category_id: detail.product.category_id || null,
            sku_id: resolvedSkuId,
            quantity: 1,
            price: parseFloat(detail.current_price),
            name: detail.product.name,
            image: (detail.product.images && detail.product.images[0]) || '',
            spec: resolvedSkuId ? '砍价·指定规格' : '砍价特惠',
            slash_no: detail.slash_no,
            supports_pickup: detail.product.supports_pickup ? 1 : 0
        };
        wx.setStorageSync('directBuyInfo', buyInfo);
        wx.navigateTo({ url: '/pages/order/confirm?from=direct' });
    },

    // 好友帮砍入口
    async onHelpCut() {
        const { detail, slashNo } = this.data;
        if (!detail) return;

        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录再帮砍', icon: 'none' });
            return;
        }
        if (detail.is_owner) {
            wx.showToast({ title: '不能帮自己砍价', icon: 'none' });
            return;
        }
        if (detail.already_helped) {
            wx.showToast({ title: '您已经帮砍过了', icon: 'none' });
            return;
        }
        if (detail.status !== 'active') {
            wx.showToast({ title: '砍价活动已结束', icon: 'none' });
            return;
        }
        if (detail.helper_full) {
            wx.showToast({ title: '帮砍名额已满', icon: 'none' });
            return;
        }
        if (this._helping) return;
        this._helping = true;

        wx.showLoading({ title: '正在帮砍...', mask: true });
        try {
            const res = await post(`/slash/${slashNo}/help`);
            wx.hideLoading();
            if (res.code === 0 && res.data) {
                const cut = parseFloat(res.data.cut_amount || 0).toFixed(2);
                wx.showModal({
                    title: '帮砍成功 🎉',
                    content: `砍掉了 ¥${cut}！当前价格 ¥${parseFloat(res.data.current_price || 0).toFixed(2)}`,
                    showCancel: false,
                    confirmText: '好的',
                    success: () => {
                        // 刷新页面数据
                        this.loadDetail(slashNo);
                    }
                });
            } else {
                wx.showToast({ title: res.message || '帮砍失败', icon: 'none' });
            }
        } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: e?.message || '帮砍失败，请重试', icon: 'none' });
        } finally {
            this._helping = false;
        }
    },

    onShare() {
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] });
        wx.showToast({ title: '点右上角分享', icon: 'none' });
    },

    onShareAppMessage() {
        const { detail } = this.data;
        if (!detail) return {};
        return {
            title: `帮我砍一刀！${detail.product?.name || '商品'}只差一点就到底价了`,
            path: `/pages/slash/detail?slash_no=${detail.slash_no}`,
            imageUrl: detail.product?.images?.[0] || ''
        };
    },

    onBack() {
        require('../../utils/navigator').safeBack('/pages/activity/activity');
    }
});
