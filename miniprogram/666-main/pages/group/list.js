// pages/group/list.js
const { get, post } = require('../../utils/request');
const app = getApp();

Page({
    data: {
        statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
        tab: 'activities',
        activities: [],
        myGroups: [],
        loading: true,
        isMember: false,
        showMemberTip: false
    },

    onLoad() { this.checkMemberStatus(); this.loadData(); },
    onShow() { this.loadData(); },

    checkMemberStatus() {
        const user = app.globalData.userInfo;
        const isMember = user && user.role_level >= 1;
        const showMemberTip = app.globalData.isLoggedIn && !isMember;
        this.setData({ isMember, showMemberTip });
    },

    switchTab(e) {
        const tab = e.currentTarget.dataset.tab;
        this.setData({ tab, loading: true });
        this.loadData(tab);
    },

    async loadData(tab) {
        const active = tab || this.data.tab;
        if (active === 'activities') {
            try {
                const res = await get('/group/activities');
                this.setData({ activities: res.code === 0 ? res.data : [], loading: false });
            } catch { this.setData({ loading: false }); }
        } else {
            if (!app.globalData.isLoggedIn) return this.setData({ loading: false });
            try {
                const res = await get('/group/my');
                this.setData({ myGroups: res.code === 0 ? res.data : [], loading: false });
            } catch { this.setData({ loading: false }); }
        }
    },

    async onStartGroup(e) {
        const activity = e.currentTarget.dataset.activity;
        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        if (!this.data.isMember) {
            wx.showModal({
                title: '需要会员身份',
                content: '发起拼团需要会员身份，完成首单消费即可升级。',
                confirmText: '去购物',
                success: (res) => {
                    if (res.confirm) wx.switchTab({ url: '/pages/category/category' });
                }
            });
            return;
        }
        try {
            const res = await post('/group/orders', { activity_id: activity.id });
            if (res.code === 0 || res.code === 1) {
                const groupNo = res.data?.group_no;
                wx.navigateTo({ url: `/pages/group/detail?group_no=${groupNo}` });
            } else {
                wx.showToast({ title: res.message || '发起失败', icon: 'none' });
            }
        } catch {
            wx.showToast({ title: '网络错误', icon: 'none' });
        }
    },

    onViewGroup(e) {
        const groupNo = e.currentTarget.dataset.no;
        if (!groupNo) return;
        wx.navigateTo({ url: `/pages/group/detail?group_no=${groupNo}` });
    },

    onShare(e) {
        const groupNo = e.currentTarget.dataset.no;
        // 让微信处理分享，detail 页面会实现 onShareAppMessage
        wx.navigateTo({ url: `/pages/group/detail?group_no=${groupNo}&share=1` });
    },

    onBack() { wx.switchTab({ url: '/pages/activity/activity' }); }
});
