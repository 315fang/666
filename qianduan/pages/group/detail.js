// pages/group/detail.js - 拼团详情
const { get } = require('../../utils/request');
const app = getApp();

Page({
    data: {
        statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
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
        if (options.group_no) {
            this.setData({ groupNo: options.group_no });
            this.loadDetail(options.group_no);
            // 带 share=1 参数时自动唤起分享菜单
            if (options.share === '1') {
                wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] });
            }
        } else {
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
                // 剩余时间
                if (d.expires_at) {
                    const ms = new Date(d.expires_at) - Date.now();
                    d._expired = ms <= 0;
                    d._remainHours = ms > 0 ? Math.floor(ms / 3600000) : 0;
                    d._remainMins = ms > 0 ? Math.floor((ms % 3600000) / 60000) : 0;
                }
                // 成员进度
                const cur = d.current_members || 0;
                const min = d.min_members || 2;
                d._progressPct = Math.min(100, Math.round(cur / min * 100));
                d._needMore = Math.max(0, min - cur);
                // 判断当前用户是否是发起人
                const myId = app.globalData.userInfo?.id;
                d._isOwner = d.members && d.members.some(m => m.is_owner && m.user_id === myId);
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
        if (detail.product && detail.product.id) {
            wx.navigateTo({ url: `/pages/product/detail?id=${detail.product.id}&group_no=${detail.group_no}` });
        }
    },

    onShare() {
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] });
        wx.showToast({ title: '点右上角分享给好友', icon: 'none' });
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

    onBack() {
        wx.navigateBack();
    }
});
