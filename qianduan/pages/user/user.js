// pages/user/user.js - 个人中心（全面升级版）
const app = getApp();
const { get, put } = require('../../utils/request');

Page({
    data: {
        userInfo: null,
        isLoggedIn: false,
        hasUserInfo: false,
        orderCounts: {
            pending: 0,
            paid: 0,
            shipped: 0,
            refund: 0
        },
        orderStats: {
            pending: 0,
            paid: 0,
            shipped: 0,
            completed: 0
        },
        distributionInfo: {
            totalEarnings: '0.00',
            availableAmount: '0.00',
            referee_count: 0,
            role_level: 0,
            role_name: '普通用户'
        },
        stats: {
            frozenAmount: '0.00'
        },
        balance: '0.00',
        teamCount: 0,
        isAgent: false,
        notificationsCount: 0,
        showNicknameModal: false,
        newNickname: '',
        showInvite: false,
        inviteCode: ''
    },

    onShow() {
        this.loadUserInfo();
    },

    // 从服务端加载用户最新信息
    async loadUserInfo() {
        const isLoggedIn = app.globalData.isLoggedIn;
        const hasUserInfo = !!(app.globalData.userInfo && app.globalData.userInfo.openid);
        this.setData({
            isLoggedIn,
            hasUserInfo
        });

        if (!isLoggedIn) {
            this.setData({ userInfo: app.globalData.userInfo });
            return;
        }

        try {
            const res = await get('/user/profile');
            if (res.code === 0 && res.data) {
                const info = res.data;
                this.setData({
                    userInfo: info,
                    hasUserInfo: true,
                    inviteCode: info.invite_code || '',
                    isAgent: info.role >= 3
                });
                app.globalData.userInfo = info;
                wx.setStorageSync('userInfo', info);
            } else {
                this.setData({ userInfo: app.globalData.userInfo });
            }
        } catch (err) {
            console.error('加载用户信息失败:', err);
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
                get('/orders', { status: 'completed', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } })),
                get('/orders', { status: 'refunded', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } }))
            ]);
            const pending = (results[0].data && results[0].data.pagination && results[0].data.pagination.total) || 0;
            const paid = (results[1].data && results[1].data.pagination && results[1].data.pagination.total) || 0;
            const shipped = (results[2].data && results[2].data.pagination && results[2].data.pagination.total) || 0;
            const completed = (results[3].data && results[3].data.pagination && results[3].data.pagination.total) || 0;
            const refund = (results[4].data && results[4].data.pagination && results[4].data.pagination.total) || 0;

            this.setData({
                'orderCounts.pending': pending,
                'orderCounts.paid': paid,
                'orderCounts.shipped': shipped,
                'orderCounts.refund': refund,
                'orderStats.pending': pending,
                'orderStats.paid': paid,
                'orderStats.shipped': shipped,
                'orderStats.completed': completed
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
                    },
                    'stats.frozenAmount': d.stats ? (d.stats.frozenAmount || d.stats.pendingAmount || '0.00') : '0.00',
                    balance: d.stats ? (d.stats.availableAmount || '0.00') : '0.00',
                    teamCount: d.team ? (d.team.totalCount || 0) : 0
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
            await app.wxLogin();
            wx.hideLoading();
            this.loadUserInfo();
            wx.showToast({ title: '登录成功', icon: 'success' });
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '登录失败', icon: 'none' });
        }
    },

    // ======== 点击登录按钮 ========
    onLoginTap() {
        if (!this.data.hasUserInfo) {
            this.onLogin();
        }
    },

    // ======== 获取用户头像和昵称（微信授权） ========
    onGetUserProfile() {
        if (!this.data.hasUserInfo) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }

        wx.getUserProfile({
            desc: '用于完善用户资料',
            success: async (res) => {
                const { nickName, avatarUrl } = res.userInfo;
                try {
                    wx.showLoading({ title: '保存中...' });
                    // 上传到服务器
                    const updateRes = await put('/user/profile', {
                        nickname: nickName,
                        avatar_url: avatarUrl
                    });

                    wx.hideLoading();

                    if (updateRes.code === 0) {
                        wx.showToast({ title: '保存成功', icon: 'success' });
                        // 重新加载用户信息
                        this.loadUserInfo();
                    } else {
                        wx.showToast({ title: updateRes.message || '保存失败', icon: 'none' });
                    }
                } catch (err) {
                    wx.hideLoading();
                    console.error('保存用户资料失败:', err);
                    wx.showToast({ title: '保存失败', icon: 'none' });
                }
            },
            fail: (err) => {
                console.error('获取用户信息失败:', err);
                wx.showToast({ title: '已取消授权', icon: 'none' });
            }
        });
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

    // ======== 快捷跳转 - 佣金 ========
    goCommission() {
        this.onCommissionTap();
    },

    // ======== ★ 钱包/提现 ========
    onWalletTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/wallet/index' });
    },

    // ======== 快捷跳转 - 钱包 ========
    goWallet() {
        this.onWalletTap();
    },

    // ======== ★ 团队 ========
    onTeamTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/distribution/team' });
    },

    // ======== 快捷跳转 - 团队 ========
    goTeam() {
        this.onTeamTap();
    },

    // ======== 快捷跳转 - 地址 ========
    goAddress() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/user/address' });
    },

    // ======== 快捷跳转 - 代理工作台 ========
    goWorkbench() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/agent/workbench' });
    },

    // ======== 邀请好友 - 显示弹窗 ========
    onShowInvite() {
        if (!this.data.hasUserInfo) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        this.setData({ showInvite: true });
    },

    // ======== 邀请好友 - 隐藏弹窗 ========
    hideInvite() {
        this.setData({ showInvite: false });
    },

    // ======== 邀请好友 - 阻止冒泡 ========
    stopP() {
        // 阻止事件冒泡，防止点击modal内容时关闭
    },

    // ======== 复制邀请码 ========
    copyInviteCode() {
        const code = this.data.inviteCode;
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

    // ======== 复制分享链接 ========
    onCopyShareLink() {
        const inviteCode = this.data.inviteCode;
        if (!inviteCode) {
            wx.showToast({ title: '暂无邀请码', icon: 'none' });
            return;
        }
        // 获取小程序的原始ID或路径
        const appId = 'your-app-id'; // 需要替换为实际的小程序AppID
        const path = `pages/index/index?share_id=${inviteCode}`;
        const shareLink = `微信小程序://臻选?appid=${appId}&path=${encodeURIComponent(path)}`;

        wx.setClipboardData({
            data: `【臻选】邀请你一起赚钱！\n我的邀请码：${inviteCode}\n立即打开小程序：${shareLink}`,
            success: () => {
                wx.showToast({ title: '分享链接已复制', icon: 'success' });
                this.hideInvite();
            }
        });
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
