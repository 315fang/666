// pages/distribution/stock-logs.js - 代理商货款流水
const { get } = require('../../utils/request');

Page({
    data: {
        currentBalance: '0.00',
        logs: [],
        activeFilter: 'all', // all / in / out
        page: 1,
        limit: 20,
        hasMore: true,
        loading: false
    },

    onShow() {
        this.setData({ logs: [], page: 1, hasMore: true });
        this.loadLogs();
    },

    onPullDownRefresh() {
        this.setData({ logs: [], page: 1, hasMore: true });
        this.loadLogs().finally(() => wx.stopPullDownRefresh());
    },

    onReachBottom() {
        if (this.data.hasMore && !this.data.loading) {
            this.loadLogs();
        }
    },

    // 筛选切换
    onFilterChange(e) {
        const filter = e.currentTarget.dataset.filter;
        this.setData({
            activeFilter: filter,
            logs: [],
            page: 1,
            hasMore: true
        });
        this.loadLogs();
    },

    // 加载货款流水
    async loadLogs() {
        if (this.data.loading) return;
        this.setData({ loading: true });

        try {
            const accountRes = await get('/agent/wallet');
            if (accountRes.code === 0 && accountRes.data) {
                this.setData({
                    currentBalance: accountRes.data.balance || '0.00'
                });
            }

            const res = await get('/agent/wallet/logs', {
                page: this.data.page,
                limit: this.data.limit
            });

            if (res.code === 0 && res.data) {
                let list = (res.data.list || []).map(item => {
                    const isIn = item.change_type === 'recharge' || item.change_type === 'refund';
                    return {
                        id: item.id,
                        type: isIn ? 'in' : 'out',
                        label: isIn ? '货款增加' : '货款扣减',
                        product_name: item.remark || (item.ref_type || '系统流水'),
                        amount: parseFloat(item.amount || 0),
                        time: item.created_at
                    };
                });

                // 前端筛选
                if (this.data.activeFilter !== 'all') {
                    list = list.filter(item => item.type === this.data.activeFilter);
                }

                // 格式化时间
                list = list.map(item => ({
                    ...item,
                    time_format: this.formatTime(item.time)
                }));

                const oldLogs = this.data.page === 1 ? [] : this.data.logs;
                const pagination = res.data.pagination || {};

                this.setData({
                    logs: [...oldLogs, ...list],
                    hasMore: (this.data.page * this.data.limit) < (pagination.total || 0),
                    page: this.data.page + 1
                });
            }
        } catch (err) {
            console.error('加载货款流水失败:', err);
            if (err.statusCode === 403) {
                wx.showToast({ title: '仅代理商可访问', icon: 'none' });
                setTimeout(() => wx.navigateBack(), 1500);
            }
        }

        this.setData({ loading: false });
    },

    formatTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        return `${month}-${day} ${hour}:${minute}`;
    },

    // 快捷充值
    onRecharge() {
        wx.showToast({ title: '请在货款余额页完成支付充值', icon: 'none' });
        wx.navigateTo({ url: '/pages/wallet/agent-wallet' });
    }
});
