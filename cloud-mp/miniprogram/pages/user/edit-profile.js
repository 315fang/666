// pages/user/edit-profile.js - 编辑个人资料
const app = getApp();
const { get, put, uploadFile } = require('../../utils/request');
const { ensurePrivacyAuthorization } = require('../../utils/privacy');
const { requireLogin } = require('../../utils/auth');

Page({
    data: {
        userInfo: null,
        showAvatarPickSheet: false,
        showNicknameModal: false,
        newNickname: ''
    },

    onLoad() {
        if (!requireLogin()) {
            setTimeout(() => wx.navigateBack(), 100);
            return;
        }
        this.loadUserInfo();
    },

    onShow() {
        this.loadUserInfo();
    },

    loadUserInfo() {
        const userInfo = app.globalData.userInfo || {};
        this.setData({
            userInfo,
            newNickname: userInfo.nickname || ''
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
                const updateRes = await put('/user/profile', { avatar_url: fullUrl });
                if (updateRes.code === 0) {
                    this.setData({ 'userInfo.avatar_url': fullUrl });
                    app.globalData.userInfo.avatar_url = fullUrl;
                    wx.setStorageSync('userInfo', app.globalData.userInfo);
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
                app.globalData.userInfo.nickname = nickname;
                wx.setStorageSync('userInfo', app.globalData.userInfo);
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

    onBack() {
        wx.navigateBack();
    }
});
