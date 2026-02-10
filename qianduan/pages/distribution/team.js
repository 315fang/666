// pages/distribution/team.js
const { get } = require('../../utils/request');

Page({
    data: {
        directCount: 0,
        indirectCount: 0,
        totalCount: 0,
        totalSales: '0.00',
        monthlyNewMembers: 0,
        members: [],
        currentTab: 'direct',
        page: 1,
        limit: 10,
        hasMore: true,
        loading: false
    },

    onLoad() {
        this.loadStats();
        this.loadMembers();
    },

    async loadStats() {
        try {
            const res = await get('/distribution/stats');
            const { team, stats } = res.data;
            this.setData({
                directCount: team.directCount,
                indirectCount: team.indirectCount,
                totalCount: team.totalCount,
                monthlyNewMembers: team.monthlyNewMembers || 0,
                totalSales: stats ? stats.totalEarnings : '0.00'
            });
        } catch (err) {
            console.error('加载统计失败:', err);
        }
    },

    async loadMembers(isLoadMore = false) {
        if (this.data.loading || (!isLoadMore && !this.data.hasMore)) return;

        this.setData({ loading: true });

        try {
            const { currentTab, page, limit, members } = this.data;
            const res = await get('/distribution/team', {
                level: currentTab,
                page,
                limit
            });

            const list = res.data.list.map(item => ({
                ...item,
                joined_at_format: item.joined_at ? item.joined_at.split('T')[0] : '',
                role_name: this.getRoleName(item.role_level),
                total_sales_format: item.total_sales ? parseFloat(item.total_sales).toFixed(2) : '0.00'
            }));

            this.setData({
                members: isLoadMore ? members.concat(list) : list,
                hasMore: list.length === limit,
                page: page + 1,
                loading: false
            });
        } catch (err) {
            this.setData({ loading: false });
            console.error('加载成员失败:', err);
        }
    },

    getRoleName(level) {
        const names = {
            0: '普通用户',
            1: '会员',
            2: '团长',
            3: '代理商'
        };
        return names[level] || '用户';
    },

    switchTab(e) {
        const tab = e.currentTarget.dataset.tab;
        if (tab === this.data.currentTab) return;

        this.setData({
            currentTab: tab,
            members: [],
            page: 1,
            hasMore: true
        }, () => {
            this.loadMembers();
        });
    },

    onLoadMore() {
        if (this.data.hasMore) {
            this.loadMembers(true);
        }
    }
});
