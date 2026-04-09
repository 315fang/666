const { post } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');

Page({
    data: {
        loading: false,
        result: null
    },

    onLoad() {
        if (!requireLogin()) {
            setTimeout(() => wx.navigateBack(), 100);
        }
    },

    async onApply() {
        if (!requireLogin()) return;
        this.setData({ loading: true, result: null });
        try {
            const res = await post('/user/portal/apply-initial-password', {}, { showLoading: true });
            const data = res.data || {};
            this.setData({ result: data });
            wx.showToast({ title: '请立即复制保存', icon: 'none' });
        } catch (e) {
            // toast by request
        } finally {
            this.setData({ loading: false });
        }
    },

    onCopyAll() {
        const r = this.data.result;
        if (!r) return;
        const text = `会员编号：${r.member_no}\n初始密码：${r.initial_password}`;
        wx.setClipboardData({
            data: text,
            success: () => wx.showToast({ title: '已复制', icon: 'success' })
        });
    }
});
