const { get } = require('../../utils/request');

const STATUS_MAP = {
    pending: { text: '待审核', class: 'status-pending' },
    approved: { text: '已通过', class: 'status-success' },
    rejected: { text: '已拒绝', class: 'status-fail' }
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
        this.loadList(true).then(() => wx.stopPullDownRefresh());
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
            const res = await get('/distribution/goods-fund-transfer-applications', { page, limit: 20 });
            if (res.code === 0) {
                const list = (res.data.list || []).map((item) => {
                    const statusConfig = STATUS_MAP[item.status] || { text: item.status, class: '' };
                    const toSnapshot = item.to_snapshot && typeof item.to_snapshot === 'object' ? item.to_snapshot : {};
                    const fromSnapshot = item.from_snapshot && typeof item.from_snapshot === 'object' ? item.from_snapshot : {};
                    return {
                        ...item,
                        statusText: statusConfig.text,
                        statusClass: statusConfig.class,
                        counterparty_text: item.direction === 'outgoing'
                            ? (toSnapshot.nickname || '下级成员')
                            : (fromSnapshot.nickname || '上级成员'),
                        created_at_text: item.created_at ? item.created_at.substring(0, 16).replace('T', ' ') : '',
                        reviewed_at_text: item.reviewed_at ? item.reviewed_at.substring(0, 16).replace('T', ' ') : '',
                        amount_text: Number(item.amount || 0).toFixed(2)
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
            console.error('加载货款划拨申请失败', err);
            this.setData({ loading: false });
        }
    }
});
