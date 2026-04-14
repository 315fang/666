const { get } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');
const { SharePosterCore } = require('./utils/sharePosterCore');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { getTempUrls } = require('../../utils/cloud');
const app = getApp();

function resolveBrandConfig() {
    return getConfigSection('brand_config') || {};
}

function resolveBrandName() {
    const bc = resolveBrandConfig();
    return bc.brand_name || app.globalData.brandName || '品牌臻选';
}

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        memberCode: '',
        posterGenerating: false,
        posterImagePath: ''
    },

    onLoad() {
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

    async resolvePosterAsset(source) {
        const raw = String(source || '').trim();
        if (!raw) return '';
        if (/^cloud:\/\//i.test(raw)) {
            try {
                return await getTempUrls(raw);
            } catch (_) {
                return raw;
            }
        }
        return raw;
    },

    async buildPosterBrandConfig() {
        const bc = await this.refreshBrandConfig();
        const coverSource = bc.share_poster_cover_file_id
            || bc.share_poster_cover_url
            || bc.share_poster_file_id
            || bc.share_poster_url
            || '';
        const resolvedCover = await this.resolvePosterAsset(coverSource);
        return {
            ...bc,
            share_poster_cover_url: resolvedCover
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
            console.error('加载邀请码失败:', err);
        }
        await this.loadPoster();
    },

    onBack() {
        wx.navigateBack();
    },

    onCopyCode() {
        const code = this.data.memberCode;
        if (!code) {
            wx.showToast({ title: '暂无邀请码', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: code,
            success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
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

    async generatePoster() {
        if (this.data.posterGenerating) return;
        this.setData({ posterGenerating: true, posterImagePath: '' });
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
                brandConfig: bc
            });
            this.setData({ posterImagePath: tempPath });
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

    onRegeneratePoster() {
        this.generatePoster();
    },

    onSavePoster() {
        const { posterImagePath } = this.data;
        if (!posterImagePath) {
            wx.showToast({ title: '海报生成中，请稍候', icon: 'none' });
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
