const { get } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');
const { SharePosterCore } = require('./utils/sharePosterCore');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { resolveCloudImageUrl } = require('../../utils/cloudAssetRuntime');
const app = getApp();

const POSTER_VARIANT_OPTIONS = [
    { value: 'brand', label: '官方宣传' },
    { value: 'personal', label: '个人推荐' }
];

function resolveBrandConfig() {
    return getConfigSection('brand_config') || {};
}

function resolveBrandName() {
    const bc = resolveBrandConfig();
    return bc.brand_name || app.globalData.brandName || '品牌臻选';
}

function resolveHomeConfigs() {
    const homeData = app.globalData.homePageData;
    const cached = homeData
        || (() => {
            try {
                const stored = wx.getStorageSync('home_config_cache');
                return stored && stored.data ? stored.data : null;
            } catch (_) {
                return null;
            }
        })();
    return (cached && (cached.configs || (cached.resources && cached.resources.configs))) || {};
}

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        memberCode: '',
        posterVariant: 'personal',
        posterVariantOptions: POSTER_VARIANT_OPTIONS,
        posterGenerating: false,
        posterImagePath: '',
        posterPreviewReady: false
    },

    onLoad() {
        this.posterImageCache = {};
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navBarHeight: app.globalData.navBarHeight || 44
        });
    },

    onShow() {
        if (!requireLogin()) return;
        this.loadMemberCode();
    },

    async refreshBrandConfig() {
        if (typeof app.fetchMiniProgramConfig === 'function') {
            try {
                await app.fetchMiniProgramConfig({ forceRefresh: true });
            } catch (_) {
                // 忽略配置刷新失败，继续使用本地已加载配置
            }
        }
        return resolveBrandConfig();
    },

    async refreshHomeConfigs() {
        if (app.globalData.homePageData) {
            return resolveHomeConfigs();
        }

        if (app.globalData.homeDataPromise) {
            try {
                await app.globalData.homeDataPromise;
            } catch (_) {
                // ignore
            }
            return resolveHomeConfigs();
        }

        if (typeof app.prefetchHomeData === 'function') {
            try {
                await app.prefetchHomeData();
            } catch (_) {
                // ignore
            }
        }

        return resolveHomeConfigs();
    },

    async resolvePosterAsset(source) {
        return resolveCloudImageUrl(source, '');
    },

    async buildPosterBrandConfig() {
        const bc = await this.refreshBrandConfig();
        const homeConfigs = await this.refreshHomeConfigs();
        const coverSource = {
            file_id: homeConfigs.official_promo_cover_file_id
                || bc.official_promo_cover_file_id
                || bc.share_poster_cover_file_id
                || bc.share_poster_file_id
                || '',
            image_url: homeConfigs.official_promo_cover
                || bc.official_promo_cover
                || bc.share_poster_cover_url
                || bc.share_poster_url
                || ''
        };
        const brandLogoSource = {
            file_id: homeConfigs.brand_logo_file_id || bc.brand_logo_file_id || '',
            image_url: homeConfigs.brand_logo || bc.brand_logo || ''
        };
        const resolvedCover = await this.resolvePosterAsset(coverSource);
        const resolvedBrandLogo = await this.resolvePosterAsset(brandLogoSource);
        return {
            ...bc,
            share_poster_cover_url: resolvedCover,
            brand_logo_url: resolvedBrandLogo,
            poster_brand_display_name: homeConfigs.nav_brand_title || bc.nav_brand_title || bc.brand_name || app.globalData.brandName || '品牌官方',
            official_promo_title: homeConfigs.official_promo_title || bc.official_promo_title || '专业皮肤修护 始于1974',
            official_promo_subtitle: homeConfigs.official_promo_subtitle || bc.official_promo_subtitle || '',
            official_promo_badge: homeConfigs.official_promo_badge || bc.official_promo_badge || '官方宣传'
        };
    },

    async loadMemberCode() {
        try {
            const res = await get('/distribution/stats');
            const memberCode = (res.data && res.data.userInfo && res.data.userInfo.invite_code)
                || app.globalData.userInfo?.invite_code
                || '';
            if (memberCode && app.globalData.userInfo) {
                app.globalData.userInfo.invite_code = memberCode;
                try {
                    wx.setStorageSync('userInfo', { ...app.globalData.userInfo, invite_code: memberCode });
                } catch (e) { /* ignore */ }
            }
            this.setData({ memberCode });
        } catch (err) {
            console.error('加载用户ID失败:', err);
        }
        await this.loadPoster();
    },

    onBack() {
        wx.navigateBack();
    },

    onCopyCode() {
        const code = this.data.memberCode;
        if (!code) {
            wx.showToast({ title: '暂无可复制ID', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: code,
            success: () => wx.showToast({ title: '我的ID已复制', icon: 'success' })
        });
    },

    onShareAppMessage() {
        const code = this.data.memberCode;
        const userInfo = app.globalData.userInfo;
        const brandName = resolveBrandName();
        return {
            title: `${userInfo?.nick_name || userInfo?.nickname || '好友'} 邀请你来${brandName}逛逛`,
            path: `/pages/index/index${code ? '?invite=' + code : ''}`,
            imageUrl: this.data.posterImagePath || ''
        };
    },

    onShareTimeline() {
        const brandName = resolveBrandName();
        return {
            title: `${brandName} · 品质甄选，好物优选`,
            query: '',
            imageUrl: this.data.posterImagePath || ''
        };
    },

    async loadPoster() {
        await this.generatePoster();
    },

    async generatePoster(options = {}) {
        if (this.data.posterGenerating) return;
        const { force = false } = options;
        const { posterVariant } = this.data;

        if (!force && this.posterImageCache[posterVariant]) {
            this.setData({
                posterImagePath: this.posterImageCache[posterVariant],
                posterPreviewReady: false
            });
            return;
        }

        this.setData({
            posterGenerating: true,
            posterImagePath: '',
            posterPreviewReady: false
        });
        try {
            const bc = await this.buildPosterBrandConfig();
            const brandName = resolveBrandName();
            const userInfo = app.globalData.userInfo || {};
            const inviteCode = this.data.memberCode || userInfo.invite_code || '';
            const core = new SharePosterCore(this, { canvasSelector: '#posterCanvas' });
            const tempPath = await core.generateToTempPath({
                userInfo,
                brandName,
                inviteCode,
                brandConfig: bc,
                posterVariant
            });
            this.posterImageCache[posterVariant] = tempPath;
            this.setData({
                posterImagePath: tempPath,
                posterPreviewReady: false
            });
        } catch (err) {
            console.error('生成海报失败:', err);
            const msg = (err && err.message) ? String(err.message) : '';
            wx.showToast({
                title: msg.length > 18 ? '海报生成失败，请重试' : (msg || '海报生成失败，请重试'),
                icon: 'none'
            });
        } finally {
            this.setData({ posterGenerating: false });
        }
    },

    onPosterVariantChange(e) {
        const variant = e && e.currentTarget && e.currentTarget.dataset
            ? String(e.currentTarget.dataset.variant || '')
            : '';
        if (!variant || variant === this.data.posterVariant) return;
        this.setData(
            {
                posterVariant: variant,
                posterImagePath: '',
                posterPreviewReady: false
            },
            () => this.generatePoster()
        );
    },

    onPosterImageLoad() {
        if (!this.data.posterPreviewReady) {
            this.setData({ posterPreviewReady: true });
        }
    },

    onPosterImageError(err) {
        console.error('海报预览加载失败:', err);
        delete this.posterImageCache[this.data.posterVariant];
        this.setData({
            posterImagePath: '',
            posterPreviewReady: false
        });
        wx.showToast({ title: '海报预览失败，请重试', icon: 'none' });
    },

    onRegeneratePoster() {
        delete this.posterImageCache[this.data.posterVariant];
        this.generatePoster({ force: true });
    },

    onSavePoster() {
        const { posterImagePath, posterPreviewReady } = this.data;
        if (!posterImagePath || !posterPreviewReady) {
            wx.showToast({ title: '海报加载中，请稍候', icon: 'none' });
            return;
        }
        wx.saveImageToPhotosAlbum({
            filePath: posterImagePath,
            success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
            fail: (err) => {
                if (err.errMsg && err.errMsg.includes('auth deny')) {
                    wx.showModal({
                        title: '需要相册权限',
                        content: '请在设置中开启相册访问权限',
                        confirmText: '去设置',
                        success: (r) => {
                            if (r.confirm) wx.openSetting();
                        }
                    });
                } else {
                    wx.showToast({ title: '保存失败', icon: 'none' });
                }
            }
        });
    }
});
