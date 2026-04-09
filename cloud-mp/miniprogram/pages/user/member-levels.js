// pages/user/member-levels.js - 会员等级晋升路线
const { get } = require('../../utils/request');
const { getConfigSection } = require('../../utils/miniProgramConfig');

function discountText(discount) {
    if (discount == null) return '原价';
    const d = Number(discount);
    if (d >= 1) return '原价';
    const fold = parseFloat((d * 10).toFixed(2));
    const clean = fold % 1 === 0 ? fold.toFixed(0) : fold.toFixed(1);
    return clean + '折';
}

Page({
    data: {
        loading: true,
        loadError: false,
        growthValue: 0,
        currentTierName: '',
        currentTierMin: 0,
        nextTierMin: null,
        barPercent: 0,
        subLine: '',
        growthTiers: []
    },

    onLoad() {
        const mc = getConfigSection('membership_config') || {};
        if (mc.member_levels_page_title) {
            wx.setNavigationBarTitle({ title: mc.member_levels_page_title });
        }
    },

    onShow() {
        const app = getApp();
        if (!app?.globalData?.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            setTimeout(() => wx.navigateBack(), 1500);
            return;
        }
        this.loadData();
    },

    async loadData() {
        this.setData({ loading: true, loadError: false });
        try {
            const [profileRes, metaRes] = await Promise.all([
                get('/user/profile'),
                get('/user/member-tier-meta')
            ]);
            if (profileRes.code !== 0 || !profileRes.data) {
                throw new Error(profileRes.message || '加载失败');
            }
            const g = Number(profileRes.data.growth_value) || 0;
            const meta = (metaRes && metaRes.code === 0 && metaRes.data) ? metaRes.data : {};
            const rawTiers = (meta.growth_tiers || []).slice().sort((a, b) => (a.min || 0) - (b.min || 0));

            // 计算当前所在档位
            let currentIdx = 0;
            for (let i = 0; i < rawTiers.length; i++) {
                if (g >= (rawTiers[i].min || 0)) currentIdx = i;
                else break;
            }

            const currentTier = rawTiers[currentIdx] || rawTiers[0] || {};
            const nextTier = rawTiers[currentIdx + 1] || null;

            const currentMin = currentTier.min || 0;
            const nextMin = nextTier ? nextTier.min : null;

            let barPercent = 100;
            if (nextMin != null) {
                barPercent = Math.min(100, Math.max(0,
                    Math.round(((g - currentMin) / Math.max(1, nextMin - currentMin)) * 100)
                ));
            }

            const mc = getConfigSection('membership_config') || {};
            let subLine = '';
            if (nextTier) {
                const need = Math.max(0, Math.ceil(nextMin - g));
                const tpl = mc.growth_bar_subtitle_template || '距离「{next}」还需 {need} 成长值';
                subLine = String(tpl).replace(/\{next\}/g, nextTier.name || '下一等级').replace(/\{need\}/g, String(need));
            }

            const growthTiers = rawTiers.map((t, idx) => ({
                ...t,
                passed: idx < currentIdx,
                active: idx === currentIdx,
                isLast: idx === rawTiers.length - 1,
                discountText: discountText(t.discount)
            }));

            this.setData({
                loading: false,
                growthValue: Math.floor(g),
                currentTierName: currentTier.name || '普通会员',
                currentTierMin: currentMin,
                nextTierMin: nextMin,
                barPercent,
                subLine,
                growthTiers
            });
        } catch (e) {
            console.error('[member-levels] 加载失败:', e);
            this.setData({ loading: false, loadError: true });
        }
    },

    onRetry() {
        this.loadData();
    }
});
