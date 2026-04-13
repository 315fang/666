// pages/wallet/index.js
const { get, post } = require('../../utils/request');
const app = getApp();

Page({
    data: {
        // 可提现余额
        balance: '0.00',
        // 佣金概览
        commissionTotal: '0.00',
        // 预计收益（团队订单已下单待支付，支付成功后才会生成真实佣金）
        commissionEstimated: '0.00',
        // 收益阶段合计（预计收益 + 冻结中 + 审核中 + 待打款）
        commissionFlowTotal: '0.00',
        commissionFrozen: '0.00',
        commissionPending: '0.00',
        commissionSettling: '0.00',
        pendingExpanded: false,
        // 明细流水
        logs: [],
        logsLoading: true,
        // 提现弹窗
        showWithdraw: false,
        withdrawAmount: '',
        withdrawing: false,
        // 代理商货款入口
        isAgent: false,
        goodsFundBalance: '0.00'
    },

    onLoad() {},

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
    },

    onShow() {
        this.loadWalletInfo();
        this.loadLogs();
        this.loadGoodsFund();
    },

    async loadWalletInfo() {
        try {
            const [walletRes, estimatedRes] = await Promise.all([
                get('/wallet/info', {}, { showError: false }).catch(() => null),
                get('/wallet/estimated-commission', {}, { showError: false }).catch(() => null)
            ]);

            if (walletRes && walletRes.code === 0 && walletRes.data) {
                const c = walletRes.data.commission || {};
                const fmt = (v) => parseFloat(v || 0).toFixed(2);
                const estimatedWrap = estimatedRes && estimatedRes.code === 0
                    ? (estimatedRes.data || estimatedRes)
                    : {};
                const estimatedCommission = parseFloat(estimatedWrap.estimated_commission || 0);
                const frozen = parseFloat(c.frozen || 0);
                const pendingApproval = parseFloat(c.pendingApproval || 0);
                const approved = parseFloat(c.approved || 0);
                const flowTotal = estimatedCommission + frozen + pendingApproval + approved;

                this.setData({
                    balance:                fmt(walletRes.data.balance),
                    commissionTotal:        fmt(c.total),
                    commissionEstimated:    fmt(estimatedCommission),
                    commissionFlowTotal:    fmt(flowTotal),
                    commissionFrozen:       fmt(c.frozen),
                    commissionPending:      fmt(c.pendingApproval),
                    commissionSettling:     fmt(c.approved)
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
                const bal = parseFloat(res.data.balance || 0);
                this.setData({
                    isAgent: bal > 0,
                    goodsFundBalance: bal.toFixed(2)
                });
            }
        } catch (_) {}
    },

    async loadLogs() {
        this.setData({ logsLoading: true });
        try {
            const res = await get('/wallet/commissions');
            if (res.code === 0) {
                const logs = (res.data.list || []).map(item => ({
                    ...item,
                    typeName:       this._typeName(item.type),
                    statusText:     this._statusText(item.status),
                    statusClass:    this._statusClass(item.status),
                    isWithdraw:     item.type === 'withdrawal',
                    created_at:     item.created_at ? item.created_at.replace('T', ' ').slice(0, 16) : '',
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
            'direct': '直推佣金', 'Direct': '直推佣金',
            'indirect': '团队佣金', 'Indirect': '团队佣金',
            'gap': '级差利润', 'Stock_Diff': '级差利润',
            'agent_fulfillment': '发货利润',
            'self': '自购返利',
            'withdrawal': '提现申请',
            'admin_adjustment': '系统调整'
        };
        return map[type] || type;
    },

    _statusText(status) {
        const map = {
            'frozen': '冻结中', 'pending': '冻结中',
            'pending_approval': '审核中',
            'approved': '待打款',
            'settled': '已到账', 'completed': '已到账',
            'cancelled': '已取消', 'rejected': '已驳回'
        };
        return map[status] || status;
    },

    _statusClass(status) {
        const map = {
            'frozen': 'log-status-frozen', 'pending': 'log-status-frozen',
            'pending_approval': 'log-status-pending_approval',
            'approved': 'log-status-approved',
            'settled': 'log-status-settled', 'completed': 'log-status-settled',
            'cancelled': 'log-status-cancelled'
        };
        return map[status] || '';
    },

    onWithdrawInput(e) {
        this.setData({ withdrawAmount: e.detail.value });
    },

    onWithdrawTap() {
        const avail = parseFloat(this.data.balance);
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
        const avail = parseFloat(this.data.balance);
        if (amount > avail) {
            wx.showToast({ title: `余额不足（可提现 ¥${avail.toFixed(2)}）`, icon: 'none' });
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
    }
});
