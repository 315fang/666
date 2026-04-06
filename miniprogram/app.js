const { getApiBaseUrl } = require('./config/env');
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
        baseUrl: getApiBaseUrl(), // 从环境配置读取
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        splashConfig: null,      // 开屏动画配置（onLaunch prefetch）
        splashConfigPromise: null,
        homePageData: null,
        homeDataPromise: null,
        miniProgramConfig: cloneDefaults(),
        brandName: '问兰',
        shareTitle: '问兰 · 品牌甄选',
        customerServiceWechat: 'wl_service',
        customerServiceHours: '9:00-21:00',
        /** 商品详情页：从视频号/橱窗等进入时 reLaunch 去壳，仅对当前商品 id 执行一次，防死循环 */
        productDetailNfRelaunchKey: ''
    },

    onLaunch(options) {
        // 获取系统信息
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

        // 小程序启动时自动登录
        this.autoLogin();

        // 分享 / 扫码进入时携带的会员码参数（登录时带给后端，新用户自动绑定团队）
        this._captureInviteFromLaunch(options);

        this.fetchMiniProgramConfig();

        // ★ 并行预拉取首页数据（登录前就开始，首页 onLoad 直接读缓存）
        this.globalData.homeDataPromise = this.prefetchHomeData();
        this.prefetchSplashConfig();

        // ★ 静默/强制版本更新检测
        this.checkUpdate();

        // 非关键启动任务后置，降低冷启动主线程压力
        setTimeout(() => {
            this.applyActiveTheme();
        }, 420);
    },

    /**
     * ★ 版本更新检测
     * 有新版本时：小版本静默等用户下次启动；逻辑层（需后端控制）可强制重启
     */
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

    // 工具方法：将回调风格 API 转为 Promise
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
