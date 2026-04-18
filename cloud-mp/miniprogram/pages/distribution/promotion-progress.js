const app = getApp();

Page({
    data: {
        loading: true,
        progress: null,
        logs: [],
        roleNames: { 0: 'VIP用户', 1: '初级会员', 2: '高级会员', 3: '推广合伙人', 4: '运营合伙人', 5: '区域合伙人', 6: '线下实体门店' }
    },

    onShow() { this._load(); },

    async _load() {
        this.setData({ loading: true });
        try {
            const { callFn } = require('../../utils/cloud');
            const [progress, logsData] = await Promise.all([
                callFn('distribution', { action: 'promotionProgress' }).catch(() => null),
                callFn('distribution', { action: 'promotionLogs' }).catch(() => ({ list: [] }))
            ]);
            const logs = (logsData?.list) || [];
            this.setData({ progress, logs, loading: false });
        } catch (err) {
            console.error('[PromotionProgress] load error:', err);
            wx.showToast({ title: '加载失败，请重试', icon: 'none' });
            this.setData({ loading: false });
        }
    }
});
