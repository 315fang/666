// pages/activity/activity.js
const { get } = require('../../utils/request');
const { cachedGet } = require('../../utils/requestCache');
const { navigate } = require('../../utils/navigator');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { loadConfig } = require('./activityLoader');
const { startBannerCountdown, clearBannerTimers } = require('./activityTimers');
const app = getApp();

function getActivityPageConfig() {
    return getConfigSection('activity_page_config');
}

function getDefaultBanners() {
    return getActivityPageConfig().default_banners || [];
}

function getDefaultPermanentActivities() {
    return getActivityPageConfig().default_permanent_activities || [];
}

function parsePositiveInt(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** 专享列表中第一个有效商品 ID（用于无跳转配置时的兜底） */
function firstSpotProductId(spots) {
    if (!Array.isArray(spots) || !spots.length) return null;
    for (let i = 0; i < spots.length; i++) {
        const id = parsePositiveInt(spots[i] && spots[i].product_id);
        if (id) return id;
    }
    return null;
}

/**
 * 推导限时/常驻卡片的实际跳转（兼容后台漏配 link、仅配 spot_products / product_id）
 */
function deriveActivityNav(item = {}) {
    const ltRaw = (item.link_type || 'none').toString().trim();
    const lvRaw = item.link_value != null ? String(item.link_value).trim() : '';
    if (ltRaw !== 'none' && lvRaw) {
        return { link_type: ltRaw, link_value: lvRaw };
    }

    const spots = item.spot_products || [];
    if (spots.length > 0 && item.id != null && String(item.id) !== '') {
        return {
            link_type: 'page',
            link_value: `/pages/activity/limited-spot?id=${encodeURIComponent(String(item.id))}`
        };
    }

    const pid =
        parsePositiveInt(item.direct_product_id) ||
        parsePositiveInt(item.product_id) ||
        parsePositiveInt(item.primary_product_id) ||
        firstSpotProductId(spots);
    if (pid) {
        return { link_type: 'product', link_value: String(pid) };
    }

    return { link_type: 'none', link_value: '' };
}

function normalizeCard(item = {}, idx = 0) {
    return {
        id: item.id || idx,
        title: item.title || '',
        subtitle: item.subtitle || item.subTitle || '',
        tag: item.tag || '',
        image: item.image || item.image_url || item.cover_image || '',
        gradient: item.gradient || 'linear-gradient(135deg,#3D2F22,#5A4535)',
        link_type: item.link_type || 'none',
        link_value: item.link_value || '',
        end_time: item.end_time || null,
        countdown: item.countdown || null,
        sort_order: item.sort_order != null ? item.sort_order : idx,
        spot_products: item.spot_products || [],
        direct_product_id: item.direct_product_id != null ? item.direct_product_id : null,
        product_id: item.product_id != null ? item.product_id : null
    };
}

function sortByOrder(arr) {
    return [...(arr || [])].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
}

function isRenderableCard(item) {
    if (!(item && item.title && (item.image || item.gradient))) return false;
    const nav = deriveActivityNav(item);
    return !!(nav.link_type && nav.link_type !== 'none' && nav.link_value);
}

/** Banner 轮播：后台 Banner + 常驻 + 限时，统一顶栏展示 */
function mergeActivityBannerSlides({ banners, permanent, limited, linksMeta }) {
    const b = sortByOrder((banners || []).map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
    const permRaw = sortByOrder((permanent || []).map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
    const limRaw = sortByOrder((limited || []).map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
    const penabled = !linksMeta || linksMeta.permanent_section_enabled !== false;
    const pBlock = penabled ? permRaw : [];
    const limitedFirst = linksMeta && linksMeta.activity_sections_order === 'limited_first';
    const middle = limitedFirst ? [...limRaw, ...pBlock] : [...pBlock, ...limRaw];
    return [...b, ...middle];
}

function getFallbackBannerSlides() {
    const meta = { permanent_section_enabled: true, activity_sections_order: 'permanent_first' };
    const merged = mergeActivityBannerSlides({
        banners: getDefaultBanners(),
        permanent: getDefaultPermanentActivities(),
        limited: [],
        linksMeta: meta
    });
    return merged.length ? merged : mergeActivityBannerSlides({
        banners: [],
        permanent: getDefaultPermanentActivities(),
        limited: [],
        linksMeta: meta
    });
}

Page({
    data: {
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,

        /** 顶部轮播：含原 Banner + 常驻 + 限时活动 */
        bannerSlides: [],
        bannerIndex: 0,

        /** 品牌新闻（列表页展示摘要，详情另请求） */
        brandNews: [],
        brandNewsSectionTitle: '品牌动态',

        wallpaperClass: '',
        loadError: false,

        pendingToast: '活动筹备中'
    },

    onLoad() {
        const activityConfig = getActivityPageConfig();
        const initialSlides = getFallbackBannerSlides();
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding:   app.globalData.navTopPadding   || (app.globalData.statusBarHeight || 20),
            navBarHeight:    app.globalData.navBarHeight    || 44,
            bannerSlides: initialSlides,
            pendingToast: activityConfig.pending_toast || '活动筹备中',
            brandNews: [],
            brandNewsSectionTitle: '品牌动态'
        });
        this._clearBannerTimers();
        initialSlides.forEach((item) => {
            if (item.end_time) this._startBannerCountdown(item.end_time, item.id);
        });
        this.loadConfig();
    },

    onShow() {},

    onUnload() {
        this._clearBannerTimers();
    },

    _applyActivityData({
        banners,
        permanent,
        limited,
        brandNews = [],
        brandNewsSectionTitle = '品牌动态',
        wallpaperClass = '',
        loadError = false,
        linksMeta = null
    }) {
        const merged = mergeActivityBannerSlides({ banners, permanent, limited, linksMeta: linksMeta || {} });
        const slides = merged.length ? merged : getFallbackBannerSlides();
        this.setData({
            bannerSlides: slides,
            brandNews: Array.isArray(brandNews) ? brandNews : [],
            brandNewsSectionTitle: brandNewsSectionTitle || '品牌动态',
            wallpaperClass,
            loadError,
            bannerIndex: 0
        });
        this._clearBannerTimers();
        slides.forEach((item) => {
            if (item.end_time) this._startBannerCountdown(item.end_time, item.id);
        });
    },

    // ── 加载后端配置 ─────────────────────────────────────────────

    async loadConfig() {
        return loadConfig(this, {
            getDefaultBanners,
            getDefaultPermanentActivities,
            sortByOrder,
            normalizeCard,
            isRenderableCard
        });
    },

    async _loadFromFestivalConfig() {
        const { loadFromFestivalConfig } = require('./activityLoader');
        return loadFromFestivalConfig(this, {
            getDefaultBanners,
            getDefaultPermanentActivities,
            sortByOrder,
            normalizeCard,
            isRenderableCard
        });
    },

    // ── 构建 Banner 列表 ──────────────────────────────────────────

    _buildBanners(cfg) {
        // 如果后端提供了 banners 字段直接用
        if (Array.isArray(cfg.banners) && cfg.banners.length) {
            return cfg.banners.map((b, i) => ({
                id:       b.id || i,
                title:    b.title || '',
                subtitle: b.subtitle || '',
                tag:      b.tag || '',
                image:    b.image || '',
                gradient: b.gradient || 'linear-gradient(135deg,#3D2F22,#5A4535)',
                link_type:  b.link_type || 'none',
                link_value: b.link_value || ''
            }));
        }
        // 用 festival banner 作为单张
        if (cfg.active && cfg.banner) {
            return [{
                id:       'fest',
                title:    cfg.title || '',
                subtitle: cfg.subtitle || '',
                tag:      cfg.tag || '',
                image:    cfg.banner,
                gradient: 'linear-gradient(135deg,#3D2F22,#5A4535)',
                link_type:  cfg.cta_link_type || 'none',
                link_value: cfg.cta_link_value || ''
            }];
        }
        return getDefaultBanners();
    },

    // ── 拆分常驻 / 限时 ──────────────────────────────────────────

    _splitActivities(cfg) {
        // 后端若提供 permanent_activities / limited_activities 字段直接拆
        if (Array.isArray(cfg.permanent_activities)) {
            return {
                permanent: cfg.permanent_activities.map((item, idx) => this._normalizeCard(item, idx)),
                limited:   (cfg.limited_activities || []).map((item, idx) => this._normalizeCard(item, idx))
            };
        }
        // 兜底：用 card_posters，按 tag 区分
        const posters = Array.isArray(cfg.card_posters) ? cfg.card_posters : [];
        const permanent = [];
        const limited   = [];
        posters.forEach((item, idx) => {
            const card = this._normalizeCard(item, idx);
            if (card.end_time || (card.tag && card.tag.includes('限时'))) {
                limited.push(card);
            } else {
                permanent.push(card);
            }
        });
        return { permanent, limited };
    },

    // 统一卡片标准化，顶层 normalizeCard() 用于新接口路径（无 link 别名字段）
    // 此处补充 link 别名字段的兼容处理，适用于旧接口降级路径
    _normalizeCard(item, idx) {
        return {
            id:       item.id || idx,
            title:    item.title || '',
            subtitle: item.subtitle || item.subTitle || '',
            tag:      item.tag || '',
            image:    item.image || '',
            gradient: item.gradient || 'linear-gradient(135deg,#3D2F22,#5A4535)',
            link_type:  item.link_type || (item.link ? 'page' : 'none'),
            link_value: item.link_value || item.link || '',
            end_time:   item.end_time || null,
            countdown:  null,
            spot_products: item.spot_products || [],
            direct_product_id: item.direct_product_id != null ? item.direct_product_id : null,
            product_id: item.product_id != null ? item.product_id : null
        };
    },

    // ── 轮播内限时活动倒计时 ─────────────────────────────────────────

    _startBannerCountdown(endTimeStr, slideId) {
        return startBannerCountdown(this, endTimeStr, slideId);
    },

    _clearBannerTimers() {
        return clearBannerTimers(this);
    },

    // ── 事件 ─────────────────────────────────────────────────────

    onBannerChange(e) {
        this.setData({ bannerIndex: e.detail.current });
    },

    onBannerTap(e) {
        const item = e.currentTarget.dataset.item || {};
        const nav = deriveActivityNav(item);
        if (nav.link_type !== 'none' && nav.link_value) {
            navigate(nav.link_type, nav.link_value);
        } else {
            wx.showToast({ title: this.data.pendingToast || '活动筹备中', icon: 'none' });
        }
    },

    onBrandNewsTap(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        wx.navigateTo({
            url: `/pages/activity/brand-news-detail?id=${encodeURIComponent(id)}`
        });
    },

    onRetryLoad() {
        this.setData({ loadError: false });
        this.loadConfig();
    },

    _resolveWallpaperClass(wallpaperCfg) {
        if (!wallpaperCfg || !wallpaperCfg.enabled) return '';
        const map = {
            default: '',
            'warm-gold': 'wallpaper-warm-gold',
            'mist-blue': 'wallpaper-mist-blue',
            dark: 'wallpaper-dark'
        };
        return map[wallpaperCfg.preset] || '';
    },

    onShareAppMessage() {
        const brandConfig = getConfigSection('brand_config');
        return {
            title: brandConfig.activity_share_title || ((app.globalData.brandName || '问兰') + ' · 当季品牌活动进行中'),
            path: '/pages/activity/activity'
        };
    }
});
