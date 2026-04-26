'use strict';

function getUserInfoSnapshot() {
    try {
        const app = getApp();
        return app && app.globalData && app.globalData.userInfo
            ? app.globalData.userInfo
            : (wx.getStorageSync('userInfo') || null);
    } catch (_error) {
        return null;
    }
}

function syncPortalPasswordFlags(patch = {}) {
    try {
        const app = getApp();
        const current = getUserInfoSnapshot() || {};
        const next = { ...current, ...patch };
        if (app && app.globalData) {
            app.globalData.userInfo = next;
        }
        wx.setStorageSync('userInfo', next);
        return next;
    } catch (_error) {
        return patch;
    }
}

function ensurePortalPasswordReady() {
    const userInfo = getUserInfoSnapshot() || {};
    if (!userInfo || Number(userInfo.role_level || 0) < 1) {
        wx.showToast({ title: '当前账号暂不支持业务密码', icon: 'none' });
        return false;
    }
    if (!userInfo.portal_password_enabled) {
        wx.showModal({
            title: '请先设置业务密码',
            content: '该操作需要先在安全中心申领并修改业务密码。',
            confirmText: '去设置',
            success: (res) => {
                if (res.confirm) {
                    wx.navigateTo({ url: '/pages/user/portal-password' });
                }
            }
        });
        return false;
    }
    if (userInfo.portal_password_change_required) {
        wx.showModal({
            title: '请先修改初始密码',
            content: '初始密码仅用于首次激活，完成修改后才能执行资金类操作。',
            confirmText: '去修改',
            success: (res) => {
                if (res.confirm) {
                    wx.navigateTo({ url: '/pages/user/portal-password' });
                }
            }
        });
        return false;
    }
    if (userInfo.portal_password_locked_until) {
        wx.showToast({ title: '业务密码已锁定，请稍后重试', icon: 'none' });
        return false;
    }
    return true;
}

function findPortalPasswordDialog() {
    try {
        const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
        for (let index = pages.length - 1; index >= 0; index -= 1) {
            const page = pages[index];
            if (!page || typeof page.selectComponent !== 'function') continue;
            const dialog = page.selectComponent('#portalPasswordDialog');
            if (dialog && typeof dialog.open === 'function') return dialog;
        }
    } catch (_error) {
        // fall through to the platform modal fallback
    }
    return null;
}

function promptWithSystemModal(title, placeholderText) {
    return new Promise((resolve) => {
        wx.showModal({
            title,
            editable: true,
            placeholderText,
            success: (res) => {
                if (!res.confirm) {
                    resolve('');
                    return;
                }
                const password = String(res.content || '').trim();
                if (!password) {
                    wx.showToast({ title: '请输入业务密码', icon: 'none' });
                    resolve('');
                    return;
                }
                resolve(password);
            },
            fail: () => resolve('')
        });
    });
}

function promptPortalPassword(options = {}) {
    if (!ensurePortalPasswordReady()) {
        return Promise.resolve('');
    }
    const title = options.title || '输入业务密码';
    const placeholderText = options.placeholderText || '请输入6位数字业务密码';
    const dialog = findPortalPasswordDialog();
    if (dialog) {
        return dialog.open({
            title,
            placeholderText,
            confirmText: options.confirmText || '确认',
            cancelText: options.cancelText || '取消'
        });
    }
    return promptWithSystemModal(title, placeholderText);
}

module.exports = {
    getUserInfoSnapshot,
    syncPortalPasswordFlags,
    ensurePortalPasswordReady,
    findPortalPasswordDialog,
    promptPortalPassword
};
