const app = getApp();

Page({
    data: {
        loading: true,
        progress: null,
        logs: [],
        roleNames: { 0: 'VIP会员', 1: '初级会员 C1', 2: '高级会员 C2', 3: '推广合伙人 B1', 4: '运营合伙人 B2', 5: '区域合伙人 B3' }
    },

    onShow() { this._load(); },

    async _load() {
        this.setData({ loading: true });
        try {
            const [progressRes, logsRes] = await Promise.all([
                wx.cloud.callFunction({ name: 'distribution', data: { action: 'promotionProgress' } }),
                wx.cloud.callFunction({ name: 'distribution', data: { action: 'promotionLogs' } })
            ]);
            const pResult = progressRes.result || {};
            const lResult = logsRes.result || {};
            if (pResult.code !== 0 && pResult.code !== undefined) {
                wx.showToast({ title: pResult.message || '加载晋升数据失败', icon: 'none' });
            }
            const progress = pResult.data || null;
            const logs = (lResult.data?.list) || [];
            this.setData({ progress, logs, loading: false });
        } catch (err) {
            console.error('[PromotionProgress] load error:', err);
            wx.showToast({ title: '加载失败，请重试', icon: 'none' });
            this.setData({ loading: false });
        }
    }
});
