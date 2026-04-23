// pages/distribution/center.js - 分佣中心（整合钱包、邀请、团队入口）
const app = getApp();
const { get, post } = require('../../utils/request');
const { ROLE_NAMES, USER_ROLES } = require('../../config/constants');
const { copyAgentPortalLink } = require('../../utils/helpers');
const { promptPortalPassword } = require('../../utils/portalPassword');

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
    'processing': { text: '打款中', class: 'status-pending' },
    'completed': { text: '已到账', class: 'status-gray' },
    'failed': { text: '打款失败', class: 'status-fail' },
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
        pointsBalance: 0,
        // 佣金明细
        commissionLogs: [],
        // Tab: overview / logs / withdraw
        activeTab: 'overview',
        // 提现
        showWithdraw: false,
        withdrawAmount: '',
        withdrawFee: '0.00',
        withdrawActual: '0.00',
        withdrawals: [],
        withdrawRules: {
            min_amount: 100,
            fee_rate_percent: 3,
            fee_cap_max: 100,
            fee_exempt_role_level: 4,
            ruleText: '最低100元起提，手续费3%（封顶100元）'
        },
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
        this.loadWithdrawalRules();
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
            content: '你还未加入团队。请联系推荐人获取邀请链接。',
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

    onGoodsFundTransferHistoryTap() {
        wx.navigateTo({ url: '/pages/distribution/goods-fund-transfer-history' });
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
                const roleLevel = userInfo.role_level ?? userInfo.distributor_level ?? userInfo.role ?? 0;

                const roleName = ROLE_NAMES[roleLevel] || app.globalData.userInfo?.role_name || userInfo.role_name || 'VIP用户';

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
                    balance: (res.data.commission_balance ?? res.data.balance ?? 0).toFixed(2),
                    walletInfo: res.data,
                    pointsBalance: res.data.points || res.data.point_balance || 0
                });
            }
        } catch (err) {
            console.error('加载钱包失败', err);
        }
    },

    onWithdrawTap() {
        this.setData({ showWithdraw: true, withdrawAmount: '', withdrawFee: '0.00', withdrawActual: '0.00' });
    },
    hideWithdraw() {
        this.setData({ showWithdraw: false });
    },
    onWithdrawInput(e) {
        const val = e.detail.value;
        this.recalculateWithdrawPreview(val);
    },

    async confirmWithdraw() {
        if (this._withdrawing) return;
        const amount = parseFloat(this.data.withdrawAmount);
        if (!amount || amount <= 0) {
            wx.showToast({ title: '请输入有效金额', icon: 'none' });
            return;
        }
        const minAmount = Number(this.data.withdrawRules?.min_amount || 0);
        if (minAmount > 0 && amount < minAmount) {
            wx.showToast({ title: `最低提现¥${minAmount.toFixed(2)}`, icon: 'none' });
            return;
        }
        const readyForLargeWithdraw = await this.ensureLargeWithdrawRealName(amount);
        if (!readyForLargeWithdraw) return;
        const portalPassword = await promptPortalPassword({
            title: '提现验证',
            placeholderText: '请输入6位数字业务密码'
        });
        if (!portalPassword) return;

        this._withdrawing = true;
        wx.showLoading({ title: '申请中...' });
        try {
            const res = await post('/wallet/withdraw', { amount, portal_password: portalPassword });
            wx.hideLoading();
            if (res.code === 0) {
                this.hideWithdraw();
                this.loadWalletInfo();
                this.refreshDashboard(true);

                const actualAmount = res.actual_amount ?? res.data?.actual_amount ?? amount;
                const fee = res.fee ?? res.data?.fee ?? 0;
                const displayAmount = parseFloat(actualAmount).toFixed(2);
                const feeText = fee > 0 ? `（手续费¥${parseFloat(fee).toFixed(2)}）` : '';
                if (this.brandAnimation) {
                    this.brandAnimation.show('withdraw', { amount: displayAmount });
                } else {
                    wx.showToast({ title: `提现¥${displayAmount}${feeText}`, icon: 'success', duration: 3000 });
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

    async loadWithdrawalRules() {
        try {
            const res = await get('/wallet/withdraw-rules', {}, { showError: false });
            if (res.code === 0 && res.data) {
                const rules = this.normalizeWithdrawalRules(res.data);
                this.setData({ withdrawRules: rules });
                if (this.data.withdrawAmount) {
                    this.recalculateWithdrawPreview(this.data.withdrawAmount, rules);
                }
            }
        } catch (err) {
            console.warn('加载提现规则失败', err);
        }
    },

    normalizeWithdrawalRules(raw = {}) {
        const minAmount = Number(raw.min_amount || 100);
        const feeRatePercent = Number(raw.fee_rate_percent || 0);
        const feeCapMax = Number(raw.fee_cap_max || 0);
        const feeExemptRoleLevel = Number(raw.fee_exempt_role_level || 4);
        return {
            min_amount: minAmount,
            fee_rate_percent: feeRatePercent,
            fee_cap_max: feeCapMax,
            fee_exempt_role_level: feeExemptRoleLevel,
            ruleText: this.formatWithdrawalRuleText({ minAmount, feeRatePercent, feeCapMax, feeExemptRoleLevel })
        };
    },

    formatWithdrawalRuleText({ minAmount, feeRatePercent, feeCapMax, feeExemptRoleLevel }) {
        const roleLevel = this.data.userInfo?.role ?? 0;
        if (roleLevel >= feeExemptRoleLevel) {
            return `最低¥${Number(minAmount || 0).toFixed(2)}起提，当前等级免手续费`;
        }
        if (feeRatePercent > 0) {
            const capText = feeCapMax > 0 ? `（封顶¥${Number(feeCapMax).toFixed(2)}）` : '';
            return `最低¥${Number(minAmount || 0).toFixed(2)}起提，手续费${Number(feeRatePercent).toFixed(2)}%${capText}`;
        }
        return `最低¥${Number(minAmount || 0).toFixed(2)}起提，免手续费`;
    },

    async ensureLargeWithdrawRealName(amount) {
        if (Number(amount || 0) < 2000) return true;
        const realName = String(this.data.userInfo?.real_name || app.globalData.userInfo?.real_name || '').trim();
        if (realName) return true;
        return new Promise((resolve) => {
            wx.showModal({
                title: '请先补充真实姓名',
                content: '单笔提现满 2000 元需要提供与你微信实名一致的真实姓名，补充后才能继续提现。',
                confirmText: '去完善',
                cancelText: '取消',
                success: (res) => {
                    if (res.confirm) {
                        wx.navigateTo({ url: '/pages/user/edit-profile' });
                    }
                    resolve(false);
                },
                fail: () => resolve(false)
            });
        });
    },

    recalculateWithdrawPreview(value, rules = this.data.withdrawRules) {
        const amount = parseFloat(value) || 0;
        const roleLevel = this.data.userInfo?.role ?? 0;
        const feeRatePercent = Number(rules?.fee_rate_percent || 0);
        const feeCapMax = Number(rules?.fee_cap_max || 0);
        const feeExemptRoleLevel = Number(rules?.fee_exempt_role_level || 4);
        let fee = 0;
        if (amount > 0 && roleLevel < feeExemptRoleLevel && feeRatePercent > 0) {
            fee = amount * feeRatePercent / 100;
            if (feeCapMax > 0) {
                fee = Math.min(fee, feeCapMax);
            }
        }
        this.setData({
            withdrawAmount: value,
            withdrawFee: fee.toFixed(2),
            withdrawActual: Math.max(0, amount - fee).toFixed(2)
        });
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
                    agentPending: res.data.paid || 0,
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
                    goodsFundBalance: res.data.goods_fund_balance || res.data.balance || this.data.goodsFundBalance
                });
            }
        } catch (err) {
            console.warn('加载代理货款失败', err);
        }
    },

    onRechargeGoodsFund() {
        wx.showToast({ title: '请前往货款账户充值', icon: 'none' });
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

    onCommissionToFund() {
        wx.showModal({
            title: '佣金转货款',
            editable: true,
            placeholderText: '请输入转入金额',
            success: async (res) => {
                if (!res.confirm || !res.content) return;
                const amount = parseFloat(res.content);
                if (!amount || amount <= 0) return wx.showToast({ title: '请输入有效金额', icon: 'none' });
                try {
                    const portalPassword = await promptPortalPassword({
                        title: '佣金转货款验证',
                        placeholderText: '请输入6位数字业务密码'
                    });
                    if (!portalPassword) return;
                    const r = await wx.cloud.callFunction({
                        name: 'distribution',
                        data: { action: 'commissionToGoodsFund', amount, portal_password: portalPassword }
                    });
                    if (r.result && r.result.code === 0) {
                        wx.showToast({ title: `成功转入${amount}元`, icon: 'success' });
                        this.refreshDashboard(true);
                    } else {
                        wx.showToast({ title: r.result?.message || '转入失败', icon: 'none' });
                    }
                } catch (err) {
                    wx.showToast({ title: '操作失败', icon: 'none' });
                }
            }
        });
    },

    onPromotionProgress() {
        wx.navigateTo({ url: '/pages/distribution/promotion-progress' });
    },

    onFundPoolTap() {
        wx.navigateTo({ url: '/pages/distribution/fund-pool' });
    },

    goInvitePosterPage() {
        wx.navigateTo({ url: '/pages/distribution/invite-poster' });
    },

    // 打开分享弹窗
    onInviteTap() {
        this.goInvitePosterPage();
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
