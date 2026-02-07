// pages/distribution/center.js
const app = getApp();
const { get } = require('../../utils/request');

Page({
    data: {
        userInfo: null,
        stats: {
            totalEarnings: '0.00',
            availableAmount: '0.00',
            frozenAmount: '0.00'
        },
        team: {
            totalCount: 0
        }
    },

    onShow() {
        this.setData({ userInfo: app.globalData.userInfo });
        this.loadStats();
    },

    async loadStats() {
        try {
            const res = await get('/stats/distribution');
            if (res.code === 0) {
                this.setData({
                    stats: res.data.stats,
                    team: res.data.team
                });
            }
        } catch (err) {
            console.error('加载分销统计失败', err);
        }
    },

    onWithdrawTap() {
        wx.navigateTo({ url: '/pages/wallet/index' });
    },

    onTeamTap() {
        wx.showToast({ title: '团队列表开发中', icon: 'none' });
    },

    onOrderTap() {
        wx.showToast({ title: '没有相关订单', icon: 'none' });
    },

    onPosterTap() {
        wx.setClipboardData({
            data: this.data.userInfo.openid,
            success: () => {
                wx.showToast({ title: '邀请码已复制', icon: 'success' });
            }
        });
    }
});
