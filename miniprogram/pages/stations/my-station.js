const { get } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');

Page({
    data: {
        loading: true,
        scope: null
    },

    onLoad() {
        if (!requireLogin()) {
            setTimeout(() => wx.navigateBack(), 100);
            return;
        }
        this.loadScope();
    },

    async loadScope() {
        this.setData({ loading: true });
        try {
            const res = await get('/stations/my-scope', {}, { showLoading: true });
            this.setData({
                scope: res.data || null,
                loading: false
            });
        } catch (_) {
            this.setData({
                scope: null,
                loading: false
            });
        }
    },

    goPickupVerify() {
        wx.navigateTo({ url: '/pages/pickup/verify' });
    },

    goPendingOrders() {
        const station = this.data.scope?.stations?.[0];
        if (!station?.id) return;
        wx.navigateTo({ url: `/pages/pickup/orders?station_id=${station.id}` });
    }
});
