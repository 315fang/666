const { get } = require('../../utils/request');

Page({
    data: {
        loaded: false,
        hasAny: false,
        channel_service_phone: '',
        product_service_phone: '',
        qr_code_url: ''
    },

    onShow() {
        this.loadChannel();
    },

    loadChannel() {
        get('/mini-program-config', {}, { showError: false, ignore401: true, timeout: 10000 })
            .then((res) => {
                const ch = (res && res.code === 0 && res.data && res.data.customer_service_channel) || {};
                const channel = String(ch.channel_service_phone || '').trim();
                const product = String(ch.product_service_phone || '').trim();
                const qr = String(ch.qr_code_url || '').trim();
                const hasAny = !!(channel || product || qr);
                this.setData({
                    loaded: true,
                    hasAny,
                    channel_service_phone: channel,
                    product_service_phone: product,
                    qr_code_url: qr
                });
            })
            .catch(() => {
                this.setData({ loaded: true, hasAny: false });
            });
    },

    _normalizePhone(raw) {
        return String(raw || '').trim().replace(/\s/g, '');
    },

    onCallChannel() {
        this._call(this.data.channel_service_phone);
    },

    onCallProduct() {
        this._call(this.data.product_service_phone);
    },

    _call(raw) {
        const phoneNumber = this._normalizePhone(raw);
        if (!phoneNumber) {
            wx.showToast({ title: '号码未配置', icon: 'none' });
            return;
        }
        wx.makePhoneCall({
            phoneNumber,
            fail: () => {
                wx.showToast({ title: '无法发起拨号', icon: 'none' });
            }
        });
    }
});
