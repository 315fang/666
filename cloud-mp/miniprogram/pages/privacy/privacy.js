// pages/privacy/privacy.js
const { openPrivacyContract } = require('../../utils/privacy');
const app = getApp();

Page({
    data: {
        statusBarHeight: 20
    },

    onLoad() {
        this.setData({ statusBarHeight: app.globalData.statusBarHeight || 20 });
    },

    onBack() {
        const { safeBack } = require('../../utils/navigator');
        safeBack('/pages/user/user');
    },

    onOpenOfficialContract() {
        openPrivacyContract({ fallbackUrl: '', showFailToast: true }).catch(() => {});
    }
});
