const { get } = require('../../utils/request');

const WITHDRAW_STATUS_MAP = {
    'pending': { text: '审核中', class: 'status-pending', hint: '平台正在审核，请等待处理' },
    'approved': { text: '待打款', class: 'status-success', hint: '审核已通过，等待平台打款' },
    'processing': { text: '打款中', class: 'status-pending', hint: '打款处理中，请留意微信零钱' },
    'completed': { text: '已到账', class: 'status-success', hint: '提现已到账' },
    'settled': { text: '已到账', class: 'status-success', hint: '提现已到账' },
    'failed': { text: '打款失败', class: 'status-fail', hint: '打款失败，金额将按规则处理' },
    'rejected': { text: '已驳回', class: 'status-fail', hint: '申请未通过，请查看原因' },
    'cancelled': { text: '已取消', class: 'status-gray', hint: '提现申请已取消' }
};

function fmtMoney(value) {
    return parseFloat(value || 0).toFixed(2);
}

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
                    const statusConfig = WITHDRAW_STATUS_MAP[item.status] || { text: item.status || '处理中', class: 'status-pending', hint: '提现申请处理中' };
                    return {
                        ...item,
                        amount: fmtMoney(item.amount),
                        fee: fmtMoney(item.fee),
                        actual_amount: fmtMoney(item.actual_amount != null ? item.actual_amount : item.amount),
                        statusText: statusConfig.text,
                        statusClass: statusConfig.class,
                        statusHint: statusConfig.hint,
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
