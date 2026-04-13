// pages/group/detail.js - 拼团详情
const { get } = require('../../utils/request');
const app = getApp();

function resolvePreferredSkuId(detail) {
    if (!detail) return null;
    const activitySkuId = detail.activity && detail.activity.sku_id != null && detail.activity.sku_id !== ''
        ? detail.activity.sku_id
        : null;
    if (activitySkuId != null) return activitySkuId;
    if (detail.sku_id != null && detail.sku_id !== '') return detail.sku_id;
    if (detail.product && detail.product.sku_id != null && detail.product.sku_id !== '') return detail.product.sku_id;
    const skus = detail.product && Array.isArray(detail.product.skus) ? detail.product.skus : [];
    if (skus.length === 1) {
        return skus[0]._id || skus[0].id || null;
    }
    return null;
}

function plainSummary(html, maxLen = 96) {
    if (!html) return '';
    const t = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

Page({
    data: {
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        groupNo: null,
        detail: null,
        loading: true,

        statusTextMap: {
            open: '拼团中',
            success: '已成团',
            fail: '拼团失败',
            cancelled: '已取消'
        }
    },

    onLoad(options) {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44
        });
        if (options.group_no) {
            this.setData({ groupNo: options.group_no });
            this.loadDetail(options.group_no);
            // 带 share=1 参数时自动唤起分享菜单
            if (options.share === '1') {
                wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] });
            }
        } else {
            this.setData({ loading: false });
            wx.showToast({ title: '参数错误', icon: 'error' });
        }
    },

    onShow() {
        if (this.data.groupNo && !this.data.loading) {
            this.loadDetail(this.data.groupNo);
        }
    },

    async loadDetail(groupNo) {
        this.setData({ loading: true });
        try {
            const res = await get(`/group/orders/${groupNo}`);
            if (res.code === 0 && res.data) {
                const d = res.data;
                // 成员进度
                const cur = d.current_members || 0;
                const min = d.min_members || 2;
                d._progressPct = Math.min(100, Math.round(cur / min * 100));
                d._needMore = Math.max(0, min - cur);
                const act = d.activity || {};
                const stockLimit = Number(act.stock_limit) || 0;
                const sold = Number(act.sold_count) || 0;
                d._stockRemain = Math.max(0, stockLimit - sold);
                d._soldPct = stockLimit > 0 ? Math.min(100, Math.round((sold / stockLimit) * 100)) : 0;
                d._soldCount = sold;
                const gp = parseFloat(d.group_price) || 0;
                const listP = parseFloat(act.original_price) || parseFloat(d.product?.retail_price) || 0;
                d._listPriceVal = listP > 0
                    ? listP.toFixed(2)
                    : (d.product && d.product.retail_price != null && d.product.retail_price !== ''
                        ? String(d.product.retail_price)
                        : '');
                d._savePerUnit = listP > gp ? (listP - gp).toFixed(2) : '0.00';
                d._saveNum = listP > gp ? +(listP - gp).toFixed(2) : 0;
                d._maxCap = d.max_members || act.max_members || 10;
                d._expireHours = act.expire_hours || 24;
                d._productSummary = plainSummary(d.product?.description, 120);
                const rs = typeof d.remain_seconds === 'number' ? d.remain_seconds : null;
                const exp = d.expire_at || d.expires_at;
                if (rs != null && rs > 0) {
                    d._expired = false;
                    d._remainHours = Math.floor(rs / 3600);
                    d._remainMins = Math.floor((rs % 3600) / 60);
                } else if (exp) {
                    const ms = new Date(exp) - Date.now();
                    d._expired = ms <= 0;
                    d._remainHours = ms > 0 ? Math.floor(ms / 3600000) : 0;
                    d._remainMins = ms > 0 ? Math.floor((ms % 3600000) / 60000) : 0;
                } else {
                    d._expired = false;
                    d._remainHours = 0;
                    d._remainMins = 0;
                }
                const myOpenid = app.globalData.userInfo?.openid || app.globalData.openid;
                d._isOwner = d.is_leader === true;
                if (d.members && myOpenid) {
                    d.members = d.members.map(m => ({
                        ...m,
                        is_me: m.openid === myOpenid
                    }));
                }
                this.setData({ detail: d, loading: false });
            } else {
                wx.showToast({ title: res.message || '加载失败', icon: 'none' });
                this.setData({ loading: false });
            }
        } catch (e) {
            console.error('[group/detail] loadDetail error:', e);
            wx.showToast({ title: '网络错误', icon: 'none' });
            this.setData({ loading: false });
        }
    },

    onJoin() {
        const { detail } = this.data;
        if (!detail) return;
        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        if (detail.status === 'fail' || detail.status === 'cancelled') {
            wx.showToast({ title: '拼团已结束', icon: 'none' });
            return;
        }
        if (!detail.product || !detail.product.id) return;

        const actSku = resolvePreferredSkuId(detail);
        const buyInfo = {
            product_id: detail.product.id,
            category_id: detail.product.category_id || null,
            sku_id: actSku,
            quantity: 1,
            price: parseFloat(detail.group_price),
            name: detail.product.name,
            image: (detail.product.images && detail.product.images[0]) || '',
            spec: actSku ? '拼团·指定规格' : '拼团特惠',
            type: 'group',
            group_no: detail.group_no,
            group_activity_id: detail.activity && (detail.activity._id || detail.activity.id),
            supports_pickup: detail.product.supports_pickup ? 1 : 0
        };
        wx.setStorageSync('directBuyInfo', buyInfo);
        wx.navigateTo({ url: '/pages/order/confirm?from=direct' });
    },

    onShareAppMessage() {
        const { detail } = this.data;
        if (!detail) return {};
        const need = detail._needMore || 0;
        return {
            title: `还差${need}人成团！${detail.product?.name || '商品'}拼团价¥${detail.group_price}`,
            path: `/pages/group/detail?group_no=${detail.group_no}`,
            imageUrl: detail.product?.images?.[0] || ''
        };
    },

    onGoMyOrder() {
        const d = this.data.detail;
        const orderId = d && (d.my_order_id || d.my_order_no);
        if (orderId) {
            wx.navigateTo({ url: `/pages/order/detail?id=${orderId}` });
        }
    },

    onGoPayMyOrder() {
        const d = this.data.detail;
        const orderId = d && (d.my_order_id || d.my_order_no);
        if (orderId) {
            wx.navigateTo({ url: `/pages/order/detail?id=${orderId}` });
        } else {
            wx.showToast({ title: '订单信息缺失', icon: 'none' });
        }
    },

    onBack() {
        require('../../utils/navigator').safeBack('/pages/activity/activity');
    }
});
