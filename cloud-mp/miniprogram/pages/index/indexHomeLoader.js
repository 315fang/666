const app = getApp();
const { get } = require('../../utils/request');
const { cachedGet } = require('../../utils/requestCache');
const {
    processProduct,
    genHeatLabel,
    parseImages,
    resolveProductImage,
    resolveProductDisplayPrice,
    normalizePriceValue
} = require('../../utils/dataFormatter');
const { getApiBaseUrl } = require('../../config/env');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const PRODUCT_PLACEHOLDER = '/assets/images/placeholder.svg';
const HOME_PAGE_CACHE_KEY = 'home_config_cache_v2';
const HOME_PAGE_CACHE_VERSION = 'home-product-image-20260418';
const FEATURED_PRODUCTS_CACHE_REV = 'product-image-20260418';

function normalizeAssetUrl(url = '') {
    const raw = extractAssetValue(url);
    if (!raw) return '';
    if (/^cloud:\/\//i.test(raw)) return raw;
    if (/^wxfile:\/\//i.test(raw) || /^data:/i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) {
        if (isExpiredSignedAssetUrl(raw)) return '';
        return raw;
    }
    if (raw.startsWith('//')) return `https:${raw}`;
    if (raw.startsWith('/')) {
        const apiBase = getApiBaseUrl().replace(/\/api\/?$/, '');
        return `${apiBase}${raw}`;
    }
    if (/^(uploads|assets)\//i.test(raw)) {
        const apiBase = getApiBaseUrl().replace(/\/api\/?$/, '');
        return `${apiBase}/${raw.replace(/^\/+/, '')}`;
    }
    return raw;
}

function extractAssetValue(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
        return String(value.url || value.image_url || value.temp_url || value.file_id || value.image || value.cover_image || '').trim();
    }
    return '';
}

