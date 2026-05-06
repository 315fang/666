// pages/wallet/index.js
const { get, post } = require('../../utils/request');
const { promptPortalPassword } = require('../../utils/portalPassword');
const app = getApp();

Page({
    data: {
        // 可提现余额
        balance: '0.00',
        // 佣金概览
        commissionTotal: '0.00',
        // 预计收益（订单已支付并生成佣金记录，但尚未进入冻结/审核阶段）
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
        // 提现记录
        withdrawals: [],
        withdrawalsLoading: true,
        // 提现弹窗
        showWithdraw: false,
        withdrawAmount: '',
        withdrawFee: '0.00',
        withdrawActual: '0.00',
        withdrawing: false,
        withdrawRules: {
            min_amount: 100,
            fee_rate_percent: 3,
            fee_cap_max: 100,
            fee_exempt_role_level: 4,
            ruleText: '最低¥100.00起提，手续费3.00%（封顶¥100.00）'
        },
        // 代理商货款入口
        isAgent: false,
        goodsFundBalance: '0.00'
    },

    onLoad() {},

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
    },

    onShow() {
        this.loadWithdrawalRules();
        this.loadWalletInfo();
        this.loadLogs();
        this.loadWithdrawals();
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
                    balance:                fmt(walletRes.data.commission_balance ?? walletRes.data.balance),
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
                const bal = parseFloat(res.data.goods_fund_balance || res.data.balance || 0);
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
                    typeName:       item.type_text || this._typeName(item.type),
                    statusText:     item.status_text || this._statusText(item.status),
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
            'region_agent': '区域奖励',
            'region_b3_virtual': '区域奖励',
            'self': '自购返利',
            'withdrawal': '提现申请',
            'admin_adjustment': '系统调整'
        };
        return map[type] || type;
    },

    _statusText(status) {
        const map = {
            'frozen': '冻结中', 'pending': '预计入账',
            'pending_approval': '审核中',
            'approved': '待打款',
            'processing': '打款中',
            'settled': '已到账', 'completed': '已到账',
            'failed': '打款失败',
            'cancelled': '已取消', 'rejected': '已驳回'
        };
        return map[status] || status;
    },

    _statusClass(status) {
        const map = {
            'frozen': 'log-status-frozen', 'pending': 'log-status-pending_approval',
            'pending_approval': 'log-status-pending_approval',
            'approved': 'log-status-approved',
            'processing': 'log-status-pending_approval',
            'settled': 'log-status-settled', 'completed': 'log-status-settled',
            'failed': 'log-status-cancelled',
            'cancelled': 'log-status-cancelled'
        };
        return map[status] || '';
    },

    async loadWithdrawals() {
        this.setData({ withdrawalsLoading: true });
        try {
            const res = await get('/wallet/withdrawals', { page: 1, limit: 3 }, { showError: false });
            if (res.code === 0) {
                const withdrawals = (res.data.list || []).slice(0, 3).map((item) => {
                    const status = String(item.status || '');
                    return {
                        ...item,
                        amount: this._fmtMoney(item.amount),
                        fee: this._fmtMoney(item.fee),
                        actual_amount: this._fmtMoney(item.actual_amount != null ? item.actual_amount : item.amount),
                        statusText: this._withdrawStatusText(status),
                        statusClass: this._withdrawStatusClass(status),
                        statusHint: this._withdrawStatusHint(status),
                        created_at: this._formatTime(item.created_at),
                        updated_at: this._formatTime(item.updated_at || item.paid_at || item.completed_at)
                    };
                });
                this.setData({ withdrawals });
            }
        } catch (err) {
            console.error('[wallet] 加载提现记录失败:', err);
        }
        this.setData({ withdrawalsLoading: false });
    },

    _fmtMoney(value) {
        return parseFloat(value || 0).toFixed(2);
    },

    _formatTime(value) {
        if (!value) return '';
        if (typeof value === 'string') return value.replace('T', ' ').slice(0, 16);
        if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 16);
        return String(value).replace('T', ' ').slice(0, 16);
    },

    _withdrawStatusText(status) {
        const map = {
            pending: '审核中',
            approved: '待打款',
            processing: '打款中',
            completed: '已到账',
            settled: '已到账',
            failed: '打款失败',
            rejected: '已驳回',
            cancelled: '已取消'
        };
        return map[status] || status || '处理中';
    },

    _withdrawStatusClass(status) {
        const map = {
            pending: 'withdraw-status-pending',
            approved: 'withdraw-status-approved',
            processing: 'withdraw-status-processing',
            completed: 'withdraw-status-success',
            settled: 'withdraw-status-success',
            failed: 'withdraw-status-fail',
            rejected: 'withdraw-status-fail',
            cancelled: 'withdraw-status-muted'
        };
        return map[status] || 'withdraw-status-pending';
    },

    _withdrawStatusHint(status) {
        const map = {
            pending: '平台正在审核，请等待处理',
            approved: '审核已通过，等待平台打款',
            processing: '打款处理中，请留意微信零钱',
            completed: '提现已到账',
            settled: '提现已到账',
            failed: '打款失败，金额将按规则处理',
            rejected: '申请未通过，请查看原因',
            cancelled: '提现申请已取消'
        };
        return map[status] || '提现申请处理中';
    },

    onWithdrawInput(e) {
        this.recalculateWithdrawPreview(e.detail.value);
    },

    onWithdrawTap() {
        const avail = parseFloat(this.data.balance);
        if (avail <= 0) {
            wx.showToast({ title: '暂无可提佣金', icon: 'none' });
            return;
        }
        this.setData({ showWithdraw: true, withdrawAmount: '', withdrawFee: '0.00', withdrawActual: '0.00' });
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
        const minAmount = Number(this.data.withdrawRules?.min_amount || 0);
        if (minAmount > 0 && amount < minAmount) {
            wx.showToast({ title: `最低提现¥${minAmount.toFixed(2)}`, icon: 'none' });
            return;
        }
        const avail = parseFloat(this.data.balance);
        if (amount > avail) {
            wx.showToast({ title: `余额不足（可提现 ¥${avail.toFixed(2)}）`, icon: 'none' });
            return;
        }
        const readyForLargeWithdraw = await this.ensureLargeWithdrawRealName(amount);
        if (!readyForLargeWithdraw) return;
        const portalPassword = await promptPortalPassword({
            title: '提现验证',
            placeholderText: '请输入6位数字业务密码'
        });
        if (!portalPassword) return;
        this.setData({ withdrawing: true });
        wx.showLoading({ title: '申请中...' });
        try {
            const res = await post('/wallet/withdraw', { amount, portal_password: portalPassword });
            wx.hideLoading();
            if (res.code === 0) {
                this.hideWithdraw();
                this.loadWalletInfo();
                this.loadWithdrawals();
                wx.showModal({
                    title: '提现申请已提交',
                    content: '当前状态：审核中。可在我的钱包的提现记录查看审核、打款和到账进度。',
                    confirmText: '查看记录',
                    cancelText: '知道了',
                    success: (modalRes) => {
                        if (modalRes.confirm) {
                            this.onWithdrawHistoryTap();
                        }
                    }
                });
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

    onWithdrawHistoryTap() {
        wx.navigateTo({ url: '/pages/distribution/withdraw-history' });
    },

    async loadWithdrawalRules() {
        try {
            const res = await get('/wallet/withdraw-rules', {}, { showError: false }).catch(() => null);
            if (res && res.code === 0 && res.data) {
                const rules = this.normalizeWithdrawalRules(res.data);
                this.setData({ withdrawRules: rules });
                if (this.data.withdrawAmount) {
                    this.recalculateWithdrawPreview(this.data.withdrawAmount, rules);
                }
            }
        } catch (err) {
            console.warn('[wallet] 加载提现规则失败:', err);
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
        const roleLevel = Number(app.globalData.userInfo?.role_level || app.globalData.userInfo?.distributor_level || 0);
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
        const roleLevel = Number(app.globalData.userInfo?.role_level || app.globalData.userInfo?.distributor_level || 0);
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
    }
});
