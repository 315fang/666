// pages/order/invite-poster.js - 邀请海报页
const { get } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');
const { InvitePosterCore, clearWxacodeCache } = require('./utils/invitePosterCore');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { getUserNickname, normalizeUserProfile, fetchUserProfile } = require('../../utils/userProfile');
const app = getApp();

/** 品牌名：优先后台 brand_config，再 globalData */
function resolveBrandName() {
    const bc = getConfigSection('brand_config') || {};
    return bc.brand_name || app.globalData.brandName || '品牌臻选';
}

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        memberCode: '',          // 会员码（member_no 优先，降级 invite_code）
        inviteCode: '',          // 邀请码（用于小程序码 scene 参数）
        posterGenerating: false,
        posterImagePath: '',
        posterVariant: 'invite',
        posterVariantList: [
            { id: 'invite',   name: '邀请语' },
            { id: 'wxacode',  name: '官方码' },
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
        this.loadPageData();
    },

    onUnload() {
        // 页面卸载时清除小程序码内存缓存
        clearWxacodeCache();
    },

    async loadPageData() {
        const [, inviteRes] = await Promise.allSettled([
            this.loadUserProfile(),
            this.loadInviteCode()
        ]);
        // 数据就绪后自动生成默认变体海报
        if (inviteRes.status === 'fulfilled' && !this.data.posterImagePath && !this.data.posterGenerating) {
            this.onGeneratePoster();
        }
    },

    async loadUserProfile() {
        try {
            const result = await fetchUserProfile();
            if (!result) console.warn('[invite-poster] 用户资料加载失败');
        } catch (err) {
            console.error('[invite-poster] 用户资料加载异常:', err);
        }
    },

    async loadInviteCode() {
        try {
            const res = await get('/distribution/stats');
            const userInfo = (res.data && res.data.userInfo) || {};
            // member_no 优先作为会员码展示；invite_code 作为扫码参数
            const memberCode = userInfo.member_no || userInfo.invite_code || app.globalData.userInfo?.member_no || app.globalData.userInfo?.invite_code || '';
            const inviteCode = userInfo.invite_code || userInfo.my_invite_code || app.globalData.userInfo?.invite_code || '';
            if (app.globalData.userInfo) {
                if (memberCode) app.globalData.userInfo.member_no = memberCode;
                if (inviteCode) app.globalData.userInfo.invite_code = inviteCode;
                try { wx.setStorageSync('userInfo', { ...app.globalData.userInfo }); } catch (_) {}
            }
            this.setData({ memberCode, inviteCode });
        } catch (err) {
            console.error('[invite-poster] 加载邀请码失败:', err);
            const cached = app.globalData.userInfo;
            if (cached) {
                this.setData({
                    memberCode: cached.member_no || cached.invite_code || '',
                    inviteCode: cached.invite_code || ''
                });
            }
        }
    },

    onBack() {
        wx.navigateBack();
    },

    onCopyCode() {
        const code = this.data.memberCode || this.data.inviteCode;
        if (!code) {
            wx.showToast({ title: '暂无会员码', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: code,
            success: () => wx.showToast({ title: '会员码已复制', icon: 'success' })
        });
    },

    onPosterVariantTap(e) {
        const id = e.currentTarget.dataset.id;
        if (!id || id === this.data.posterVariant) return;
        this.setData({ posterVariant: id, posterImagePath: '' });
        // 切换变体后自动生成
        this.onGeneratePoster();
    },

    onShareAppMessage() {
        const code = this.data.inviteCode;
        const userInfo = normalizeUserProfile(app.globalData.userInfo || {});
        const brandName = resolveBrandName();
        return {
            title: `${getUserNickname(userInfo) || '好友'} 邀请你来${brandName}逛逛`,
            path: `/pages/index/index${code ? '?invite=' + code : ''}`,
            imageUrl: this.data.posterImagePath || ''
        };
    },

    async onGeneratePoster() {
        if (this.data.posterGenerating) return;
        const inviteCode = this.data.inviteCode;
        const variant = this.data.posterVariant;
        if (variant !== 'creative' && !inviteCode) {
            wx.showToast({ title: '邀请码加载中，请稍候', icon: 'none' });
            return;
        }
        this.setData({ posterGenerating: true, posterImagePath: '' });
        try {
            const userInfo = normalizeUserProfile(app.globalData.userInfo || {});
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
            console.error('[invite-poster] 生成海报失败:', err);
            const msg = err && err.message ? String(err.message) : '';
            wx.showToast({
                title: msg && msg.length <= 20 ? msg : '海报生成失败，请重试',
                icon: 'none',
                duration: 2000
            });
        } finally {
            this.setData({ posterGenerating: false });
        }
    },

    onSavePoster() {
        const { posterImagePath } = this.data;
        if (!posterImagePath) {
            wx.showToast({ title: '请先等待海报生成', icon: 'none' });
            return;
        }
        wx.saveImageToPhotosAlbum({
            filePath: posterImagePath,
            success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
            fail: (err) => {
                if (err.errMsg && err.errMsg.includes('auth deny')) {
                    wx.showModal({
                        title: '需要相册权限',
                        content: '请在设置中开启相册访问权限后再保存',
                        confirmText: '去设置',
                        success: (r) => { if (r.confirm) wx.openSetting(); }
                    });
                } else {
                    wx.showToast({ title: '保存失败，请重试', icon: 'none' });
                }
            }
        });
    }
});
