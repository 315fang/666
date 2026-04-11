// pages/group/list.js
const { get } = require('../../utils/request');
const { normalizeActivityList } = require('../../utils/activityList');
const { requireLogin } = require('../../utils/auth');
const app = getApp();
const PRODUCT_PLACEHOLDER = '/assets/icons/package.svg';

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

function getActivityList(res) {
    if (!res || res.code !== 0) return [];
    return normalizeActivityList(res.list || res.data || res);
}

function buildGroupBuyInfo(activity = {}) {
    const product = activity.product || {};
    const price = parseFloat(activity.group_price || activity.price || product.retail_price || product.price || 0);
    return {
        product_id: product.id || product._id || activity.product_id,
        category_id: product.category_id || null,
        sku_id: activity.sku_id || null,
        quantity: 1,
        price,
        name: product.name || activity.name || '拼团商品',
        image: (product.images && product.images[0]) || product.image || '',
        spec: activity.sku_id ? '拼团·指定规格' : '拼团特惠',
        type: 'group',
        group_activity_id: activity._id || activity.id,
        supports_pickup: product.supports_pickup ? 1 : 0
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

    onLoad(options = {}) {
        const initialTab = options.tab === 'my' ? 'my' : 'activities';
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44,
            tab: initialTab
        });
        this.checkMemberStatus();
        this.loadData(initialTab);
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
        if (tab === 'my' && !requireLogin(null, '登录后查看我的拼团')) return;
        this.setData({ tab, loading: true });
        this.loadData(tab);
    },

    async loadData(tab) {
        const active = tab || this.data.tab;
        if (active === 'activities') {
            try {
                const res = await get('/group/activities');
                const raw = getActivityList(res);
                this.setData({ activities: raw.map(enrichGroupActivity), loading: false });
            } catch { this.setData({ loading: false }); }
        } else {
            if (!app.globalData.isLoggedIn) return this.setData({ myGroups: [], loading: false });
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
        wx.setStorageSync('directBuyInfo', buildGroupBuyInfo(activity));
        wx.navigateTo({ url: '/pages/order/confirm?from=direct' });
    },

    onViewGroup(e) {
        const groupNo = e.currentTarget.dataset.no;
        if (!groupNo) {
            wx.showToast({ title: '支付成功后可在订单中查看拼团进度', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: `/pages/group/detail?group_no=${groupNo}` });
    },

    onGoMyGroups() {
        if (!requireLogin(null, '登录后查看我的拼团')) return;
        this.setData({ tab: 'my', loading: true });
        this.loadData('my');
    },

    onGoActivities() {
        this.setData({ tab: 'activities', loading: true });
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

    onShare(e) {
        const groupNo = e.currentTarget.dataset.no;
        if (!groupNo) {
            wx.showToast({ title: '支付成功后再分享拼团', icon: 'none' });
            return;
        }
        // 让微信处理分享，detail 页面会实现 onShareAppMessage
        wx.navigateTo({ url: `/pages/group/detail?group_no=${groupNo}&share=1` });
    },

    onBack() { wx.switchTab({ url: '/pages/activity/activity' }); }
});
