// pages/activity/activity.js
const { navigate } = require('../../utils/navigator');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const {
    pickPreferredAssetRef,
    warmRenderableImageUrls,
    resolveRenderableImageUrl
} = require('../../utils/cloudAssetRuntime');
const { getBrandNewsFallbackCover } = require('../../utils/brandNewsCover');
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

async function resolveBannerSlideImages(slides = []) {
    const items = Array.isArray(slides) ? slides : [];
    await warmRenderableImageUrls(items);
    return Promise.all(items.map(async (item) => ({
        ...item,
        image: await resolveRenderableImageUrl(item, '')
    })));
}

async function resolveSectionImages(sections = []) {
    const rows = Array.isArray(sections) ? sections : [];
    const sectionAssets = [];
    rows.forEach((section) => {
        if (Array.isArray(section.subCards) && section.subCards.length) {
            sectionAssets.push(...section.subCards);
            return;
        }
        sectionAssets.push(section);
    });
    await warmRenderableImageUrls(sectionAssets);
    return Promise.all(rows.map(async (section) => {
        if (Array.isArray(section.subCards) && section.subCards.length) {
            const subCards = await Promise.all(section.subCards.map(async (card) => ({
                ...card,
                image: await resolveRenderableImageUrl(card, '')
            })));
            return { ...section, subCards };
        }
        return {
            ...section,
            image: await resolveRenderableImageUrl(section, '')
        };
    }));
}

