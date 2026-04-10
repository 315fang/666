const app = getApp();
const { get } = require('../../utils/request');
const { ROLE_NAMES } = require('../../config/constants');
const { ErrorHandler } = require('../../utils/errorHandler');
const { fetchUserProfile } = require('../../utils/userProfile');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { requestCache } = require('../../utils/requestCache');
const { fetchPointSummary } = require('../../utils/points');
const { listFavorites, listFootprints } = require('../../utils/localUserContent');
const { parseImages } = require('../../utils/dataFormatter');

const USER_DASHBOARD_TTL = 15 * 1000;
const QUAD_PLACEHOLDER = '/assets/images/placeholder.svg';
const ORDER_BADGE_SNAPSHOT_KEY = 'user_order_badge_seen_snapshot';

function getOrderBadgeSnapshotStorageKey(page) {
    const userId = page?.data?.userInfo?.id || app.globalData?.userInfo?.id || 0;
    return `${ORDER_BADGE_SNAPSHOT_KEY}_${userId || 'guest'}`;
}

function readOrderBadgeSnapshot(page) {
    try {
        return wx.getStorageSync(getOrderBadgeSnapshotStorageKey(page)) || {};
    } catch (_) {
        return {};
    }
}

function writeOrderBadgeSnapshot(page, snapshot) {
    try {
        wx.setStorageSync(getOrderBadgeSnapshotStorageKey(page), snapshot || {});
    } catch (_) {
        // ignore storage write failures
    }
}

function buildOrderFreshFlags(currentStats = {}, seenSnapshot = {}) {
    return {
        pending: Number(currentStats.pending || 0) > Number(seenSnapshot.pending || 0),
        paid: Number(currentStats.paid || 0) > Number(seenSnapshot.paid || 0),
        shipped: Number(currentStats.shipped || 0) > Number(seenSnapshot.shipped || 0),
        pendingReview: Number(currentStats.pendingReview || 0) > Number(seenSnapshot.pendingReview || 0),
        refund: Number(currentStats.refund || 0) > Number(seenSnapshot.refund || 0)
    };
}

function orderFirstThumb(order) {
    if (!order || !order.product) return QUAD_PLACEHOLDER;
    const imgs = parseImages(order.product.images);
    return imgs[0] || QUAD_PLACEHOLDER;
}

function applyGrowthDisplay(page, info) {
    if (!info) {
        page.setData({ growthDisplay: null });
        return;
    }

    const membershipConfig = getConfigSection('membership_config') || {};
    const growthProgress = info.growth_progress || {};
    const growthValue = Number(info.growth_value) || 0;
    const currentTier = growthProgress.current || {};
    const nextTier = growthProgress.next || null;
    let percent = Number(growthProgress.percent);
    if (!Number.isFinite(percent)) percent = 0;
    const barPercent = Math.min(100, Math.max(0, percent));
    const nextThreshold = growthProgress.next_threshold;

    let subLine = '';
    if (!nextTier) {
        subLine = membershipConfig.growth_bar_max_tier_text || '您已达到当前成长体系最高档位';
    } else {
        const needRaw = nextThreshold != null ? Number(nextThreshold) - growthValue : 0;
        const need = Math.max(0, Math.ceil(needRaw));
        const template = membershipConfig.growth_bar_subtitle_template || '距离「{next}」还需 {need} 成长值';
        const nextName = nextTier.name || '下一等级';
        subLine = String(template)
            .replace(/\{next\}/g, nextName)
            .replace(/\{need\}/g, String(need));
    }

    page.setData({
        growthDisplay: {
            value: Math.floor(growthValue),
            currentTierName: currentTier.name || '',
            barPercent,
            subLine,
            privilegeLinkText: membershipConfig.growth_privileges_entry_text || '查看权益'
        }
    });
}

function refreshBusinessCenterVisibility(page) {
    const membershipConfig = getConfigSection('membership_config');
    const minRoleLevel = Number(membershipConfig.business_center_min_role_level);
    const threshold = Number.isFinite(minRoleLevel) ? minRoleLevel : 1;
    const loggedIn = !!(app.globalData && app.globalData.isLoggedIn);
    const userInfo = page.data.userInfo || app.globalData.userInfo || {};
    const roleLevel = userInfo.role_level != null ? userInfo.role_level : 0;
    page.setData({ showBusinessCenter: loggedIn && roleLevel >= threshold });
}

