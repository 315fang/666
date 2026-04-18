const { get, post } = require('../../utils/request');

Page({
    data: {
        loading: true,
        loadError: '',
        orders: []
    },

    onShow() {
        this.loadOrders();
    },

    async loadOrders() {
        this.setData({ loading: true, loadError: '' });
        try {
            const res = await get('/deposit-orders/mine');
            const list = Array.isArray(res?.list)
                ? res.list
                : (Array.isArray(res?.data?.list) ? res.data.list : []);
            this.setData({
                loading: false,
                orders: Array.isArray(list) ? list : []
            });
        } catch (error) {
            this.setData({
                loading: false,
                loadError: error?.message || '加载失败，请稍后重试',
                orders: []
            });
        }
    },

    async onPayTap(e) {
        const orderId = e.currentTarget.dataset.id;
        if (!orderId) return;
        try {
            const res = await post('/deposit-orders/prepay', { deposit_order_id: orderId });
            const payload = res?.data || res;
            wx.requestPayment({
                timeStamp: payload.timeStamp,
                nonceStr: payload.nonceStr,
                package: payload.package,
                signType: payload.signType,
                paySign: payload.paySign,
                success: () => {
                    wx.showToast({ title: '支付成功', icon: 'success' });
                    this.loadOrders();
                },
                fail: (error) => {
                    if (error && /cancel/i.test(String(error.errMsg || error.message || ''))) {
                        return;
                    }
                    wx.showToast({ title: '支付失败，请重试', icon: 'none' });
                }
            });
        } catch (error) {
            wx.showToast({ title: '支付失败，请重试', icon: 'none' });
        }
    },

    onOpenTicket(e) {
        const path = e.currentTarget.dataset.path;
        if (!path) return;
        wx.navigateTo({ url: path });
    },

    onRetry() {
        this.loadOrders();
    }
});
