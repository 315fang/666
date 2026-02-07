// pages/wallet/index.js
const { get, post } = require('../../utils/request');

Page({
    data: {
        balance: '0.00',
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
                this.setData({
                    balance: res.data.balance.toFixed(2)
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
                this.setData({
                    logs: res.data.list
                });
            }
        } catch (err) {
            console.error(err);
        }
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