function parseSignedAssetExpireAt(url = '') {
    const text = String(url || '').trim();
    if (!/^https?:\/\//i.test(text)) return 0;
    const match = text.match(/[?&]t=(\d{10,13})\b/i);
    if (!match) return 0;
    const raw = Number(match[1]);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return raw > 1e12 ? raw : raw * 1000;
}

function isExpiredSignedAssetUrl(url = '') {
    const text = String(url || '').trim();
    if (!/^https?:\/\//i.test(text)) return false;
    if (!/[?&]sign=/.test(text)) return false;
    const expireAt = parseSignedAssetExpireAt(text);
    return expireAt > 0 && expireAt <= Date.now();
}

function pickImageSource(record = {}) {
    const direct = [record.image_url, record.url, record.image, record.cover_image]
        .map((item) => normalizeAssetUrl(item))
        .find(Boolean);
    if (direct) return direct;

    const fileId = String(record.file_id || '').trim();
    if (/^cloud:\/\//i.test(fileId)) {
        return normalizeAssetUrl(fileId);
    }
    return normalizeAssetUrl(fileId || '');
}

function isPlaceholderAsset(url = '') {
    const text = String(url || '').trim();
    if (!text) return false;
    return /(^|\/)assets\/images\/placeholder\.svg(?:$|[?#])/i.test(text)
        || /\/assets\/images\/placeholder\.svg(?:$|[?#])/i.test(text);
}

function uniqueAssetUrls(list = [], options = {}) {
    const includePlaceholder = !!options.includePlaceholder;
    const seen = new Set();
    return (Array.isArray(list) ? list : [])
        .map((item) => normalizeAssetUrl(item))
        .filter((url) => {
            if (!includePlaceholder && isPlaceholderAsset(url)) return false;
            if (!url || seen.has(url)) return false;
            seen.add(url);
            return true;
        });
}

function collectProductImageCandidates(product = {}, processed = {}) {
    return uniqueAssetUrls([
        resolveProductImage(product, ''),
        processed.firstImage,
        product.cover_image,
        product.coverImage,
        product.image,
        product.image_url,
        product.cover,
        product.cover_url,
        product.coverUrl,
        product.url,
        product.thumb,
        product.thumbnail,
        product.product_image,
        product.productImage,
        product.product_image_url,
        product.file_id,
        product.fileId,
        ...parseImages(product.images),
        ...parseImages(product.image),
        ...parseImages(product.cover_image),
        ...parseImages(product.image_url),
        ...parseImages(product.file_id),
        ...(Array.isArray(processed.images) ? processed.images : [])
    ]);
}

function getProductLookupId(product = {}) {
    return product && (product.id || product._id || product._legacy_id || product.product_id || '');
}

async function hydrateFeaturedProductSource(product = {}) {
    const productId = getProductLookupId(product);
    if (!productId) return product;

    try {
        const detailRes = await get(`/products/${productId}`, {}, {
            showError: false,
            maxRetries: 0
        });
        const detail = detailRes && (detailRes.data || detailRes);
        return detail && typeof detail === 'object'
            ? { ...detail, id: detail.id || productId }
            : product;
    } catch (_) {
        return product;
    }
}

function pickDisplayName(record = {}) {
    return record.nickName || record.nickname || '';
}

async function loadData(page, forceRefresh = false) {
    const cacheKey = HOME_PAGE_CACHE_KEY;
    const cacheTtl = 5 * 60 * 1000;
    const now = Date.now();
    page.setData({ loading: true });
    try {
        let data = null;

        if (!forceRefresh) {
            const memoryExpireAt = Number(app.globalData.homePageDataExpireAt || 0);
            const memoryVersion = String(app.globalData.homePageDataVersion || '');
            if (app.globalData.homePageData && memoryVersion === HOME_PAGE_CACHE_VERSION && memoryExpireAt > now) {
                data = app.globalData.homePageData;
            } else if (app.globalData.homePageData) {
                app.globalData.homePageData = null;
                app.globalData.homePageDataExpireAt = 0;
                app.globalData.homePageDataVersion = '';
            }
            if (!data) {
                const cached = wx.getStorageSync(cacheKey);
                if (cached && cached.version === HOME_PAGE_CACHE_VERSION && cached.expireAt > Date.now()) {
                    data = cached.data;
                    app.globalData.homePageData = data;
                    app.globalData.homePageDataExpireAt = Number(cached.expireAt) || 0;
                    app.globalData.homePageDataVersion = HOME_PAGE_CACHE_VERSION;
                }
            }
            if (!data && app.globalData.homeDataPromise) {
                data = await app.globalData.homeDataPromise.catch(() => null);
            }
        }

        if (!data || Object.keys(data).length === 0) {
            const pageRes = await get('/page-content/home').catch(() => null);
            const canonicalPayload = pageRes && (pageRes.data || pageRes);
            if (canonicalPayload && Object.keys(canonicalPayload).length) {
                data = canonicalPayload;
                page.homeResources = canonicalPayload.resources || null;
                page.setData({ pageLayout: canonicalPayload.layout || canonicalPayload.resources?.layout || null });
            } else {
                const res = await get('/homepage-config').catch(() => ({ data: {} }));
                data = res.data || {};
            }

            if (data && Object.keys(data).length) {
                const expireAt = now + cacheTtl;
                app.globalData.homePageData = data;
                app.globalData.homePageDataExpireAt = expireAt;
                app.globalData.homePageDataVersion = HOME_PAGE_CACHE_VERSION;
                try {
                    wx.setStorageSync(cacheKey, { data, expireAt, version: HOME_PAGE_CACHE_VERSION });
                } catch (_) {
                    // ignore storage write errors in low-storage scenarios
                }
            }
        }

        applyHomeConfig(page, data);
        loadFeaturedProducts(page, { forceRefresh });
        loadPosters(page, { forceRefresh });
        loadBubbles(page);
        loadCoupons(page);
    } catch (err) {
        console.error('[Index] 获取首页配置失败:', err);
        page.setData({ loading: false });
    }
}

async function loadFeaturedProducts(page, options = {}) {
    const forceRefresh = !!options.forceRefresh;
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
                keys: 'home.featuredProducts',
                rev: FEATURED_PRODUCTS_CACHE_REV
            }, {
                useCache: !forceRefresh,
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
            const res = await cachedGet(get, '/products', { page: 1, limit: 6, sort: 'hot', rev: FEATURED_PRODUCTS_CACHE_REV }, {
                useCache: !forceRefresh,
                cacheTTL: 2 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            });
            const listRaw = res.list || (res.data && res.data.list) || (Array.isArray(res.data) ? res.data : []);
            list = Array.isArray(listRaw) ? listRaw : [];
        }

        const roleLevel = app.globalData.userInfo && app.globalData.userInfo.role_level || 0;
        const products = await Promise.all(list.map(async (product) => {
            let source = product;
            let processed = processProduct(source, roleLevel);
            let imageCandidates = collectProductImageCandidates(source, processed);
            if (!imageCandidates.length) {
                source = await hydrateFeaturedProductSource(product);
                processed = processProduct(source, roleLevel);
                imageCandidates = collectProductImageCandidates(source, processed);
            }

            const displayPrice = Number(resolveProductDisplayPrice(source, roleLevel) || 0);
            const marketPrice = Number(normalizePriceValue(source.market_price ?? source.original_price) || 0);
            const galleryImages = uniqueAssetUrls([
                ...(Array.isArray(processed.images) ? processed.images : []),
                ...imageCandidates
            ]);
            const coverImage = imageCandidates[0] || '';
            const discountLabel = (marketPrice > displayPrice && displayPrice > 0)
                ? (Math.round(displayPrice / marketPrice * 10)) + '折'
                : '';
            const heatLabel = genHeatLabel(source);
            return {
                ...source,
                ...processed,
                firstImage: coverImage || '',
                images: galleryImages,
                display_image: coverImage || '',
                cover_image: coverImage,
                image: coverImage,
                image_candidates: imageCandidates,
                image_candidate_index: coverImage ? 0 : -1,
                retail_price: displayPrice,
                price: displayPrice,
                market_price: marketPrice > displayPrice ? marketPrice : 0,
                discount_label: discountLabel,
                heat_label: heatLabel
            };
        }));
        page.setData({ featuredProducts: products });
    } catch (err) {
        console.error('[Index] 加载精选商品失败:', err);
    }
}

async function loadPosters(page, options = {}) {
    const forceRefresh = !!options.forceRefresh;
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
                useCache: !forceRefresh,
                cacheTTL: 5 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            }).catch(() => ({ data: [] })),
            cachedGet(get, '/banners', { position: 'home_bottom' }, {
                useCache: !forceRefresh,
                cacheTTL: 5 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            }).catch(() => ({ data: [] }))
        ]);
        const midList = midRes?.data?.list ?? midRes?.list ?? midRes?.data ?? [];
        const bottomList = bottomRes?.data?.list ?? bottomRes?.list ?? bottomRes?.data ?? [];
        page.setData({
            midPosters: mapBanners(Array.isArray(midList) ? midList : []),
            bottomPosters: mapBanners(Array.isArray(bottomList) ? bottomList : [])
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
        const list = Array.isArray(res && res.list)
            ? res.list
            : (Array.isArray(res && res.data && res.data.list) ? res.data.list : []);
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
    page.homeResources = data.resources || page.homeResources || null;

    const bannerGroup = data.banners || data.resources?.banners || {};
    const bannerList = Array.isArray(bannerGroup)
        ? bannerGroup
        : (Array.isArray(bannerGroup.home) ? bannerGroup.home : []);
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

    const configs = data.configs || data.resources?.configs || {};
    const showBrandLogo = configs.show_brand_logo !== 'false' && configs.show_brand_logo !== false;
    page.setData({
        homeConfigs: configs,
        showBrandLogo,
        brandLogo: configs.brand_logo || '',
        navBrandTitle: configs.nav_brand_title || brandConfig.nav_brand_title || '问兰镜像',
        navBrandSub: configs.nav_brand_sub || brandConfig.nav_brand_sub || '品牌甄选',
        latestActivity: page._normalizeLatestActivity(data.latestActivity || data.resources?.latest_activity || {}),
        heroBanners,
        loading: false
    });

    const popupAd = data.popupAd || data.resources?.popup_ad || {};
    if (popupAd.enabled && (popupAd.file_id || popupAd.image_url || popupAd.url)) {
        page._checkAndShowPopupAd({
            ...popupAd,
            file_id: popupAd.file_id || '',
            image_url: pickImageSource(popupAd), // deprecated: use file_id instead
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
            const source = Array.isArray(res && res.list)
                ? res.list
                : (Array.isArray(res && res.data && res.data.list) ? res.data.list : []);
            const coupons = source.map((c) => {
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
