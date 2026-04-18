/**
 * app.js — 云开发版入口
 *
 * 主要变更：
 * 1. 在 onLaunch 最前面初始化 wx.cloud
 * 2. 登录改为调用云函数 login，不再用 wx.request + JWT
 * 3. globalData.token 废弃，鉴权由云函数自动通过 openid 完成
 */
const { cloneDefaults } = require('./utils/miniProgramConfig');
const authMethods = require('./appAuth');
const configMethods = require('./appConfig');
const prefetchMethods = require('./appPrefetch');

// ★ 云开发环境 ID — 部署前替换为真实值
// 在微信开发者工具 → 云开发控制台 → 设置 中查看
const CLOUD_ENV_ID = 'cloud1-9gywyqe49638e46f';

App({
    ...authMethods,
    ...configMethods,
    ...prefetchMethods,

    globalData: {
        userInfo: null,
        openid: null,
        // token 废弃 — 云开发通过 openid 自动鉴权，无需 JWT
        isLoggedIn: false,
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        homePageData: null,
        homePageDataExpireAt: 0,
        homeDataPromise: null,
        miniProgramConfig: cloneDefaults(),
        miniProgramConfigPromise: null,
        brandName: '问兰',
        shareTitle: '问兰 · 品牌甄选',
        customerServiceWechat: 'wl_service',
        customerServiceHours: '9:00-21:00',
        productDetailNfRelaunchKey: ''
    },

    onLaunch(options) {
        // ★ 第一步：初始化云开发（必须在所有云 API 调用之前）
        wx.cloud.init({
            env: CLOUD_ENV_ID,
            traceUser: true  // 在云开发控制台中显示用户访问来源
        });

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

        // 从缓存恢复登录状态（云开发版：无 token，仅 openid + userInfo）
        this.autoLogin();

        // 捕获会员码参数
        this._captureInviteFromLaunch(options);

        // 拉取小程序配置
        this.fetchMiniProgramConfig();

        // 并行预拉取首页数据
        this.globalData.homeDataPromise = this.prefetchHomeData();

        // 版本更新检测
        this.checkUpdate();

        // 开屏动画入口已删除，永远不会再次使用
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
