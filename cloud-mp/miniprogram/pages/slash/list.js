// pages/slash/list.js
const { get, post } = require('../../utils/request');
const { normalizeActivityList } = require('../../utils/activityList');
const { requireLogin } = require('../../utils/auth');
const { resolveSlashResumePayload } = require('../../utils/activityResume');
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

function extractListData(res) {
    if (Array.isArray(res && res.list)) return res.list;
    if (Array.isArray(res && res.data)) return res.data;
    if (res && res.data && Array.isArray(res.data.list)) return res.data.list;
    return [];
}

function normalizeUserMessage(message, fallback) {
    const text = message ? String(message).trim() : '';
    if (!text || text === 'ok') return fallback;
    return text;
}

function normalizeSlashRecord(record) {
    if (!record) return record;
    const currentPrice = parseFloat(record.current_price);
    const floorPrice = parseFloat(record.floor_price);
    let status = record.status || 'active';
    if (status === 'completed') status = 'success';
    if (Number.isFinite(currentPrice) && Number.isFinite(floorPrice) && floorPrice > 0 && currentPrice <= floorPrice) {
        status = 'success';
    }
    return { ...record, status };
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

    onLoad(options = {}) {
        const initialTab = options.tab === 'my' ? 'my' : 'activities';
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44,
            activeTab: initialTab
        });
        this.loadData(initialTab);
    },
    onShow() { this.loadData(); },

    switchTab(e) {
        const tab = e.currentTarget.dataset.tab;
        if (tab === 'my' && !requireLogin(null, '登录后查看我的砍价')) return;
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
            if (!app.globalData.isLoggedIn) { this.setData({ myRecords: [], loading: false }); return; }
            try {
                const res = await get('/slash/my/list', { page: 1, pageSize: 20 });
                const records = extractListData(res).map(normalizeSlashRecord);
                this.setData({ myRecords: records, loading: false });
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
            const resume = resolveSlashResumePayload(res);
            if ((res.code === 0 || res.code === 1) && resume.resumable) {
                wx.navigateTo({ url: `/pages/slash/detail?slash_no=${resume.slashNo}` });
                return;
            }
            if (res.code === 0 || res.code === 1) {
                wx.showToast({ title: normalizeUserMessage(res.message, '砍价已发起，可前往“我的砍价”查看'), icon: 'none' });
                setTimeout(() => this.onGoMySlash(), 500);
                return;
            }
            wx.showToast({ title: normalizeUserMessage(res.message, '发起砍价失败'), icon: 'none' });
        } catch (e) {
            const message = e && e.message ? String(e.message) : '';
            if (message.includes('已发起过砍价')) {
                wx.showToast({ title: '该砍价已发起，正在为你打开', icon: 'none' });
                setTimeout(() => this.onGoMySlash(), 500);
                return;
            }
            wx.showToast({ title: normalizeUserMessage(message, '网络异常，请稍后重试'), icon: 'none' });
        }
    },

    onViewRecord(e) {
        const slashNo = e.currentTarget.dataset.no;
        if (!slashNo) {
            wx.showToast({ title: '缺少砍价编号', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: `/pages/slash/detail?slash_no=${slashNo}` });
    },

    onGoMySlash() {
        if (!requireLogin(null, '登录后查看我的砍价')) return;
        this.setData({ activeTab: 'my', loading: true });
        this.loadData('my');
    },

    onGoActivities() {
        this.setData({ activeTab: 'activities', loading: true });
        this.loadData('activities');
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
