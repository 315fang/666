const { get } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');
const { InvitePosterCore } = require('./utils/invitePosterCore');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const app = getApp();

/** 品牌名：优先后台 brand_config（与首页/我的一致），再 globalData */
function resolveBrandName() {
    const bc = getConfigSection('brand_config') || {};
    return bc.brand_name || app.globalData.brandName || '品牌臻选';
}

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        inviteCode: '',
        posterGenerating: false,
        posterImagePath: '',
        posterVariant: 'invite',
        posterVariantList: [
            { id: 'invite', name: '邀请语' },
            { id: 'wxacode', name: '官方码' },
            { id: 'creative', name: '创意版' }
        ]
    },

    onLoad() {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navBarHeight: app.globalData.navBarHeight || 44
        });
    },

    onShow() {
        if (!requireLogin()) return;
        this.loadInviteCode();
    },

    async loadInviteCode() {
        try {
            const res = await get('/distribution/stats');
            const inviteCode = (res.data && res.data.userInfo && res.data.userInfo.invite_code)
                || app.globalData.userInfo?.invite_code
                || '';
            if (inviteCode && app.globalData.userInfo) {
                app.globalData.userInfo.invite_code = inviteCode;
                try {
                    wx.setStorageSync('userInfo', { ...app.globalData.userInfo, invite_code: inviteCode });
                } catch (e) { /* ignore */ }
            }
            this.setData({ inviteCode });
        } catch (err) {
            console.error('加载邀请码失败:', err);
        }
    },

    onBack() {
        wx.navigateBack();
    },

    onCopyCode() {
        const code = this.data.inviteCode;
        if (!code) {
            wx.showToast({ title: '暂无邀请码', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: code,
            success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
        });
    },

    onPosterVariantTap(e) {
        const id = e.currentTarget.dataset.id;
        if (!id || id === this.data.posterVariant) return;
        this.setData({ posterVariant: id, posterImagePath: '' });
    },

    onShareAppMessage() {
        const code = this.data.inviteCode;
        const userInfo = app.globalData.userInfo;
        const brandName = resolveBrandName();
        return {
            title: `${userInfo?.nickname || '好友'} 邀请你来${brandName}逛逛`,
            path: `/pages/index/index${code ? '?invite=' + code : ''}`,
            imageUrl: ''
        };
    },

    async onGeneratePoster() {
        if (this.data.posterGenerating) return;
        const inviteCode = this.data.inviteCode;
        const variant = this.data.posterVariant;
        if ((variant === 'wxacode' || variant === 'invite') && !inviteCode) {
            wx.showToast({ title: '请先获取邀请码', icon: 'none' });
            return;
        }
        this.setData({ posterGenerating: true, posterImagePath: '' });
        try {
            const userInfo = app.globalData.userInfo || {};
            const brandName = resolveBrandName();
            const core = new InvitePosterCore(this);
            const tempPath = await core.generateToTempPath({
                variant,
                inviteCode,
                userInfo,
                brandName
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

    onSavePoster() {
        const { posterImagePath } = this.data;
        if (!posterImagePath) {
            wx.showToast({ title: '请先生成海报', icon: 'none' });
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
