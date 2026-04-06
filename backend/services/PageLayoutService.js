const { Op } = require('sequelize');
const { AppConfig, Banner, HomeSection, QuickEntry, PageLayout } = require('../models');
const { getPublicBoardMap } = require('./BoardService');
const { sanitizeActivityLinksForPublic } = require('../utils/activityLinksPublic');
const { LRUCache } = require('lru-cache');
const { warn: logWarn } = require('../utils/logger');

const pagePayloadCache = new LRUCache({
    max: 20,
    ttl: 1000 * 45
});

const DEFAULT_LAYOUTS = [
    {
        page_key: 'home',
        page_name: '首页',
        scene: 'home',
        sort_order: 100,
        layout_schema: [
            { key: 'heroBanner', type: 'banner', title: '顶部轮播' },
            { key: 'quickEntry', type: 'entry-grid', title: '快捷入口' },
            { key: 'featuredProducts', type: 'product-board', title: '精选商品榜' },
            { key: 'midPoster', type: 'banner', title: '中部海报位' },
            { key: 'bottomPoster', type: 'banner', title: '底部海报位' }
        ],
        data_sources: {
            heroBanner: { pool: 'content', source: 'banner:home' },
            quickEntry: { pool: 'content', source: 'quick-entry:home' },
            featuredProducts: { pool: 'board', source: 'home.featuredProducts' },
            midPoster: { pool: 'content', source: 'banner:home_mid' },
            bottomPoster: { pool: 'content', source: 'banner:home_bottom' }
        }
    },
    {
        page_key: 'activity',
        page_name: '活动页',
        scene: 'activity',
        sort_order: 90,
        layout_schema: [
            { key: 'heroBanner', type: 'banner', title: '活动 Banner' },
            { key: 'permanentActivities', type: 'campaign-list', title: '常驻活动' },
            { key: 'limitedActivities', type: 'campaign-list', title: '限时活动' },
            { key: 'brandNews', type: 'article-list', title: '品牌新闻' }
        ],
        data_sources: {
            heroBanner: { pool: 'campaign', source: 'activity_links.banners' },
            permanentActivities: { pool: 'campaign', source: 'activity_links.permanent' },
            limitedActivities: { pool: 'campaign', source: 'activity_links.limited' },
            brandNews: { pool: 'campaign', source: 'activity_links.brand_news' }
        }
    },
    {
        page_key: 'user',
        page_name: '我的页',
        scene: 'user',
        sort_order: 80,
        layout_schema: [
            { key: 'profileCard', type: 'user-card', title: '用户卡片' },
            { key: 'assetPanel', type: 'asset-panel', title: '资产面板' },
            { key: 'orderPanel', type: 'order-panel', title: '订单与售后' },
            { key: 'memberTools', type: 'tool-grid', title: '会员服务' },
            { key: 'ruleSummary', type: 'rule-card', title: '规则说明' }
        ],
        data_sources: {
            ruleSummary: { pool: 'rule', source: 'rules.shipping_commission' }
        }
    }
];

function parseConfigValue(row) {
    if (!row) return null;
    const value = row.config_value;
    if (row.config_type === 'json' || row.config_type === 'array') {
        try {
            return JSON.parse(value);
        } catch (_) {
            return null;
        }
    }
    if (row.config_type === 'boolean') {
        return value === 'true' || value === '1';
    }
    if (row.config_type === 'number') {
        return Number(value);
    }
    return value;
}

