const { get } = require('../../utils/request');
const app = getApp();

const STATUS_MAP = {
    pending: '待处理',
    processing: '处理中',
    resolved: '已处理',
    closed: '已关闭'
};

function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    const h = `${d.getHours()}`.padStart(2, '0');
    const min = `${d.getMinutes()}`.padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
}

Page({
    data: {
        loading: true,
        list: []
    },

    onShow() {
        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            setTimeout(() => wx.navigateBack(), 400);
            return;
        }
        this.loadTickets();
    },

    async loadTickets() {
        this.setData({ loading: true });
        try {
            const res = await get('/customer-service/tickets', { page: 1, limit: 50 }, { showError: false });
            if (!res || res.code !== 0) {
                this.setData({ loading: false, list: [] });
                wx.showToast({ title: (res && res.message) || '加载失败', icon: 'none' });
                return;
            }
            const raw = res.data?.list || [];
            const list = raw.map((r) => ({
                id: r.id,
                type: r.type,
                content: r.content,
                contact: r.contact,
                status: r.status || 'pending',
                statusText: STATUS_MAP[r.status] || STATUS_MAP.pending,
                timeText: formatTime(r.created_at)
            }));
            this.setData({ loading: false, list });
        } catch (_) {
            this.setData({ loading: false, list: [] });
            wx.showToast({ title: '网络错误', icon: 'none' });
        }
    }
});
