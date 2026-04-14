const { get } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');

function normalizePickupInfo(info) {
    if (!info) return null;
    const verifiedAt = info.pickup_verified_at || info.verified_at || '';
    return {
        ...info,
        verified_at: verifiedAt,
        pickup_verified_at: verifiedAt,
        pickup_qr_token: info.pickup_qr_token || info.qr_token || info.pickup_qr_code || '',
        pickupStation: info.pickupStation || info.pickup_station || info.station || null
    };
}

Page({
    data: {
        loading: true,
        info: null,
        orderId: null
    },

    onLoad(options) {
        if (!requireLogin()) {
            setTimeout(() => wx.navigateBack(), 100);
            return;
        }
        const id = options.id;
        if (!id) {
            this.setData({ loading: false });
            return;
        }
        this.setData({ orderId: id });
        this.load(id);
    },

    async load(id) {
        this.setData({ loading: true });
        try {
            const res = await get(`/pickup/my/${id}`, {}, { showLoading: true });
            this.setData({ info: normalizePickupInfo(res.data || null), loading: false });
        } catch (e) {
            this.setData({ loading: false, info: null });
        }
    },

    onCopyCode() {
        const c = this.data.info && this.data.info.pickup_code;
        if (!c) return;
        wx.setClipboardData({
            data: c,
            success: () => wx.showToast({ title: '已复制', icon: 'success' })
        });
    }
});
