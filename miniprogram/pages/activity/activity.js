// pages/activity/activity.js
const { get } = require('../../utils/request');
const { cachedGet, requestCache } = require('../../utils/requestCache');
const { navigate } = require('../../utils/navigator');
const { getConfigSection } = require('../../utils/miniProgramConfig');
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
        try {
            const pageRes = await cachedGet(get, '/page-content', { page_key: 'activity' }, {
                cacheTTL: 10 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 6000
            }).catch(() => null);
            const unifiedLinks = pageRes?.data?.resources?.activity_links;
            if (pageRes?.code === 0 && unifiedLinks && typeof unifiedLinks === 'object') {
                this.pageLayout = pageRes?.data?.layout || null;
                const banners = unifiedLinks.banners || [];
                const permanentEnabled = unifiedLinks.permanent_section_enabled !== false;
                let permanent = unifiedLinks.permanent || [];
                if (!permanentEnabled) {
                    permanent = [];
                }
                const limited = unifiedLinks.limited || [];
                this._applyActivityData({
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

            // 优先从新的 activity-links 接口读取结构化配置
            const linksRes = await cachedGet(get, '/activity/links', {}, {
                cacheTTL: 10 * 60 * 1000,
                showError: false,
                maxRetries: 0,
                timeout: 6000
            });
            const links = linksRes?.data;

            if (links && typeof links === 'object') {
                const banners = links.banners || [];
                const permanentEnabled = links.permanent_section_enabled !== false;
                let permanent = links.permanent || [];
                if (!permanentEnabled) {
                    permanent = [];
                }
                const limited = links.limited || [];
                this._applyActivityData({
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

            // 降级：从旧的 festival-config 接口拼数据
            await this._loadFromFestivalConfig();

        } catch (e) {
            // activity/links 请求失败，降级
            try {
                await this._loadFromFestivalConfig();
            } catch (e2) {
                console.error('[Activity] loadConfig error:', e2);
                this.setData({ loadError: true });
            }
        }
    },

    async _loadFromFestivalConfig() {
        const res = await cachedGet(get, '/activity/festival-config', {}, {
            cacheTTL: 30 * 60 * 1000
        });
        const cfg = res.data || {};
        const wallpaperClass = this._resolveWallpaperClass(cfg.global_wallpaper);
        const bRaw = this._buildBanners(cfg);
        const { permanent, limited } = this._splitActivities(cfg);
        const permCards = sortByOrder(permanent.map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
        const limCards = sortByOrder(limited.map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
        const banCards = sortByOrder(bRaw.map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
        const usePerm = permCards.length
            ? permCards
            : sortByOrder(getDefaultPermanentActivities().map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
        this._applyActivityData({
            banners: banCards.length ? banCards : getDefaultBanners(),
            permanent: usePerm,
            limited: limCards,
            brandNews: [],
            brandNewsSectionTitle: '品牌动态',
            wallpaperClass,
            loadError: false,
            linksMeta: { permanent_section_enabled: true, activity_sections_order: 'permanent_first' }
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
        const key = `_timer_banner_${slideId}`;
        if (this[key]) clearInterval(this[key]);

        const tick = () => {
            const slides = [...this.data.bannerSlides];
            const idx = slides.findIndex((s) => String(s.id) === String(slideId));
            if (idx < 0) {
                clearInterval(this[key]);
                return;
            }
            const diff = Math.max(0, new Date(endTimeStr).getTime() - Date.now());
            if (diff === 0) {
                clearInterval(this[key]);
                requestCache.deleteByPrefix('/activity/festival-config');
                requestCache.deleteByPrefix('/page-content');
                slides.splice(idx, 1);
                const nextIdx = Math.min(this.data.bannerIndex, Math.max(0, slides.length - 1));
                this.setData({ bannerSlides: slides, bannerIndex: nextIdx });
                return;
            }
            this.setData({
                [`bannerSlides[${idx}].countdown`]: {
                    days:  String(Math.floor(diff / 86400000)).padStart(2, '0'),
                    hours: String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0'),
                    mins:  String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0'),
                    secs:  String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')
                }
            });
        };
        tick();
        this[key] = setInterval(tick, 1000);
    },

    _clearBannerTimers() {
        Object.keys(this).filter((k) => k.startsWith('_timer_banner_')).forEach((k) => {
            clearInterval(this[k]);
            this[k] = null;
        });
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
