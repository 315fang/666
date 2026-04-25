const { get } = require('../../utils/request');

const app = getApp();
const REGION_AGENT_ROLE_LEVEL = 5;

const COMMISSION_STATUS_MAP = {
    'pending': { text: '预计入账', class: 'status-pending' },
    'frozen': { text: '冻结中', class: 'status-frozen' },
    'pending_approval': { text: '待审核', class: 'status-pending' },
    'available': { text: '可提现', class: 'status-success' },
    'settled': { text: '已结算', class: 'status-gray' },
    'cancelled': { text: '已取消', class: 'status-fail' }
};

const TYPE_MAP = {
    'direct': { name: '直推佣金', icon: '/assets/icons/user.svg' },
    'Direct': { name: '直推佣金', icon: '/assets/icons/user.svg' },
    'indirect': { name: '团队佣金', icon: '/assets/icons/users.svg' },
    'Indirect': { name: '团队佣金', icon: '/assets/icons/users.svg' },
    'team': { name: '团队佣金', icon: '/assets/icons/users.svg' },
    'same_level': { name: '平级奖励', icon: '/assets/icons/users.svg' },
    'peer': { name: '平级奖励', icon: '/assets/icons/users.svg' },
    'pickup_subsidy': { name: '服务费', icon: '/assets/icons/truck.svg' },
    'pickup_service_fee': { name: '服务费', icon: '/assets/icons/truck.svg' },
    'agent_assist': { name: '动销奖励', icon: '/assets/icons/bar-chart.svg' },
    'assist': { name: '动销奖励', icon: '/assets/icons/bar-chart.svg' },
    'self': { name: '自购返利', icon: '/assets/icons/dollar-sign.svg' },
    'year_end_dividend': { name: '年终分红', icon: '/assets/icons/dollar-sign.svg' },
    'Stock_Diff': { name: '级差利润', icon: '/assets/icons/bar-chart.svg' },
    'agent_fulfillment': { name: '发货利润', icon: '/assets/icons/truck.svg' },
    'region_agent': { name: '区域奖励', icon: '/assets/icons/bar-chart.svg' },
    'region_b3_virtual': { name: '区域奖励', icon: '/assets/icons/bar-chart.svg' },
    'admin_deduct': { name: '系统扣除', icon: '/assets/icons/dollar-sign.svg' },
    'admin_credit': { name: '系统补发', icon: '/assets/icons/dollar-sign.svg' },
    'admin_adjustment': { name: '系统调整', icon: '/assets/icons/dollar-sign.svg' }
};

function getUserInfoSnapshot() {
    return app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
}

function canViewRegionReward(userInfo = {}) {
    const roleLevel = Number(userInfo.role_level ?? userInfo.distributor_level ?? userInfo.level ?? 0);
    const virtualSettlementType = String(userInfo.virtual_settlement_type || '').trim().toLowerCase();
    return roleLevel === REGION_AGENT_ROLE_LEVEL || virtualSettlementType === 'b3_region';
}

Page({
    data: {
        logs: [],
        totalEarnings: '0.00',
        frozenAmount: '0.00',
        currentType: 'all',
        canViewRegionReward: false,
        page: 1,
        loading: false,
        hasMore: true
    },

    onLoad() {
        this.refreshRegionRewardVisibility();
        this.loadStats();
        this.loadLogs(true);
    },

    onShow() {
        this.refreshRegionRewardVisibility();
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
        if (this.data.currentType === 'region' && !this.data.canViewRegionReward) {
            this.setData({ currentType: 'all' });
        }

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
            // 兼容大小写类型名
            if (params.type === 'Direct') params.type = 'direct';
            if (params.type === 'Indirect') params.type = 'indirect';

            const res = await get('/wallet/commissions', params);
            if (res.code === 0) {
                const list = (res.data.list || []).map(item => {
                    const statusConfig = COMMISSION_STATUS_MAP[item.status] || { text: item.status, class: '' };
                    const typeConfig = TYPE_MAP[item.type] || { name: item.type, icon: '/assets/icons/dollar-sign.svg' };
                    return {
                        ...item,
                        statusText: statusConfig.text,
                        statusClass: statusConfig.class,
                        typeName: typeConfig.name,
                        typeIcon: typeConfig.icon,
                        created_at: item.created_at ? item.created_at.substring(0, 16).replace('T', ' ') : '',
                        sourceText: item.source_text || '',
                        fromUserNick: item.from_user_nick || '',
                        fromUserMemberNo: item.from_user_member_no || '',
                        orderNoDisplay: item.order_no_display || '',
                        orderSourceText: item.order_source_text || '',
                        productSummary: item.product_summary || ''
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

    refreshRegionRewardVisibility() {
        const nextCanView = canViewRegionReward(getUserInfoSnapshot());
        const patch = { canViewRegionReward: nextCanView };
        if (!nextCanView && this.data.currentType === 'region') {
            patch.currentType = 'all';
        }
        this.setData(patch);
        return nextCanView;
    },

    onTypeChange(e) {
        const type = e.currentTarget.dataset.type;
        if (type === 'region' && !this.data.canViewRegionReward) return;
        if (type === this.data.currentType) return;

        this.setData({ currentType: type }, () => {
            this.loadLogs(true);
        });
    }
});
