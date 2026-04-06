const { post } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');

Page({
    data: {
        code: '',
        qrToken: '',
        loading: false,
        loadingQr: false
    },

    onLoad() {
        if (!requireLogin()) {
            setTimeout(() => wx.navigateBack(), 100);
        }
    },

    onCodeInput(e) {
        this.setData({ code: (e.detail.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '') });
    },

    onTokenInput(e) {
        this.setData({ qrToken: (e.detail.value || '').trim() });
    },

    async onVerifyCode() {
        if (!requireLogin()) return;
        const c = (this.data.code || '').trim();
        if (c.length !== 16) {
            wx.showToast({ title: '请输入16位核销码', icon: 'none' });
            return;
        }
        this.setData({ loading: true });
        try {
            await post('/pickup/verify-code', { pickup_code: c }, { showLoading: true });
            wx.showToast({ title: '核销成功', icon: 'success' });
            this.setData({ code: '' });
        } catch (e) {
            // toast
        } finally {
            this.setData({ loading: false });
        }
    },

    onScan() {
        wx.scanCode({
            scanType: ['qrCode', 'barCode'],
            success: (res) => {
                const raw = (res.result || '').trim();
                this.setData({ qrToken: raw });
            },
            fail: () => wx.showToast({ title: '未识别', icon: 'none' })
        });
    },

    async onVerifyQr() {
        if (!requireLogin()) return;
        const t = (this.data.qrToken || '').trim();
        if (!t) {
            wx.showToast({ title: '请扫码或粘贴内容', icon: 'none' });
            return;
        }
        this.setData({ loadingQr: true });
        try {
            await post('/pickup/verify-qr', { qr_token: t }, { showLoading: true });
            wx.showToast({ title: '核销成功', icon: 'success' });
            this.setData({ qrToken: '' });
        } catch (e) {
            // toast
        } finally {
            this.setData({ loadingQr: false });
        }
    }
});
