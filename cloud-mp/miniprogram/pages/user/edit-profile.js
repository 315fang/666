// pages/user/edit-profile.js - 编辑个人资料
const app = getApp();
const { get, put, uploadFile } = require('../../utils/request');
const { ensurePrivacyAuthorization } = require('../../utils/privacy');
const { requireLogin } = require('../../utils/auth');
const { isDefaultUserProfile } = require('../../utils/userProfile');

Page({
    data: {
        userInfo: null,
        showAvatarPickSheet: false,
        showNicknameModal: false,
        newNickname: '',
        showRealNameModal: false,
        newRealName: '',
        bootstrapMode: false,
        showBootstrapGuide: false
    },

    onLoad(options) {
        if (!requireLogin()) {
            setTimeout(() => wx.navigateBack(), 100);
            return;
        }
        this.setData({ bootstrapMode: String(options?.bootstrap || '') === '1' });
        this.loadUserInfo();
    },

    onShow() {
        this.loadUserInfo();
    },

    loadUserInfo() {
        const userInfo = app.globalData.userInfo || {};
        this.setData({
            userInfo,
            newNickname: userInfo.nickname || '',
            newRealName: userInfo.real_name || '',
            showBootstrapGuide: !!(this.data.bootstrapMode && isDefaultUserProfile(userInfo))
        });
    },

    // 选择头像
    onSelectAvatar() {
        this.setData({ showAvatarPickSheet: true });
    },

    onCancelAvatarPick() {
        this.setData({ showAvatarPickSheet: false });
    },

    // 选择头像回调
    async onChooseAvatar(e) {
        this.setData({ showAvatarPickSheet: false });
        const { avatarUrl } = e.detail;
        if (!avatarUrl) return;

        try {
            await ensurePrivacyAuthorization();
        } catch (err) {
            return;
        }

        try {
            wx.showLoading({ title: '上传中...' });
            const res = await uploadFile('/user/upload', avatarUrl, 'file');
            if (res.code === 0 && res.data.url) {
                const fullUrl = res.data.url;
                const updateRes = await put('/user/profile', { avatar: fullUrl });
                if (updateRes.code === 0) {
                    this.setData({ 'userInfo.avatar': fullUrl });
                    app.globalData.userInfo.avatar = fullUrl;
                    app.globalData.userInfo.avatar_url = fullUrl;
                    app.globalData.userInfo.avatarUrl = fullUrl;
                    wx.setStorageSync('userInfo', app.globalData.userInfo);
                    this.setData({ showBootstrapGuide: !!(this.data.bootstrapMode && isDefaultUserProfile(app.globalData.userInfo || {})) });
                    wx.showToast({ title: '头像更新成功', icon: 'success' });
                }
            }
        } catch (err) {
            console.error('更新头像失败:', err);
            wx.showToast({ title: '更新头像失败', icon: 'none' });
        } finally {
            wx.hideLoading();
        }
    },

    // 修改昵称
    onEditNickname() {
        this.setData({
            showNicknameModal: true,
            newNickname: this.data.userInfo?.nickname || ''
        });
    },

    onNicknameInput(e) {
        this.setData({ newNickname: e.detail.value });
    },

    onCancelNickname() {
        this.setData({ showNicknameModal: false });
    },

    onEditRealName() {
        this.setData({
            showRealNameModal: true,
            newRealName: this.data.userInfo?.real_name || ''
        });
    },

    onRealNameInput(e) {
        this.setData({ newRealName: e.detail.value });
    },

    onCancelRealName() {
        this.setData({ showRealNameModal: false });
    },

    stopP() { },

    async onConfirmNickname() {
        if (this._submitting) return;
        const nickname = this.data.newNickname.trim();
        if (!nickname) {
            wx.showToast({ title: '昵称不能为空', icon: 'none' });
            return;
        }

        try {
            await ensurePrivacyAuthorization();
        } catch (err) {
            return;
        }

        this._submitting = true;
        wx.showLoading({ title: '保存中...' });
        try {
            const res = await put('/user/profile', { nickname });
            if (res.code === 0) {
                this.setData({
                    showNicknameModal: false,
                    'userInfo.nickname': nickname
                });
                app.globalData.userInfo.nick_name = nickname;
                app.globalData.userInfo.nickname = nickname;
                app.globalData.userInfo.nickName = nickname;
                wx.setStorageSync('userInfo', app.globalData.userInfo);
                this.setData({ showBootstrapGuide: !!(this.data.bootstrapMode && isDefaultUserProfile(app.globalData.userInfo || {})) });
                wx.showToast({ title: '修改成功', icon: 'success' });
            } else {
                wx.showToast({ title: res.message || '修改失败', icon: 'none' });
            }
        } catch (err) {
            wx.showToast({ title: '修改失败', icon: 'none' });
        } finally {
            this._submitting = false;
            wx.hideLoading();
        }
    },

    async onConfirmRealName() {
        if (this._realNameSubmitting) return;
        const realName = String(this.data.newRealName || '').trim();
        if (!realName) {
            wx.showToast({ title: '真实姓名不能为空', icon: 'none' });
            return;
        }
        if (realName.length < 2 || realName.length > 32) {
            wx.showToast({ title: '真实姓名长度需在2-32个字符之间', icon: 'none' });
            return;
        }

        try {
            await ensurePrivacyAuthorization();
        } catch (err) {
            return;
        }

        this._realNameSubmitting = true;
        wx.showLoading({ title: '保存中...' });
        try {
            const res = await put('/user/profile', { real_name: realName });
            if (res.code === 0) {
                const nextUser = { ...(app.globalData.userInfo || {}), ...(res.data || {}), real_name: realName };
                app.globalData.userInfo = nextUser;
                wx.setStorageSync('userInfo', nextUser);
                this.setData({
                    showRealNameModal: false,
                    userInfo: nextUser,
                    newRealName: realName
                });
                wx.showToast({ title: '真实姓名已保存', icon: 'success' });
            } else {
                wx.showToast({ title: res.message || '保存失败', icon: 'none' });
            }
        } catch (err) {
            wx.showToast({ title: err?.message || '保存失败', icon: 'none' });
        } finally {
            this._realNameSubmitting = false;
            wx.hideLoading();
        }
    },

    onBack() {
        wx.navigateBack();
    }
});
