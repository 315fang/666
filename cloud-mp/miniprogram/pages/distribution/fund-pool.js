const app = getApp();

const SUB_LABELS = {
    mirror_ops: '镜像运营基金',
    travel: '旅行基金',
    parent: '父母奖',
    personal: '个人奖励'
};

Page({
    data: {
        loading: true,
        totalContribution: '0.00',
        count: 0,
        entries: [],
        mySubTotals: {},
        poolOverview: null
    },

    onShow() { this._load(); },

    async _load() {
        this.setData({ loading: true });
        try {
            const { callFn } = require('../../utils/cloud');
            const data = await callFn('distribution', { action: 'myFundPoolSummary' });
            const entries = (data.entries || []).map(e => ({
                ...e,
                amountText: parseFloat(e.amount || 0).toFixed(2),
                dateText: this._fmtDate(e.created_at),
                subText: this._buildSubText(e.sub_amounts),
                sourceText: this._sourceLabel(e.source)
            }));

            this.setData({
                totalContribution: parseFloat(data.total_contribution || 0).toFixed(2),
                count: data.count || 0,
                entries,
                mySubTotals: this._normalizeSubTotals(data.my_sub_totals),
                poolOverview: this._normalizePoolOverview(data.pool_overview),
                loading: false
            });
        } catch (err) {
            console.error('[FundPool] load error:', err);
            wx.showToast({ title: '加载失败，请重试', icon: 'none' });
            this.setData({ loading: false });
        }
    },

    _fmtDate(d) {
        if (!d) return '';
        const date = typeof d === 'string' ? new Date(d) : (d.$date ? new Date(d.$date) : new Date(d));
        if (isNaN(date.getTime())) return '';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${day} ${h}:${min}`;
    },

    _buildSubText(sub) {
        if (!sub) return '';
        return Object.keys(SUB_LABELS)
            .filter(k => sub[k] > 0)
            .map(k => `${SUB_LABELS[k]} ¥${parseFloat(sub[k]).toFixed(2)}`)
            .join('  ');
    },

    _normalizeSubTotals(sub = {}) {
        return {
            mirror_ops: this._moneyText(sub.mirror_ops),
            travel: this._moneyText(sub.travel),
            parent: this._moneyText(sub.parent),
            personal: this._moneyText(sub.personal)
        };
    },

    _normalizePoolOverview(pool = {}) {
        const subBalances = pool.sub_balances || {};
        return {
            enabled: !!pool.enabled,
            currentBalance: this._moneyText(pool.current_balance),
            totalIn: this._moneyText(pool.total_in),
            totalOut: this._moneyText(pool.total_out),
            subBalances: {
                mirror_ops: this._moneyText(subBalances.mirror_ops),
                travel: this._moneyText(subBalances.travel),
                parent: this._moneyText(subBalances.parent),
                personal: this._moneyText(subBalances.personal)
            }
        };
    },

    _moneyText(value) {
        return parseFloat(value || 0).toFixed(2);
    },

    _sourceLabel(s) {
        const map = {
            'upgrade_payment': '升级入池',
            'admin_upgrade': '后台升级入池',
            'manual': '手动入池',
            'dividend': '分红'
        };
        return map[s] || s || '入池';
    }
});
