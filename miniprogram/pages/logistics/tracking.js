// pages/logistics/tracking.js
const { get } = require('../../utils/request');
const app = getApp();
const { getConfigSection } = require('../../utils/miniProgramConfig');

Page({
    data: {
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        pageTitle: '物流跟踪',
        manualEmptyTracesText: '当前为手工发货模式，暂不提供第三方物流轨迹',
        info: null,
        loading: true,
        error: null,
        refreshing: false,
        manualMode: false
    },

    onLoad(options) {
        const brandConfig = getConfigSection('brand_config');
        const logisticsConfig = getConfigSection('logistics_config');
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44,
            pageTitle: brandConfig.logistics_page_title || '物流跟踪',
            manualEmptyTracesText: logisticsConfig.manual_empty_traces_text || '当前为手工发货模式，暂不提供第三方物流轨迹'
        });
        this.orderId = options.order_id;
        this.trackingNo = options.tracking_no;
        this.company = options.company || 'auto';
        this.loadLogistics();
    },

    async loadLogistics(forceRefresh = false) {
        this.setData({ loading: true, error: null });
        try {
            const reqOptions = {
                // 物流查询失败时不走全局重试，避免用户长时间卡在 loading
                maxRetries: 0,
                timeout: 8000,
                showError: false
            };
            let res;
            if (this.orderId) {
                // 通过订单ID查询（附带权限校验）
                const url = forceRefresh
                    ? `/logistics/order/${this.orderId}?refresh=1`
                    : `/logistics/order/${this.orderId}`;
                res = await get(url, {}, reqOptions);
            } else if (this.trackingNo) {
                const url = forceRefresh
                    ? `/logistics/${this.trackingNo}?company=${this.company}&refresh=1`
                    : `/logistics/${this.trackingNo}?company=${this.company}`;
                res = await get(url, {}, reqOptions);
            } else {
                this.setData({ error: '缺少运单号或订单号', loading: false });
                return;
            }

            if (res?.code === 0) {
                // 格式化时间
                const traces = (res.data.traces || []).map(t => ({
                    ...t,
                    time: this.formatTime(t.time)
                }));
                this.setData({
                    info: { ...res.data, traces },
                    loading: false,
                    manualMode: !!res.data.manual_mode
                });
            } else {
                this.setData({ error: res?.message || '查询失败，请稍后重试', loading: false });
            }
        } catch (e) {
            this.setData({ error: this.getFriendlyErrorMessage(e), loading: false });
        }
    },

    async onRefresh() {
        if (this.data.refreshing) return;
        if (this.data.manualMode) {
            const logisticsConfig = getConfigSection('logistics_config');
            wx.showToast({ title: logisticsConfig.manual_refresh_toast || '手工发货模式无需刷新轨迹', icon: 'none' });
            return;
        }
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

    getFriendlyErrorMessage(err) {
        const msg = (err && (err.message || err.errMsg)) ? String(err.message || err.errMsg) : '';
        if (/timeout|超时/i.test(msg)) return '物流服务响应超时，请稍后重试';
        if (/401|登录已过期/i.test(msg)) return '登录已过期，请重新登录后查询';
        if (/network|fail|连接失败/i.test(msg)) return '网络异常，请检查网络后重试';
        return '物流查询失败，请稍后重试';
    },

    onBack() { require('../../utils/navigator').safeBack(); }
});
