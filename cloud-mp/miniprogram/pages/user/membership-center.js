// pages/user/membership-center.js - 权益中心（整合版）
const { get } = require('../../utils/request');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { applyGrowthTierDisplayNames, calculateCumulativeGrowthPercent } = require('../../utils/growthTierDisplay');
const { ROLE_NAMES } = require('../../config/constants');
const {
    buildMembershipCardViewModel
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
        return '成长值提升可解锁更多权益';
    }
    return text
        .replace(/积分会员/g, '成长值档位')
        .replace(/成长会员权益/g, '成长值权益')
        .replace(/积分权益/g, '权益')
        .replace(/积分/g, '成长值');
}

function normalizeUpgradeProgress(raw) {
    if (!raw || raw.visible === false) {
        return {
            visible: false,
            state: 'hidden',
            title: '',
            summary: '',
            statusText: '',
            statusClass: '',
            effective_order_days: 0,
            recommended_path: null,
            other_paths: []
        };
    }
    const recommendedPath = raw.recommended_path || null;
    const otherPaths = Array.isArray(raw.other_paths) ? raw.other_paths : [];
    const state = String(raw.state || 'pending');
    return {
        ...raw,
        visible: true,
        state,
        statusText: state === 'ready' ? '已满足' : (state === 'max_auto_level' ? '当前最高' : '进行中'),
        statusClass: state === 'ready' ? 'upgrade-status-ready' : (state === 'max_auto_level' ? 'upgrade-status-max' : 'upgrade-status-pending'),
        effective_order_days: Number(raw.effective_order_days || 0),
        recommended_path: recommendedPath,
        other_paths: otherPaths,
        bestPercent: recommendedPath ? Math.max(0, Math.min(100, Number(recommendedPath.percent || 0))) : 100,
        showOtherPaths: otherPaths.length > 0
    };
}

function pickNumberValue(source = {}, keys = [], fallback = 0) {
    for (const key of keys) {
        const value = source && source[key];
        if (value === null || value === undefined || value === '') continue;
        const number = Number(value);
        if (Number.isFinite(number)) return number;
    }
    return fallback;
}

function resolvePointsBalance(data = {}) {
    return Math.max(0, pickNumberValue(data, [
        'available_points',
        'balance_points',
        'balance',
        'points',
        'total_points'
    ]));
}

function resolveCouponCount(data = {}) {
    const explicit = pickNumberValue(data, [
        'total',
        'count',
        'unused_count'
    ], NaN);
    if (Number.isFinite(explicit)) {
        return Math.max(0, explicit);
    }
    if (Array.isArray(data.list)) return data.list.length;
    if (Array.isArray(data.coupons)) return data.coupons.length;
    return 0;
}

Page({
    data: {
        loading: true,
        loadError: false,
        growthValue: 0,
        pointsBalance: 0,
        couponCount: 0,
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
        consumeCardSummary: {},
        agentCardSummary: {},
        agentUpgradeProgress: normalizeUpgradeProgress(null)
    },

    onLoad() {
        const mc = getConfigSection('membership_config') || {};
        wx.setNavigationBarTitle({ title: mc.membership_center_page_title || '权益中心' });
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
            const [profileRes, metaRes, pointsRes, couponsRes] = await Promise.all([
                get('/user/profile'),
                get('/user/member-tier-meta'),
                get('/points/account').catch(() => ({ code: -1, data: {} })),
                get('/coupons/mine?status=unused&limit=1').catch(() => ({ code: -1, data: { total: 0 } }))
            ]);
            if (profileRes.code !== 0 || !profileRes.data) {
                throw new Error(profileRes.message || '加载失败');
            }
            const g = Math.max(0, Number(profileRes.data.growth_value) || 0);
            const roleLevel = Number(profileRes.data.role_level) || 0;
            const meta = (metaRes && metaRes.code === 0 && metaRes.data) ? metaRes.data : {};
            const currentMeta = meta.current || {};
            
            // 积分和券数据。不同接口历史字段不完全一致，这里统一归一到资产中心口径。
            const pointsBalance = (pointsRes.code === 0 && pointsRes.data) ? resolvePointsBalance(pointsRes.data) : 0;
            const couponCount = (couponsRes.code === 0 && couponsRes.data) ? resolveCouponCount(couponsRes.data) : 0;

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
                barPercent = calculateCumulativeGrowthPercent(g, nextMin, 0);
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
            const {
                consumeCardSummary,
                agentCardSummary
            } = buildMembershipCardViewModel({
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
            const agentUpgradeProgress = normalizeUpgradeProgress(meta.agent_upgrade_progress);

            this.setData({
                loading: false,
                growthValue: Math.floor(g),
                pointsBalance: Math.floor(pointsBalance),
                couponCount: couponCount,
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
                consumeCardSummary,
                agentCardSummary,
                agentUpgradeProgress
            });
        } catch (e) {
            console.error('[membership-center] 加载失败:', e);
            this.setData({ loading: false, loadError: true });
        }
    },

    goTeamCenter() {
        wx.navigateTo({ url: '/pages/distribution/business-center' });
    },

    goPoints() {
        wx.navigateTo({ url: '/pages/points/index' });
    },

    goCouponList() {
        wx.navigateTo({ url: '/pages/coupon/list' });
    },

    goCouponCenter() {
        wx.navigateTo({ url: '/pages/coupon/center' });
    },

    goLottery() {
        wx.navigateTo({ url: '/pages/lottery/lottery' });
    },

    onRetry() {
        this.loadData();
    }
});
