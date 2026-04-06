// pages/distribution/team.js
const { get } = require('../../utils/request');
const { ROLE_NAMES } = require('../../config/constants');
const app = getApp();

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        inviteCode: '',
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

    async loadStats() {
        try {
            const res = await get('/distribution/stats');
            const { team, stats } = res.data;
            const inviteCode = (res.data && res.data.userInfo && res.data.userInfo.invite_code)
                || app.globalData.userInfo?.invite_code
                || '';
            if (inviteCode && app.globalData.userInfo) {
                app.globalData.userInfo.invite_code = inviteCode;
                try {
                    wx.setStorageSync('userInfo', { ...app.globalData.userInfo, invite_code: inviteCode });
                } catch (e) { /* ignore */ }
            }
            this.setData({
                inviteCode,
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
        return ROLE_NAMES[level] || '用户';
    },

    switchTab(e) {
        const tab = e.currentTarget.dataset.tab;
        if (tab === this.data.currentTab) return;
        this.setData({
            currentTab: tab,
            members: [],
            page: 1,
            hasMore: true
        }, () => { this.loadMembers(); });
    },

    onLoadMore() {
        if (this.data.hasMore) this.loadMembers(true);
    },

    onCopyCode() {
        const code = this.data.inviteCode;
        if (!code) { wx.showToast({ title: '暂无会员码', icon: 'none' }); return; }
        wx.setClipboardData({
            data: code,
            success: () => wx.showToast({ title: '会员码已复制', icon: 'success' })
        });
    },

    onShareAppMessage() {
        const code = this.data.inviteCode;
        const userInfo = app.globalData.userInfo;
        const brandName = app.globalData.brandName || '品牌臻选';
        return {
            title: `${userInfo?.nickname || '好友'} 邀请你加入${brandName}，领取专属优惠`,
            path: `/pages/index/index${code ? '?invite=' + code : ''}`,
            imageUrl: ''
        };
    },

    onBack() {
        wx.navigateBack();
    }
});
