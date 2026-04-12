// pages/wallet/index.js - 佣金账户（仅显示分销佣金，与货款账户完全独立）
const { get, post } = require('../../utils/request');
const app = getApp();

Page({
    data: {
        // 可提现余额（佣金）
        balance: '0.00',
        // 佣金概览
        commissionTotal: '0.00',       // 历史累计佣金
        commissionAvailable: '0.00',   // 可提现
        // 待入账合计（冻结中 + 审核中 + 待打款 之和）
        commissionPendingTotal: '0.00',
        // 待入账明细（展开后显示）
        commissionFrozen: '0.00',      // 冻结中（退款保护期）
        commissionPending: '0.00',     // 审核中（等平台审核）
        commissionSettling: '0.00',    // 待打款（审核通过等打款）
        pendingExpanded: false,        // 是否展开待入账明细
        // 佣金流水列表
        logs: [],
        logsLoading: false,
        // 提现弹窗
        showWithdraw: false,
        withdrawAmount: '',
        withdrawing: false,
        // 代理商：显示货款账户入口
        isAgent: false,
        goodsFundBalance: '0.00'
    },

    onLoad() {
        const userInfo = app.globalData.userInfo || {};
        const isAgent = (userInfo.role_level || 0) >= 3;
        this.setData({ isAgent });
    },

    onShow() {
        this.loadWalletInfo();
        this.loadLogs();
        if (this.data.isAgent) {
            this.loadGoodsFund();
        }
    },

    async loadWalletInfo() {
        try {
            const res = await get('/wallet/info');
            if (res.code === 0 && res.data) {
                const c = res.data.commission || {};
                const fmt = (v) => parseFloat(v || 0).toFixed(2);
                this.setData({
                    balance: fmt(res.data.balance),
                    commissionTotal: fmt(c.total),
                    commissionAvailable: fmt(c.available ?? res.data.balance),
                    commissionPendingTotal: fmt(c.pendingTotal),
                    commissionFrozen: fmt(c.frozen),
                    commissionPending: fmt(c.pendingApproval),
                    commissionSettling: fmt(c.approved)
                });
            }
        } catch (err) {
            console.error('[wallet] 加载佣金账户失败:', err);
        }
    },

    togglePendingExpand() {
        this.setData({ pendingExpanded: !this.data.pendingExpanded });
    },

    async loadGoodsFund() {
        try {
            const res = await get('/agent/wallet');
            if (res.code === 0 && res.data) {
                this.setData({ goodsFundBalance: res.data.balance || '0.00' });
            }
        } catch (err) {
            console.warn('[wallet] 加载货款余额失败:', err);
        }
    },

    async loadLogs() {
        this.setData({ logsLoading: true });
        try {
            const res = await get('/wallet/commissions');
            if (res.code === 0) {
                const logs = (res.data.list || []).map(item => ({
                    ...item,
                    typeName: this._typeName(item.type),
                    statusText: this._statusText(item.status),
                    statusClass: this._statusClass(item.status),
                    isWithdraw: item.type === 'withdrawal',
                    created_at: item.created_at ? item.created_at.replace('T', ' ').slice(0, 16) : '',
                    refund_deadline: item.refund_deadline ? item.refund_deadline.split('T')[0] : null
                }));
                this.setData({ logs });
            }
        } catch (err) {
            console.error('[wallet] 加载佣金明细失败:', err);
        }
        this.setData({ logsLoading: false });
    },

    _typeName(type) {
        const map = {
            'direct': '直推佣金',
            'Direct': '直推佣金',
            'indirect': '团队佣金',
            'Indirect': '团队佣金',
            'gap': '级差利润',
            'Stock_Diff': '级差利润',
            'agent_fulfillment': '发货利润',
            'self': '自购返利',
            'withdrawal': '提现申请'
        };
        return map[type] || type;
    },

    _statusText(status) {
        const map = {
            'frozen': '冻结中',
            'pending_approval': '审核中',
            'approved': '待结算',
            'settled': '已到账',
            'cancelled': '已取消'
        };
        return map[status] || status;
    },

    _statusClass(status) {
        const map = {
            'frozen': 'badge-frozen',
            'pending_approval': 'badge-pending',
            'approved': 'badge-settling',
            'settled': 'badge-settled',
            'cancelled': 'badge-cancel'
        };
        return map[status] || '';
    },

    onWithdrawInput(e) {
        this.setData({ withdrawAmount: e.detail.value });
    },

    onWithdrawTap() {
        const avail = parseFloat(this.data.commissionAvailable);
        if (avail <= 0) {
            wx.showToast({ title: '暂无可提现佣金', icon: 'none' });
            return;
        }
        this.setData({ showWithdraw: true, withdrawAmount: '' });
    },

    hideWithdraw() {
        if (this.data.withdrawing) return;
        this.setData({ showWithdraw: false });
    },

    async confirmWithdraw() {
        if (this.data.withdrawing) return;
        const amount = parseFloat(this.data.withdrawAmount);
        if (!amount || amount <= 0) {
            wx.showToast({ title: '请输入提现金额', icon: 'none' });
            return;
        }
        const avail = parseFloat(this.data.commissionAvailable);
        if (amount > avail) {
            wx.showToast({ title: `可提现余额不足（¥${avail.toFixed(2)}）`, icon: 'none' });
            return;
        }
        this.setData({ withdrawing: true });
        wx.showLoading({ title: '申请中...' });
        try {
            const res = await post('/wallet/withdraw', { amount });
            wx.hideLoading();
            if (res.code === 0) {
                this.hideWithdraw();
                wx.showToast({ title: '提现申请已提交', icon: 'success' });
                setTimeout(() => this.loadWalletInfo(), 1200);
            } else {
                wx.showToast({ title: res.message || '申请失败', icon: 'none' });
            }
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: err.message || '申请失败，请重试', icon: 'none' });
        }
        this.setData({ withdrawing: false });
    },

    onGoGoodsFund() {
        wx.navigateTo({ url: '/pages/wallet/agent-wallet' });
    },

    onGoCommissionLogs() {
        wx.navigateTo({ url: '/pages/distribution/commission-logs' });
    },

    onBack() {
        wx.navigateBack();
    }
});
