// pages/user/user.js - 个人中心（全面升级版）
const app = getApp();
const { get, put } = require('../../utils/request');
const { ErrorHandler } = require('../../utils/errorHandler');
const globalStore = require('../../store/index');
const { formatMoney } = require('../../utils/dataFormatter');

Page({
    data: {
        userInfo: null,
        isLoggedIn: false,
        orderCounts: {
            pending: 0,
            paid: 0,
            shipped: 0,
            refund: 0
        },
        distributionInfo: {
            totalEarnings: '0.00',
            availableAmount: '0.00',
            referee_count: 0,
            role_level: 0,
            role_name: '普通用户'
        },
        notificationsCount: 0,
        showNicknameModal: false,
        newNickname: ''
    },

    onShow() {
        this.loadUserInfo();
    },

    // 从服务端加载用户最新信息
    async loadUserInfo() {
        const isLoggedIn = app.globalData.isLoggedIn;
        this.setData({ isLoggedIn });

        if (!isLoggedIn) {
            this.setData({ userInfo: app.globalData.userInfo });
            return;
        }

        try {
            const res = await get('/user/profile');
            if (res.code === 0 && res.data) {
                const info = res.data;
                this.setData({ userInfo: info });
                app.globalData.userInfo = info;
                wx.setStorageSync('userInfo', info);
            } else {
                this.setData({ userInfo: app.globalData.userInfo });
            }
        } catch (err) {
            ErrorHandler.handle(err, {
                customMessage: '加载用户信息失败',
                showToast: false
            });
            this.setData({ userInfo: app.globalData.userInfo });
        }

        // 并行加载所有数据
        this.loadOrderCounts();
        this.loadDistributionInfo();
        this.loadNotificationsCount();
    },

    // ====== 订单数量（含退款） ======
    async loadOrderCounts() {
        try {
            const results = await Promise.all([
                get('/orders', { status: 'pending', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } })),
                get('/orders', { status: 'paid', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } })),
                get('/orders', { status: 'shipped', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } })),
                get('/orders', { status: 'refunded', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } }))
            ]);
            this.setData({
                'orderCounts.pending': (results[0].data && results[0].data.pagination && results[0].data.pagination.total) || 0,
                'orderCounts.paid': (results[1].data && results[1].data.pagination && results[1].data.pagination.total) || 0,
                'orderCounts.shipped': (results[2].data && results[2].data.pagination && results[2].data.pagination.total) || 0,
                'orderCounts.refund': (results[3].data && results[3].data.pagination && results[3].data.pagination.total) || 0
            });
        } catch (err) {
            console.error('加载订单数量失败:', err);
        }
    },

    // ====== 分销信息 ======
    async loadDistributionInfo() {
        try {
            const res = await get('/distribution/overview');
            if (res.code === 0 && res.data) {
                const d = res.data;
                const roleNames = { 0: '普通用户', 1: '会员', 2: '团长', 3: '代理商' };
                this.setData({
                    distributionInfo: {
                        totalEarnings: d.stats ? d.stats.totalEarnings : '0.00',
                        availableAmount: d.stats ? d.stats.availableAmount : '0.00',
                        referee_count: d.team ? d.team.totalCount : 0,
                        role_level: d.userInfo ? d.userInfo.role : 0,
                        role_name: d.userInfo ? (d.userInfo.role_name || roleNames[d.userInfo.role]) : '普通用户'
                    }
                });
            }
        } catch (err) {
            console.error('加载分销信息失败:', err);
        }
    },

    // ====== ★ 通知未读数 ======
    async loadNotificationsCount() {
        try {
            const res = await get('/notifications', { page: 1, limit: 1 });
            if (res.code === 0 && res.data) {
                const unreadCount = res.data.unread_count || 0;
                this.setData({ notificationsCount: unreadCount });
            }
        } catch (err) {
            console.error('加载通知计数失败:', err);
        }
    },

    // ======== 登录 ========
    async onLogin() {
        try {
            wx.showLoading({ title: '登录中...' });
            // 传入 withProfile=true 以获取微信头像和昵称
            await app.wxLogin(null, true);
            wx.hideLoading();
            this.loadUserInfo();
            wx.showToast({ title: '登录成功', icon: 'success' });
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '登录失败', icon: 'none' });
        }
    },

    // ======== 修改昵称 ========
    onEditNickname() {
        this.setData({
            showNicknameModal: true,
            newNickname: this.data.userInfo ? this.data.userInfo.nickname : ''
        });
    },

    onNicknameInput(e) {
        this.setData({ newNickname: e.detail.value });
    },

    onCancelNickname() {
        this.setData({ showNicknameModal: false });
    },

    preventTap() {
        // 阻止冒泡
    },

    async onConfirmNickname() {
        const nickname = this.data.newNickname.trim();
        if (!nickname) {
            wx.showToast({ title: '昵称不能为空', icon: 'none' });
            return;
        }
        try {
            const res = await put('/user/profile', { nickname });
            if (res.code === 0) {
                wx.showToast({ title: '修改成功', icon: 'success' });
                this.setData({ showNicknameModal: false });
                this.loadUserInfo();
            } else {
                wx.showToast({ title: res.message || '修改失败', icon: 'none' });
            }
        } catch (err) {
            wx.showToast({ title: '修改失败', icon: 'none' });
        }
    },

    // ======== ★ 佣金明细（点击累计佣金跳转） ========
    onCommissionTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/distribution/center?tab=logs' });
    },

    // ======== ★ 钱包/提现 ========
    onWalletTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/wallet/index' });
    },

    // ======== ★ 团队 ========
    onTeamTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/distribution/team' });
    },

    // ======== 订单入口 ========
    onOrderAllTap() {
        wx.navigateTo({ url: '/pages/order/list' });
    },

    onOrderTap(e) {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        const status = e.currentTarget.dataset.status;
        wx.navigateTo({ url: '/pages/order/list?status=' + status });
    },

    // ======== ★ 售后/退款入口 ========
    onRefundTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/order/refund-list' });
    },

    // ======== 通知入口 ========
    onNotificationsTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/user/notifications' });
    },

    // ======== 设置 ========
    onSettingsTap() {
        wx.showActionSheet({
            itemList: ['清除缓存', '意见反馈'],
            success: (res) => {
                if (res.tapIndex === 0) {
                    wx.clearStorageSync();
                    wx.showToast({ title: '缓存已清除', icon: 'success' });
                }
            }
        });
    },

    // ======== 关于 ========
    onAboutTap() {
        wx.showModal({
            title: '关于臻选',
            content: '臻选 v1.0.0\n精选全球好物，让分享更有价值。\n\n客服微信：zhenxuan_service',
            showCancel: false
        });
    },

    // ======== 联系客服 ========
    onContactTap() {
        wx.showModal({
            title: '联系客服',
            content: '客服微信：zhenxuan_service\n\n工作时间：9:00-21:00\n\n如有问题，请添加客服微信，我们将尽快为您处理。',
            confirmText: '复制微信号',
            success: (res) => {
                if (res.confirm) {
                    wx.setClipboardData({
                        data: 'zhenxuan_service',
                        success: () => {
                            wx.showToast({ title: '微信号已复制', icon: 'success' });
                        }
                    });
                }
            }
        });
    },

    // ======== 菜单入口 ========
    onMenuTap(e) {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        const url = e.currentTarget.dataset.url;
        if (url) {
            wx.navigateTo({ url: url });
        } else {
            wx.showToast({ title: '即将开放', icon: 'none' });
        }
    },

    // ======== 复制邀请码 ========
    onCopyInviteCode() {
        const userInfo = this.data.userInfo;
        const code = userInfo ? userInfo.invite_code : '';
        if (!code) {
            wx.showToast({ title: '暂无邀请码', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: code,
            success: () => {
                wx.showToast({ title: '邀请码已复制', icon: 'success' });
            }
        });
    },

    // ======== ★ 分享邀请 ========
    onShareTap() {
        // 触发转发分享
    },

    // ======== 退出登录 ========
    onLogout() {
        wx.showModal({
            title: '提示',
            content: '确认退出登录吗？',
            success: (res) => {
                if (res.confirm) {
                    app.logout();
                    this.setData({
                        userInfo: null,
                        isLoggedIn: false,
                        notificationsCount: 0
                    });
                    wx.showToast({ title: '已退出', icon: 'success' });
                }
            }
        });
    },

    // ======== 分享功能（关键：带邀请码） ========
    onShareAppMessage() {
        const userInfo = this.data.userInfo;
        const inviteCode = userInfo ? (userInfo.invite_code || userInfo.id) : '';
        return {
            title: '臻选 · 精选全球好物，邀你一起赚',
            path: `/pages/index/index?share_id=${inviteCode}`,
            imageUrl: ''
        };
    }
});
