// pages/slash/detail.js - 砍价详情
const { get, post } = require('../../utils/request');
const app = getApp();

Page({
    data: {
        statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
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

    async loadDetail(slashNo) {
        this.setData({ loading: true });
        try {
            const res = await get(`/slash/${slashNo}`);
            if (res.code === 0 && res.data) {
                const d = res.data;
                // 计算砍价进度百分比
                const range = (d.original_price || 0) - (d.floor_price || 0);
                const cut = (d.original_price || 0) - (d.current_price || d.original_price);
                d._progressPct = range > 0 ? Math.min(100, Math.round(cut / range * 100)) : 0;
                // 格式化剩余时间
                if (d.expires_at) {
                    const ms = new Date(d.expires_at) - Date.now();
                    d._expired = ms <= 0;
                    d._remainHours = ms > 0 ? Math.floor(ms / 3600000) : 0;
                    d._remainMins = ms > 0 ? Math.floor((ms % 3600000) / 60000) : 0;
                }
                this.setData({ detail: d, loading: false });
            } else {
                wx.showToast({ title: res.message || '加载失败', icon: 'none' });
                this.setData({ loading: false });
            }
        } catch (e) {
            console.error('[slash/detail] loadDetail error:', e);
            wx.showToast({ title: '网络错误', icon: 'none' });
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
        // 跳转到商品详情页触发购买
        if (detail.product && detail.product.id) {
            wx.navigateTo({ url: `/pages/product/detail?id=${detail.product.id}&slash_no=${detail.slash_no}` });
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
        wx.navigateBack();
    }
});
