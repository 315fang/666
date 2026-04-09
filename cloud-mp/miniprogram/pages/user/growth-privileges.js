const { get } = require('../../utils/request');
const { getConfigSection } = require('../../utils/miniProgramConfig');

Page({
    data: {
        loading: true,
        loadError: false,
        growthValue: 0,
        growthTiers: [],
        pointLevels: [],
        memberLevels: [],
        currentGrowthMin: 0,
        currentPointLevel: 1
    },

    onLoad() {
        const mc = getConfigSection('membership_config') || {};
        if (mc.growth_privileges_page_title) {
            wx.setNavigationBarTitle({ title: mc.growth_privileges_page_title });
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
            const tiers = (meta.growth_tiers || []).slice().sort((a, b) => (a.min || 0) - (b.min || 0));
            const points = meta.point_levels || [];
            const members = meta.member_levels || [];

            let currentTierMin = tiers.length ? tiers[0].min : 0;
            for (let i = 0; i < tiers.length; i++) {
                if (g >= tiers[i].min) currentTierMin = tiers[i].min;
            }

            let pointLevel = 1;
            const sortedP = [...points].sort((a, b) => (a.min || 0) - (b.min || 0));
            for (let i = sortedP.length - 1; i >= 0; i--) {
                if (g >= sortedP[i].min) {
                    pointLevel = sortedP[i].level;
                    break;
                }
            }

            this.setData({
                loading: false,
                growthValue: g,
                growthTiers: tiers.map((t) => ({
                    ...t,
                    active: t.min === currentTierMin
                })),
                pointLevels: sortedP,
                memberLevels: members,
                currentGrowthMin: currentTierMin,
                currentPointLevel: pointLevel
            });
        } catch (e) {
            console.error(e);
            this.setData({ loading: false, loadError: true });
        }
    },

    onRetry() {
        this.loadData();
    }
});
