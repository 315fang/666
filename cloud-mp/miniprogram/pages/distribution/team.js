const { get } = require('../../utils/request');
const { ROLE_NAMES } = require('../../config/constants');
const app = getApp();

function formatDate(dateText) {
    if (!dateText) return '';
    return String(dateText).split('T')[0];
}

function formatMoney(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function pickNumber(values, fallback = 0) {
    for (let i = 0; i < values.length; i += 1) {
        const n = Number(values[i]);
        if (Number.isFinite(n)) return n;
    }
    return fallback;
}

function buildTabStats(team = {}) {
    const levels = team.levels || {};
    const directCount = pickNumber([levels.direct && levels.direct.count, team.directCount], 0);
    const indirectCount = pickNumber([levels.indirect && levels.indirect.count, team.indirectCount], 0);
    const directMonthlyNew = pickNumber([
        levels.direct && levels.direct.monthlyNewCount,
        team.directMonthlyNewMembers,
        team.monthlyNewMembers
    ], 0);
    const indirectMonthlyNew = pickNumber([
        levels.indirect && levels.indirect.monthlyNewCount,
        team.indirectMonthlyNewMembers
    ], 0);
    const directTotalSales = pickNumber([
        levels.direct && levels.direct.totalSales,
        team.directTotalSales,
        team.directSales
    ], 0);
    const indirectTotalSales = pickNumber([
        levels.indirect && levels.indirect.totalSales,
        team.indirectTotalSales,
        team.indirectSales
    ], 0);

    return {
        direct: {
            count: directCount,
            monthlyNewMembers: directMonthlyNew,
            totalSales: directTotalSales
        },
        indirect: {
            count: indirectCount,
            monthlyNewMembers: indirectMonthlyNew,
            totalSales: indirectTotalSales
        },
        all: {
            count: pickNumber([levels.all && levels.all.count, team.totalCount], directCount + indirectCount),
            monthlyNewMembers: pickNumber([levels.all && levels.all.monthlyNewCount, team.monthlyNewMembers], directMonthlyNew + indirectMonthlyNew),
            totalSales: pickNumber([levels.all && levels.all.totalSales, team.totalSales], directTotalSales + indirectTotalSales)
        }
    };
}

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        memberCode: '',
        directCount: 0,
        indirectCount: 0,
        totalCount: 0,
        totalSales: '0.00',
        monthlyNewMembers: 0,
        teamStatsByTab: {
            direct: { count: 0, monthlyNewMembers: 0, totalSales: 0 },
            indirect: { count: 0, monthlyNewMembers: 0, totalSales: 0 },
            all: { count: 0, monthlyNewMembers: 0, totalSales: 0 }
        },
        members: [],
        currentTab: 'direct',
        page: 1,
        limit: 10,
        hasMore: true,
        loading: false
    },

    onLoad(options) {
        if (options && options.tab === 'poster') {
            wx.redirectTo({ url: '/pages/distribution/invite-poster' });
            return;
        }
        const allowed = ['direct', 'indirect'];
        const tab = options && options.tab;
        const initialTab = tab && allowed.includes(tab) ? tab : null;
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navBarHeight: app.globalData.navBarHeight || 44,
            ...(initialTab ? { currentTab: initialTab } : {})
        });
        this.loadStats();
        this.loadMembers();
    },

    goInvitePosterPage() {
        wx.navigateTo({ url: '/pages/distribution/invite-poster' });
    },

    goWalletLogs() {
        wx.navigateTo({ url: '/pages/distribution/commission-logs' });
    },

    applyCurrentTabSummary(tab = this.data.currentTab, teamStatsByTab = this.data.teamStatsByTab) {
        const summary = teamStatsByTab[tab] || teamStatsByTab.all || { count: 0, monthlyNewMembers: 0, totalSales: 0 };
        this.setData({
            totalCount: Number(summary.count || 0),
            monthlyNewMembers: Number(summary.monthlyNewMembers || 0),
            totalSales: formatMoney(summary.totalSales)
        });
    },

    async loadStats() {
        try {
            const res = await get('/distribution/stats');
            const { team = {}, userInfo = {} } = res.data || {};
            const memberCode = userInfo.invite_code || app.globalData.userInfo?.invite_code || '';
            const teamStatsByTab = buildTabStats(team);
            if (memberCode && app.globalData.userInfo) {
                app.globalData.userInfo.invite_code = memberCode;
                try {
                    wx.setStorageSync('userInfo', { ...app.globalData.userInfo, invite_code: memberCode });
                } catch (e) { }
            }
            this.setData({
                memberCode,
                directCount: Number(team.directCount || 0),
                indirectCount: Number(team.indirectCount || 0),
                teamStatsByTab
            }, () => {
                this.applyCurrentTabSummary(this.data.currentTab, teamStatsByTab);
            });
        } catch (err) {
            console.error('加载统计失败:', err);
        }
    },

    async loadMembers(isLoadMore = false) {
        if (this.data.loading || (isLoadMore && !this.data.hasMore)) return;
        this.setData({ loading: true });
        try {
            const { currentTab, page, limit, members } = this.data;
            const res = await get('/distribution/team', {
                level: currentTab,
                page,
                pageSize: limit,
                limit
            });
            const list = (res.data?.list || []).map((item) => {
                const levelLabel = Number(item.level) === 1 ? '一级成员' : '二级成员';
                return {
                    ...item,
                    joined_at_format: formatDate(item.joined_at),
                    role_name: this.getRoleName(item.role_level),
                    relation_source_text: item.relation_source_text || (item.relation_source === 'directed_b1' ? '定向邀约' : '普通邀请'),
                    current_relation_text: item.current_relation_text || item.relation_text || (Number(item.level) === 1 ? '当前关系：你的一级团队成员' : '当前关系：你的二级团队成员'),
                    inviter_text: item.inviter_text || (Number(item.level) === 1 ? '邀请人：你' : '邀请人：一级团队成员'),
                    total_sales_format: formatMoney(item.total_sales),
                    order_count_format: Number(item.order_count || 0),
                    level_label: levelLabel,
                    detail_items: [
                        { label: '团队层级', value: levelLabel },
                        { label: '成员身份', value: this.getRoleName(item.role_level) },
                        { label: '当前关系', value: item.current_relation_text || item.relation_text || (Number(item.level) === 1 ? '当前关系：你的一级团队成员' : '当前关系：你的二级团队成员') },
                        { label: '邀请人', value: item.inviter_text || (Number(item.level) === 1 ? '邀请人：你' : '邀请人：一级团队成员') },
                        { label: '加入来源', value: item.relation_source_text || (item.relation_source === 'directed_b1' ? '定向邀约' : '普通邀请') },
                        { label: '成员ID', value: item.invite_code || '暂无ID' },
                        { label: '手机号', value: item.phone || '未绑定' },
                        { label: '订单数', value: `${Number(item.order_count || 0)} 单` },
                        { label: '累计业绩', value: `¥${formatMoney(item.total_sales)}` },
                        { label: '加入时间', value: formatDate(item.joined_at) || '未知' }
                    ]
                };
            });
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
        return ROLE_NAMES[level] || 'VIP用户';
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
            this.applyCurrentTabSummary(tab);
            this.loadMembers();
        });
    },

    onLoadMore() {
        if (this.data.hasMore) this.loadMembers(true);
    },

    goMemberDetail(e) {
        const index = Number(e.currentTarget.dataset.index);
        const member = this.data.members[index];
        if (!member) return;
        wx.navigateTo({ url: `/pages/distribution/team-member?id=${member._id || member.id}` });
    },

    onShareAppMessage() {
        const code = this.data.memberCode;
        const userInfo = app.globalData.userInfo;
        const brandName = app.globalData.brandName || '品牌臻选';
        return {
            title: `${userInfo?.nick_name || userInfo?.nickname || '好友'} 邀请你加入${brandName}，领取专属优惠`,
            path: `/pages/index/index${code ? '?invite=' + code : ''}`,
            imageUrl: ''
        };
    },

    onBack() {
        wx.navigateBack();
    }
});
