// pages/user/membership-center.js - 会员权益中心（整合版）
const { get } = require('../../utils/request');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { applyGrowthTierDisplayNames } = require('../../utils/growthTierDisplay');
const { ROLE_NAMES } = require('../../config/constants');
const {
    buildMembershipCardViewModel,
    getMembershipCardMeta
} = require('../../utils/membershipCardBuilder');

function resolveCurrentGrowthTierMin(rawTiers, currentTierMeta, growthValue) {
    const currentTierMin = Number(currentTierMeta?.min);
    if (Number.isFinite(currentTierMin)) {
        return currentTierMin;
    }
    let activeTierMin = rawTiers.length ? Number(rawTiers[0].min || 0) : 0;
    for (const tier of rawTiers) {
        const tierMin = Number(tier.min || 0);
        if (growthValue >= tierMin) {
            activeTierMin = tierMin;
        } else {
            break;
        }
    }
    return activeTierMin;
}

function sanitizeTierDesc(desc) {
    const text = String(desc || '').trim();
    if (!text) return '';
    if (/折|原价|复购价/.test(text)) {
        return '成长值提升可解锁更多成长会员权益';
    }
    return text
        .replace(/积分会员/g, '成长会员')
        .replace(/积分权益/g, '成长会员权益')
        .replace(/积分/g, '成长值');
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
        growthTiers: [],
        memberLevels: [],
        currentGrowthMin: 0,
        currentRoleLevel: 0,
        currentRoleName: 'VIP用户',
        activeCard: 'consume',
        cardSwiperCurrent: 0,
        cardReady: false,
        consumeCardSummary: {},
        agentCardSummary: {},
        currentCardMeta: {}
    },

    onLoad() {
        const mc = getConfigSection('membership_config') || {};
        wx.setNavigationBarTitle({ title: mc.membership_center_page_title || '会员权益中心' });
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
        this.setData({ loading: true, loadError: false, cardReady: false });
        try {
            const [profileRes, metaRes] = await Promise.all([
                get('/user/profile'),
                get('/user/member-tier-meta')
            ]);
            if (profileRes.code !== 0 || !profileRes.data) {
                throw new Error(profileRes.message || '加载失败');
            }
            const g = Number(profileRes.data.growth_value) || 0;
            const roleLevel = Number(profileRes.data.role_level) || 0;
            const meta = (metaRes && metaRes.code === 0 && metaRes.data) ? metaRes.data : {};
            const currentMeta = meta.current || {};

            const rawTiers = applyGrowthTierDisplayNames(
                (meta.growth_tiers || []).slice().sort((a, b) => (a.min || 0) - (b.min || 0))
            );
            const rawMembers = (meta.member_levels || [])
                .slice()
                .map((item) => ({
                    ...item,
                    name: ROLE_NAMES[Number(item.level)] || item.name
                }))
                .sort((a, b) => (a.level || 0) - (b.level || 0));

            // 计算当前所在档位（用于晋升路线）
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

            const activeTierMin = resolveCurrentGrowthTierMin(rawTiers, currentMeta.current_growth_tier, g);
            const roleName = String(
                ROLE_NAMES[roleLevel]
                || currentMeta.role_name
                || profileRes.data.role_name
                || rawMembers.find(m => Number(m.level) === roleLevel)?.name
                || 'VIP用户'
            );

            const growthTiers = rawTiers.map((t, idx) => ({
                ...t,
                desc: sanitizeTierDesc(t.desc),
                active: Number(t.min || 0) === activeTierMin,
                passed: idx < currentIdx,
                isNext: idx === currentIdx + 1,
                isLast: idx === rawTiers.length - 1
            }));
            const memberLevels = rawMembers.map((m) => ({ ...m }));
            const cardViewModel = buildMembershipCardViewModel({
                growthValue: Math.floor(g),
                currentTierName: currentTier.name || '普通会员',
                nextTierMin: nextMin,
                subLine,
                barPercent,
                growthTiers,
                memberLevels,
                currentRoleLevel: roleLevel,
                currentRoleName: roleName
            });

            this.setData({
                loading: false,
                growthValue: Math.floor(g),
                currentTierName: currentTier.name || '普通会员',
                currentTierMin: currentMin,
                nextTierMin: nextMin,
                barPercent,
                subLine,
                growthTiers,
                memberLevels,
                currentGrowthMin: activeTierMin,
                currentRoleLevel: roleLevel,
                currentRoleName: roleName,
                ...cardViewModel,
                cardReady: true
            });
        } catch (e) {
            console.error('[membership-center] 加载失败:', e);
            this.setData({ loading: false, loadError: true, cardReady: false });
        }
    },

    onCardSwiperChange(e) {
        if (!this.data.cardReady) return;
        const current = Number(e.detail && e.detail.current);
        const cardSwiperCurrent = current === 1 ? 1 : 0;
        const activeCard = cardSwiperCurrent === 1 ? 'agent' : 'consume';
        if (cardSwiperCurrent === this.data.cardSwiperCurrent && activeCard === this.data.activeCard) {
            return;
        }
        this.setData({
            cardSwiperCurrent,
            activeCard,
            currentCardMeta: getMembershipCardMeta({
                activeCard,
                consumeCardSummary: this.data.consumeCardSummary,
                agentCardSummary: this.data.agentCardSummary
            })
        });
    },

    onCardTabTap(e) {
        if (!this.data.cardReady) return;
        const type = e.currentTarget.dataset.type;
        const cardSwiperCurrent = type === 'agent' ? 1 : 0;
        const activeCard = cardSwiperCurrent === 1 ? 'agent' : 'consume';
        if (activeCard === this.data.activeCard) return;
        this.setData({
            cardSwiperCurrent,
            activeCard,
            currentCardMeta: getMembershipCardMeta({
                activeCard,
                consumeCardSummary: this.data.consumeCardSummary,
                agentCardSummary: this.data.agentCardSummary
            })
        });
    },

    goTeamCenter() {
        wx.navigateTo({ url: '/pages/distribution/business-center' });
    },

    onRetry() {
        this.loadData();
    }
});
