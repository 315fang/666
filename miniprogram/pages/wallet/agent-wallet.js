// pages/wallet/agent-wallet.js — 代理商货款余额
const { get, post } = require('../../utils/request');
const app = getApp();

const DEFAULT_PRESET_AMOUNTS = [100, 300, 500, 1000, 2000, 5000];

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        loading: true,
        isAgent: false,
        roleLevel: 0,
        balance: '0.00',
        frozenBalance: '0.00',
        totalRecharge: '0.00',
        totalDeduct: '0.00',
        logs: [],
        page: 1,
        limit: 20,
        hasMore: true,
        logsLoading: false,
        activeFilter: 'all',
        showRechargePanel: false,
        presetAmounts: DEFAULT_PRESET_AMOUNTS,
        selectedAmount: 500,
        selectedIdx: 2,
        customAmount: '',
        useCustom: false,
        recharging: false,
        bonusEnabled: false,
        bonusTiers: [],
        currentBonusHint: ''
    },

    onLoad() {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navBarHeight: app.globalData.navBarHeight || 44
        });

        const userInfo = app.globalData.userInfo || {};
        const roleLevel = userInfo.role_level || 0;
        const isAgent = roleLevel >= 3;
        this.setData({ roleLevel, isAgent });

        if (isAgent) {
            this.loadRechargeConfig();
            this.loadAll();
        } else {
            this.setData({ loading: false });
        }
    },

    onPullDownRefresh() {
        if (!this.data.isAgent) { wx.stopPullDownRefresh(); return; }
        this.setData({ logs: [], page: 1, hasMore: true });
        this.loadAll().finally(() => wx.stopPullDownRefresh());
    },

    onReachBottom() {
        if (this.data.hasMore && !this.data.logsLoading && this.data.isAgent) {
            this.loadLogs();
        }
    },

    async loadAll() {
        this.setData({ loading: true });
        await Promise.allSettled([this.loadWalletInfo(), this.loadLogs(true)]);
        this.setData({ loading: false });
    },

    async loadWalletInfo() {
        try {
            const res = await get('/agent/wallet');
            if (res && res.code === 0 && res.data) {
                const d = res.data;
                this.setData({
                    balance: d.balance || '0.00',
                    frozenBalance: d.frozen_balance || '0.00',
                    totalRecharge: d.total_recharge || '0.00',
                    totalDeduct: d.total_deduct || '0.00'
                });
            }
        } catch (e) {
            console.error('货款账户加载失败:', e);
        }
    },

    async loadLogs(reset = false) {
        if (this.data.logsLoading) return;
        const page = reset ? 1 : this.data.page;
        this.setData({ logsLoading: true });
        try {
            const res = await get('/agent/wallet/logs', { page, limit: this.data.limit });
            if (res && res.code === 0) {
                const newLogs = (res.data.list || []).map(item => ({
                    ...item,
                    changeLabel: this._getChangeLabel(item.change_type),
                    amountSign: item.change_type === 'deduct' || item.change_type === 'manual_deduct' ? '-' : '+',
                    isOut: item.change_type === 'deduct' || item.change_type === 'manual_deduct',
                    timeText: (item.created_at || '').replace('T', ' ').slice(0, 16)
                }));
                const total = res.data.pagination?.total || 0;
                const logs = reset ? newLogs : [...this.data.logs, ...newLogs];
                this.setData({
                    logs,
                    page: page + 1,
                    hasMore: logs.length < total
                });
            }
        } catch (e) {
            console.error('加载流水失败:', e);
        }
        this.setData({ logsLoading: false });
    },

    _getChangeLabel(type) {
        const map = {
            recharge: '货款充值',
            deduct: '发货扣款',
            manual_recharge: '手动充值',
            manual_deduct: '手动扣减',
            refund: '退款返还',
            order_ship: '发货扣款',
            wx_recharge: '微信支付充值',
            recharge_pending: '充值处理中'
        };
        return map[type] || type || '变动';
    },

    async loadRechargeConfig() {
        try {
            const res = await get('/agent/wallet/recharge-config');
            if (res?.code === 0 && res.data) {
                const presets = Array.isArray(res.data.preset_amounts) && res.data.preset_amounts.length > 0
                    ? res.data.preset_amounts : DEFAULT_PRESET_AMOUNTS;
                const defIdx = Math.min(2, presets.length - 1);
                this.setData({
                    presetAmounts: presets,
                    selectedAmount: presets[defIdx] || 500,
                    selectedIdx: defIdx,
                    bonusEnabled: !!res.data.bonus_enabled,
                    bonusTiers: Array.isArray(res.data.bonus_tiers) ? res.data.bonus_tiers.sort((a, b) => a.min - b.min) : []
                });
                this._updateBonusHint();
            }
        } catch (_) {}
    },

    _getBonusForAmount(amount) {
        if (!this.data.bonusEnabled || !this.data.bonusTiers.length) return 0;
        let bonus = 0;
        for (const tier of this.data.bonusTiers) {
            if (amount >= tier.min) bonus = tier.bonus;
        }
        return bonus;
    },

    _updateBonusHint() {
        const amount = this._getRechargeAmount() || 0;
        const bonus = this._getBonusForAmount(amount);
        const hint = bonus > 0 ? `充 ¥${amount} 送 ¥${bonus}，实际到账 ¥${amount + bonus}` : '';
        this.setData({ currentBonusHint: hint });
    },

    onFilterChange(e) {
        const filter = e.currentTarget.dataset.filter;
        if (filter === this.data.activeFilter) return;
        this.setData({ activeFilter: filter, logs: [], page: 1, hasMore: true });
        this.loadLogs(true);
    },

    onRecharge() {
        if (!this.data.isAgent) {
            wx.showModal({
                title: '仅代理商可充值',
                content: '货款充值功能仅开放给代理商等级及以上用户，请联系客服升级账户。',
                showCancel: false,
                confirmText: '我知道了'
            });
            return;
        }
        const defaultIdx = Math.min(2, this.data.presetAmounts.length - 1);
        this.setData({ showRechargePanel: true, customAmount: '', useCustom: false, selectedAmount: this.data.presetAmounts[defaultIdx] || 500, selectedIdx: defaultIdx });
    },

    onPanelTap() { },

    onCloseRecharge() {
        if (this.data.recharging) return;
        this.setData({ showRechargePanel: false });
    },

    onSelectPreset(e) {
        const amount = Number(e.currentTarget.dataset.amount);
        const idx = Number(e.currentTarget.dataset.idx);
        this.setData({ selectedAmount: amount, selectedIdx: idx, useCustom: false, customAmount: '' }, () => this._updateBonusHint());
    },

    onCustomAmountInput(e) {
        const val = e.detail.value;
        this.setData({ customAmount: val, useCustom: !!val, selectedAmount: null, selectedIdx: -1 }, () => this._updateBonusHint());
    },

    onCustomAmountFocus() {
        this.setData({ useCustom: true, selectedAmount: null, selectedIdx: -1 });
    },

    _getRechargeAmount() {
        if (this.data.useCustom && this.data.customAmount) {
            return parseFloat(this.data.customAmount);
        }
        return this.data.selectedAmount;
    },

    async onConfirmRecharge() {
        const amount = this._getRechargeAmount();
        if (!amount || isNaN(amount) || amount <= 0) {
            wx.showToast({ title: '请选择或输入充值金额', icon: 'none' });
            return;
        }
        if (amount < 10) {
            wx.showToast({ title: '最低充值 ¥10', icon: 'none' });
            return;
        }
        if (amount > 100000) {
            wx.showToast({ title: '单次最高充值 ¥100,000', icon: 'none' });
            return;
        }

        this.setData({ recharging: true });
        wx.showLoading({ title: '发起支付...' });
        try {
            const prepayRes = await post('/agent/wallet/prepay', { amount });
            wx.hideLoading();

            if (prepayRes.code !== 0) {
                wx.showToast({ title: prepayRes.message || '发起支付失败', icon: 'none' });
                this.setData({ recharging: false });
                return;
            }

            const p = prepayRes.data;
            wx.requestPayment({
                timeStamp: p.timeStamp,
                nonceStr:  p.nonceStr,
                package:   p.package,
                signType:  p.signType || 'RSA',
                paySign:   p.paySign,
                success: () => {
                    wx.showToast({ title: '充值成功！', icon: 'success' });
                    this.setData({ showRechargePanel: false, recharging: false });
                    setTimeout(() => this.loadAll(), 1500);
                },
                fail: (err) => {
                    this.setData({ recharging: false });
                    if (err.errMsg && err.errMsg.includes('cancel')) {
                        wx.showToast({ title: '已取消充值', icon: 'none' });
                    } else {
                        wx.showToast({ title: '支付失败，请重试', icon: 'none' });
                    }
                }
            });
        } catch (err) {
            wx.hideLoading();
            this.setData({ recharging: false });
            wx.showToast({ title: err.message || '发起充值失败', icon: 'none' });
        }
    },

    onBack() {
        wx.navigateBack();
    }
});
