// pages/distribution/center.js - 分佣中心（整合钱包、邀请、团队入口）
const app = getApp();
const { get, post } = require('../../utils/request');
const { ROLE_NAMES, USER_ROLES } = require('../../config/constants');
const { copyAgentPortalLink } = require('../../utils/helpers');

// 状态字典
const COMMISSION_STATUS_MAP = {
    'frozen': { text: '冻结中(T+15)', class: 'status-frozen' },
    'pending_approval': { text: '待审核', class: 'status-pending' },
    'available': { text: '可提现', class: 'status-success' },
    'settled': { text: '已结算', class: 'status-gray' },
    'cancelled': { text: '已取消', class: 'status-fail' }
};

const WITHDRAW_STATUS_MAP = {
    'pending': { text: '审核中', class: 'status-pending' },
    'approved': { text: '待打款', class: 'status-success' },
    'completed': { text: '已到账', class: 'status-gray' },
    'rejected': { text: '已驳回', class: 'status-fail' }
};

const DISTRIBUTION_DASHBOARD_TTL = 20 * 1000;

Page({
    data: {
        userInfo: null,
        stats: {
            totalEarnings: '0.00',
            availableAmount: '0.00',
            frozenAmount: '0.00'
        },
        team: {
            totalCount: 0,
            directCount: 0,
            indirectCount: 0
        },
        // 钱包
        balance: '0.00',
        walletInfo: null,
        // 佣金明细
        commissionLogs: [],
        // Tab: overview / logs / withdraw
        activeTab: 'overview',
        // 提现
        showWithdraw: false,
        withdrawAmount: '',
        withdrawals: [],
        // 分享弹窗
        showShareModal: false,
        // 绑定上级信息（历史字段，兼容保留）
        hasParent: false,
        parentInfo: null,
        // 代理商专属
        isAgent: false,
        agentPending: 0,
        agentMonthProfit: '0.00',
        agentDebt: 0,
        goodsFundBalance: '0.00',
        walletSummary: null,
        // 会员成长
        growthValue: 0,
        growthPercent: 0,
        nextGrowthThreshold: null,
        growthLoaded: false
    },

    onLoad(options) {
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
    },

    onShow() {
        this.setData({ userInfo: app.globalData.userInfo });
        this.refreshDashboard();

        // 如果用户没有上级，且没有提示过，显示提示
        const hasShownInviteTip = wx.getStorageSync('hasShownInviteTip');
        if (!this.data.hasParent && !hasShownInviteTip) {
            setTimeout(() => {
                this.showInviteTip();
            }, 800);
        }
    },

    refreshDashboard(forceRefresh = false) {
        if (!forceRefresh && this._dashboardRefreshPromise) {
            return this._dashboardRefreshPromise;
        }

        if (!forceRefresh && this._lastDashboardRefreshAt && (Date.now() - this._lastDashboardRefreshAt) < DISTRIBUTION_DASHBOARD_TTL) {
            return Promise.resolve();
        }

        const userInfo = app.globalData.userInfo;
        const isLikelyAgent = this.data.isAgent || (userInfo && (userInfo.role_level || 0) >= USER_ROLES.LEADER);

        const tasks = [
            this.loadStats(),
            this.loadWalletInfo(),
            this.loadMemberTierMeta()
        ];

        if (isLikelyAgent) {
            tasks.push(this.loadAgentData());
        }

        this._dashboardRefreshPromise = Promise.allSettled(tasks).finally(() => {
            this._lastDashboardRefreshAt = Date.now();
            this._dashboardRefreshPromise = null;
        });

        return this._dashboardRefreshPromise;
    },

    // 显示加入团队提示
    showInviteTip() {
        if (this.data.hasParent) return;

        // 【逻辑修正】：如果是代理商或以上角色（自身已经是高层节点），则直接免疫“请寻找邀请人”的弹窗
        if (this.data.userInfo && ((this.data.userInfo.role_level || 0) >= USER_ROLES.LEADER || this.data.isAgent)) return;

        wx.showModal({
            title: '欢迎加入',
            content: '您尚未加入任何团队。\n\n请联系您的推荐人，获取团队邀请链接即可加入团队。',
            confirmText: '知道了',
            showCancel: false,
            success: () => {
                wx.setStorageSync('hasShownInviteTip', true);
            }
        });
    },

    // ====== 导航跳转 ======
    onProfileTap() {
        wx.switchTab({ url: '/pages/user/user' });
    },

    onCommissionLogsTap() {
        wx.navigateTo({ url: '/pages/distribution/commission-logs' });
    },

    onWithdrawHistoryTap() {
        wx.navigateTo({ url: '/pages/distribution/withdraw-history' });
    },

    onTeamTap() {
        wx.navigateTo({ url: '/pages/distribution/team' });
    },

    onOrderTap() {
        wx.navigateTo({ url: '/pages/order/list?status=all' });
    },

    // ====== 分享弹窗 ======
    async onShowShareModal() {
        this.setData({ showShareModal: true });
    },

    hideShareModal() {
        this.setData({ showShareModal: false });
    },


    // ====== 退货入口 ======
    onRefundTap() {
        wx.navigateTo({ url: '/pages/order/refund-list' });
    },

    // 加载分销统计
    async loadStats() {
        try {
            const res = await get('/stats/distribution');
            if (res.code === 0 && res.data) {
                const hasParent = !!(res.data.userInfo && res.data.userInfo.inviter);
                const userInfo = res.data.userInfo || {};
                const roleLevel = userInfo.role || 0;

                // 以全局 userInfo 的 role_name 为主，如果缺失则使用接口返回或常量映射
                const roleName = app.globalData.userInfo?.role_name || userInfo.role_name || ROLE_NAMES[roleLevel] || '普通用户';

                this.setData({
                    stats: res.data.stats || this.data.stats,
                    team: res.data.team || this.data.team,
                    userInfo: {
                        ...this.data.userInfo,
                        ...userInfo,
                        role: roleLevel,
                        role_name: roleName
                    },
                    hasParent: hasParent,
                    parentInfo: userInfo.inviter || null,
                    growthValue: parseFloat(userInfo.growth_value || 0),
                    growthPercent: userInfo.growth_progress?.percent || 0,
                    nextGrowthThreshold: userInfo.growth_progress?.next_threshold || null,
                    growthLoaded: true
                });
            }
        } catch (err) {
            console.error('加载分销统计失败', err);
        }
    },

    // ====== 钱包信息 ======
    async loadWalletInfo() {
        try {
            const res = await get('/wallet/info');
            if (res.code === 0 && res.data) {
                this.setData({
                    balance: (res.data.balance || 0).toFixed(2),
                    walletInfo: res.data
                });
            }
        } catch (err) {
            console.error('加载钱包失败', err);
        }
    },

    onWithdrawTap() {
        this.setData({ showWithdraw: true, withdrawAmount: '' });
    },
    hideWithdraw() {
        this.setData({ showWithdraw: false });
    },
    onWithdrawInput(e) {
        this.setData({ withdrawAmount: e.detail.value });
    },

    async confirmWithdraw() {
        if (this._withdrawing) return;
        const amount = parseFloat(this.data.withdrawAmount);
        if (!amount || amount <= 0) {
            wx.showToast({ title: '请输入有效金额', icon: 'none' });
            return;
        }

        this._withdrawing = true;
        wx.showLoading({ title: '申请中...' });
        try {
            const res = await post('/wallet/withdraw', { amount });
            wx.hideLoading();
            if (res.code === 0) {
                this.hideWithdraw();
                this.loadWalletInfo();

                // ★ 触发「提现成功」品牌动画 — 金币弹出
                if (this.brandAnimation) {
                    this.brandAnimation.show('withdraw', { amount: amount.toFixed(2) });
                } else {
                    wx.showToast({ title: '申请成功', icon: 'success' });
                }
            } else {
                wx.showToast({ title: res.message || '申请失败', icon: 'none' });
            }
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: err.message || '申请失败', icon: 'none' });
        } finally {
            this._withdrawing = false;
        }
    },


    // ====== 代理商专属功能 ======
    async loadAgentData() {
        try {
            const res = await get('/agent/workbench', {}, {
                showError: false,
                maxRetries: 0,
                timeout: 8000
            });
            if (res.code === 0) {
                this.setData({
                    isAgent: true,
                    agentPending: res.data.pending_ship || 0,
                    agentMonthProfit: res.data.month_profit || '0.00',
                    agentDebt: parseFloat(res.data.debt_amount || 0),
                    goodsFundBalance: res.data.goods_fund_balance || '0.00'
                });
                this.loadAgentWallet();
            } else {
                this.setData({ isAgent: false });
            }
        } catch (err) {
            this.setData({ isAgent: false });
        }
    },

    async loadMemberTierMeta() {
        try {
            const res = await get('/user/member-tier-meta');
            if (res.code === 0 && res.data) {
                // 预留：后续可在页面展示完整等级配置
                this.setData({ memberLevels: res.data.member_levels || [] });
            }
        } catch (err) {
            console.warn('加载会员等级配置失败', err);
        }
    },

    async loadAgentWallet() {
        try {
            const res = await get('/agent/wallet');
            if (res.code === 0) {
                this.setData({
                    walletSummary: res.data,
                    goodsFundBalance: res.data.balance || this.data.goodsFundBalance
                });
            }
        } catch (err) {
            console.warn('加载代理货款失败', err);
        }
    },

    onRechargeGoodsFund() {
        wx.showToast({ title: '请在货款账户页完成支付充值', icon: 'none' });
        this.goWorkbench();
    },

    goWorkbench() {
        wx.navigateTo({ url: '/pages/wallet/agent-wallet' });
    },

    goGoodsFundLogs() {
        wx.navigateTo({ url: '/pages/distribution/stock-logs' });
    },

    goAgentPortal() {
        copyAgentPortalLink({ mode: 'modal' });
    },

    // 打开分享弹窗
    onInviteTap() {
        this.onShowShareModal();
    },

    // 分享团队邀请入口
    onShareAppMessage() {
        const brandName = app.globalData.brandName || '问兰';
        const shareTitle = app.globalData.shareTitle || (brandName + ' · 品牌甄选');
        return {
            title: shareTitle,
            path: '/pages/index/index',
            imageUrl: ''
        };
    }
});