function parseBannerProductImages(product) {
    if (!product?.images) return [];
    if (Array.isArray(product.images)) return product.images;
    try {
        const parsed = JSON.parse(product.images);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function normalizeBannerList(list = []) {
    return list.map((banner) => {
        const images = parseBannerProductImages(banner.product);
        return {
            id: banner.id,
            title: banner.title || '',
            subtitle: banner.subtitle || '',
            kicker: banner.kicker || '',
            image_url: banner.image_url || images[0] || '',
            link_type: banner.link_type || 'none',
            link_value: banner.link_value || '',
            product_id: banner.product_id || null
        };
    });
}

async function ensureDefaultPageLayouts() {
    for (const item of DEFAULT_LAYOUTS) {
        await PageLayout.findOrCreate({
            where: { page_key: item.page_key },
            defaults: item
        });
    }
}

async function getPageLayout(pageKey) {
    await ensureDefaultPageLayouts();
    const layout = await PageLayout.findOne({
        where: { page_key: pageKey, status: 1 }
    });
    return layout ? layout.get({ plain: true }) : null;
}

async function getHomePayload() {
    const [configRows, sections, quickEntries, heroBanners, midBanners, bottomBanners, boardMap] = await Promise.all([
        AppConfig.findAll({
            where: { category: 'homepage', is_public: true, status: 1 },
            attributes: ['config_key', 'config_value', 'config_type']
        }),
        HomeSection.findAll({
            where: { status: 1, is_visible: true },
            order: [['sort_order', 'DESC'], ['id', 'ASC']]
        }),
        QuickEntry.findAll({
            where: { status: 1, position: 'home' },
            order: [['sort_order', 'DESC'], ['id', 'ASC']]
        }),
        Banner.findAll({
            where: { status: 1, position: 'home' },
            include: [{ association: 'product', required: false }]
        }),
        Banner.findAll({
            where: { status: 1, position: 'home_mid' },
            include: [{ association: 'product', required: false }]
        }),
        Banner.findAll({
            where: { status: 1, position: 'home_bottom' },
            include: [{ association: 'product', required: false }]
        }),
        getPublicBoardMap({ scene: 'home', keys: ['home.featuredProducts'] })
    ]);

    const configs = {};
    configRows.forEach((row) => {
        configs[row.config_key] = parseConfigValue(row);
    });

    // 弹窗广告配置
    let popupAd = { enabled: false };
    try {
        const popupRow = await AppConfig.findOne({
            where: { category: 'popup_ad', config_key: 'popup_ad_config', status: 1 }
        });
        if (popupRow?.config_value) {
            const parsed = JSON.parse(popupRow.config_value);
            popupAd = { enabled: false, ...parsed };
            if (popupAd.product_id && !popupAd.image_url) {
                const { Product } = require('../models');
                const popupProduct = await Product.findByPk(popupAd.product_id, { attributes: ['images', 'name'] });
                if (popupProduct) {
                    let pImgs = popupProduct.images || [];
                    if (typeof pImgs === 'string') try { pImgs = JSON.parse(pImgs); } catch (_) { pImgs = []; }
                    if (pImgs.length > 0) popupAd.image_url = pImgs[0];
                    if (!popupAd.button_text) popupAd.button_text = popupProduct.name;
                }
            }
            if (popupAd.product_id && (!popupAd.link_type || popupAd.link_type === 'none')) {
                popupAd.link_type = 'product';
                popupAd.link_value = String(popupAd.product_id);
            }
        }
    } catch (e) {
        logWarn('PAGE_LAYOUT', '弹窗广告配置加载失败', { error: e.message });
    }

    return {
        configs,
        quick_entries: quickEntries.map((item) => item.get({ plain: true })),
        home_sections: sections.map((item) => item.get({ plain: true })),
        banners: {
            home: normalizeBannerList(heroBanners.map((item) => item.get({ plain: true }))),
            home_mid: normalizeBannerList(midBanners.map((item) => item.get({ plain: true }))),
            home_bottom: normalizeBannerList(bottomBanners.map((item) => item.get({ plain: true })))
        },
        boards: boardMap,
        popupAd,
        legacy_payload: {
            configs,
            quickEntries: quickEntries.map((item) => item.get({ plain: true })),
            homeSections: sections.map((item) => item.get({ plain: true })),
            banners: normalizeBannerList(heroBanners.map((item) => item.get({ plain: true }))),
            popupAd
        }
    };
}

async function getActivityPayload() {
    const rows = await AppConfig.findAll({
        where: {
            category: { [Op.in]: ['activity', 'ui_theme'] },
            config_key: { [Op.in]: ['activity_links_config', 'festival_config', 'global_ui_config'] },
            status: 1
        },
        attributes: ['config_key', 'config_value', 'config_type']
    });

    const resources = {
        activity_links: { banners: [], permanent: [], limited: [] },
        festival_config: {},
        global_ui_config: {}
    };

    rows.forEach((row) => {
        const value = parseConfigValue(row);
        if (row.config_key === 'activity_links_config') resources.activity_links = { ...resources.activity_links, ...(value || {}) };
        if (row.config_key === 'festival_config') resources.festival_config = value || {};
        if (row.config_key === 'global_ui_config') resources.global_ui_config = value || {};
    });

    resources.activity_links = sanitizeActivityLinksForPublic(resources.activity_links);

    return resources;
}

async function getUserPayload() {
    const rows = await AppConfig.findAll({
        where: {
            config_key: { [Op.in]: ['RULES_TITLE', 'RULES_SUMMARY', 'RULES_DETAILS'] },
            status: 1
        },
        attributes: ['config_key', 'config_value', 'config_type']
    });

    const rules = {
        title: '发货与佣金规则说明',
        summary: '',
        details: []
    };

    rows.forEach((row) => {
        const value = parseConfigValue(row);
        if (row.config_key === 'RULES_TITLE') rules.title = value || rules.title;
        if (row.config_key === 'RULES_SUMMARY') rules.summary = value || '';
        if (row.config_key === 'RULES_DETAILS') rules.details = Array.isArray(value) ? value : [];
    });

    return {
        rules
    };
}

async function getPagePayload(pageKey) {
    const cacheKey = `page_payload:${pageKey}`;
    const cached = pagePayloadCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const layout = await getPageLayout(pageKey);
    if (!layout) return null;

    let resources = {};
    if (pageKey === 'home') {
        resources = await getHomePayload();
    } else if (pageKey === 'activity') {
        resources = await getActivityPayload();
    } else if (pageKey === 'user') {
        resources = await getUserPayload();
    }

    const payload = {
        page_key: pageKey,
        page_name: layout.page_name,
        layout,
        resources
    };

    pagePayloadCache.set(cacheKey, payload);
    return payload;
}

function clearPagePayloadCache(pageKey = null) {
    if (pageKey) {
        pagePayloadCache.delete(`page_payload:${pageKey}`);
        return;
    }
    pagePayloadCache.clear();
}

module.exports = {
    DEFAULT_LAYOUTS,
    ensureDefaultPageLayouts,
    getPageLayout,
    getPagePayload,
    clearPagePayloadCache
};