function scheduleSecondaryLoads(page, forceRefresh = false) {
    clearTimeout(page._secondaryLoadTimer);
    const delay = forceRefresh ? 0 : 180;
    page._secondaryLoadTimer = setTimeout(() => {
        const tasks = [
            loadOrderCounts(page),
            loadNotificationsCount(page),
            loadAssetRow(page),
            loadQuadPreviews(page),
            loadDistributionInfo(page),
            loadPickupVerifyScope(page)
        ];
        Promise.allSettled(tasks);
    }, delay);
}

async function loadPageLayoutConfig(page) {
    try {
        const response = await get('/page-content', { page_key: 'user' });
        const pageData = response?.data || {};
        page.setData({
            pageLayout: pageData.layout || null
        });
    } catch (_) {
        // 页面编排接口失败时静默回退，避免影响“我的页”主流程
    }
}

async function loadUserInfo(page, forceRefresh = false) {
    const isLoggedIn = app.globalData.isLoggedIn;
    page.setData({ isLoggedIn });

    if (!isLoggedIn) {
        page.setData({
            userInfo: app.globalData.userInfo,
            showBusinessCenter: false,
            growthDisplay: null,
            unusedCouponCount: 0,
            pointsBalanceDisplay: '--',
            commissionBalance: '0.00',
            couponBanner: null,
            notificationsCount: 0,
            orderStats: { pending: 0, paid: 0, shipped: 0, pendingReview: 0, refund: 0 }
        });
        await loadQuadPreviews(page);
        return;
    }

    if (!forceRefresh && page._dashboardRefreshPromise) {
        return page._dashboardRefreshPromise;
    }

    if (!forceRefresh && page._lastDashboardRefreshAt && (Date.now() - page._lastDashboardRefreshAt) < USER_DASHBOARD_TTL) {
        refreshBusinessCenterVisibility(page);
        scheduleSecondaryLoads(page, false);
        return;
    }

    page._dashboardRefreshPromise = (async () => {
        const result = await fetchUserProfile();
        if (result) {
            const info = result.info;
            const roleLevel = info.role_level || 0;
            const participateDistribution = info.participate_distribution === 1 || info.participate_distribution === true;
            info.participate_distribution = participateDistribution ? 1 : 0;
            page.setData({
                userInfo: info,
                hasUserInfo: true,
                isAgent: roleLevel >= 2
            });
            applyGrowthDisplay(page, info);
            refreshBusinessCenterVisibility(page);
        } else {
            const cached = app.globalData.userInfo;
            const roleLevel = cached?.role_level != null ? cached.role_level : 0;
            page.setData({
                userInfo: cached,
                hasUserInfo: !!cached
            });
            applyGrowthDisplay(page, cached);
            refreshBusinessCenterVisibility(page);
        }
        page._lastDashboardRefreshAt = Date.now();
    })().catch((error) => {
        ErrorHandler.handle(error, {
            customMessage: '加载用户信息失败',
            showToast: false
        });
        const cached = app.globalData.userInfo;
        const roleLevel = cached?.role_level != null ? cached.role_level : 0;
        page.setData({
            userInfo: cached,
            hasUserInfo: !!cached
        });
        applyGrowthDisplay(page, cached);
        refreshBusinessCenterVisibility(page);
    }).finally(() => {
        page._dashboardRefreshPromise = null;
    });

    scheduleSecondaryLoads(page, forceRefresh);
    return page._dashboardRefreshPromise;
}

