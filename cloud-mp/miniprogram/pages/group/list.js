// pages/group/list.js
const { get, post } = require('../../utils/request');
const { normalizeActivityList } = require('../../utils/activityList');
const app = getApp();

function plainSummary(html, maxLen = 44) {
    if (!html) return '';
    const t = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

function enrichGroupActivity(a) {
    if (!a) return a;
    const stockLimit = Number(a.stock_limit) || 0;
    const sold = Number(a.sold_count) || 0;
    const remain = Math.max(0, stockLimit - sold);
    const soldPct = stockLimit > 0 ? Math.min(100, Math.round((sold / stockLimit) * 100)) : 0;
    const gp = parseFloat(a.group_price) || 0;
    const p = a.product || {};
    const line = parseFloat(a.original_price) || parseFloat(p.retail_price) || 0;
    const saveNum = line > gp ? +(line - gp).toFixed(2) : 0;
    return {
        ...a,
        _summary: plainSummary(p.description, 46),
        _stockRemain: remain,
        _soldPct: soldPct,
        _soldCount: sold,
        _linePrice: line > 0 ? line.toFixed(2) : '',
        _saveNum: saveNum,
        _saveYuan: saveNum > 0 ? saveNum.toFixed(2) : '0.00',
        _maxCap: a.max_members || 10
    };
}

Page({
    data: {
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        tab: 'activities',
        activities: [],
        myGroups: [],
        loading: true,
        isMember: false,
        showMemberTip: false
    },

    onLoad() {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44
        });
        this.checkMemberStatus();
        this.loadData();
    },
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
                const raw = res.code === 0 ? normalizeActivityList(res.data) : [];
                this.setData({ activities: raw.map(enrichGroupActivity), loading: false });
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
            const payload = { activity_id: activity.id };
            if (activity.sku_id != null && activity.sku_id !== '') {
                payload.sku_id = activity.sku_id;
            }
            const res = await post('/group/orders', payload);
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
