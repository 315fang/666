// pages/slash/list.js
const { get, post } = require('../../utils/request');
const { normalizeActivityList } = require('../../utils/activityList');
const app = getApp();
const PRODUCT_PLACEHOLDER = '/assets/icons/package.svg';

function plainSummary(html, maxLen = 44) {
    if (!html) return '';
    const t = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

function enrichSlashActivity(a) {
    if (!a) return a;
    const stockLimit = Number(a.stock_limit) || 0;
    const sold = Number(a.sold_count) || 0;
    const remain = Math.max(0, stockLimit - sold);
    const soldPct = stockLimit > 0 ? Math.min(100, Math.round((sold / stockLimit) * 100)) : 0;
    const orig = parseFloat(a.original_price) || 0;
    const floor = parseFloat(a.floor_price) || 0;
    const saveNum = orig > floor ? +(orig - floor).toFixed(2) : 0;
    const p = a.product || {};
    const retail = parseFloat(p.retail_price) || 0;
    return {
        ...a,
        _summary: plainSummary(p.description, 46),
        _stockRemain: remain,
        _soldPct: soldPct,
        _soldCount: sold,
        _saveNum: saveNum,
        _saveYuan: saveNum > 0 ? saveNum.toFixed(2) : '0.00',
        _retailHint: retail > 0 && Math.abs(retail - orig) > 0.01 ? retail.toFixed(2) : ''
    };
}

function getActivityList(res) {
    if (!res || res.code !== 0) return [];
    return normalizeActivityList(res.list || res.data || res);
}

Page({
    data: {
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        activeTab: 'activities',
        activities: [],
        myRecords: [],
        loading: true
    },

    onLoad() {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44
        });
        this.loadData();
    },
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
                const raw = getActivityList(res);
                this.setData({ activities: raw.map(enrichSlashActivity), loading: false });
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
                if (!slashNo) {
                    wx.showToast({ title: '活动数据异常', icon: 'none' });
                    return;
                }
                wx.navigateTo({ url: `/pages/slash/detail?slash_no=${slashNo}` });
            } else {
                wx.showToast({ title: res.message || '发起失败', icon: 'none' });
            }
        } catch (e) {
            wx.showToast({ title: e?.message || '网络错误', icon: 'none' });
        }
    },

    onViewRecord(e) {
        const slashNo = e.currentTarget.dataset.no;
        wx.navigateTo({ url: `/pages/slash/detail?slash_no=${slashNo}` });
    },

    onActivityImageError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const activities = Array.isArray(this.data.activities) ? this.data.activities.slice() : [];
        if (!activities[index]) return;
        const product = {
            ...(activities[index].product || {}),
            images: [PRODUCT_PLACEHOLDER],
            image: PRODUCT_PLACEHOLDER
        };
        activities[index] = {
            ...activities[index],
            product
        };
        this.setData({ activities });
    },

    onBack() { wx.switchTab({ url: '/pages/activity/activity' }); }
});
