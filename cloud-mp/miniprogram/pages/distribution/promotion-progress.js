const app = getApp();

function formatMoney(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function normalizePiggyBank(piggyBank = {}) {
    const buckets = (piggyBank.buckets || []).map((item) => ({
        ...item,
        locked_amount_text: formatMoney(item.locked_amount),
        unlocked_amount_text: formatMoney(item.unlocked_amount),
        has_amount: Number(item.locked_amount || 0) > 0 || Number(item.unlocked_amount || 0) > 0
    }));
    return {
        ...piggyBank,
        locked_amount_text: formatMoney(piggyBank.locked_amount),
        unlocked_amount_text: formatMoney(piggyBank.unlocked_amount),
        unlockable_amount_text: formatMoney(piggyBank.unlockable_amount),
        next_level_unlock_amount_text: formatMoney(piggyBank.next_level_unlock_amount),
        buckets
    };
}

Page({
    data: {
        loading: true,
        progress: null,
        logs: [],
        roleNames: { 0: 'VIP用户', 1: '初级会员', 2: '高级会员', 3: '推广合伙人', 4: '运营合伙人', 5: '区域合伙人', 6: '店长' }
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
            const nextProgress = progress
                ? { ...progress, piggy_bank: normalizePiggyBank(progress.piggy_bank || {}) }
                : null;
            this.setData({ progress: nextProgress, logs, loading: false });
        } catch (err) {
            console.error('[PromotionProgress] load error:', err);
            wx.showToast({ title: '加载失败，请重试', icon: 'none' });
            this.setData({ loading: false });
        }
    }
});
