const { get } = require('../../utils/request');
const { cachedGet } = require('../../utils/requestCache');

async function loadConfig(page, helpers) {
    const {
        getDefaultBanners,
        getDefaultPermanentActivities,
        sortByOrder,
        normalizeCard,
        isRenderableCard
    } = helpers;

    try {
        const pageRes = await cachedGet(get, '/page-content', { page_key: 'activity' }, {
            useCache: false,
            showError: false,
            maxRetries: 0,
            timeout: 6000
        }).catch(() => null);
        const unifiedLinks = pageRes && pageRes.data && pageRes.data.resources
            ? pageRes.data.resources.activity_links
            : null;
        if (pageRes && pageRes.code === 0 && unifiedLinks && typeof unifiedLinks === 'object') {
            page.pageLayout = pageRes.data.layout || null;
            const banners = unifiedLinks.banners || [];
            const permanentEnabled = unifiedLinks.permanent_section_enabled !== false;
            let permanent = unifiedLinks.permanent || [];
            if (!permanentEnabled) {
                permanent = [];
            }
            const limited = unifiedLinks.limited || [];
            page._applyActivityData({
                banners: banners.length ? banners : getDefaultBanners(),
                permanent,
                limited,
                brandNews: unifiedLinks.brand_news || [],
                brandNewsSectionTitle: unifiedLinks.brand_news_section_title || '品牌动态',
                wallpaperClass: '',
                loadError: false,
                linksMeta: unifiedLinks
            });
            return;
        }

        const linksRes = await cachedGet(get, '/activity/links', {}, {
            useCache: false,
            showError: false,
            maxRetries: 0,
            timeout: 6000
        });
        const links = linksRes && linksRes.data;

        if (links && typeof links === 'object') {
            const banners = links.banners || [];
            const permanentEnabled = links.permanent_section_enabled !== false;
            let permanent = links.permanent || [];
            if (!permanentEnabled) {
                permanent = [];
            }
            const limited = links.limited || [];
            page._applyActivityData({
                banners: banners.length ? banners : getDefaultBanners(),
                permanent,
                limited,
                brandNews: links.brand_news || [],
                brandNewsSectionTitle: links.brand_news_section_title || '品牌动态',
                wallpaperClass: '',
                loadError: false,
                linksMeta: links
            });
            return;
        }

        await loadFromFestivalConfig(page, helpers);
    } catch (e) {
        try {
            await loadFromFestivalConfig(page, helpers);
        } catch (e2) {
            console.error('[Activity] loadConfig error:', e2);
            page.setData({ loadError: true });
        }
    }
}

async function loadFromFestivalConfig(page, helpers) {
    const {
        getDefaultBanners,
        getDefaultPermanentActivities,
        sortByOrder,
        normalizeCard,
        isRenderableCard
    } = helpers;

    const res = await cachedGet(get, '/activity/festival-config', {}, {
        useCache: false
    });
    const cfg = res.data || {};
    const wallpaperClass = page._resolveWallpaperClass(cfg.global_wallpaper);
    const bannerRaw = buildBanners(cfg, getDefaultBanners);
    const { permanent, limited } = splitActivities(page, cfg);
    const permCards = sortByOrder(permanent.map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
    const limCards = sortByOrder(limited.map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
    const bannerCards = sortByOrder(bannerRaw.map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
    const usePerm = permCards.length
        ? permCards
        : sortByOrder(getDefaultPermanentActivities().map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
    page._applyActivityData({
        banners: bannerCards.length ? bannerCards : getDefaultBanners(),
        permanent: usePerm,
        limited: limCards,
        brandNews: [],
        brandNewsSectionTitle: '品牌动态',
        wallpaperClass,
        loadError: false,
        linksMeta: { permanent_section_enabled: true, activity_sections_order: 'permanent_first' }
    });
}

function buildBanners(cfg, getDefaultBanners) {
    if (Array.isArray(cfg.banners) && cfg.banners.length) {
        return cfg.banners.map((banner, index) => ({
            id: banner.id || index,
            title: banner.title || '',
            subtitle: banner.subtitle || '',
            tag: banner.tag || '',
            image: banner.image || '',
            gradient: banner.gradient || 'linear-gradient(135deg,#3D2F22,#5A4535)',
            link_type: banner.link_type || 'none',
            link_value: banner.link_value || ''
        }));
    }
    if (cfg.active && cfg.banner) {
        return [{
            id: 'fest',
            title: cfg.title || '',
            subtitle: cfg.subtitle || '',
            tag: cfg.tag || '',
            image: cfg.banner,
            gradient: 'linear-gradient(135deg,#3D2F22,#5A4535)',
            link_type: cfg.cta_link_type || 'none',
            link_value: cfg.cta_link_value || ''
        }];
    }
    return getDefaultBanners();
}

function splitActivities(page, cfg) {
    if (Array.isArray(cfg.permanent_activities)) {
        return {
            permanent: cfg.permanent_activities.map((item, idx) => page._normalizeCard(item, idx)),
            limited: (cfg.limited_activities || []).map((item, idx) => page._normalizeCard(item, idx))
        };
    }
    const posters = Array.isArray(cfg.card_posters) ? cfg.card_posters : [];
    const permanent = [];
    const limited = [];
    posters.forEach((item, idx) => {
        const card = page._normalizeCard(item, idx);
        if (card.end_time || (card.tag && card.tag.includes('限时'))) {
            limited.push(card);
        } else {
            permanent.push(card);
        }
    });
    return { permanent, limited };
}

module.exports = {
    loadConfig,
    loadFromFestivalConfig,
    buildBanners,
    splitActivities
};
