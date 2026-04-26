const app = getApp();
const { get } = require('../../utils/request');
const { callFn } = require('../../utils/cloud');
const { ROLE_NAMES } = require('../../config/constants');

/** 与后台 DEFAULT_ROLE_NAMES / 分销侧代理等级一致，避免接口里旧文案（如「代理会员」）与等级不符 */
function resolveAgentRoleBadgeName(roleLevel) {
    const n = Number(roleLevel);
    if (!Number.isFinite(n) || n < 0) return ROLE_NAMES[0];
    const text = ROLE_NAMES[n];
    return text != null ? text : ROLE_NAMES[0];
}

/** 避免在 WXML 的 class 里写三元表达式，部分基础库会报 FLOW_INITIAL_CREATION 渲染错误 */
function agentPillSkinClassForLevel(roleLevel) {
    const n = Number(roleLevel);
    return n === 6 ? 'hero-member-pill-store' : 'hero-member-pill-agent';
}
const { ErrorHandler } = require('../../utils/errorHandler');
const { fetchUserProfile } = require('../../utils/userProfile');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { requestCache, cachedGet } = require('../../utils/requestCache');
const { fetchPointSummary } = require('../../utils/points');
const { listFavorites, listFootprints } = require('../../utils/localUserContent');
const { parseImages } = require('../../utils/dataFormatter');
const { resolveCloudImageUrl } = require('../../utils/cloudAssetRuntime');
const {
    calculateCumulativeGrowthPercent,
    getDisplayNextTierForGrowth,
    getDisplayTierForGrowth,
    pickProgressPercent,
    resolveNextThreshold
} = require('../../utils/growthTierDisplay');

const USER_DASHBOARD_TTL = 15 * 1000;
const USER_SECONDARY_TTL = 60 * 1000;
const USER_PAGE_LAYOUT_TTL = 5 * 60 * 1000;
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

function normalizeOrderBadgeStatus(status) {
    if (status === 'pending_review') return 'pendingReview';
    return status;
}

function extractResponseList(response) {
    if (!response) return [];
    const data = response.data;
    const list = Array.isArray(response.list)
        ? response.list
        : (data && Array.isArray(data.list) ? data.list : data);
    return Array.isArray(list) ? list : [];
}

