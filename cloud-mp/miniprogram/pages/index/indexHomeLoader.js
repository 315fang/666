const app = getApp();
const { get } = require('../../utils/request');
const { cachedGet } = require('../../utils/requestCache');
const {
    processProduct,
    genHeatLabel,
    resolveProductImage,
    resolveProductDisplayPrice,
    normalizePriceValue
} = require('../../utils/dataFormatter');
const { getApiBaseUrl } = require('../../config/env');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { warmRenderableImageUrls, resolveRenderableImageUrl } = require('../../utils/cloudAssetRuntime');

const HOME_COUPON_PREVIEW_LIMIT = 4;

const FIXED_BRAND_CARD_PRESETS = [
    {
        slot_index: 0,
        category_key: 'latest_activity',
        title: '最新活动',
        link_type: 'page',
        link_value: '/pages/index/brand-news-list?category_key=latest_activity'
    },
    {
        slot_index: 1,
        category_key: 'industry_frontier',
        title: '行业前沿',
        link_type: 'page',
        link_value: '/pages/index/brand-news-list?category_key=industry_frontier'
    },
    {
        slot_index: 2,
        category_key: 'mall_notice',
        title: '商城公告',
        link_type: 'page',
        link_value: '/pages/index/brand-news-list?category_key=mall_notice'
    }
];

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toBoolean(value) {
    if (value === true || value === 1 || value === '1') return true;
    const normalized = pickString(value).toLowerCase();
    if (!normalized) return false;
    return ['true', 'yes', 'y', 'on', 'enabled', 'active', 'show', 'visible', 'display'].includes(normalized);
}

function getBrandCardPreset(input, index = 0) {
    const rawSlotIndex = input && input.slot_index;
    const slotIndex = rawSlotIndex === '' || rawSlotIndex === null || rawSlotIndex === undefined
        ? NaN
        : Number(rawSlotIndex);
    if (Number.isInteger(slotIndex) && FIXED_BRAND_CARD_PRESETS[slotIndex]) {
        return FIXED_BRAND_CARD_PRESETS[slotIndex];
    }
    const categoryKey = pickString(input && input.category_key);
    if (categoryKey) {
        const matched = FIXED_BRAND_CARD_PRESETS.find((item) => item.category_key === categoryKey);
        if (matched) return matched;
    }
    return FIXED_BRAND_CARD_PRESETS[index] || FIXED_BRAND_CARD_PRESETS[0];
}

function createBrandCard(index = 0) {
    const preset = getBrandCardPreset(null, index);
    return {
        id: `brand-card-${preset.slot_index}-${preset.category_key}`,
        slot_index: preset.slot_index,
        category_key: preset.category_key,
        title: preset.title,
        subtitle: '',
        image: '',
        file_id: '',
        link_type: preset.link_type,
        link_value: preset.link_value
    };
}

function createBrandCertification(index = 0) {
    return {
        id: `brand-cert-${index}`,
        title: '',
        subtitle: '',
        image: '',
        file_id: ''
    };
}

function createEmptyBrandZone() {
    return {
        enabled: false,
        title: '品牌专区',
        coverImage: '',
        coverFileId: '',
        welcomeTitle: 'Welcome',
        welcomeSubtitle: '',
        cards: [],
        certifications: [],
        story: {
            title: '企业介绍',
            body: ''
        }
    };
}

function normalizeBrandConfigList(list = [], options = {}) {
    const withLink = !!options.withLink;
    return (Array.isArray(list) ? list : [])
        .map((item, index) => {
            if (typeof item === 'string') {
                const title = pickString(item);
                if (!title) return null;
                const base = withLink ? createBrandCard(index) : createBrandCertification(index);
                return {
                    ...base,
                    title
                };
            }

            if (!item || typeof item !== 'object') return null;

            const base = withLink ? createBrandCard(index) : createBrandCertification(index);
            const preset = withLink ? getBrandCardPreset(item, index) : null;
            const fileId = pickString(item.file_id || item.fileId);
            const image = normalizeAssetUrl(fileId || item.image || item.image_url || item.url || item.cover_image || item.coverImage);
            const title = pickString(item.title || item.name || item.label, base.title || '');
            const subtitle = pickString(item.subtitle || item.desc || item.description);
            const linkType = withLink ? pickString(item.link_type, preset ? preset.link_type : base.link_type || 'none') : 'none';
            const linkValue = withLink ? pickString(item.link_value, preset ? preset.link_value : base.link_value || '') : '';
            const fixedTitle = withLink && preset ? preset.title : (title || base.title || '未命名内容');

            if (!(title || subtitle || image || fileId || linkValue)) return null;

            return {
                ...base,
                ...(preset ? {
                    slot_index: preset.slot_index,
                    category_key: preset.category_key,
                    title: preset.title,
                    link_type: preset.link_type,
                    link_value: preset.link_value
                } : {}),
                ...item,
                id: pickString(item.id, base.id),
                title: fixedTitle,
                subtitle,
                image,
                file_id: fileId,
                ...(withLink ? { link_type: linkType, link_value: linkValue } : {})
            };
        })
        .filter(Boolean);
}

