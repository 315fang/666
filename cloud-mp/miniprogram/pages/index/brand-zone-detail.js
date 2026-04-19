const { get } = require('../../utils/request');
const navigator = require('../../utils/navigator');
const {
    applyHomeConfig,
    normalizeAssetUrl,
    createEmptyBrandZone
} = require('./indexHomeLoader');

const app = getApp();

function splitStoryBody(text = '') {
    return String(text || '')
        .split(/\r?\n+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function hasBrandZoneContent(brandZone = {}) {
    return !!(
        brandZone
        && brandZone.enabled
        && (
            (Array.isArray(brandZone.cards) && brandZone.cards.length > 0)
            || (Array.isArray(brandZone.certifications) && brandZone.certifications.length > 0)
            || String(brandZone.coverImage || '').trim()
            || String(brandZone.welcomeTitle || '').trim()
            || String(brandZone.welcomeSubtitle || '').trim()
            || String(brandZone.story && brandZone.story.body || '').trim()
        )
    );
}

Page({
    data: {
        loading: true,
        loadError: false,
        navBrandTitle: '问兰镜像',
        navBrandSub: '品牌甄选',
        homeConfigs: {},
        brandZone: createEmptyBrandZone(),
        storyParagraphs: [],
        heroImage: '',
        officialPromoTitle: '',
        officialPromoSubtitle: '',
        officialPromoBadge: '官方宣传'
    },

    onLoad() {
        this.loadPage();
    },

    _normalizeLatestActivity() {
        return {};
    },

    _checkAndShowPopupAd() {},

    async loadPage(forceRefresh = false) {
        this.setData({ loading: true, loadError: false });
        try {
            let data = null;

            if (!forceRefresh && app.globalData.homeDataPromise) {
                data = await app.globalData.homeDataPromise.catch(() => null);
            }

            if (!data && typeof app.prefetchHomeData === 'function') {
                data = await app.prefetchHomeData().catch(() => null);
            }

            if (!data || Object.keys(data).length === 0) {
                const pageRes = await get('/page-content/home').catch(() => null);
                const canonicalPayload = pageRes && (pageRes.data || pageRes);
                data = canonicalPayload && Object.keys(canonicalPayload).length ? canonicalPayload : null;
            }

            if (!data) {
                const fallbackRes = await get('/homepage-config').catch(() => ({ data: {} }));
                data = fallbackRes.data || {};
            }

            await applyHomeConfig(this, data);

            const brandZone = {
                ...createEmptyBrandZone(),
                ...(this.data.brandZone || {})
            };
            const heroImage = String(brandZone.coverImage || '').trim()
                || normalizeAssetUrl(this.data.homeConfigs.official_promo_cover || '');
            const officialPromoTitle = String(this.data.homeConfigs.official_promo_title || '').trim();
            const officialPromoSubtitle = String(this.data.homeConfigs.official_promo_subtitle || '').trim();
            const officialPromoBadge = String(this.data.homeConfigs.official_promo_badge || '官方宣传').trim() || '官方宣传';
            const storyParagraphs = splitStoryBody(brandZone.story && brandZone.story.body);
            const loadError = !hasBrandZoneContent(brandZone);

            this.setData({
                loading: false,
                loadError,
                brandZone,
                heroImage,
                storyParagraphs,
                officialPromoTitle,
                officialPromoSubtitle,
                officialPromoBadge
            });

            if (!loadError) {
                wx.setNavigationBarTitle({
                    title: (brandZone.title || '品牌专区').slice(0, 18)
                });
            }
        } catch (err) {
            console.error('[BrandZoneDetail] load failed:', err);
            this.setData({
                loading: false,
                loadError: true,
                brandZone: createEmptyBrandZone(),
                storyParagraphs: [],
                heroImage: ''
            });
        }
    },

    onRetry() {
        this.loadPage(true);
    },

    onBrandCardTap(e) {
        const item = e.currentTarget.dataset.item || {};
        if (item.link_type && item.link_type !== 'none' && item.link_value) {
            navigator.navigate(item.link_type, item.link_value);
            return;
        }
        wx.showToast({ title: '内容筹备中', icon: 'none' });
    },

    onOpenActivity() {
        wx.navigateTo({ url: '/pages/index/brand-news-list?category_key=latest_activity' });
    },

    onCoverImageError() {
        this.setData({ heroImage: '' });
    },

    onBrandZoneImageError(e) {
        const scene = e?.currentTarget?.dataset?.scene || 'card';
        const index = Number(e?.currentTarget?.dataset?.index || 0);
        const brandZone = {
            ...createEmptyBrandZone(),
            ...(this.data.brandZone || {})
        };

        if (scene === 'certification') {
            const certifications = Array.isArray(brandZone.certifications) ? brandZone.certifications.slice() : [];
            if (!certifications[index]) return;
            certifications[index] = { ...certifications[index], image: '' };
            brandZone.certifications = certifications;
        } else {
            const cards = Array.isArray(brandZone.cards) ? brandZone.cards.slice() : [];
            if (!cards[index]) return;
            cards[index] = { ...cards[index], image: '' };
            brandZone.cards = cards;
        }

        this.setData({ brandZone });
    },

    onShareAppMessage() {
        const title = this.data.officialPromoTitle
            || `${this.data.navBrandTitle || '品牌'} · 品牌专区`;
        return {
            title,
            path: '/pages/index/brand-zone-detail'
        };
    }
});