async function resolveBrandNewsImages(list = []) {
    const items = Array.isArray(list) ? list : [];
    await warmRenderableImageUrls(items);
    return Promise.all(items.map(async (item) => ({
        ...item,
        cover_image: await resolveRenderableImageUrl(item, getBrandNewsFallbackCover(item))
    })));
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
            link_value: `/pages/activity/limited-spot?slot_id=${encodeURIComponent(String(item.id))}`
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
        image: pickPreferredAssetRef(item),
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

function plainSummary(html, maxLen = 46) {
    if (!html) return '';
    const text = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function enrichSlashActivity(item) {
    if (!item) return item;
    return {
        ...item,
        _summary: item._summary || plainSummary(item.product && item.product.description, 46)
    };
}

function enrichGroupActivity(item) {
    if (!item) return item;
    return {
        ...item,
        _summary: item._summary || plainSummary(item.product && item.product.description, 46)
    };
}

function formatLotteryDisplayValue(prize = {}) {
    const value = Number(prize.prize_value || 0);
    if (prize.type === 'points' && value > 0) return `${value} 积分`;
    if (prize.type === 'coupon' && value > 0) return `${value} 元券`;
    if (prize.type === 'physical') return '实物礼品';
    return '试试下一次好运';
}

function enrichLotteryPrize(item) {
    if (!item) return item;
    return {
        ...item,
        display_value: item.display_value || formatLotteryDisplayValue(item)
    };
}

function isRenderableCard(item) {
    if (!(item && item.title && (item.image || item.gradient))) return false;
    const nav = deriveActivityNav(item);
    return !!(nav.link_type && nav.link_type !== 'none' && nav.link_value);
}

/** Banner 轮播：后台 Banner + 限时活动，不在Banner中展示常驻活动 */
function mergeActivityBannerSlides({ banners, limited }) {
    const b = sortByOrder((banners || []).map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
    const limRaw = sortByOrder((limited || []).map((item, idx) => normalizeCard(item, idx)).filter(isRenderableCard));
    return [...b, ...limRaw];
}

function getFallbackBannerSlides() {
    const merged = mergeActivityBannerSlides({
        banners: getDefaultBanners(),
        limited: []
    });
    return merged.length ? merged : mergeActivityBannerSlides({
        banners: [],
        limited: []
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
        permanentActivities: [],
        activitySections: [],

        wallpaperClass: '',
        loadError: false,

        pendingToast: '活动筹备中'
    },

    onLoad() {
        const activityConfig = getActivityPageConfig();
        const initialSlides = getFallbackBannerSlides();
        const initialPermanent = getDefaultPermanentActivities();
        this._limitedActivities = [];
        this._activityLinksMeta = {};
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding:   app.globalData.navTopPadding   || (app.globalData.statusBarHeight || 20),
            navBarHeight:    app.globalData.navBarHeight    || 44,
            bannerSlides: initialSlides,
            pendingToast: activityConfig.pending_toast || '活动筹备中',
            brandNews: [],
            brandNewsSectionTitle: '品牌动态',
            permanentActivities: initialPermanent,
            activitySections: []
        });
        this._clearBannerTimers();
        initialSlides.forEach((item) => {
            if (item.end_time) this._startBannerCountdown(item.end_time, item.id);
        });
        this._skipNextOnShowReload = true;
        this._reloadActivityData();
    },

    onShow() {
        const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
        if (tabBar && typeof tabBar.refresh === 'function') {
            tabBar.refresh();
        }
        if (this._skipNextOnShowReload) {
            this._skipNextOnShowReload = false;
            return;
        }
        this._reloadActivityData();
    },

    _reloadActivityData() {
        if (this._activityReloading) return this._activityReloading;
        const promise = Promise.resolve()
            .then(() => this.loadConfig())
            .finally(() => {
                this._activityReloading = null;
            });
        this._activityReloading = promise;
        return promise;
    },

    onUnload() {
        this._clearBannerTimers();
    },

    _restartSectionCountdowns(activitySections = []) {
        const { startSectionCountdown } = require('./activityTimers');
        const sections = Array.isArray(activitySections) ? activitySections : [];
        sections.forEach((section) => {
            const cards = Array.isArray(section.subCards) ? section.subCards : [];
            cards.forEach((card) => {
                if (!card || !card.countdownMeta) return;
                startSectionCountdown(this, {
                    sectionKey: section.key,
                    cardKey: card.key,
                    startTime: card.countdownMeta.startTime,
                    endTime: card.countdownMeta.endTime
                });
            });
        });
    },

    async _applyActivityData({
        banners,
        permanent,
        limited,
        brandNews = [],
        brandNewsSectionTitle = '品牌动态',
        wallpaperClass = '',
        loadError = false,
        linksMeta = null
    }) {
        const merged = mergeActivityBannerSlides({ banners, limited });
        const slides = merged.length ? merged : getFallbackBannerSlides();
        const permanentActivities = Array.isArray(permanent) ? permanent : [];
        this._limitedActivities = Array.isArray(limited) ? limited : [];
        this._activityLinksMeta = linksMeta && typeof linksMeta === 'object' ? linksMeta : {};
        const applyToken = (this._activityApplyToken || 0) + 1;
        this._activityApplyToken = applyToken;
        const activitySections = this._buildActivitySectionsRaw(permanentActivities);
        this.setData({
            bannerSlides: slides,
            brandNews,
            brandNewsSectionTitle: brandNewsSectionTitle || '品牌动态',
            permanentActivities,
            activitySections,
            wallpaperClass,
            loadError,
            bannerIndex: 0
        });
        this._clearBannerTimers();
        slides.forEach((item) => {
            if (item.end_time) this._startBannerCountdown(item.end_time, item.id);
        });
        this._restartSectionCountdowns(activitySections);
        Promise.all([
            resolveBannerSlideImages(slides),
            resolveBrandNewsImages(brandNews),
            resolveSectionImages(activitySections)
        ]).then(([resolvedSlides, resolvedBrandNews, resolvedSections]) => {
            if (this._activityApplyToken !== applyToken) return;
            this.setData({
                bannerSlides: resolvedSlides,
                brandNews: resolvedBrandNews,
                activitySections: resolvedSections
            });
            this._clearBannerTimers();
            resolvedSlides.forEach((item) => {
                if (item.end_time) this._startBannerCountdown(item.end_time, item.id);
            });
            this._restartSectionCountdowns(resolvedSections);
        }).catch(() => null);
    },

    // ── 加载后端配置 ─────────────────────────────────────────────

    async loadConfig() {
        const { loadConfig } = require('./activityLoader');
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

    _buildActivitySectionsRaw(permanentActivities) {
        const { buildActivitySections } = require('../../utils/activitySectionBuilder');
        const meta = this._activityLinksMeta || {};
        const built = buildActivitySections({
            permanentActivities: Array.isArray(permanentActivities) ? permanentActivities : [],
            limitedActivities: this._limitedActivities || [],
            permanentSectionTitle: meta.permanent_section_title || '',
            permanentSectionSubtitle: meta.permanent_section_subtitle || ''
        });
        return (built.sections || []).map((section) => ({
            ...section
        }));
    },

    async _buildActivitySections(permanentActivities) {
        return resolveSectionImages(this._buildActivitySectionsRaw(permanentActivities));
    },

    async loadActivityPreviews() {
        // 简化：不再需要加载预览数据，直接更新sections
        const activitySections = await this._buildActivitySections(this.data.permanentActivities || []);
        this.setData({
            activitySections
        });
        this._restartSectionCountdowns(activitySections);
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
            image:    pickPreferredAssetRef(item),
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
        const { startBannerCountdown } = require('./activityTimers');
        return startBannerCountdown(this, endTimeStr, slideId);
    },

    _clearBannerTimers() {
        const { clearBannerTimers } = require('./activityTimers');
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

    onBannerImageError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const bannerSlides = Array.isArray(this.data.bannerSlides) ? this.data.bannerSlides.slice() : [];
        if (!bannerSlides[index]) return;
        bannerSlides[index] = { ...bannerSlides[index], image: '' };
        this.setData({ bannerSlides });
    },

    onBrandNewsImageError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const brandNews = Array.isArray(this.data.brandNews) ? this.data.brandNews.slice() : [];
        if (!brandNews[index]) return;
        brandNews[index] = { ...brandNews[index], cover_image: '' };
        this.setData({ brandNews });
    },

    onSectionImageError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const activitySections = Array.isArray(this.data.activitySections) ? this.data.activitySections.slice() : [];
        if (!activitySections[index]) return;
        activitySections[index] = { ...activitySections[index], image: '' };
        this.setData({ activitySections });
    },

    onBrandNewsTap(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        wx.navigateTo({
            url: `/pages/activity/brand-news-detail?id=${encodeURIComponent(id)}`
        });
    },

    onSectionTap(e) {
        const section = e.currentTarget.dataset.section || {};
        if (!(section.moreLinkType && section.moreLinkValue)) return;
        navigate(section.moreLinkType, section.moreLinkValue);
    },

    onSubCardTap(e) {
        const card = e.currentTarget.dataset.card || {};
        if (!(card.moreLinkType && card.moreLinkValue)) return;
        navigate(card.moreLinkType, card.moreLinkValue);
    },

    onRetryLoad() {
        this.setData({ loadError: false });
        this._reloadActivityData();
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
