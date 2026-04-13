// pages/slash/detail.js - 砍价详情
const { get, post } = require('../../utils/request');
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

function formatHelperList(helpers = []) {
    return helpers.map((item) => ({
        ...item,
        user: item.user || item.helper || null,
        cut_amount: item.cut_amount ?? item.slash_amount ?? 0
    }));
}

Page({
    data: {
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        slashNo: null,
        detail: null,
        loading: true,
        sharing: false,
        helping: false,

        // 角色标记（从后端返回字段提取到顶层，方便 wxml 直接使用）
        isOwner: false,       // 当前用户是否是砍价发起人
        alreadyHelped: false, // 当前用户是否已帮砍
        helperFull: false,    // 帮砍名额是否已满
        myHelpAmount: '0.00', // 本人帮砍金额（若已帮砍）

        statusTextMap: {
            active: '进行中',
            success: '已到底价',
            expired: '已过期',
            purchased: '已购买'
        }
    },

    onLoad(options) {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44
        });
        if (options.slash_no) {
            this.setData({ slashNo: options.slash_no });
            this.loadDetail(options.slash_no);
        } else {
            wx.showToast({ title: '参数错误', icon: 'error' });
        }
    },

    onShow() {
        if (this.data.slashNo && !this.data.loading) {
            this.loadDetail(this.data.slashNo);
        }
    },

    async loadDetail(slashNo) {
        this.setData({ loading: true });
        try {
            const res = await get(`/slash/${slashNo}`);
            if (res.code === 0 && res.data) {
                const d = res.data;
                d.helpers = formatHelperList(d.helpers || []);
                // 计算砍价进度百分比
                const range = (d.original_price || 0) - (d.floor_price || 0);
                const cut = (d.original_price || 0) - (d.current_price || d.original_price);
                d._progressPct = range > 0 ? Math.min(100, Math.round(cut / range * 100)) : 0;
                const act = d.activity || {};
                const stockLimit = Number(act.stock_limit) || 0;
                const sold = Number(act.sold_count) || 0;
                d._stockRemain = Math.max(0, stockLimit - sold);
                d._soldPct = stockLimit > 0 ? Math.min(100, Math.round((sold / stockLimit) * 100)) : 0;
                d._soldCount = sold;
                d._maxHelpersText = act.max_helpers === -1 ? '不限人数' : `最多${act.max_helpers}人`;
                const minH = act.min_slash_per_helper != null ? act.min_slash_per_helper : '';
                const maxH = act.max_slash_per_helper != null ? act.max_slash_per_helper : '';
                d._slashRangeHint = minH !== '' && maxH !== '' ? `好友每次随机砍 ¥${minH} ~ ¥${maxH}` : '';
                d._productSummary = plainSummary(d.product?.description, 120);
                const origN = parseFloat(d.original_price) || 0;
                const curN = parseFloat(d.current_price) || 0;
                d._alreadySaved = origN > curN ? (origN - curN).toFixed(2) : '0.00';
                const floorN = parseFloat(d.floor_price) || 0;
                d._toFloor = curN > floorN ? (curN - floorN).toFixed(2) : '0.00';
                const rs = typeof d.remain_seconds === 'number' ? d.remain_seconds : null;
                const expireAt = d.expires_at || d.expire_at;
                if (rs != null && rs > 0) {
                    d._expired = false;
                    d._remainHours = Math.floor(rs / 3600);
                    d._remainMins = Math.floor((rs % 3600) / 60);
                    d._remainSecs = rs % 60;
                } else if (expireAt) {
                    const ms = new Date(expireAt) - Date.now();
                    d._expired = ms <= 0;
                    d._remainHours = ms > 0 ? Math.floor(ms / 3600000) : 0;
                    d._remainMins = ms > 0 ? Math.floor((ms % 3600000) / 60000) : 0;
                    d._remainSecs = 0;
                } else {
                    d._expired = false;
                    d._remainHours = 0;
                    d._remainMins = 0;
                    d._remainSecs = 0;
                }

                // 提取角色标记到顶层（供底部按钮判断用）
                const isOwner = !!d.is_owner;
                const alreadyHelped = !!d.already_helped;
                const helperFull = !!d.helper_full;
                // 找到本人帮砍金额
                let myHelpAmount = '0.00';
                if (alreadyHelped && Array.isArray(d.helpers)) {
                    const myHelp = d.helpers.find((h) => h.is_me || h.is_self);
                    if (myHelp && myHelp.cut_amount != null) {
                        myHelpAmount = parseFloat(myHelp.cut_amount).toFixed(2);
                    }
                }

                this.setData({ detail: d, loading: false, isOwner, alreadyHelped, helperFull, myHelpAmount });
            } else {
                wx.showToast({ title: res.message || '加载失败', icon: 'none' });
                this.setData({ loading: false });
            }
        } catch (e) {
            console.error('[slash/detail] loadDetail error:', e);
            wx.showToast({ title: e?.message || '网络错误', icon: 'none' });
            this.setData({ loading: false });
        }
    },

    // 帮砍（被邀请者点击"帮 TA 砍一刀"）
    async onHelp() {
        const { detail, helping, alreadyHelped } = this.data;
        if (!detail || helping) return;
        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        if (alreadyHelped) {
            wx.showToast({ title: '您已帮砍过了', icon: 'none' });
            return;
        }
        this.setData({ helping: true });
        wx.showLoading({ title: '帮砍中…', mask: true });
        try {
            const slashId = detail.id || detail._id || detail.slash_no;
            const res = await post(`/slash/${slashId}/help`, { slash_no: detail.slash_no });
            wx.hideLoading();
            if (res.code === 0) {
                const cutAmount = res.data && res.data.cut_amount != null
                    ? parseFloat(res.data.cut_amount).toFixed(2)
                    : '0.00';
                wx.showModal({
                    title: '帮砍成功！',
                    content: `您帮 TA 砍了 ¥${cutAmount}，继续邀请好友砍得更多！`,
                    showCancel: false,
                    confirmText: '好的'
                });
                // 刷新详情（获取最新价格和帮砍记录）
                this.loadDetail(this.data.slashNo);
            } else {
                wx.showToast({ title: res.message || '帮砍失败', icon: 'none' });
                this.setData({ helping: false });
            }
        } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: e?.message || '帮砍失败，请重试', icon: 'none' });
            this.setData({ helping: false });
        }
    },

    async onBuy() {
        const { detail, isOwner } = this.data;
        if (!detail) return;
        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        // 非发起人不能以砍价价格下单
        if (!isOwner) {
            wx.showToast({ title: '只有发起人才能以砍价价格购买', icon: 'none' });
            return;
        }
        if (detail.status === 'purchased') {
            wx.showToast({ title: '已购买该商品', icon: 'none' });
            return;
        }
        if (detail.status === 'expired' || detail._expired) {
            wx.showToast({ title: '砍价已过期', icon: 'none' });
            return;
        }
        if (!detail.product || !detail.product.id) return;

        const resolvedSkuId = resolvePreferredSkuId(detail);
        const buyInfo = {
            product_id: detail.product.id,
            category_id: detail.product.category_id || null,
            sku_id: resolvedSkuId,
            quantity: 1,
            price: parseFloat(detail.current_price),
            name: detail.product.name,
            image: (detail.product.images && detail.product.images[0]) || '',
            spec: resolvedSkuId ? '砍价·指定规格' : '砍价特惠',
            type: 'slash',
            slash_no: detail.slash_no,
            supports_pickup: detail.product.supports_pickup ? 1 : 0
        };
        wx.setStorageSync('directBuyInfo', buyInfo);
        wx.navigateTo({ url: '/pages/order/confirm?from=direct' });
    },

    onShareAppMessage() {
        const { detail } = this.data;
        if (!detail) return {};
        return {
            title: `帮我砍一刀！${detail.product?.name || '商品'}只差一点就到底价了`,
            path: `/pages/slash/detail?slash_no=${detail.slash_no}`,
            imageUrl: detail.product?.images?.[0] || ''
        };
    },

    onBack() {
        require('../../utils/navigator').safeBack('/pages/activity/activity');
    }
});
