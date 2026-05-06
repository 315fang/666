// pages/group/list.js
const { get, post } = require('../../utils/request');
const { normalizeActivityList } = require('./utils/activityList');
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

function getPagedList(res) {
    if (Array.isArray(res && res.list)) return res.list;
    if (Array.isArray(res && res.data)) return res.data;
    if (res && res.data && Array.isArray(res.data.list)) return res.data.list;
    return [];
}

function normalizeActivityId(value) {
    return value == null ? '' : String(value).trim();
}

function applyActivityFocus(list = [], activityId = '') {
    const focusId = normalizeActivityId(activityId);
    if (!focusId) return { list, focused: false };
    const matched = list.filter((item) => normalizeActivityId(item.id || item._id) === focusId);
    return matched.length ? { list: matched, focused: true } : { list, focused: false };
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
        supports_pickup: product.supports_pickup ? 1 : 0,
        allow_coupon: 0,
        allow_points: 0
    };
}

function normalizeMyGroupItem(item = {}) {
    const paymentStatus = item.payment_status || 'paid';
    const groupOrder = item.groupOrder || {};
    const minMembers = Number(groupOrder.min_members || item.group_size || 2) || 2;
    const rawCurrentMembers = Number(groupOrder.current_members || item.member_count || 0) || 0;
    const currentMembers = paymentStatus === 'unpaid'
        ? 0
        : Math.max(1, rawCurrentMembers);
    const rawStatus = groupOrder.status || '';
    const normalizedStatus = rawStatus || (paymentStatus === 'unpaid' ? 'unpaid' : 'open');

    return {
        ...item,
        _memberCurrent: currentMembers,
        _memberMin: minMembers,
        _memberText: `${currentMembers}/${minMembers}人`,
        groupOrder: {
            ...groupOrder,
            status: normalizedStatus,
            current_members: currentMembers,
            min_members: minMembers
        }
    };
}

Page({
    data: {
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        tab: 'activities',
        focusActivityId: '',
        focusApplied: false,
        activities: [],
        myGroups: [],
        loading: true
    },

    onLoad(options = {}) {
        const initialTab = options.tab === 'my' ? 'my' : 'activities';
        const focusActivityId = normalizeActivityId(options.activity_id);
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44,
            tab: initialTab,
            focusActivityId
        });
        this.loadData(initialTab);
    },
    onShow() { this.loadData(); },

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
                const enriched = raw.map(enrichGroupActivity);
                const focused = applyActivityFocus(enriched, this.data.focusActivityId);
                this.setData({ activities: focused.list, focusApplied: focused.focused, loading: false });
            } catch { this.setData({ loading: false }); }
        } else {
            if (!app.globalData.isLoggedIn) return this.setData({ myGroups: [], loading: false });
            try {
                const res = await get('/group/my', { page: 1, pageSize: 20 });
                this.setData({
                    myGroups: getPagedList(res).map(normalizeMyGroupItem),
                    loading: false
                });
            } catch { this.setData({ loading: false }); }
        }
    },

    async onStartGroup(e) {
        const activity = e.currentTarget.dataset.activity;
        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.setStorageSync('directBuyInfo', buildGroupBuyInfo(activity));
        wx.navigateTo({ url: '/pages/order/confirm?from=direct' });
    },

    async ensureGroupNoForItem(orderId) {
        if (!orderId) return '';
        try {
            const res = await post(`/orders/${encodeURIComponent(orderId)}/retry-group-join`);
            return res && res.data && res.data.group_no ? res.data.group_no : '';
        } catch (_) {
            return '';
        }
    },

    async onViewGroup(e) {
        const groupNo = e.currentTarget.dataset.no;
        const orderId = e.currentTarget.dataset.orderId;
        const paymentStatus = e.currentTarget.dataset.paymentStatus;
        let targetGroupNo = groupNo;
        if (!targetGroupNo && paymentStatus === 'paid') {
            wx.showLoading({ title: '正在同步拼团...' });
            targetGroupNo = await this.ensureGroupNoForItem(orderId);
            wx.hideLoading();
        }
        if (!targetGroupNo) {
            wx.showToast({ title: paymentStatus === 'paid' ? '拼团记录生成中，请稍后重试' : '支付后可在订单中查看拼团', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: `/pages/group/detail?group_no=${targetGroupNo}` });
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

    onClearActivityFocus() {
        this.setData({ focusActivityId: '', focusApplied: false, tab: 'activities', loading: true });
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

    async onShare(e) {
        const groupNo = e.currentTarget.dataset.no;
        const orderId = e.currentTarget.dataset.orderId;
        const paymentStatus = e.currentTarget.dataset.paymentStatus;
        let targetGroupNo = groupNo;
        if (!targetGroupNo && paymentStatus === 'paid') {
            wx.showLoading({ title: '正在同步拼团...' });
            targetGroupNo = await this.ensureGroupNoForItem(orderId);
            wx.hideLoading();
        }
        if (!targetGroupNo) {
            wx.showToast({ title: paymentStatus === 'paid' ? '拼团记录生成中，请稍后再分享' : '支付后再分享拼团', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: `/pages/group/detail?group_no=${targetGroupNo}&share=1` });
    },

    onGoPayOrder(e) {
        const orderId = e.currentTarget.dataset.orderId || e.currentTarget.dataset.orderNo;
        if (!orderId) {
            wx.showToast({ title: '订单信息缺失', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: `/pages/order/detail?id=${orderId}` });
    },

    async onCancelUnpaidOrder(e) {
        const orderId = e.currentTarget.dataset.orderId;
        if (!orderId) return;
        const res = await new Promise(resolve => {
            wx.showModal({
                title: '取消拼团订单',
                content: '确定取消该拼团订单吗？',
                confirmText: '确定取消',
                confirmColor: '#e53e3e',
                success: resolve
            });
        });
        if (!res.confirm) return;
        try {
            await post(`/orders/${encodeURIComponent(orderId)}/cancel`);
            wx.showToast({ title: '已取消', icon: 'success' });
            this.loadData('my');
        } catch (err) {
            wx.showToast({ title: err.message || '取消失败', icon: 'none' });
        }
    },

    onBack() { wx.switchTab({ url: '/pages/activity/activity' }); }
});