function normalizeBrandZone(configs = {}) {
    const defaults = createEmptyBrandZone();
    const cards = normalizeBrandConfigList(configs.brand_endorsements, { withLink: true });
    const certifications = normalizeBrandConfigList(configs.brand_certifications);
    const coverFileId = pickString(configs.brand_zone_cover_file_id);
    const coverImage = normalizeAssetUrl(coverFileId || configs.brand_zone_cover || '');
    const storyBody = pickString(configs.brand_story_body);
    const welcomeTitle = pickString(configs.brand_zone_welcome_title, defaults.welcomeTitle);
    const welcomeSubtitle = pickString(configs.brand_zone_welcome_subtitle, defaults.welcomeSubtitle);

    return {
        ...defaults,
        enabled: configs.brand_zone_enabled !== undefined
            ? toBoolean(configs.brand_zone_enabled)
            : !!(cards.length || certifications.length || coverImage || storyBody),
        title: pickString(configs.brand_zone_title, defaults.title),
        coverImage,
        coverFileId,
        welcomeTitle,
        welcomeSubtitle,
        showWelcome: !!(welcomeTitle || welcomeSubtitle),
        cards,
        certifications,
        story: {
            title: pickString(configs.brand_story_title, defaults.story.title),
            body: storyBody
        }
    };
}

