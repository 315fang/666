// pages/user/user.js - 个人中心（全面升级版）
const app = getApp();
const { get, put, uploadFile } = require('../../utils/request');
const { ErrorHandler } = require('../../utils/errorHandler');
const { ROLE_NAMES } = require('../../config/constants');
const globalStore = require('../../store/index');
const { formatMoney } = require('../../utils/dataFormatter');

Page({
    data: {
        userInfo: null,
        isLoggedIn: false,
        hasUserInfo: false,
        // 资产卡数据（WXML 绑定用）
        stats: { frozenAmount: '0.00' },
        balance: '0.00',
        teamCount: 0,
        // 订单统计（WXML 用 orderStats）
        orderStats: {
            pending: 0,
            paid: 0,
            shipped: 0,
            refund: 0
        },
        // 角色相关
        isAgent: false,
        // 分销原始信息
        distributionInfo: {
            totalEarnings: '0.00',
            availableAmount: '0.00',
            referee_count: 0,
            role_level: 0,
            role_name: '普通用户'
        },
        notificationsCount: 0,
        // 昵称修改弹窗
        showNicknameModal: false,
        newNickname: '',
        // 邀请码弹窗
        showInvite: false,
        inviteCode: '',
        // 卡片下拉效果
        cardTransform: 0,
        isPulling: false
    },

    // 触摸开始
    onCardTouchStart(e) {
        this.startY = e.touches[0].clientY;
        this.setData({ isPulling: true });
    },

    // 触摸移动 - 实现卡片下拉效果
    onCardTouchMove(e) {
        const moveY = e.touches[0].clientY;
        const diff = moveY - this.startY;
        
        // 只有向下拖动时才响应，且限制最大下拉距离
        if (diff > 0 && diff < 150) {
            // 添加阻尼效果
            const dampedDiff = diff * 0.6;
            this.setData({ cardTransform: dampedDiff });
        }
    },

    // 触摸结束 - 卡片回弹
    onCardTouchEnd(e) {
        this.setData({ 
            cardTransform: 0,
            isPulling: false 
        });
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
                const roleLevel = info.role || 0;
                const roleName = info.role_name || ROLE_NAMES[roleLevel] || '普通用户';
                
                this.setData({
                    userInfo: {
                        ...info,
                        role_name: roleName
                    },
                    hasUserInfo: true,
                    inviteCode: info.invite_code || '',
                    isAgent: (info.role_level || roleLevel || 0) >= 2
                });
                app.globalData.userInfo = this.data.userInfo;
                wx.setStorageSync('userInfo', this.data.userInfo);
            } else {
                const cached = app.globalData.userInfo;
                this.setData({
                    userInfo: cached,
                    hasUserInfo: !!cached
                });
            }
        } catch (err) {
            ErrorHandler.handle(err, {
                customMessage: '加载用户信息失败',
                showToast: false
            });
            const cached = app.globalData.userInfo;
            this.setData({
                userInfo: cached,
                hasUserInfo: !!cached
            });
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
                // ★ 退款数量从 /refunds 接口获取活跃退款数
                get('/refunds', { page: 1, limit: 1 }).catch(() => ({ data: { list: [] } }))
            ]);
            const pending = (results[0].data && results[0].data.pagination && results[0].data.pagination.total) || 0;
            const paid = (results[1].data && results[1].data.pagination && results[1].data.pagination.total) || 0;
            const shipped = (results[2].data && results[2].data.pagination && results[2].data.pagination.total) || 0;
            // ★ 退款列表的总数
            const refundList = results[3].data?.list || [];
            const refundTotal = results[3].data?.pagination?.total || refundList.length;
            this.setData({
                'orderStats.pending': pending,
                'orderStats.paid': paid,
                'orderStats.shipped': shipped,
                'orderStats.refund': refundTotal
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
                const totalEarnings = d.stats ? d.stats.totalEarnings : '0.00';
                const availableAmount = d.stats ? d.stats.availableAmount : '0.00';
                const frozenAmount = d.stats ? (d.stats.frozenAmount || '0.00') : '0.00';
                const teamCount = d.team ? d.team.totalCount : 0;
                const roleLevel = d.userInfo ? d.userInfo.role : 0;
                this.setData({
                    distributionInfo: {
                        totalEarnings,
                        availableAmount,
                        referee_count: teamCount,
                        role_level: roleLevel,
                        role_name: d.userInfo ? (d.userInfo.role_name || ROLE_NAMES[roleLevel]) : '普通用户'
                    },
                    // 同步 WXML 用到的顶级变量
                    stats: { frozenAmount },
                    balance: availableAmount,
                    teamCount,
                    isAgent: roleLevel >= 2
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

    // ======== 头像昵称修改（适配微信 2024 最新规则） ========
    async onChooseAvatar(e) {
        const { avatarUrl } = e.detail;
        if (!avatarUrl) return;

        try {
            // 1. 上传图片到服务器
            // 确保使用正确的上传接口路径
            const res = await uploadFile('/user/upload', avatarUrl, 'file');
            if (res.code === 0 && res.data.url) {
                const fullUrl = res.data.url;
                // 2. 更新用户信息
                const updateRes = await put('/user/profile', { avatar_url: fullUrl });
                if (updateRes.code === 0) {
                    this.setData({
                        'userInfo.avatar_url': fullUrl
                    });
                    wx.showToast({ title: '头像更新成功', icon: 'success' });
                }
            }
        } catch (err) {
            console.error('更新头像失败:', err);
            wx.showToast({ title: '更新头像失败', icon: 'none' });
        }
    },

    async onNicknameBlur(e) {
        const nickname = e.detail.value.trim();
        if (!nickname || nickname === (this.data.userInfo?.nickname)) return;

        try {
            const res = await put('/user/profile', { nickname });
            if (res.code === 0) {
                this.setData({
                    'userInfo.nickname': nickname
                });
                wx.showToast({ title: '昵称更新成功', icon: 'success' });
            }
        } catch (err) {
            console.error('更新昵称失败:', err);
            wx.showToast({ title: '更新昵称失败', icon: 'none' });
        }
    },

    // ======== 登录（WXML 用 onLoginTap） ========
    async onLogin() {
        try {
            wx.showLoading({ title: '登录中...' });
            await app.wxLogin(null, true);
            wx.hideLoading();
            this.loadUserInfo();
            wx.showToast({ title: '登录成功', icon: 'success' });
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '登录失败', icon: 'none' });
        }
    },

    // WXML 绑定别名 — 登录/授权
    async onLoginTap() {
        if (!this.data.isLoggedIn) {
            this.onLogin();
            return;
        }
        // 已登录但信息不完整，引导授权
        if (!this.data.hasUserInfo || !this.data.userInfo || !this.data.userInfo.nickname) {
            try {
                wx.showModal({
                    title: '完善个人信息',
                    content: '为了更好地为您服务，需要获取您的微信头像和昵称',
                    confirmText: '去授权',
                    cancelText: '取消',
                    success: async (res) => {
                        if (res.confirm) {
                            await this.onLogin();
                        }
                    }
                });
            } catch (err) {
                console.error('授权提示失败:', err);
            }
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

    // 阻止事件冒泡（WXML 中 catchtap="stopP"）
    stopP() { },

    async onConfirmNickname() {
        if (this._submitting) return;
        const nickname = this.data.newNickname.trim();
        if (!nickname) {
            wx.showToast({ title: '昵称不能为空', icon: 'none' });
            return;
        }
        this._submitting = true;
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
        } finally {
            this._submitting = false;
        }
    },

    // ======== ★ 佣金明细 ========
    onCommissionTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/distribution/center?tab=logs' });
    },
    // WXML 绑定别名
    goCommission() { this.onCommissionTap(); },

    // ======== ★ 钱包/提现 ========
    onWalletTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/wallet/index' });
    },
    goWallet() { this.onWalletTap(); },

    // ======== ★ 团队 ========
    onTeamTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/distribution/team' });
    },
    goTeam() { this.onTeamTap(); },

    // ======== 地址管理 ========
    goAddress() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/address/list' });
    },

    // ======== 智能助手 ========
    goAIChat() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/ai/chat' });
    },

    // ======== 工作台 ========
    goWorkbench() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/distribution/workbench' });
    },

    // ======== 订单入口 ========
    onOrderAllTap() {
        wx.navigateTo({ url: '/pages/order/list' });
    },

    onOrderTap(e) {
        console.log('[User] onOrderTap clicked, dataset:', e.currentTarget.dataset);
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        const type = e.currentTarget.dataset.type;
        let url = '/pages/order/list';
        if (type && type !== 'all') {
            url += '?status=' + type;
        }
        console.log('[User] Navigating to:', url);
        wx.navigateTo({ url: url });
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

    // ======== 显示/隐藏邀请码弹窗 ========
    onShowInvite() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        this.setData({ showInvite: true });
    },

    hideInvite() {
        this.setData({ showInvite: false });
    },

    // ======== 复制邀请码 ========
    onCopyInviteCode() {
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
    // WXML 绑定别名
    copyInviteCode() { this.onCopyInviteCode(); },

    // ======== ★ 分佣中心（整合团队、钱包、邀请码） ========
    goDistributionCenter() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/distribution/center' });
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
