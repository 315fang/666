// pages/slash/list.js
const { get, post } = require('../../utils/request');
const app = getApp();

Page({
    data: {
        statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
        activeTab: 'activities',
        activities: [],
        myRecords: [],
        loading: true
    },

    onLoad() { this.loadData(); },
    onShow() { this.loadData(); },

    switchTab(e) {
        const tab = e.currentTarget.dataset.tab;
        this.setData({ activeTab: tab, loading: true });
        this.loadData(tab);
    },

    async loadData(tab) {
        const active = tab || this.data.activeTab;
        if (active === 'activities') {
            try {
                const res = await get('/slash/activities');
                this.setData({ activities: res.code === 0 ? res.data : [], loading: false });
            } catch { this.setData({ loading: false }); }
        } else {
            if (!app.globalData.isLoggedIn) { this.setData({ loading: false }); return; }
            try {
                const res = await get('/slash/my/list');
                this.setData({ myRecords: res.code === 0 ? res.data : [], loading: false });
            } catch { this.setData({ loading: false }); }
        }
    },

    async onStartSlash(e) {
        const activity = e.currentTarget.dataset.activity;
        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        try {
            const res = await post('/slash/start', { activity_id: activity.id });
            if (res.code === 0 || res.code === 1) {
                const slashNo = res.data?.slash_no;
                wx.navigateTo({ url: `/pages/slash/detail?slash_no=${slashNo}` });
            } else {
                wx.showToast({ title: res.message || '发起失败', icon: 'none' });
            }
        } catch {
            wx.showToast({ title: '网络错误', icon: 'none' });
        }
    },

    onViewRecord(e) {
        const slashNo = e.currentTarget.dataset.no;
        wx.navigateTo({ url: `/pages/slash/detail?slash_no=${slashNo}` });
    },

    onBack() { wx.switchTab({ url: '/pages/activity/activity' }); }
});
