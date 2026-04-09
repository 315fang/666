const { getApiBaseUrl, CLOUD_ENV_ID } = require('./config/env');
const { cloneDefaults } = require('./utils/miniProgramConfig');
const authMethods = require('./appAuth');
const configMethods = require('./appConfig');
const prefetchMethods = require('./appPrefetch');

App({
    ...authMethods,
    ...configMethods,
    ...prefetchMethods,
    globalData: {
        userInfo: null,
        openid: null,
        token: null,
        isLoggedIn: false,
        baseUrl: getApiBaseUrl(),
        cloudEnvId: CLOUD_ENV_ID,
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        splashConfig: null,
        splashConfigPromise: null,
        homePageData: null,
        homeDataPromise: null,
        miniProgramConfig: cloneDefaults(),
        brandName: '问兰',
        shareTitle: '问兰 · 品牌甄选',
        customerServiceWechat: 'wl_service',
        customerServiceHours: '9:00-21:00',
        productDetailNfRelaunchKey: ''
    },

    onLaunch(options) {
        wx.cloud.init({
            env: CLOUD_ENV_ID,
            traceUser: true
        });

        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        this.globalData.statusBarHeight = windowInfo.statusBarHeight || 20;
        try {
            const menuButton = wx.getMenuButtonBoundingClientRect();
            const status = windowInfo.statusBarHeight || 20;
            if (menuButton && menuButton.bottom) {
                this.globalData.navTopPadding = menuButton.top || status;
                this.globalData.navBarHeight = menuButton.height || 44;
            } else {
                this.globalData.navTopPadding = status;
                this.globalData.navBarHeight = 44;
            }
        } catch (e) {
            this.globalData.navTopPadding = this.globalData.statusBarHeight;
            this.globalData.navBarHeight = 44;
        }

        this.autoLogin();
        this._captureInviteFromLaunch(options);
        this.fetchMiniProgramConfig();
        this.globalData.homeDataPromise = this.prefetchHomeData();
        this.prefetchSplashConfig();
        this.checkUpdate();

        setTimeout(() => {
            this.applyActiveTheme();
        }, 420);
    },

    checkUpdate() {
        if (!wx.canIUse('getUpdateManager')) return;
        const updateManager = wx.getUpdateManager();
        updateManager.onUpdateReady(() => {
            wx.showModal({
                title: '更新提示',
                content: '新版本已准备好，重启即可体验最新功能～',
                showCancel: false,
                confirmText: '立即重启',
                success() {
                    updateManager.applyUpdate();
                }
            });
        });
        updateManager.onUpdateFailed(() => {
            console.warn('[UpdateManager] 新版本下载失败');
        });
    },

    promisify(fn) {
        return (options = {}) => {
            return new Promise((resolve, reject) => {
                fn({
                    ...options,
                    success: resolve,
                    fail: reject
                });
            });
        };
    }
});
