// pages/logistics/tracking.js
const { get, post } = require('../../utils/request');
const app = getApp();

Page({
    data: {
        statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
        info: null,
        loading: true,
        error: null,
        refreshing: false
    },

    onLoad(options) {
        this.orderId = options.order_id;
        this.trackingNo = options.tracking_no;
        this.company = options.company || 'auto';
        this.loadLogistics();
    },

    async loadLogistics(forceRefresh = false) {
        this.setData({ loading: true, error: null });
        try {
            let res;
            if (this.orderId) {
                // 通过订单ID查询（附带权限校验）
                const url = forceRefresh
                    ? `/logistics/order/${this.orderId}?refresh=1`
                    : `/logistics/order/${this.orderId}`;
                res = await get(url);
            } else if (this.trackingNo) {
                const url = forceRefresh
                    ? `/logistics/${this.trackingNo}?company=${this.company}&refresh=1`
                    : `/logistics/${this.trackingNo}?company=${this.company}`;
                res = await get(url);
            }

            if (res?.code === 0) {
                // 格式化时间
                const traces = (res.data.traces || []).map(t => ({
                    ...t,
                    time: this.formatTime(t.time)
                }));
                this.setData({ info: { ...res.data, traces }, loading: false });
            } else {
                this.setData({ error: res?.message || '查询失败，请稍后重试', loading: false });
            }
        } catch (e) {
            this.setData({ error: '网络错误，请检查连接', loading: false });
        }
    },

    async onRefresh() {
        if (this.data.refreshing) return;
        this.setData({ refreshing: true });
        await this.loadLogistics(true);
        this.setData({ refreshing: false });
        wx.showToast({ title: '已刷新', icon: 'success' });
    },

    formatTime(isoStr) {
        if (!isoStr) return '';
        try {
            const d = new Date(isoStr);
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch { return isoStr; }
    },

    onBack() { wx.navigateBack(); }
});
