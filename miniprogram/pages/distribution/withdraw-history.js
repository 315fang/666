const { get } = require('../../utils/request');

const WITHDRAW_STATUS_MAP = {
    'pending': { text: '审核中', class: 'status-pending' },
    'approved': { text: '待打款', class: 'status-success' },
    'completed': { text: '已到账', class: 'status-gray' },
    'rejected': { text: '已驳回', class: 'status-fail' }
};

Page({
    data: {
        list: [],
        page: 1,
        loading: false,
        hasMore: true
    },

    onLoad() {
        this.loadList(true);
    },

    onPullDownRefresh() {
        this.loadList(true).then(() => {
            wx.stopPullDownRefresh();
        });
    },

    onReachBottom() {
        if (this.data.hasMore && !this.data.loading) {
            this.loadList();
        }
    },

    async loadList(reset = false) {
        if (this.data.loading) return;

        const page = reset ? 1 : this.data.page;
        this.setData({ loading: true });

        try {
            const res = await get('/wallet/withdrawals', { page, limit: 20 });
            if (res.code === 0) {
                const list = (res.data.list || []).map(item => {
                    const statusConfig = WITHDRAW_STATUS_MAP[item.status] || { text: item.status, class: '' };
                    return {
                        ...item,
                        statusText: statusConfig.text,
                        statusClass: statusConfig.class,
                        created_at: item.created_at ? item.created_at.substring(0, 16).replace('T', ' ') : ''
                    };
                });

                this.setData({
                    list: reset ? list : [...this.data.list, ...list],
                    page: page + 1,
                    hasMore: list.length === 20,
                    loading: false
                });
            }
        } catch (err) {
            console.error('加载记录失败', err);
            this.setData({ loading: false });
        }
    }
});