function pickPointBalance(account = {}) {
    const value = account.balance_points != null
        ? account.balance_points
        : (account.points != null ? account.points : account.growth_value);
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function formatMoney(value, fallback = '0.00') {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : fallback;
}

/** 「我的」资产卡片展示：只显示整数部分（截断小数，非四舍五入） */
function formatMoneyInt(value, fallback = '0') {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return String(Math.trunc(n));
}

function pickPiggyBankLockedAmount(source = {}) {
    const piggyBank = source.piggyBank || source.piggy_bank || {};
    return source.piggyBankLockedAmount
        ?? source.piggy_bank_locked_amount
        ?? piggyBank.locked_amount
        ?? piggyBank.lockedAmount
        ?? 0;
}

async function loadPiggyBankBalanceDisplay() {
    const progress = await callFn('distribution', { action: 'promotionProgress' }, {
        showError: false,
        preventDup: true,
        maxRetries: 0,
        readOnly: true
    }).catch(() => null);
    return formatMoneyInt(pickPiggyBankLockedAmount(progress || {}));
}

function buildDisplayNickname(info) {
    const rawName = info?.nick_name || info?.nickname || info?.nickName || '微信用户';
    return String(rawName).trim() || '微信用户';
}

async function resolveQuadPreviewImage(value) {
    const resolved = await resolveCloudImageUrl(value, QUAD_PLACEHOLDER).catch(() => '');
    return resolved || QUAD_PLACEHOLDER;
}

function buildBrowseFavoriteSub(favoriteCount = 0, footprintCount = 0) {
    const favCount = Math.max(0, Number(favoriteCount) || 0);
    const viewCount = Math.max(0, Number(footprintCount) || 0);
    if (favCount > 0 && viewCount > 0) return `${viewCount}条近期浏览 · ${favCount}件收藏`;
    if (viewCount > 0) return `${viewCount}条近期浏览`;
    if (favCount > 0) return `${favCount}件收藏`;
    return '暂无浏览与收藏';
}

async function buildLocalQuadPreviews() {
    const favorites = listFavorites();
    const footprints = listFootprints();
    const [favoriteImage, footprintImage] = await Promise.all([
        favorites[0] ? resolveQuadPreviewImage(favorites[0]?.image_ref || favorites[0]?.image) : Promise.resolve(QUAD_PLACEHOLDER),
        footprints[0] ? resolveQuadPreviewImage(footprints[0]?.image_ref || footprints[0]?.image) : Promise.resolve(QUAD_PLACEHOLDER)
    ]);
    return {
        quadFavorite: {
            count: favorites.length,
            sub: buildBrowseFavoriteSub(favorites.length, footprints.length),
            image: favoriteImage,
            hasImage: !!favorites[0]
        },
        quadFootprint: {
            count: footprints.length,
            sub: footprints.length ? `${footprints.length}条浏览足迹` : '看过的商品',
            image: footprintImage,
            hasImage: !!footprints[0]
        }
    };
}

function normalizeQuadPreviewCard(raw = {}, fallback = {}) {
    const image = raw.image || raw.cover_image || fallback.image || QUAD_PLACEHOLDER;
    const count = Number.isFinite(Number(raw.count)) ? Number(raw.count) : Number(fallback.count || 0);
    return {
        ...fallback,
        ...raw,
        count,
        image: image || QUAD_PLACEHOLDER,
        hasImage: raw.hasImage != null
            ? !!raw.hasImage
            : (raw.has_image != null ? !!raw.has_image : !!(image && image !== QUAD_PLACEHOLDER)),
        sub: raw.sub || raw.subtitle || fallback.sub || ''
    };
}

function createEmptyCartPreview(loggedIn = true) {
    return {
        count: 0,
        total: '0.00',
        sub: loggedIn ? '购物袋空空如也' : '登录后同步购物袋',
        meta: loggedIn ? '去挑选喜欢的商品' : '登录后查看待购商品',
        primaryName: loggedIn ? '暂无待购商品' : '登录后查看购物袋',
        hasItems: false,
        items: [],
        cartIds: '',
        remainingCount: 0,
        actionText: loggedIn ? '去挑选' : '去登录'
    };
}

function extractCartItems(response) {
    if (!response) return [];
    const data = response.data;
    if (Array.isArray(response.items)) return response.items;
    if (Array.isArray(response.list)) return response.list;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    if (data && Array.isArray(data.list)) return data.list;
    return [];
}

function parseCartQuantity(item = {}) {
    const qty = Number(item.quantity != null ? item.quantity : item.qty);
    return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function parseCartPrice(item = {}) {
    const candidates = [
        item.effective_price,
        item.price,
        item.snapshot_price,
        item.sku && item.sku.retail_price,
        item.sku && item.sku.price,
        item.product && item.product.retail_price,
        item.product && item.product.price
    ];
    for (const value of candidates) {
        const price = Number(value);
        if (Number.isFinite(price) && price >= 0) return price;
    }
    return 0;
}

function pickCartProductName(item = {}) {
    return String(
        item.product?.name
        || item.snapshot_name
        || item.name
        || '购物袋商品'
    ).trim();
}

function pickCartSpecText(item = {}) {
    const raw = item.snapshot_spec || item.sku?.spec_value || item.sku?.spec || item.spec || '';
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
        return raw
            .map((entry) => entry && (entry.value || entry.name))
            .filter(Boolean)
            .join(' / ');
    }
    if (typeof raw === 'object') {
        return Object.keys(raw)
            .map((key) => raw[key])
            .filter(Boolean)
            .join(' / ');
    }
    return String(raw);
}

function pickCartImageSource(item = {}) {
    return item.image
        || item.firstImage
        || item.sku?.image
        || item.snapshot_image
        || item.product?.display_image
        || item.product?.preview_images
        || item.product?.images
        || item.product?.image_url
        || item.product?.image
        || QUAD_PLACEHOLDER;
}

async function buildCartPreview(response, loggedIn = true) {
    if (!loggedIn) return createEmptyCartPreview(false);

    const items = extractCartItems(response);
    if (!items.length) return createEmptyCartPreview(true);

    const count = items.reduce((sum, item) => sum + parseCartQuantity(item), 0);
    const total = items.reduce((sum, item) => sum + parseCartPrice(item) * parseCartQuantity(item), 0);
    const previewItems = await Promise.all(items.slice(0, 3).map(async (item) => ({
        id: item.id || item._id || '',
        name: pickCartProductName(item),
        spec: pickCartSpecText(item),
        quantity: parseCartQuantity(item),
        image: await resolveQuadPreviewImage(pickCartImageSource(item))
    })));
    const primary = previewItems[0] || {};
    const cartIds = items.map((item) => item.id || item._id).filter(Boolean).join(',');

    return {
        count,
        total: formatMoney(total),
        sub: `共 ${count} 件，合计 ¥${formatMoney(total)}`,
        meta: primary.spec ? `${primary.spec} · x${primary.quantity}` : `x${primary.quantity || 1}`,
        primaryName: primary.name || '购物袋商品',
        hasItems: true,
        items: previewItems,
        cartIds,
        remainingCount: Math.max(0, items.length - previewItems.length),
        actionText: '去结算'
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
    const fallbackCurrentTier = getDisplayTierForGrowth(growthValue);
    const fallbackNextTier = getDisplayNextTierForGrowth(growthValue);
    const currentTier = growthProgress.current || growthProgress.tier || fallbackCurrentTier || {};
    const nextTier = growthProgress.next || growthProgress.nextLevel || fallbackNextTier || null;
    const fallbackPercent = pickProgressPercent(growthProgress, 0);
    const nextThreshold = resolveNextThreshold(growthProgress, fallbackNextTier ? fallbackNextTier.min : null);
    const barPercent = nextTier
        ? calculateCumulativeGrowthPercent(growthValue, nextThreshold, fallbackPercent)
        : 100;

    let subLine = '';
    if (!nextTier) {
        subLine = membershipConfig.growth_bar_max_tier_text || '已达到当前最高等级';
    } else {
        const needRaw = nextThreshold != null ? Number(nextThreshold) - growthValue : 0;
        const need = Math.max(0, Math.ceil(needRaw));
        const template = membershipConfig.growth_bar_subtitle_template || '距离「{next}」还需 {need} 成长值';
        const nextName = nextTier.name || '下一等级';
        subLine = String(template
            .replace(/\{next\}/g, nextName)
            .replace(/\{need\}/g, String(need)));
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
    const loggedIn = !!(app.globalData && app.globalData.isLoggedIn);
    page.setData({ showBusinessCenter: loggedIn });
}

function hasFreshTimestamp(timestamp, ttl) {
    return !!timestamp && (Date.now() - timestamp) < ttl;
}

function clearSecondaryLoadState(page) {
    if (page._secondaryLoadTimer) {
        clearTimeout(page._secondaryLoadTimer);
        page._secondaryLoadTimer = null;
    }
    const resolvePending = page._secondaryLoadDone;
    page._secondaryLoadDone = null;
    page._secondaryLoadPromise = null;
    if (typeof resolvePending === 'function') {
        resolvePending();
    }
}

function scheduleSecondaryLoads(page, forceRefresh = false) {
    if (page._secondaryLoadPromise) {
        return page._secondaryLoadPromise;
    }
    if (!forceRefresh && hasFreshTimestamp(page._lastSecondaryRefreshAt, USER_SECONDARY_TTL)) {
        return Promise.resolve();
    }

    clearSecondaryLoadState(page);
    const delay = forceRefresh ? 0 : 200;
    page._secondaryLoadPromise = new Promise((resolve) => {
        page._secondaryLoadDone = resolve;
        page._secondaryLoadTimer = setTimeout(() => {
            page._secondaryLoadTimer = null;
            loadDashboardBootstrap(page).catch(() => {
                const legacyTasks = [
                    loadOrderCounts(page),
                    loadNotificationsCount(page),
                    loadAssetRow(page),
                    loadCartPreview(page),
                    loadQuadPreviews(page),
                    loadDistributionInfo(page),
                    loadPickupVerifyScope(page)
                ];
                return Promise.allSettled(legacyTasks);
            }).finally(() => {
                page._lastSecondaryRefreshAt = Date.now();
                clearSecondaryLoadState(page);
            });
        }, delay);
    });
    return page._secondaryLoadPromise;
}

async function loadDashboardBootstrap(page) {
    if (!app.globalData.isLoggedIn) {
        const localQuad = await buildLocalQuadPreviews();
        page.setData({
            ...localQuad,
            cartPreview: createEmptyCartPreview(false)
        });
        return;
    }

    const openid = app.globalData.openid || wx.getStorageSync('openid') || '';
    const [response, cartPreview] = await Promise.all([
        cachedGet(get, '/user/dashboard-bootstrap', { _openid_cache_key: openid }, {
            cacheTTL: USER_DASHBOARD_TTL,
            showError: false,
            maxRetries: 0
        }),
        fetchCartPreview(true)
    ]);
    if (!response || response.code !== 0 || !response.data) {
        throw new Error('dashboard bootstrap failed');
    }

    const payload = response.data || {};
    const localQuad = await buildLocalQuadPreviews();
    const favoriteCard = normalizeQuadPreviewCard(payload.quadPreview?.favorite || {}, localQuad.quadFavorite);
    const footprintPayload = payload.quadPreview?.footprint || {};
    const useServerFootprint = Number(footprintPayload.count || 0) > 0 || !!(footprintPayload.image || footprintPayload.cover_image);
    const footprintCard = useServerFootprint
        ? normalizeQuadPreviewCard(footprintPayload, localQuad.quadFootprint)
        : localQuad.quadFootprint;
    const browseFavoriteCard = {
        ...favoriteCard,
        sub: buildBrowseFavoriteSub(favoriteCard.count, footprintCard.count)
    };

    const nextStats = {
        pending: Number(payload.orderStats?.pending || 0),
        paid: Number(payload.orderStats?.paid || 0),
        shipped: Number(payload.orderStats?.shipped || 0),
        pendingReview: Number(payload.orderStats?.pendingReview || 0),
        refund: Number(payload.orderStats?.refund || 0)
    };
    const seenSnapshot = readOrderBadgeSnapshot(page);
    const freshFlags = buildOrderFreshFlags(nextStats, seenSnapshot);
    const currentFlags = page.data.orderFreshFlags || {};
    const mergedFlags = {};
    ['pending', 'paid', 'shipped', 'pendingReview', 'refund'].forEach((key) => {
        mergedFlags[key] = freshFlags[key] ? true : (currentFlags[key] || false);
    });

    const distributionCard = payload.distributionCard || {};
    const pickupScopeLight = payload.pickupScopeLight || {};

    page.setData({
        'orderStats.pending': nextStats.pending,
        'orderStats.paid': nextStats.paid,
        'orderStats.shipped': nextStats.shipped,
        'orderStats.pendingReview': nextStats.pendingReview,
        'orderStats.refund': nextStats.refund,
        orderFreshFlags: mergedFlags,
        notificationsCount: Number(payload.notificationsCount || 0),
        unusedCouponCount: Number(payload.assetRow?.unusedCouponCount || 0),
        pointsBalanceDisplay: String(payload.assetRow?.pointsBalance != null ? payload.assetRow.pointsBalance : 0),
        piggyBankBalance: formatMoneyInt(pickPiggyBankLockedAmount(payload.assetRow || {})),
        cartPreview,
        quadFavorite: browseFavoriteCard,
        quadFootprint: footprintCard,
        stats: { frozenAmount: distributionCard.frozenAmount || '0.00' },
        balance: distributionCard.balance != null ? String(distributionCard.balance) : '0',
        commissionBalance: distributionCard.commissionBalance != null ? String(distributionCard.commissionBalance) : '0',
        teamCount: Number(distributionCard.teamCount || 0),
        isAgent: distributionCard.isAgent != null ? !!distributionCard.isAgent : page.data.isAgent,
        displayAgentRoleLevel: Number(distributionCard.roleLevel != null ? distributionCard.roleLevel : page.data.displayAgentRoleLevel || 0),
        agentRoleBadgeName: distributionCard.roleName || page.data.agentRoleBadgeName,
        agentPillSkinClass: agentPillSkinClassForLevel(Number(distributionCard.roleLevel != null ? distributionCard.roleLevel : page.data.displayAgentRoleLevel || 0)),
        showPickupVerify: !!pickupScopeLight.hasVerifyAccess,
        isStoreManager: !!pickupScopeLight.isStoreManager,
        storeManagerStationName: pickupScopeLight.stationName || '',
        storeManagerStationCount: Number(pickupScopeLight.stationCount || 0),
        pickupVerifyScope: pickupScopeLight.hasVerifyAccess ? pickupScopeLight : null
    });
}

async function loadPageLayoutConfig(page) {
    if (page._pageLayoutPromise) {
        return page._pageLayoutPromise;
    }
    if (hasFreshTimestamp(page._lastPageLayoutAt, USER_PAGE_LAYOUT_TTL)) {
        return page.data.pageLayout || null;
    }

    try {
        page._pageLayoutPromise = get('/page-content', { page_key: 'user' })
            .then((response) => {
                const pageData = response?.data || {};
                page.setData({
                    pageLayout: pageData.layout || null
                });
                page._lastPageLayoutAt = Date.now();
                return pageData.layout || null;
            })
            .finally(() => {
                page._pageLayoutPromise = null;
            });
        return await page._pageLayoutPromise;
    } catch (_) {
        // 页面编排接口失败时静默回退，避免影响“我的页”主流程
        return null;
    }
}

async function loadUserInfo(page, forceRefresh = false) {
    const isLoggedIn = app.globalData.isLoggedIn;
    page.setData({ isLoggedIn });

    if (!isLoggedIn) {
        page.setData({
            userInfo: app.globalData.userInfo,
            displayNickname: buildDisplayNickname(app.globalData.userInfo),
            showBusinessCenter: false,
            growthDisplay: null,
            unusedCouponCount: 0,
            pointsBalanceDisplay: '--',
            balance: '0',
            commissionBalance: '0',
            piggyBankBalance: '0',
            couponBanner: null,
            cartPreview: createEmptyCartPreview(false),
            notificationsCount: 0,
            orderStats: { pending: 0, paid: 0, shipped: 0, pendingReview: 0, refund: 0 },
            displayAgentRoleLevel: 0,
            agentRoleBadgeName: resolveAgentRoleBadgeName(0),
            agentPillSkinClass: 'hero-member-pill-agent'
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
        const cached = app.globalData.userInfo;
        if (cached) {
            const roleLevel = Number(cached.role_level) || 0;
            page.setData({
                userInfo: cached,
                displayNickname: buildDisplayNickname(cached),
                hasUserInfo: true,
                isAgent: roleLevel >= 2,
                displayAgentRoleLevel: roleLevel,
                agentRoleBadgeName: resolveAgentRoleBadgeName(roleLevel),
                agentPillSkinClass: agentPillSkinClassForLevel(roleLevel)
            });
            applyGrowthDisplay(page, cached);
            refreshBusinessCenterVisibility(page);
        }

        const bootstrapPromise = loadDashboardBootstrap(page)
            .then(() => {
                page._lastSecondaryRefreshAt = Date.now();
                return true;
            })
            .catch(() => false);

        const result = await fetchUserProfile();
        if (result) {
            const info = result.info;
            const roleLevel = Number(info.role_level) || 0;
            const participateDistribution = info.participate_distribution === 1 || info.participate_distribution === true;
            info.participate_distribution = participateDistribution ? 1 : 0;
            page.setData({
                userInfo: info,
                displayNickname: buildDisplayNickname(info),
                hasUserInfo: true,
                isAgent: roleLevel >= 2,
                displayAgentRoleLevel: roleLevel,
                agentRoleBadgeName: resolveAgentRoleBadgeName(roleLevel),
                agentPillSkinClass: agentPillSkinClassForLevel(roleLevel)
            });
            applyGrowthDisplay(page, info);
            refreshBusinessCenterVisibility(page);
        } else {
            const cached = app.globalData.userInfo;
            const roleLevel = Number(cached?.role_level) || 0;
            page.setData({
                userInfo: cached,
                displayNickname: buildDisplayNickname(cached),
                hasUserInfo: !!cached,
                displayAgentRoleLevel: roleLevel,
                agentRoleBadgeName: resolveAgentRoleBadgeName(roleLevel),
                agentPillSkinClass: agentPillSkinClassForLevel(roleLevel)
            });
            applyGrowthDisplay(page, cached);
            refreshBusinessCenterVisibility(page);
        }
        const bootstrapOk = await bootstrapPromise;
        if (!bootstrapOk) {
            const legacyTasks = [
                loadOrderCounts(page),
                loadNotificationsCount(page),
                loadAssetRow(page),
                loadCartPreview(page),
                loadQuadPreviews(page),
                loadDistributionInfo(page),
                loadPickupVerifyScope(page)
            ];
            await Promise.allSettled(legacyTasks);
            page._lastSecondaryRefreshAt = Date.now();
        }
        page._lastDashboardRefreshAt = Date.now();
    })().catch((error) => {
        ErrorHandler.handle(error, {
            customMessage: '加载用户信息失败',
            showToast: false
        });
        const cached = app.globalData.userInfo;
        const roleLevel = Number(cached?.role_level) || 0;
        page.setData({
            userInfo: cached,
            displayNickname: buildDisplayNickname(cached),
            hasUserInfo: !!cached,
            displayAgentRoleLevel: roleLevel,
            agentRoleBadgeName: resolveAgentRoleBadgeName(roleLevel),
            agentPillSkinClass: agentPillSkinClassForLevel(roleLevel)
        });
        applyGrowthDisplay(page, cached);
        refreshBusinessCenterVisibility(page);
    }).finally(() => {
        page._dashboardRefreshPromise = null;
    });

    return page._dashboardRefreshPromise;
}

async function fetchCartPreview(loggedIn = true) {
    if (!loggedIn) return createEmptyCartPreview(false);
    const response = await get('/cart', {}, {
        showError: false,
        maxRetries: 0,
        preventDuplicate: true
    }).catch(() => null);
    return buildCartPreview(response, true);
}

async function loadCartPreview(page) {
    if (!app.globalData.isLoggedIn) {
        page.setData({ cartPreview: createEmptyCartPreview(false) });
        return;
    }
    try {
        const cartPreview = await fetchCartPreview(true);
        page.setData({ cartPreview });
    } catch (_) {
        // 购物袋摘要失败不影响账户页主数据。
    }
}

async function loadAssetRow(page) {
    if (!app.globalData.isLoggedIn) {
        page.setData({ unusedCouponCount: 0, pointsBalanceDisplay: '--', piggyBankBalance: '0', couponBanner: null });
        return;
    }
    try {
        const [couponResponse, pointWrap, piggyBankBalance] = await Promise.all([
            get('/coupons/mine', { status: 'unused' }).catch(() => ({ code: -1, data: [] })),
            fetchPointSummary().catch(() => ({ account: {} })),
            loadPiggyBankBalanceDisplay().catch(() => '0')
        ]);
        let coupons = couponResponse.code === 0 ? extractResponseList(couponResponse) : [];
        coupons = coupons.filter((c) => {
            const exp = c && (c.expire_at || c.expires_at || c.end_at || c.valid_until);
            if (!exp) return true;
            const t = new Date(exp).getTime();
            return !Number.isFinite(t) || t > Date.now();
        });
        const unusedCouponCount = coupons.length;
        const balance = pickPointBalance(pointWrap.account || {});
        page.setData({
            unusedCouponCount,
            pointsBalanceDisplay: balance != null ? String(balance) : '0',
            piggyBankBalance,
            couponBanner: null
        });
    } catch (_) {
        // ignore
    }
}

async function loadQuadPreviews(page) {
    const localQuad = await buildLocalQuadPreviews();
    let quadFavorite = localQuad.quadFavorite;
    let quadFootprint = localQuad.quadFootprint;

    if (!app.globalData.isLoggedIn) {
        page.setData({ quadFavorite, quadFootprint });
        return;
    }

    try {
        const [favoriteResponse] = await Promise.all([
            get('/user/favorites', {}, { showError: false }).catch(() => null)
        ]);

        const favoriteList = favoriteResponse && favoriteResponse.code === 0
            ? (Array.isArray(favoriteResponse.data)
                ? favoriteResponse.data
                : (Array.isArray(favoriteResponse.data && favoriteResponse.data.list) ? favoriteResponse.data.list : []))
            : [];

        if (favoriteList.length) {
            const list = favoriteList;
            const favoriteImage = await resolveQuadPreviewImage(list[0].image_ref || list[0].image || list[0].product_image);
            quadFavorite = {
                count: list.length,
                sub: buildBrowseFavoriteSub(list.length, quadFootprint.count),
                image: favoriteImage,
                hasImage: favoriteImage !== QUAD_PLACEHOLDER
            };
        }

    } catch (_) {
        // keep defaults
    }

    page.setData({
        quadFavorite: {
            ...quadFavorite,
            sub: buildBrowseFavoriteSub(quadFavorite.count, quadFootprint.count)
        },
        quadFootprint
    });
}

async function loadOrderCounts(page) {
    if (!app.globalData.isLoggedIn) return;

    try {
        const countsRes = await get('/orders/counts').catch(() => ({ data: {} }));
        const c = countsRes.data || {};

        const pending = c.pending || c.pending_payment || 0;
        const paid = (c.paid || 0) + (c.pending_group || 0);
        const shipped = c.shipped || 0;
        const pendingReview = Number(c.pending_review || 0);
        const refund = c.refund || 0;

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
        ? statuses.map(normalizeOrderBadgeStatus).filter(Boolean)
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
        const [overviewResponse, walletResponse, agentWalletResponse, piggyBankBalance] = await Promise.all([
            get('/distribution/overview', {}, { showError: false }).catch(() => null),
            get('/wallet/info', {}, { showError: false }).catch(() => null),
            get('/agent/wallet', {}, { showError: false }).catch(() => null),
            loadPiggyBankBalanceDisplay().catch(() => '0')
        ]);

        const dashboard = overviewResponse && overviewResponse.code === 0 ? (overviewResponse.data || {}) : {};
        const walletInfo = walletResponse && walletResponse.code === 0 ? (walletResponse.data || {}) : {};
        const agentWalletInfo = agentWalletResponse && agentWalletResponse.code === 0 ? (agentWalletResponse.data || {}) : {};
        const stats = dashboard.stats || {};
        const dashboardUserInfo = dashboard.userInfo || {};
        const teamInfo = dashboard.team || {};
        const teamGoodsFund = teamInfo.agentGoodsFund || {};
        const roleLevel = Number(
            dashboardUserInfo.role_level != null
                ? dashboardUserInfo.role_level
                : ((page.data.userInfo || app.globalData.userInfo || {}).role_level || dashboardUserInfo.role || 0)
        ) || 0;
        const goodsFundRaw = agentWalletInfo.goods_fund_balance != null
            ? agentWalletInfo.goods_fund_balance
            : (
                agentWalletInfo.agent_wallet_balance != null
                    ? agentWalletInfo.agent_wallet_balance
                    : (
                        agentWalletInfo.balance != null
                            ? agentWalletInfo.balance
                            : (teamGoodsFund.goods_fund_balance != null ? teamGoodsFund.goods_fund_balance : '0.00')
                    )
            );
        const goodsFundBalance = formatMoney(goodsFundRaw);
        const commissionRaw = walletInfo.commission_balance != null
            ? walletInfo.commission_balance
            : (
                walletInfo.balance != null
                    ? walletInfo.balance
                    : (
                        walletInfo.available_balance != null
                            ? walletInfo.available_balance
                            : (
                                walletInfo.commission && walletInfo.commission.available != null
                                    ? walletInfo.commission.available
                                    : stats.availableAmount
                            )
                    )
            );
        const availableAmount = formatMoney(
            stats.availableAmount != null
                ? stats.availableAmount
                : (
                    walletInfo.commission && walletInfo.commission.available != null
                        ? walletInfo.commission.available
                        : commissionRaw
                )
        );
        const totalEarnings = formatMoney(stats.totalEarnings);
        const frozenAmount = formatMoney(
            stats.frozenAmount != null
                ? stats.frozenAmount
                : (
                    walletInfo.commission && walletInfo.commission.frozen != null
                        ? walletInfo.commission.frozen
                        : '0.00'
                )
        );
        const teamCount = Number(teamInfo.totalCount || 0);

        const badgeName = resolveAgentRoleBadgeName(roleLevel);
        page.setData({
            distributionInfo: {
                totalEarnings,
                availableAmount,
                goodsFundBalance,
                referee_count: teamCount,
                role_level: roleLevel,
                role_name: badgeName
            },
            stats: { frozenAmount },
            balance: formatMoneyInt(goodsFundRaw),
            commissionBalance: formatMoneyInt(commissionRaw),
            piggyBankBalance,
            teamCount,
            isAgent: roleLevel >= 2,
            displayAgentRoleLevel: roleLevel,
            agentRoleBadgeName: badgeName,
            agentPillSkinClass: agentPillSkinClassForLevel(roleLevel)
        });
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
            pickupVerifyScope: null,
            isStoreManager: false,
            storeManagerStationName: '',
            storeManagerStationCount: 0
        });
        return;
    }
    try {
        const response = await get('/stations/my-scope', {}, { showError: false });
        if (response && response.code === 0 && response.data) {
            const stations = Array.isArray(response.data.stations) ? response.data.stations : [];
            const managerStations = stations.filter((item) => String(item.my_role || '') === 'manager');
            page.setData({
                showPickupVerify: !!response.data.has_verify_access,
                pickupVerifyScope: response.data,
                isStoreManager: managerStations.length > 0,
                storeManagerStationName: managerStations[0]?.name || '',
                storeManagerStationCount: managerStations.length
            });
            return;
        }
    } catch (e) {
        console.error('[userDashboard] loadPickupVerifyScope error:', e);
    }
    page.setData({
        showPickupVerify: false,
        pickupVerifyScope: null,
        isStoreManager: false,
        storeManagerStationName: '',
        storeManagerStationCount: 0
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
    buildCartPreview,
    clearUserCache,
    clearSecondaryLoadState,
    createEmptyCartPreview,
    loadAssetRow,
    loadCartPreview,
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
