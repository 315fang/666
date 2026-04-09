const app = getApp();
const { put, uploadFile } = require('../../utils/request');
const { ensurePrivacyAuthorization, openPrivacyContract } = require('../../utils/privacy');

function onTapEditProfile(page) {
    wx.showActionSheet({
        itemList: ['修改头像', '修改昵称'],
        success: (res) => {
            if (res.tapIndex === 0) {
                page.setData({ showAvatarPickSheet: true });
            } else if (res.tapIndex === 1) {
                onEditNickname(page);
            }
        }
    });
}

function onCancelAvatarPick(page) {
    page.setData({ showAvatarPickSheet: false });
}

async function onChooseAvatar(page, event) {
    page.setData({ showAvatarPickSheet: false });
    const { avatarUrl } = event.detail;
    if (!avatarUrl) return;

    try {
        await ensurePrivacyAuthorization();
    } catch (_) {
        return;
    }

    try {
        const uploadResponse = await uploadFile('/user/upload', avatarUrl, 'file');
        if (uploadResponse.code === 0 && uploadResponse.data.url) {
            const fullUrl = uploadResponse.data.url;
            const updateResponse = await put('/user/profile', { avatar_url: fullUrl });
            if (updateResponse.code === 0) {
                page.setData({ 'userInfo.avatar_url': fullUrl });
                wx.showToast({ title: '头像更新成功', icon: 'success' });
            }
        }
    } catch (error) {
        console.error('更新头像失败:', error);
        wx.showToast({ title: '更新头像失败', icon: 'none' });
    }
}

async function confirmLoginAuthorization() {
    return new Promise((resolve) => {
        wx.showModal({
            title: '登录授权提醒',
            content: '登录前请先阅读并同意《隐私协议》与《用户服务协议》。\n\n点击“同意登录”后，系统将继续执行微信授权登录。',
            cancelText: '查看条款',
            confirmText: '同意登录',
            success: (res) => {
                if (res.confirm) {
                    resolve(true);
                    return;
                }
                openPrivacyContract({
                    fallbackUrl: '/pages/privacy/privacy',
                    showFailToast: true
                }).catch(() => {});
                resolve(false);
            },
            fail: () => resolve(false)
        });
    });
}

async function onLogin(page) {
    if (page._loggingIn) return;
    const authorized = await confirmLoginAuthorization();
    if (!authorized) return;
    page._loggingIn = true;
    wx.showLoading({ title: '登录中...' });
    try {
        const result = await app.triggerLogin();
        wx.hideLoading();
        if (result && result.success === false) {
            if (result.reason !== 'privacy_denied') {
                wx.showToast({ title: '登录失败，请重试', icon: 'none' });
            }
            return;
        }
        page.loadUserInfo(true);
        wx.showToast({ title: '登录成功', icon: 'success' });
    } catch (_) {
        wx.hideLoading();
        wx.showToast({ title: '登录失败', icon: 'none' });
    } finally {
        page._loggingIn = false;
    }
}

function onEditNickname(page) {
    page.setData({
        showNicknameModal: true,
        newNickname: page.data.userInfo ? page.data.userInfo.nickname : ''
    });
}

function onNicknameInput(page, event) {
    page.setData({ newNickname: event.detail.value });
}

function onCancelNickname(page) {
    page.setData({ showNicknameModal: false });
}

async function onConfirmNickname(page) {
    if (page._submitting) return;
    const nickname = page.data.newNickname.trim();
    if (!nickname) {
        wx.showToast({ title: '昵称不能为空', icon: 'none' });
        return;
    }
    try {
        await ensurePrivacyAuthorization();
    } catch (_) {
        return;
    }
    page._submitting = true;
    try {
        const response = await put('/user/profile', { nickname });
        if (response.code === 0) {
            wx.showToast({ title: '修改成功', icon: 'success' });
            page.setData({ showNicknameModal: false });
            page.loadUserInfo(true);
        } else {
            wx.showToast({ title: response.message || '修改失败', icon: 'none' });
        }
    } catch (_) {
        wx.showToast({ title: '修改失败', icon: 'none' });
    } finally {
        page._submitting = false;
    }
}

module.exports = {
    confirmLoginAuthorization,
    onCancelAvatarPick,
    onCancelNickname,
    onChooseAvatar,
    onConfirmNickname,
    onEditNickname,
    onLogin,
    onNicknameInput,
    onTapEditProfile
};
