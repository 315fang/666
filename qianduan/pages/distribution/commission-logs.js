const { get } = require('../../utils/request');

const COMMISSION_STATUS_MAP = {
    'frozen': { text: '冻结中', class: 'status-frozen' },
    'pending_approval': { text: '待审核', class: 'status-pending' },
    'available': { text: '可提现', class: 'status-success' },
    'settled': { text: '已结算', class: 'status-gray' },
    'cancelled': { text: '已取消', class: 'status-fail' }
};

const TYPE_MAP = {
    'Direct': { name: '直推佣金', icon: '👤' },
    'Indirect': { name: '团队佣金', icon: '👥' },
    'Stock_Diff': { name: '级差利润', icon: '📈' },
    'agent_fulfillment': { name: '发货利润', icon: '🚚' }
};

Page({
    data: {
        logs: [],
        totalEarnings: '0.00',
        frozenAmount: '0.00',
        currentType: 'all',
        page: 1,
        loading: false,
        hasMore: true
    },

    onLoad() {
        this.loadStats();
        this.loadLogs(true);
    },

    onPullDownRefresh() {
        this.loadStats();
        this.loadLogs(true).then(() => {
            wx.stopPullDownRefresh();
        });
    },

    onReachBottom() {
        if (this.data.hasMore && !this.data.loading) {
            this.loadLogs();
        }
    },

    async loadStats() {
        try {
            const res = await get('/stats/distribution');
            if (res.code === 0 && res.data) {
                this.setData({
                    totalEarnings: res.data.stats?.totalEarnings || '0.00',
                    frozenAmount: res.data.stats?.frozenAmount || '0.00'
                });
            }
        } catch (err) {
            console.error('加载统计失败', err);
        }
    },

    async loadLogs(reset = false) {
        if (this.data.loading) return;

        const page = reset ? 1 : this.data.page;
        this.setData({ loading: true });

        try {
            const params = {
                page,
                limit: 20
            };
            if (this.data.currentType !== 'all') {
                params.type = this.data.currentType;
            }

            const res = await get('/wallet/commissions', params);
            if (res.code === 0) {
                const list = (res.data.list || []).map(item => {
                    const statusConfig = COMMISSION_STATUS_MAP[item.status] || { text: item.status, class: '' };
                    const typeConfig = TYPE_MAP[item.type] || { name: item.type, icon: '💰' };
                    return {
                        ...item,
                        statusText: statusConfig.text,
                        statusClass: statusConfig.class,
                        typeName: typeConfig.name,
                        typeIcon: typeConfig.icon,
                        created_at: item.created_at ? item.created_at.substring(0, 16).replace('T', ' ') : ''
                    };
                });

                this.setData({
                    logs: reset ? list : [...this.data.logs, ...list],
                    page: page + 1,
                    hasMore: list.length === 20,
                    loading: false
                });
            }
        } catch (err) {
            console.error('加载明细失败', err);
            this.setData({ loading: false });
        }
    },

    onTypeChange(e) {
        const type = e.currentTarget.dataset.type;
        if (type === this.data.currentType) return;

        this.setData({ currentType: type }, () => {
            this.loadLogs(true);
        });
    }
});