function normalizeAssetUrl(url = '') {
    const raw = String(url || '');
    if (!raw) return '';
    if (/^cloud:\/\//i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) {
        if (isExpiredSignedAssetUrl(raw)) return '';
        return raw;
    }
    if (raw.startsWith('/')) {
        const apiBase = getApiBaseUrl().replace(/\/api\/?$/, '');
        return `${apiBase}${raw}`;
    }
    return raw;
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
    if (/tcb\.qcloud\.la/i.test(text)) return false;
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

function collectProductImageSources(product = {}) {
    return {
        file_id: product.image_ref || product.imageRef || product.file_id || product.fileId || '',
        image: product.display_image || product.displayImage || product.image || '',
        image_url: product.image_url || product.imageUrl || '',
        cover_image: product.cover_image || product.coverImage || '',
        preview_images: product.preview_images || product.previewImages || '',
        images: product.images || ''
    };
}

function pickDisplayName(record = {}) {
    return record.nickName || record.nickname || '';
}

function setHomePageData(page, patch, callback) {
    if (page && typeof page._setHomeData === 'function') {
        page._setHomeData(patch, callback);
        return;
    }
    page.setData(patch, callback);
}

async function loadData(page, forceRefresh = false) {
    const cacheKey = 'home_config_cache';
    const cacheTtl = 5 * 60 * 1000;
    const now = Date.now();
    setHomePageData(page, { loading: true });
    try {
        let data = null;

        if (!forceRefresh) {
            const memoryExpireAt = Number(app.globalData.homePageDataExpireAt || 0);
            if (app.globalData.homePageData && memoryExpireAt > now) {
                data = app.globalData.homePageData;
            } else if (app.globalData.homePageData && memoryExpireAt > 0 && memoryExpireAt <= now) {
                app.globalData.homePageData = null;
                app.globalData.homePageDataExpireAt = 0;
            }
            if (!data) {
                const cached = wx.getStorageSync(cacheKey);
                if (cached && cached.expireAt > Date.now()) {
                    data = cached.data;
                    app.globalData.homePageData = data;
                    app.globalData.homePageDataExpireAt = Number(cached.expireAt) || 0;
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
                setHomePageData(page, { pageLayout: canonicalPayload.layout || canonicalPayload.resources?.layout || null });
            } else {
                const res = await get('/homepage-config').catch(() => ({ data: {} }));
                data = res.data || {};
            }

            if (data && Object.keys(data).length) {
                const expireAt = now + cacheTtl;
                app.globalData.homePageData = data;
                app.globalData.homePageDataExpireAt = expireAt;
                try {
                    wx.setStorageSync(cacheKey, { data, expireAt });
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
        setHomePageData(page, { loading: false });
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
                keys: 'home.featuredProducts'
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
            const res = await cachedGet(get, '/products', {
                page: 1,
                limit: 6,
                sort: 'hot',
                view: 'card',
                include_skus: 0,
                include_total: 0
            }, {
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
        const productImageSources = list.map((product) => collectProductImageSources(product));
        await warmRenderableImageUrls(productImageSources).catch(() => null);

        const products = await Promise.all(list.map(async (product, index) => {
            const processed = processProduct(product, roleLevel);
            const displayPrice = Number(resolveProductDisplayPrice(product, roleLevel) || 0);
            const marketPrice = Number(normalizePriceValue(product.market_price ?? product.original_price) || 0);
            const fallbackCoverImage = normalizeAssetUrl(product.display_image || product.image_url || product.image_ref)
                || normalizeAssetUrl(resolveProductImage(product))
                || normalizeAssetUrl(processed.firstImage)
                || pickImageSource(product)
                || '/assets/images/placeholder.svg';
            const coverImage = await resolveRenderableImageUrl(productImageSources[index], fallbackCoverImage)
                .catch(() => fallbackCoverImage);
            const discountLabel = (marketPrice > displayPrice && displayPrice > 0)
                ? (Math.round(displayPrice / marketPrice * 10)) + '折'
                : '';
            const heatLabel = genHeatLabel(product);
            return {
                ...processed,
                cover_image: coverImage,
                image: coverImage,
                cardImage: coverImage,
                hasCardImage: !!coverImage,
                image_sources: productImageSources[index],
                soldOut: Number(product.stock) === 0 || Number(processed.stock) === 0,
                retail_price: displayPrice,
                price: displayPrice,
                market_price: marketPrice > displayPrice ? marketPrice : 0,
                discount_label: discountLabel,
                heat_label: heatLabel
            };
        }));
        setHomePageData(page, { featuredProducts: products });
        if (typeof page._setupScrollReveal === 'function') {
            wx.nextTick(() => page._setupScrollReveal());
        }
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
            setHomePageData(page, {
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
        setHomePageData(page, {
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
        setHomePageData(page, { bubbles, currentBubble: bubbles[0] });
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
    const brandZone = normalizeBrandZone(configs);
    const navBrandTitle = configs.nav_brand_title || brandConfig.nav_brand_title || '问兰镜像';
    const navBrandSub = configs.nav_brand_sub || brandConfig.nav_sub || '品牌甄选';
    setHomePageData(page, {
        homeConfigs: configs,
        showBrandLogo,
        brandLogo: configs.brand_logo || '',
        navBrandTitle,
        navBrandSub,
        couponZoneTitle: configs.coupon_zone_title || '优惠券中心',
        couponZoneSubtitle: configs.coupon_zone_subtitle || '领券后下单可用',
        brandZoneCoverKicker: navBrandSub || '品牌甄选',
        brandZoneCoverTitle: navBrandTitle || brandZone.title || '品牌专区',
        latestActivity: page._normalizeLatestActivity(data.latestActivity || data.resources?.latest_activity || {}),
        brandZone,
        heroBanners,
        loading: false
    });

    if (typeof page._setupScrollReveal === 'function') {
        wx.nextTick(() => page._setupScrollReveal());
    }

    const popupAd = data.popupAd || data.resources?.popup_ad || {};
    if (popupAd.enabled && (popupAd.file_id || popupAd.image_url || popupAd.url)) {
        page._checkAndShowPopupAd({
            ...popupAd,
            file_id: popupAd.file_id || '',
            image_url: pickImageSource(popupAd), // deprecated: use file_id instead
            url: pickImageSource(popupAd),
            displayImage: pickImageSource(popupAd),
            hasImage: !!pickImageSource(popupAd)
        });
    }
}

async function loadCoupons(page) {
    if (!app.globalData.isLoggedIn) {
        setHomePageData(page, { homeCoupons: [], homeCouponHasMore: false, unusedCouponCount: 0 });
        return;
    }
    try {
        const res = await cachedGet(get, '/coupons/mine', { status: 'unused' }, {
            cacheTTL: 60 * 1000,
            showError: false,
            maxRetries: 0,
            timeout: 10000
        });
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
                    name: buildHomeCouponName(c),
                    sub_label: buildHomeCouponSubLabel(c),
                    expire_at_formatted: formatCouponExpire(c.expire_at)
                };
            });
            setHomePageData(page, {
                homeCoupons: coupons.slice(0, HOME_COUPON_PREVIEW_LIMIT),
                homeCouponHasMore: coupons.length > HOME_COUPON_PREVIEW_LIMIT,
                unusedCouponCount: coupons.length
            });
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

function buildHomeCouponName(coupon = {}) {
    return pickString(coupon.coupon_name || coupon.name || coupon.title, '优惠券');
}

function buildHomeCouponSubLabel(coupon = {}) {
    const expireText = formatCouponExpire(
        coupon.expire_at || coupon.expires_at || coupon.end_at || coupon.valid_until
    );
    if (expireText) return `${expireText} 到期`;

    const validDays = Math.max(0, Math.floor(toCouponNumber(coupon.valid_days)));
    if (validDays > 0) return `领取后 ${validDays} 天内有效`;
    return '长期有效';
}

module.exports = {
    loadData,
    loadFeaturedProducts,
    loadPosters,
    loadBubbles,
    loadCoupons,
    applyHomeConfig,
    normalizeAssetUrl,
    createEmptyBrandZone
};
