// pages/wallet/index.js
const { get, post } = require('../../utils/request');

Page({
    data: {
        balance: '0.00',
        commissionOverview: null,
        logs: [],
        showWithdraw: false,
        withdrawAmount: ''
    },

    onShow() {
        this.loadWalletInfo();
        this.loadLogs();
    },

    async loadWalletInfo() {
        try {
            const res = await get('/wallet/info');
            if (res.code === 0) {
                const overview = res.data.commission || {};
                this.setData({
                    balance: res.data.balance.toFixed(2),
                    commissionOverview: {
                        total: overview.total ? overview.total.toFixed(2) : '0.00',
                        frozen: overview.frozen ? overview.frozen.toFixed(2) : '0.00',
                        pendingApproval: overview.pendingApproval ? overview.pendingApproval.toFixed(2) : '0.00',
                        approved: overview.approved ? overview.approved.toFixed(2) : '0.00',
                        available: overview.available ? overview.available.toFixed(2) : '0.00'
                    }
                });
            }
        } catch (err) {
            console.error(err);
        }
    },

    async loadLogs() {
        try {
            const res = await get('/wallet/commissions');
            if (res.code === 0) {
                const logs = (res.data.list || []).map(item => {
                    return {
                        ...item,
                        typeName: this.getTypeName(item.type),
                        statusText: this.getStatusText(item.status),
                        created_at: item.created_at ? item.created_at.replace('T', ' ').substring(0, 19) : '',
                        refund_deadline: item.refund_deadline ? item.refund_deadline.split('T')[0] : null
                    };
                });
                this.setData({ logs });
            }
        } catch (err) {
            console.error(err);
        }
    },

    getTypeName(type) {
        const typeMap = {
            'direct': '直推佣金',
            'Direct': '直推佣金',
            'indirect': '团队佣金',
            'Indirect': '团队佣金',
            'gap': '级差利润',
            'Stock_Diff': '级差利润',
            'agent_fulfillment': '发货利润',
            'self': '自购返利',
            'withdrawal': '提现'
        };
        return typeMap[type] || type;
    },

    getStatusText(status) {
        const statusMap = {
            'frozen': '冻结中(T+15)',
            'pending_approval': '待审核',
            'approved': '待结算',
            'settled': '已结算',
            'cancelled': '已取消'
        };
        return statusMap[status] || status;
    },

    onWithdrawTap() {
        this.setData({ showWithdraw: true });
    },

    hideWithdraw() {
        this.setData({ showWithdraw: false });
    },

    async confirmWithdraw() {
        const amount = parseFloat(this.data.withdrawAmount);
        if (!amount || amount <= 0) {
            wx.showToast({ title: '请输入有效金额', icon: 'none' });
            return;
        }

        const balance = parseFloat(this.data.balance);
        if (amount > balance) {
            wx.showToast({ title: '提现金额不能大于余额', icon: 'none' });
            return;
        }

        try {
            const res = await post('/wallet/withdraw', { amount });
            if (res.code === 0) {
                wx.showToast({ title: '申请成功', icon: 'success' });
                this.hideWithdraw();
                this.loadWalletInfo();
            } else {
                wx.showToast({ title: res.message, icon: 'none' });
            }
        } catch (err) {
            wx.showToast({ title: '申请失败', icon: 'none' });
        }
    }
});
