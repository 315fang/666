const { get, post } = require('../../utils/request');

function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).replace('T', ' ').slice(0, 19);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatCountdown(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const hours = String(Math.floor(total / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const secs = String(total % 60).padStart(2, '0');
    return `${hours}:${minutes}:${secs}`;
}

Page({
    data: {
        rechargeOrderId: '',
        loading: true,
        paying: false,
        order: null,
        countdownText: ''
    },

    onLoad(options) {
        this.setData({
            rechargeOrderId: decodeURIComponent(options.id || '')
        });
        this.loadOrder();
    },

    onShow() {
        if (this.data.rechargeOrderId) {
            this.loadOrder();
        }
    },

    onUnload() {
        this._clearCountdown();
    },

    _clearCountdown() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    },

    _startCountdown(seconds) {
        this._clearCountdown();
        this.setData({ countdownText: formatCountdown(seconds) });
        if (seconds <= 0) return;
        let remaining = seconds;
        this._timer = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                this._clearCountdown();
                this.setData({ countdownText: '00:00:00' });
                this.loadOrder();
                return;
            }
            this.setData({ countdownText: formatCountdown(remaining) });
        }, 1000);
    },

    async loadOrder() {
        if (!this.data.rechargeOrderId) return;
        this.setData({ loading: true });
        try {
            const res = await get(`/agent/wallet/recharge-orders/${encodeURIComponent(this.data.rechargeOrderId)}`);
            const order = res?.data;
            this.setData({
                loading: false,
                rechargeOrderId: order?.order_no || this.data.rechargeOrderId,
                order: order ? {
                    ...order,
                    amountText: Number(order.amount || 0).toFixed(2),
                    createdAtText: formatDateTime(order.created_at),
                    expireAtText: formatDateTime(order.expire_at),
                    paidAtText: formatDateTime(order.paid_at),
                    cancelledAtText: formatDateTime(order.cancelled_at)
                } : null
            });
            this._startCountdown(order?.can_continue_pay ? order.seconds_remaining : 0);
        } catch (err) {
            this._clearCountdown();
            this.setData({ loading: false });
            wx.showToast({ title: err.message || '加载失败', icon: 'none' });
        }
    },

    async onContinuePay() {
        const order = this.data.order;
        if (!order || !order.can_continue_pay || this.data.paying) return;

        this.setData({ paying: true });
        wx.showLoading({ title: '拉起支付...' });
        try {
            const res = await post('/agent/wallet/prepay', { recharge_order_id: order.id || order.order_no });
            wx.hideLoading();
            const data = res?.data || {};

            if (data.prepay_failed || !data.timeStamp) {
                this.setData({ paying: false });
                wx.showModal({
                    title: '暂时无法支付',
                    content: data.prepay_message || '请稍后重试，充值单会保留到超时关闭。',
                    showCancel: false
                });
                this.loadOrder();
                return;
            }

            wx.requestPayment({
                timeStamp: data.timeStamp,
                nonceStr: data.nonceStr,
                package: data.package,
                signType: data.signType || 'RSA',
                paySign: data.paySign,
                success: () => {
                    wx.showToast({ title: '充值成功', icon: 'success' });
                    setTimeout(() => this.loadOrder(), 1200);
                },
                fail: (err) => {
                    if (err.errMsg && err.errMsg.includes('cancel')) {
                        wx.showToast({ title: '已取消支付', icon: 'none' });
                    } else {
                        wx.showToast({ title: '支付未完成，可继续重试', icon: 'none' });
                    }
                    this.loadOrder();
                },
                complete: () => {
                    this.setData({ paying: false });
                }
            });
        } catch (err) {
            wx.hideLoading();
            this.setData({ paying: false });
            wx.showToast({ title: err.message || '拉起支付失败', icon: 'none' });
            this.loadOrder();
        }
    }
});
