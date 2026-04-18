const app = getApp();
const { getTempUrls } = require('../../utils/cloud');
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
const FEATURED_PRODUCTS_CACHE_REV = 'product-image-20260418';
const tempUrlCache = new Map();

function normalizeAssetUrl(url = '') {
    const raw = extractAssetValue(url);
    if (!raw) return '';
    if (/^cloud:\/\//i.test(raw)) return raw;
    if (/^wxfile:\/\//i.test(raw) || /^data:/i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) {
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

function isCloudFileId(value) {
    return /^cloud:\/\//i.test(String(value || '').trim());
}

async function warmCloudTempUrls(urls = []) {
    const cloudIds = [...new Set(
        (Array.isArray(urls) ? urls : [])
            .map((item) => normalizeAssetUrl(item))
            .filter((item) => isCloudFileId(item) && !tempUrlCache.has(item))
    )];
    if (!cloudIds.length) return;

    try {
        const tempUrls = await getTempUrls(cloudIds);
        const list = Array.isArray(tempUrls) ? tempUrls : [tempUrls];
        cloudIds.forEach((cloudId, index) => {
            const tempUrl = String(list[index] || '').trim();
            if (tempUrl) tempUrlCache.set(cloudId, tempUrl);
        });
    } catch (err) {
        console.warn('[Index] getTempUrls failed:', err);
    }
}

async function resolveCloudImageUrl(value, fallback = '') {
    const normalized = normalizeAssetUrl(value);
    if (!normalized) return fallback;
    if (!isCloudFileId(normalized)) return normalized;

    if (!tempUrlCache.has(normalized)) {
        await warmCloudTempUrls([normalized]);
    }

    return tempUrlCache.get(normalized) || fallback;
}

async function resolveBannerListImages(list = []) {
    return Promise.all((Array.isArray(list) ? list : []).map(async (item) => ({
        ...item,
        image: await resolveCloudImageUrl(item.image || item.image_url || item.url || item.file_id || '', '')
    })));
}

async function resolveBrandZoneAssets(input = {}) {
    const brandZone = {
        ...createEmptyBrandZone(),
        ...(input || {})
    };
    const [coverImage, cards, certifications] = await Promise.all([
        resolveCloudImageUrl(brandZone.coverImage || '', ''),
        Promise.all((Array.isArray(brandZone.cards) ? brandZone.cards : []).map(async (item) => ({
            ...item,
            image: await resolveCloudImageUrl(item.image || item.file_id || '', '')
        }))),
        Promise.all((Array.isArray(brandZone.certifications) ? brandZone.certifications : []).map(async (item) => ({
            ...item,
            image: await resolveCloudImageUrl(item.image || item.file_id || '', '')
        })))
    ]);
    return {
        ...brandZone,
        coverImage,
        cards,
        certifications
    };
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
        product.image_url,
        ...parseImages(product.preview_images),
        ...parseImages(product.previewImages),
        processed.firstImage,
        resolveProductImage(product, ''),
        product.cover_image,
        product.coverImage,
        product.image,
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

function normalizeText(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function isBoardVisible(board = {}) {
    return !(
        board.is_visible === 0
        || board.is_visible === false
        || board.is_active === 0
        || board.is_active === false
        || board.status === 0
        || board.status === false
    );
}

function normalizeBoardEntries(boardMap = {}) {
    return Object.entries(boardMap || {})
        .map(([key, board]) => ({
            ...(board || {}),
            key: String((board && (board.board_key || board.key)) || key || '').trim()
        }))
        .filter((board) => board.key && isBoardVisible(board))
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

function normalizeBrandList(list = [], prefix = 'brand-item', options = {}) {
    const withLink = !!options.withLink;
    return (Array.isArray(list) ? list : [])
        .map((item, index) => {
            if (typeof item === 'string') {
                const title = normalizeText(item);
                return title
                    ? {
                        id: `${prefix}-${index}`,
                        title,
                        subtitle: '',
                        image: '',
                        file_id: '',
                        ...(withLink ? { link_type: 'none', link_value: '' } : {})
                    }
                    : null;
            }
            if (!item || typeof item !== 'object') return null;
            const title = normalizeText(item.title || item.name || item.label);
            const subtitle = normalizeText(item.subtitle || item.desc || item.description);
            const image = pickImageSource(item);
            const fileId = normalizeText(item.file_id);
            const linkType = withLink ? normalizeText(item.link_type, 'none') : 'none';
            const linkValue = withLink ? normalizeText(item.link_value) : '';
            if (!title && !subtitle && !image && !fileId && !linkValue) return null;
            return {
                id: item.id || `${prefix}-${index}`,
                title: title || subtitle || '未命名内容',
                subtitle,
                image,
                file_id: fileId,
                ...(withLink ? { link_type: linkType, link_value: linkValue } : {})
            };
        })
        .filter(Boolean);
}

function createEmptyBrandZone() {
    return {
        enabled: false,
        title: '品牌专区',
        coverImage: '',
        welcomeTitle: 'Welcome',
        welcomeSubtitle: '',
        story: {
            title: '企业介绍',
            body: ''
        },
        cards: [],
        certifications: []
    };
}

function normalizeHomeBrandZone(configs = {}) {
    const story = {
        title: normalizeText(configs.brand_story_title, '企业介绍'),
        body: normalizeText(configs.brand_story_body)
    };
    const cards = normalizeBrandList(configs.brand_endorsements, 'brand-zone-card', { withLink: true }).slice(0, 3);
    const certifications = normalizeBrandList(configs.brand_certifications, 'brand-zone-certification');
    const enabled = configs.brand_zone_enabled !== undefined
        ? !(configs.brand_zone_enabled === false || configs.brand_zone_enabled === 'false' || configs.brand_zone_enabled === 0 || configs.brand_zone_enabled === '0')
        : !!(cards.length || certifications.length || story.body);

    return {
        enabled,
        title: normalizeText(configs.brand_zone_title, '品牌专区'),
        coverImage: pickImageSource({
            file_id: configs.brand_zone_cover_file_id,
            image: configs.brand_zone_cover,
            image_url: configs.brand_zone_cover
        }),
        welcomeTitle: normalizeText(configs.brand_zone_welcome_title, 'Welcome'),
        welcomeSubtitle: normalizeText(configs.brand_zone_welcome_subtitle),
        story,
        cards,
        certifications
    };
}

async function buildDisplayProduct(product = {}, roleLevel = 0) {
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
        ? `${Math.round(displayPrice / marketPrice * 10)}折`
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
}

async function loadData(page, forceRefresh = false) {
    page.setData({ loading: true });
    try {
        let data = null;

        if (!forceRefresh && app.globalData.homeDataPromise) {
            data = await app.globalData.homeDataPromise.catch(() => null);
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
        }
        try { wx.removeStorageSync(HOME_PAGE_CACHE_KEY); } catch (_) {}

        await applyHomeConfig(page, data);
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
        let boardEntries = normalizeBoardEntries(page.homeResources && page.homeResources.boards ? page.homeResources.boards : {});
        if (!boardEntries.length) {
            const boardRes = await cachedGet(get, '/boards/map', {
                scene: 'home',
                rev: FEATURED_PRODUCTS_CACHE_REV
            }, {
                useCache: !forceRefresh,
                cacheTTL: 2 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 10000
            }).catch(() => null);
            const boardMap = boardRes && boardRes.data ? boardRes.data : {};
            boardEntries = normalizeBoardEntries(boardMap);
            if (page.homeResources && boardEntries.length) {
                page.homeResources.boards = boardMap;
            }
        }

        const roleLevel = app.globalData.userInfo && app.globalData.userInfo.role_level || 0;
        const categoryBoards = boardEntries.filter((board) => {
            const boardKey = String(board.key || '').trim();
            const boardType = String(board.section_type || board.board_type || '').trim();
            return (boardType === 'product_board' || boardKey.startsWith('home.category.') || boardKey === 'home.featuredProducts')
                && Array.isArray(board.products)
                && board.products.length > 0;
        });

        if (categoryBoards.length > 0) {
            const featuredSections = [];
            for (const board of categoryBoards) {
                const rawProducts = Array.isArray(board.products) ? board.products.slice(0, 4) : [];
                const products = await Promise.all(rawProducts.map((product) => buildDisplayProduct(product, roleLevel)));
                if (!products.length) continue;
                featuredSections.push({
                    id: board.id || board.key,
                    key: board.key,
                    title: normalizeText(board.board_name || board.section_name || board.title, '精选好物'),
                    subtitle: normalizeText(board.subtitle || board.description),
                    products
                });
            }
            page.setData({
                featuredSections,
                featuredProducts: featuredSections[0] ? featuredSections[0].products : []
            });
            return;
        }

        const featuredBoard = boardEntries.find((board) => String(board.key || '').trim() === 'home.featuredProducts');
        let list = Array.isArray(featuredBoard && featuredBoard.products) ? featuredBoard.products : [];
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

        const products = await Promise.all(list.map((product) => buildDisplayProduct(product, roleLevel)));
        page.setData({
            featuredProducts: products,
            featuredSections: []
        });
    } catch (err) {
        console.error('[Index] 加载精选商品失败:', err);
    }
}

async function loadPosters(page, options = {}) {
    const forceRefresh = !!options.forceRefresh;
    const mapBanners = (list) => (list || []).map((banner) => ({
        id: banner.id,
        image: pickImageSource(banner),
        file_id: banner.file_id || '',
        title: banner.title || '',
        subtitle: banner.subtitle || '',
        link_type: banner.link_type || 'none',
        link_value: banner.link_value || ''
    }));
    try {
        const layoutBanners = page.homeResources ? page.homeResources.banners || null : null;
        const layoutMid = layoutBanners && Array.isArray(layoutBanners.home_mid) ? layoutBanners.home_mid : [];
        const layoutBottom = layoutBanners && Array.isArray(layoutBanners.home_bottom) ? layoutBanners.home_bottom : [];
        if (layoutBanners && (layoutMid.length > 0 || layoutBottom.length > 0)) {
            const [midPosters, bottomPosters] = await Promise.all([
                resolveBannerListImages(mapBanners(layoutMid)),
                resolveBannerListImages(mapBanners(layoutBottom))
            ]);
            page.setData({
                midPosters,
                bottomPosters
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
        const [midPosters, bottomPosters] = await Promise.all([
            resolveBannerListImages(mapBanners(Array.isArray(midList) ? midList : [])),
            resolveBannerListImages(mapBanners(Array.isArray(bottomList) ? bottomList : []))
        ]);
        page.setData({
            midPosters,
            bottomPosters
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

async function applyHomeConfig(page, data) {
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
            file_id: banner.file_id || '',
            title: banner.title || '',
            subtitle: banner.subtitle || '',
            link_type: banner.link_type || 'none',
            link_value: banner.link_value || ''
        }))
        : defaultBrandBanners;

    const apiConfigs = data.configs || data.resources?.configs || {};
    const localBrand = getConfigSection('brand_config') || {};
    const configs = { ...localBrand, ...apiConfigs };
    if (!Array.isArray(configs.brand_endorsements) || configs.brand_endorsements.length === 0) {
        configs.brand_endorsements = localBrand.brand_endorsements;
    }
    if (!Array.isArray(configs.brand_certifications) || configs.brand_certifications.length === 0) {
        configs.brand_certifications = localBrand.brand_certifications;
    }
    if (!String(configs.brand_story_body || '').trim() && localBrand.brand_story_body) {
        configs.brand_story_body = localBrand.brand_story_body;
    }
    if (!String(configs.brand_story_title || '').trim() && localBrand.brand_story_title) {
        configs.brand_story_title = localBrand.brand_story_title;
    }
    const showBrandLogo = configs.show_brand_logo !== 'false' && configs.show_brand_logo !== false;
    const [resolvedHeroBanners, brandZone] = await Promise.all([
        resolveBannerListImages(heroBanners),
        resolveBrandZoneAssets(normalizeHomeBrandZone(configs))
    ]);
    page.setData({
        homeConfigs: configs,
        showBrandLogo,
        brandLogo: configs.brand_logo || '',
        navBrandTitle: configs.nav_brand_title || brandConfig.nav_brand_title || '问兰镜像',
        navBrandSub: configs.nav_brand_sub || brandConfig.nav_brand_sub || '品牌甄选',
        brandZone,
        latestActivity: page._normalizeLatestActivity(data.latestActivity || data.resources?.latest_activity || {}),
        heroBanners: resolvedHeroBanners,
        loading: false
    });

    const popupAd = data.popupAd || data.resources?.popup_ad || {};
    if (popupAd.enabled && (popupAd.file_id || popupAd.image_url || popupAd.url)) {
        const popupImage = await resolveCloudImageUrl(pickImageSource(popupAd), '');
        page._checkAndShowPopupAd({
            ...popupAd,
            file_id: popupAd.file_id || '',
            image_url: popupImage,
            url: popupImage
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
            const now = Date.now();
            const usable = source.filter((c) => {
                const exp = c && (c.expire_at || c.expires_at || c.end_at || c.valid_until);
                if (!exp) return true;
                const t = new Date(exp).getTime();
                return !Number.isFinite(t) || t > now;
            });
            const coupons = usable.map((c) => {
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
            // 只展示前 3 张（已过滤过期）
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
    normalizeAssetUrl,
    createEmptyBrandZone
};