async function loadAssetRow(page) {
    if (!app.globalData.isLoggedIn) {
        page.setData({ unusedCouponCount: 0, pointsBalanceDisplay: '--', couponBanner: null });
        return;
    }
    try {
        const [couponResponse, pointWrap] = await Promise.all([
            get('/coupons/mine', { status: 'unused' }).catch(() => ({ code: -1, data: [] })),
            fetchPointSummary().catch(() => ({ account: {} }))
        ]);
        const coupons = couponResponse.code === 0 ? (couponResponse.data || []) : [];
        const unusedCouponCount = coupons.length;
        const balance = pointWrap.account != null ? pointWrap.account.balance_points : 0;
        let couponBanner = null;
        if (unusedCouponCount > 0) {
            const firstCoupon = coupons[0];
            const minValue = Number(firstCoupon.min_purchase) > 0 ? `满${firstCoupon.min_purchase}元可用` : '无门槛';
            couponBanner = {
                id: firstCoupon.id,
                value: firstCoupon.coupon_type === 'percent'
                    ? `${(Number(firstCoupon.coupon_value || 0) * 10).toFixed(0)}折`
                    : `¥${firstCoupon.coupon_value}`,
                name: firstCoupon.coupon_name || '优惠券',
                minPurchase: minValue
            };
        }
        page.setData({
            unusedCouponCount,
            pointsBalanceDisplay: balance != null ? String(balance) : '0',
            couponBanner
        });
    } catch (_) {
        // ignore
    }
}

async function loadQuadPreviews(page) {
    const favorites = listFavorites();
    const footprints = listFootprints();
    let quadFavorite = {
        count: favorites.length,
        sub: favorites.length ? `${favorites.length}件收藏宝贝` : '暂无收藏',
        image: favorites[0]?.image || QUAD_PLACEHOLDER,
        hasImage: !!favorites[0]?.image
    };
    let quadFootprint = {
        count: footprints.length,
        sub: footprints.length ? `${footprints.length}条浏览足迹` : '看过的商品',
        image: footprints[0]?.image || QUAD_PLACEHOLDER,
        hasImage: !!footprints[0]?.image
    };

    if (!app.globalData.isLoggedIn) {
        page.setData({ quadFavorite, quadFootprint });
        return;
    }

    try {
        const [favoriteResponse] = await Promise.all([
            get('/user/favorites', {}, { showError: false }).catch(() => null)
        ]);

        if (favoriteResponse && favoriteResponse.code === 0 && Array.isArray(favoriteResponse.data) && favoriteResponse.data.length) {
            const list = favoriteResponse.data;
            quadFavorite = {
                count: list.length,
                sub: `${list.length}件收藏宝贝`,
                image: list[0].image || QUAD_PLACEHOLDER,
                hasImage: !!list[0].image
            };
        }

    } catch (_) {
        // keep defaults
    }

    page.setData({
        quadFavorite,
        quadFootprint
    });
}

async function loadOrderCounts(page) {
    if (!app.globalData.isLoggedIn) return;

    try {
        const results = await Promise.all([
            get('/orders', { status: 'pending', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } })),
            get('/orders', { status: 'paid', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } })),
            get('/orders', { status: 'shipped', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } })),
            get('/orders', { status: 'pending_review', limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } })),
            get('/refunds', { status: 'pending', page: 1, limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } })),
            get('/refunds', { status: 'approved', page: 1, limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } })),
            get('/refunds', { status: 'processing', page: 1, limit: 1 }).catch(() => ({ data: { pagination: { total: 0 } } }))
        ]);

        const pending = results[0].data?.pagination?.total || 0;
        const paid = results[1].data?.pagination?.total || 0;
        const shipped = results[2].data?.pagination?.total || 0;
        const pendingReview = results[3].data?.pagination?.total || 0;
        const refund = (results[4].data?.pagination?.total || 0)
            + (results[5].data?.pagination?.total || 0)
            + (results[6].data?.pagination?.total || 0);

        const nextStats = {
            pending,
            paid,
            shipped,
            pendingReview,
            refund
        };
        const seenSnapshot = readOrderBadgeSnapshot(page);
        const freshFlags = buildOrderFreshFlags(nextStats, seenSnapshot);
        // 只更新 orderStats 数字；orderFreshFlags 采用合并不覆盖策略：
        // - 某状态 freshFlag 已为 false（用户已点过），保持 false 不再亮起
        // - 某状态 freshFlag 为 true 且新计算也为 true，保持亮起
        // - 只有新订单数量增加时才重新亮起
        const mergedFlags = {};
        const currentFlags = page.data.orderFreshFlags || {};
        ['pending', 'paid', 'shipped', 'pendingReview', 'refund'].forEach((key) => {
            mergedFlags[key] = freshFlags[key] ? true : (currentFlags[key] || false);
        });
        page.setData({
            'orderStats.pending': pending,
            'orderStats.paid': paid,
            'orderStats.shipped': shipped,
            'orderStats.pendingReview': pendingReview,
            'orderStats.refund': refund,
            orderFreshFlags: mergedFlags
        });
    } catch (error) {
        console.error('加载订单数量失败:', error);
    }
}

