// pages/distribution/commission-logs.js - 佣金明细（含来源订单、下级用户、积分入口）
const { get } = require('../../utils/request');

// 状态映射（对应后端 commission.status）
const STATUS_MAP = {
    frozen:           { text: '冻结中',   cls: 'status-frozen' },
    pending_approval: { text: '审核中',   cls: 'status-pending' },
    available:        { text: '可提现',   cls: 'status-success' },
    settled:          { text: '已结算',   cls: 'status-gray' },
    cancelled:        { text: '已取消',   cls: 'status-fail' }
};

// 类型映射（全部小写，兼容历史大小写写法）
const TYPE_MAP = {
    direct:            { name: '直推佣金', icon: '/assets/icons/user.svg',       color: '#C8A258' },
    indirect:          { name: '团队佣金', icon: '/assets/icons/users.svg',      color: '#5A8060' },
    gap:               { name: '级差利润', icon: '/assets/icons/bar-chart.svg',  color: '#B76447' },
    stock_diff:        { name: '级差利润', icon: '/assets/icons/bar-chart.svg',  color: '#B76447' },
    agent_fulfillment: { name: '发货利润', icon: '/assets/icons/truck.svg',      color: '#4A6E8A' },
    self:              { name: '自购返利', icon: '/assets/icons/shopping-bag.svg', color: '#8A6020' }
};

// 筛选标签（对应 TYPE_MAP 的 key，前端展示用）
const FILTER_TABS = [
    { key: 'all',              label: '全部' },
    { key: 'direct',           label: '直推' },
    { key: 'indirect',         label: '团队' },
    { key: 'gap',              label: '级差' },
    { key: 'agent_fulfillment', label: '发货' }
];

function resolveType(raw) {
    const key = String(raw || '').toLowerCase();
    return TYPE_MAP[key] || { name: raw || '其他', icon: '/assets/icons/dollar-sign.svg', color: '#9A8D80' };
}

function resolveStatus(raw) {
    return STATUS_MAP[raw] || { text: raw || '未知', cls: '' };
}

function formatDate(iso) {
    if (!iso) return '';
    return iso.replace('T', ' ').slice(0, 16);
}

Page({
    data: {
        // 统计
        totalEarnings: '0.00',
        availableAmount: '0.00',
        frozenAmount: '0.00',
        // 列表
        logs: [],
        loading: false,
        hasMore: true,
        page: 1,
        limit: 20,
        // 筛选
        currentType: 'all',
        filterTabs: FILTER_TABS,
        // 积分入口
        pointBalance: 0
    },

    onLoad() {
        this.loadStats();
        this.loadLogs(true);
        this.loadPointBalance();
    },

    onPullDownRefresh() {
        this.loadStats();
        this.loadPointBalance();
        this.loadLogs(true).finally(() => wx.stopPullDownRefresh());
    },

    onReachBottom() {
        if (this.data.hasMore && !this.data.loading) {
            this.loadLogs(false);
        }
    },

    async loadStats() {
        try {
            const res = await get('/stats/distribution');
            if (res.code === 0 && res.data && res.data.stats) {
                const s = res.data.stats;
                this.setData({
                    totalEarnings: s.totalEarnings || '0.00',
                    availableAmount: s.availableAmount || s.available || '0.00',
                    frozenAmount: s.frozenAmount || '0.00'
                });
            }
        } catch (err) {
            console.error('[commission-logs] 加载统计失败:', err);
        }
    },

    async loadPointBalance() {
        try {
            const res = await get('/wallet/points');
            if (res.code === 0 && res.data) {
                this.setData({ pointBalance: res.data.points || 0 });
            }
        } catch (_) {}
    },

    async loadLogs(reset = false) {
        if (this.data.loading) return;
        const page = reset ? 1 : this.data.page;
        this.setData({ loading: true });

        try {
            const params = { page, limit: this.data.limit };
            if (this.data.currentType !== 'all') {
                params.type = this.data.currentType;
            }

            const res = await get('/wallet/commissions', params);
            if (res.code === 0 && res.data) {
                const rawList = res.data.list || [];
                const newLogs = rawList.map(item => this._normalize(item));
                const logs = reset ? newLogs : [...this.data.logs, ...newLogs];
                this.setData({
                    logs,
                    page: page + 1,
                    // 若返回条数 < limit，说明没有更多了
                    hasMore: rawList.length >= this.data.limit
                });
            } else {
                this.setData({ hasMore: false });
            }
        } catch (err) {
            console.error('[commission-logs] 加载失败:', err);
            this.setData({ hasMore: false });
        }
        this.setData({ loading: false });
    },

    _normalize(item) {
        const typeInfo = resolveType(item.type);
        const statusInfo = resolveStatus(item.status);
        // 来源描述：优先取 from_user_nick，其次取 remark / description
        const fromDesc = item.from_user_nick
            ? `来自：${item.from_user_nick}`
            : (item.remark || item.description || '');
        // 商品摘要
        const productSummary = item.product_summary
            ? `商品：${item.product_summary.slice(0, 12)}${item.product_summary.length > 12 ? '…' : ''}`
            : '';
        // 订单号（取后8位展示）
        const orderNo = item.order_no_display || item.order_no || item.order_id || '';
        const orderShort = orderNo ? String(orderNo).slice(-10) : '';
        return {
            ...item,
            typeName: typeInfo.name,
            typeIcon: typeInfo.icon,
            typeColor: typeInfo.color,
            statusText: statusInfo.text,
            statusCls: statusInfo.cls,
            created_at: formatDate(item.created_at),
            fromDesc,
            productSummary,
            orderShort,
            orderNo,
            hasDetail: !!(fromDesc || productSummary || orderShort)
        };
    },

    onTypeChange(e) {
        const type = e.currentTarget.dataset.type;
        if (type === this.data.currentType) return;
        this.setData({ currentType: type, logs: [], page: 1, hasMore: true });
        this.loadLogs(true);
    },

    onGoPoints() {
        wx.navigateTo({ url: '/pages/user/points' });
    }
});
