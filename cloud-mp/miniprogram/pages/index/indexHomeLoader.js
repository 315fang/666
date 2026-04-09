const app = getApp();
const { get } = require('../../utils/request');
const { cachedGet } = require('../../utils/requestCache');
const { processProduct, genHeatLabel } = require('../../utils/dataFormatter');
const { getApiBaseUrl } = require('../../config/env');
const { getConfigSection } = require('../../utils/miniProgramConfig');

function normalizeAssetUrl(url = '') {
    const raw = String(url || '');
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) {
        const apiBase = getApiBaseUrl().replace(/\/api\/?$/, '');
        return `${apiBase}${raw}`;
    }
    return raw;
}

function pickImageSource(record = {}) {
    return normalizeAssetUrl(record.file_id || record.image_url || record.url || record.image || '');
}

function pickDisplayName(record = {}) {
    return record.nickName || record.nickname || '';
}

async function loadData(page, forceRefresh = false) {
    page.setData({ loading: true });
    try {
        let data = null;

        if (!forceRefresh) {
            data = app.globalData.homePageData;
            if (!data) {
                const cached = wx.getStorageSync('home_config_cache');
                if (cached && cached.expireAt > Date.now()) {
                    data = cached.data;
                    app.globalData.homePageData = data;
                }
            }
            if (!data && app.globalData.homeDataPromise) {
                data = await app.globalData.homeDataPromise.catch(() => null);
            }
        }

        if (!data || Object.keys(data).length === 0) {
            const pageRes = await get('/page-content/home').catch(() => null);
            const unifiedPayload = pageRes && pageRes.data && pageRes.data.resources
                ? (pageRes.data.resources.legacy_payload || null)
                : null;
            if (unifiedPayload && Object.keys(unifiedPayload).length) {
                data = unifiedPayload;
                page.homeResources = pageRes.data.resources || null;
                page.setData({ pageLayout: pageRes.data.layout || null });
            } else {
                const res = await get('/homepage-config').catch(() => ({ data: {} }));
                data = res.data || {};
            }
        }

        applyHomeConfig(page, data);
        loadFeaturedProducts(page);
        loadPosters(page);
        loadBubbles(page);
        loadCoupons(page);
    } catch (err) {
        console.error('[Index] 获取首页配置失败:', err);
        page.setData({ loading: false });
    }
}

async function loadFeaturedProducts(page) {
    try {
        const layoutBoardProducts = page.homeResources && page.homeResources.boards
            && page.homeResources.boards['home.featuredProducts']
            ? page.homeResources.boards['home.featuredProducts'].products
            : null;
        let list = Array.isArray(layoutBoardProducts) ? layoutBoardProducts : [];

        let boardProducts = list;
        if (!boardProducts.length) {
            const boardRes = await cachedGet(get, '/boards/map', {
                scene: 'home',
                keys: 'home.featuredProducts'
            }, {
                cacheTTL: 2 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            }).catch(() => null);
            boardProducts = boardRes && boardRes.data && boardRes.data['home.featuredProducts']
                ? boardRes.data['home.featuredProducts'].products
                : null;
        }
        list = Array.isArray(boardProducts) ? boardProducts : [];

        if (!list.length) {
            const res = await cachedGet(get, '/products', { page: 1, limit: 6, sort: 'hot' }, {
                cacheTTL: 2 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            });
            const listRaw = res.list || (res.data && res.data.list) || (Array.isArray(res.data) ? res.data : []);
            list = Array.isArray(listRaw) ? listRaw : [];
        }

        const roleLevel = app.globalData.userInfo && app.globalData.userInfo.role_level || 0;
        const products = list.map((product) => {
            const processed = processProduct(product, roleLevel);
            const discountLabel = (product.market_price && product.retail_price && parseFloat(product.market_price) > parseFloat(product.retail_price))
                ? (Math.round(parseFloat(product.retail_price) / parseFloat(product.market_price) * 10)) + '折'
                : '';
            const heatLabel = genHeatLabel(product);
            return { ...processed, discount_label: discountLabel, heat_label: heatLabel };
        });
        page.setData({ featuredProducts: products });
    } catch (err) {
        console.error('[Index] 加载精选商品失败:', err);
    }
}

async function loadPosters(page) {
    const mapBanners = (list) => (list || []).map((banner) => ({
        id: banner.id,
        image: pickImageSource(banner),
        title: banner.title || '',
        subtitle: banner.subtitle || '',
        link_type: banner.link_type || 'none',
        link_value: banner.link_value || ''
    }));
    try {
        const layoutBanners = page.homeResources ? page.homeResources.banners || null : null;
        if (layoutBanners) {
            page.setData({
                midPosters: mapBanners(layoutBanners.home_mid || []),
                bottomPosters: mapBanners(layoutBanners.home_bottom || [])
            });
            return;
        }

        const [midRes, bottomRes] = await Promise.all([
            cachedGet(get, '/banners', { position: 'home_mid' }, {
                cacheTTL: 5 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            }).catch(() => ({ data: [] })),
            cachedGet(get, '/banners', { position: 'home_bottom' }, {
                cacheTTL: 5 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            }).catch(() => ({ data: [] }))
        ]);
        page.setData({
            midPosters: mapBanners((midRes && (midRes.data || midRes.list)) || []),
            bottomPosters: mapBanners((bottomRes && (bottomRes.data || bottomRes.list)) || [])
        });
    } catch (e) {
        console.log('[Index] 海报加载失败，不影响主页渲染');
    }
}

