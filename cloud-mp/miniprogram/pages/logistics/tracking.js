// pages/logistics/tracking.js
const { get } = require('../../utils/request');
const app = getApp();
const { getConfigSection } = require('../../utils/miniProgramConfig');

const KNOWN_STATUS_THEMES = new Set([
    'in_transit',
    'delivered',
    'dispatching',
    'collecting',
    'failed',
    'problem',
    'returned',
    'unknown',
    'manual'
]);

const ORDER_STATUS_THEME_MAP = {
    pending: 'collecting',
    pending_payment: 'collecting',
    paid: 'collecting',
    pickup_pending: 'manual',
    agent_confirmed: 'dispatching',
    shipping_requested: 'dispatching',
    shipped: 'in_transit',
    completed: 'delivered',
    refunding: 'problem',
    refunded: 'returned',
    cancelled: 'failed'
};

const ORDER_STATUS_TEXT_MAP = {
    pending: '订单待支付',
    pending_payment: '订单待支付',
    paid: '待商家发货',
    pickup_pending: '待到店核销',
    agent_confirmed: '仓库准备发货',
    shipping_requested: '已提交发货申请',
    shipped: '运输中',
    completed: '已签收',
    refunding: '物流异常 / 退款处理中',
    refunded: '订单已退款',
    cancelled: '订单已取消'
};

function parseTimeValue(value) {
    if (!value) return 0;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : 0;
}

function normalizeTraceList(traces = []) {
    return (Array.isArray(traces) ? traces : [])
        .map((item = {}) => ({
            ...item,
            time: item.time || '',
            desc: item.desc || item.status_text || item.statusText || '物流信息更新中',
            location: item.location || item.address || '',
            _sortTime: parseTimeValue(item.time)
        }))
        .sort((a, b) => b._sortTime - a._sortTime)
        .map(({ _sortTime, ...item }) => item);
}

function normalizeLogisticsPayload(payload = {}, logisticsConfig = {}) {
    const rawStatus = String(payload.status_text || payload.statusText || payload.status || '').trim();
    const statusKey = String(rawStatus).toLowerCase();
    const manualMode = !!payload.manual_mode;
    const theme = manualMode
        ? 'manual'
        : (KNOWN_STATUS_THEMES.has(statusKey) ? statusKey : (ORDER_STATUS_THEME_MAP[statusKey] || 'unknown'));

    const traces = normalizeTraceList(payload.traces || []);
    return {
        ...payload,
        manual_mode: manualMode,
        status: theme,
        status_text: manualMode
            ? (logisticsConfig.manual_status_text || '商家已手工发货')
            : (payload.status_text || payload.statusText || ORDER_STATUS_TEXT_MAP[statusKey] || '物流信息更新中'),
        company: payload.company || payload.shipping_company || payload.logistics_company || '',
        tracking_no: payload.tracking_no || '',
        order_no: payload.order_no || '',
        traces,
        query_time: payload.query_time || payload.updated_at || payload.shipped_at || ''
    };
}

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
            const logisticsConfig = getConfigSection('logistics_config');
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
                const normalized = normalizeLogisticsPayload(res.data || {}, logisticsConfig);
                const traces = (normalized.traces || []).map(t => ({
                    ...t,
                    time: this.formatTime(t.time)
                }));
                this.setData({
                    info: {
                        ...normalized,
                        traces,
                        query_time: this.formatTime(normalized.query_time)
                    },
                    loading: false,
                    manualMode: !!normalized.manual_mode
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

    onCopyTrackingNo() {
        const trackingNo = String(this.data.info?.tracking_no || '').trim();
        if (!trackingNo) {
            wx.showToast({ title: '暂无物流单号', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: trackingNo,
            success: () => wx.showToast({ title: '单号已复制', icon: 'success' })
        });
    },

    onBack() { require('../../utils/navigator').safeBack(); }
});
