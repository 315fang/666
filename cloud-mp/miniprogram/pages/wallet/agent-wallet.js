// pages/wallet/agent-wallet.js — 代理商货款余额
const { get, post } = require('../../utils/request');
const { formatLogItem, mergeWalletLogPairs, groupLogsByDate, formatGroupDate, getChangeLabel } = require('./agentWalletLogs');
const {
    DEFAULT_PRESET_AMOUNTS,
    loadRechargeConfig,
    getBonusForAmount,
    getRechargeAmount,
    updateBonusHint
} = require('./agentWalletRecharge');
const app = getApp();

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
        groupedLogs: [],       // 按日期分组的流水
        page: 1,
        limit: 20,
        hasMore: true,
        logsLoading: false,
        loadError: '',         // 错误信息
        activeFilter: 'all',
        activeFilterText: '全部',  // 空状态文案用
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
                    balance: d.goods_fund_balance || d.balance || '0.00',
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
        this.setData({ logsLoading: true, loadError: '' });
        try {
            const params = {
                page,
                limit: this.data.limit
            };
            if (this.data.activeFilter && this.data.activeFilter !== 'all') {
                params.filter = this.data.activeFilter;
            }
            const res = await get('/agent/wallet/logs', params);
            if (res && res.code === 0) {
                const responseList = res.data.list || [];
                const rawList = mergeWalletLogPairs(responseList);
                const newLogs = rawList.map(item => this._formatLogItem(item));
                const total = Number(res.data.pagination?.total || 0);
                const logs = reset ? newLogs : [...this.data.logs, ...newLogs];
                this.setData({
                    logs,
                    groupedLogs: this._groupLogsByDate(logs),
                    page: page + 1,
                    hasMore: total > 0 ? page * this.data.limit < total : responseList.length === this.data.limit
                });
            } else {
                // API 返回业务错误
                const msg = (res && res.message) || '加载流水失败';
                if (reset || this.data.logs.length === 0) {
                    this.setData({ loadError: msg });
                }
            }
        } catch (e) {
            console.error('加载流水失败:', e);
            const msg = e.message || '网络异常，请检查网络连接';
            if (reset || this.data.logs.length === 0) {
                this.setData({ loadError: msg });
            }
        }
        this.setData({ logsLoading: false });
    },

    /** 格式化单条日志 */
    _formatLogItem(item) {
        return formatLogItem(this, item);
    },

    /** 按日期对日志进行分组 */
    _groupLogsByDate(logs) {
        return groupLogsByDate(logs);
    },

    /** 格式化分组日期文案 */
    _formatGroupDate(dateKey) {
        return formatGroupDate(dateKey);
    },

    _getChangeLabel(type) {
        return getChangeLabel(type);
    },

    async loadRechargeConfig() {
        return loadRechargeConfig(this);
    },

    _getBonusForAmount(amount) {
        return getBonusForAmount(this, amount);
    },

    _updateBonusHint() {
        return updateBonusHint(this);
    },

    onFilterChange(e) {
        const filter = e.currentTarget.dataset.filter;
        if (filter === this.data.activeFilter) return;
        const filterTextMap = { all: '全部', in: '入账', out: '支出' };
        this.setData({
            activeFilter: filter,
            activeFilterText: filterTextMap[filter] || '全部',
            logs: [],
            groupedLogs: [],
            page: 1,
            hasMore: true,
            loadError: ''
        });
        this.loadLogs(true);
    },

    /** 重试加载 */
    onRetryLoad() {
        this.setData({ loadError: '', logs: [], groupedLogs: [], page: 1, hasMore: true });
        this.loadAll();
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
        return getRechargeAmount(this);
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