function markOrderBadgesSeen(page, statuses) {
    const currentStats = page.data.orderStats || {};
    const currentFlags = page.data.orderFreshFlags || {};
    const targetStatuses = Array.isArray(statuses) && statuses.length
        ? statuses
        : ['pending', 'paid', 'shipped', 'pendingReview', 'refund'];
    const nextSnapshot = {
        ...readOrderBadgeSnapshot(page)
    };
    const nextFlags = {
        ...currentFlags
    };

    targetStatuses.forEach((status) => {
        nextSnapshot[status] = Number(currentStats[status] || 0);
        nextFlags[status] = false;
    });

    writeOrderBadgeSnapshot(page, nextSnapshot);
    page.setData({ orderFreshFlags: nextFlags });
}

async function loadDistributionInfo(page) {
    try {
        const response = await get('/distribution/overview');
        if (response.code === 0 && response.data) {
            const dashboard = response.data;
            const totalEarnings = dashboard.stats ? dashboard.stats.totalEarnings : '0.00';
            const availableAmount = dashboard.stats ? dashboard.stats.availableAmount : '0.00';
            const frozenAmount = dashboard.stats ? (dashboard.stats.frozenAmount || '0.00') : '0.00';
            const goodsFundBalance = dashboard.team && dashboard.team.agentGoodsFund
                ? (dashboard.team.agentGoodsFund.goods_fund_balance || '0.00')
                : '0.00';
            const teamCount = dashboard.team ? dashboard.team.totalCount : 0;
            const roleLevel = dashboard.userInfo ? dashboard.userInfo.role : 0;

            page.setData({
                distributionInfo: {
                    totalEarnings,
                    availableAmount,
                    goodsFundBalance,
                    referee_count: teamCount,
                    role_level: roleLevel,
                    role_name: dashboard.userInfo ? (dashboard.userInfo.role_name || ROLE_NAMES[roleLevel]) : '普通用户'
                },
                stats: { frozenAmount },
                balance: goodsFundBalance,
                commissionBalance: availableAmount,
                teamCount,
                isAgent: roleLevel >= 2
            });
        }
    } catch (error) {
        console.error('加载分销信息失败:', error);
    }
}

async function loadNotificationsCount(page) {
    if (!app.globalData.isLoggedIn) {
        page.setData({ notificationsCount: 0 });
        return;
    }
    try {
        const response = await get('/notifications', { page: 1, limit: 1 });
        if (response.code === 0 && response.data) {
            page.setData({ notificationsCount: response.data.unread_count || 0 });
        }
    } catch (error) {
        console.error('加载通知计数失败:', error);
    }
}

async function loadPickupVerifyScope(page) {
    if (!app.globalData.isLoggedIn) {
        page.setData({
            showPickupVerify: false,
            pickupVerifyScope: null
        });
        return;
    }
    try {
        const response = await get('/stations/my-scope', {}, { showError: false });
        console.log('[userDashboard] loadPickupVerifyScope response:', JSON.stringify(response?.data || null));
        if (response && response.code === 0 && response.data) {
            page.setData({
                showPickupVerify: !!response.data.has_verify_access,
                pickupVerifyScope: response.data
            });
            return;
        }
    } catch (e) {
        console.error('[userDashboard] loadPickupVerifyScope error:', e);
    }
    page.setData({
        showPickupVerify: false,
        pickupVerifyScope: null
    });
}

function clearUserCache() {
    [
        'home_config_cache',
        'mini_program_config_cache',
        'active_theme_cache',
        'splash_config_cache',
        'directBuyInfo',
        'selectedAddress',
        'searchHistory'
    ].forEach((key) => wx.removeStorageSync(key));
    requestCache.clear();
}

module.exports = {
    applyGrowthDisplay,
    clearUserCache,
    loadAssetRow,
    loadDistributionInfo,
    loadNotificationsCount,
    loadOrderCounts,
    loadPageLayoutConfig,
    loadPickupVerifyScope,
    loadQuadPreviews,
    loadUserInfo,
    markOrderBadgesSeen,
    refreshBusinessCenterVisibility,
    scheduleSecondaryLoads
};