async function loadBubbles(page) {
    try {
        const res = await cachedGet(get, '/activity/bubbles', { limit: 10 }, {
            cacheTTL: 60 * 1000,
            showError: false,
            maxRetries: 0,
            timeout: 10000
        });
        const list = res && res.data || [];
        if (!Array.isArray(list) || list.length === 0) return;
        const bubbles = list.map((bubble) => {
            if (bubble.text) return bubble.text;
            const action = { order: '购买了', group_buy: '拼团了', slash: '砍价了', lottery: '抽中了' }[bubble.type] || '购买了';
            return `${pickDisplayName(bubble)} ${action} ${bubble.product_name}`;
        });
        page.setData({ bubbles, currentBubble: bubbles[0] });
        page._bubbleIdx = 0;
        page._startBubbleRotation();
    } catch (_) { }
}

function applyHomeConfig(page, data) {
    if (!data) return;
    app.globalData.homePageData = data;
    const brandConfig = getConfigSection('brand_config');

    const bannerList = Array.isArray(data.banners)
        ? data.banners
        : (Array.isArray(data.banners && data.banners.home) ? data.banners.home : []);
    const defaultBrandBanners = [
        {
            id: '__default_1',
            image: '',
            title: '品牌甄选',
            subtitle: '发现值得信赖的好物',
            link_type: 'none',
            link_value: ''
        }
    ];
    const heroBanners = bannerList.length > 0
        ? bannerList.map((banner) => ({
            id: banner.id,
            image: pickImageSource(banner),
            title: banner.title || '',
            subtitle: banner.subtitle || '',
            link_type: banner.link_type || 'none',
            link_value: banner.link_value || ''
        }))
        : defaultBrandBanners;

    const configs = data.configs || {};
    const showBrandLogo = configs.show_brand_logo !== 'false' && configs.show_brand_logo !== false;
    page.setData({
        homeConfigs: configs,
        showBrandLogo,
        brandLogo: configs.brand_logo || '',
        navBrandTitle: configs.nav_brand_title || brandConfig.nav_brand_title || '问兰镜像',
        navBrandSub: configs.nav_brand_sub || brandConfig.nav_brand_sub || '品牌甄选',
        latestActivity: page._normalizeLatestActivity(data.latestActivity || {}),
        heroBanners,
        loading: false
    });

    const popupAd = data.popupAd || {};
    if (popupAd.enabled && (popupAd.file_id || popupAd.image_url || popupAd.url)) {
        page._checkAndShowPopupAd({
            ...popupAd,
            file_id: popupAd.file_id || '',
            image_url: pickImageSource(popupAd),
            url: pickImageSource(popupAd)
        });
    }
}

async function loadCoupons(page) {
    if (!app.globalData.isLoggedIn) {
        page.setData({ homeCoupons: [] });
        return;
    }
    try {
        const res = await get('/coupons/mine', { status: 'unused' });
        if (res.code === 0) {
            const coupons = (res.data || []).map((c) => {
                let discount_text = '';
                if (c.coupon_type === 'percent') {
                    const raw = parseFloat((toCouponNumber(c.coupon_value) * 10).toFixed(1));
                    discount_text = (raw % 1 === 0 ? raw.toFixed(0) : raw.toFixed(1)) + '折';
                }
                const minLabel = toCouponNumber(c.min_purchase) > 0 ? `满${c.min_purchase}元可用` : '无门槛';
                const valueText = c.coupon_type === 'percent'
                    ? discount_text
                    : `¥${toCouponNumber(c.coupon_value).toFixed(toCouponNumber(c.coupon_value) % 1 === 0 ? 0 : 1)}`;
                return {
                    ...c,
                    discount_text,
                    value_text: valueText,
                    min_label: minLabel,
                    expire_at_formatted: formatCouponExpire(c.expire_at)
                };
            });
            // 只展示前 3 张
            page.setData({ homeCoupons: coupons.slice(0, 3), unusedCouponCount: coupons.length });
        }
    } catch (_) {
        // 静默失败
    }
}

function toCouponNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function formatCouponExpire(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${m}.${day}`;
    } catch (_) {
        return dateStr;
    }
}

module.exports = {
    loadData,
    loadFeaturedProducts,
    loadPosters,
    loadBubbles,
    loadCoupons,
    applyHomeConfig,
    normalizeAssetUrl
};
