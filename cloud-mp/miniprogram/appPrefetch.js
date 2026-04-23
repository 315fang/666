/**
 * appPrefetch.js — 云开发版
 *
 * 原版通过 GET /page-content/home 与 GET /splash/active 预拉取，
 * 云开发版改为调用 config 云函数。
 */
const { callFn } = require('./utils/cloud');
const { get } = require('./utils/request');
const { cachedGet } = require('./utils/requestCache');
const HOME_PAGE_CACHE_KEY = 'home_config_cache_v2';
const HOME_PAGE_ASSET_TTL = 4 * 60 * 60 * 1000;
const CATEGORY_BOOTSTRAP_TTL = 5 * 60 * 1000;
const ACTIVITY_BOOTSTRAP_TTL = 60 * 1000;
const LIMITED_SALE_OVERVIEW_TTL = 30 * 1000;

module.exports = {
    prefetchHomeData(options = {}) {
        const { forceRefresh = false } = options;
        const expireAt = Number(this.globalData.homePageDataExpireAt || 0);
        if (!forceRefresh && this.globalData.homePageData && expireAt > Date.now()) {
            return Promise.resolve(this.globalData.homePageData);
        }
        if (!forceRefresh && this.globalData.homeDataPromise) {
            return this.globalData.homeDataPromise;
        }
        if (forceRefresh) {
            this.globalData.homePageData = null;
            this.globalData.homePageDataExpireAt = 0;
        }
        try { wx.removeStorageSync(HOME_PAGE_CACHE_KEY); } catch (_) {}

        // ★ 改为调用云函数
        const promise = callFn('config', { action: 'homeContent' }, { showError: false })
            .then(res => {
                const pageData = res && (res.data || res);
                if (!pageData) throw new Error('empty home content');

                this._cacheHomePayload(pageData);
                console.log('[Prefetch] 首页页面编排预拉取完成');
                return pageData;
            })
            .catch(err => {
                console.warn('[Prefetch] 首页配置预拉取失败（不影响首页兜底渲染）', err);
                return null;
            })
            .finally(() => {
                this.globalData.homeDataPromise = null;
            });

        this.globalData.homeDataPromise = promise;
        return promise;
    },

    prefetchSplashConfig() {
        if (this.globalData.splashConfigPromise) {
            return this.globalData.splashConfigPromise;
        }

        const cacheKey = 'splash_config_cache';
        const cacheTtl = 5 * 60 * 1000;
        const now = Date.now();

        try {
            const cached = wx.getStorageSync(cacheKey);
            if (cached && cached.expireAt > now) {
                this.globalData.splashConfig = cached.config;
                this.globalData.splashConfigPromise = Promise.resolve(cached.config);
                return this.globalData.splashConfigPromise;
            }
        } catch (e) {}

        // ★ 改为调用云函数
        this.globalData.splashConfigPromise = callFn('config', { action: 'splash' }, { showError: false })
            .then(res => {
                if (res && res.data) {
                    this.globalData.splashConfig = res.data;
                    wx.setStorageSync(cacheKey, { config: res.data, expireAt: now + cacheTtl });
                }
                return this.globalData.splashConfig;
            })
            .catch(err => {
                console.warn('[Splash] 配置拉取失败（不影响启动）', err);
                return null;
            })
            .finally(() => {
                this.globalData.splashConfigPromise = null;
            });

        return this.globalData.splashConfigPromise;
    },

    prefetchCategoryBootstrap() {
        if (this.globalData.categoryBootstrapPromise) {
            return this.globalData.categoryBootstrapPromise;
        }

        const promise = Promise.allSettled([
            cachedGet(get, '/categories', {}, {
                cacheTTL: CATEGORY_BOOTSTRAP_TTL,
                showError: false,
                maxRetries: 0
            }),
            cachedGet(get, '/banners', { position: 'category' }, {
                cacheTTL: CATEGORY_BOOTSTRAP_TTL,
                showError: false,
                maxRetries: 0
            })
        ])
            .catch((err) => {
                console.warn('[Prefetch] 分类页基础数据预拉取失败（不影响分类页兜底加载）', err);
                return null;
            })
            .finally(() => {
                this.globalData.categoryBootstrapPromise = null;
            });

        this.globalData.categoryBootstrapPromise = promise;
        return promise;
    },

    prefetchActivityBootstrap() {
        if (this.globalData.activityBootstrapPromise) {
            return this.globalData.activityBootstrapPromise;
        }

        const promise = Promise.allSettled([
            cachedGet(get, '/page-content', { page_key: 'activity' }, {
                cacheTTL: ACTIVITY_BOOTSTRAP_TTL,
                showError: false,
                maxRetries: 0
            }),
            cachedGet(get, '/limited-sales/overview', {}, {
                cacheTTL: LIMITED_SALE_OVERVIEW_TTL,
                showError: false,
                maxRetries: 0
            })
        ])
            .catch((err) => {
                console.warn('[Prefetch] 活动页基础数据预拉取失败（不影响活动页兜底加载）', err);
                return null;
            })
            .finally(() => {
                this.globalData.activityBootstrapPromise = null;
            });

        this.globalData.activityBootstrapPromise = promise;
        return promise;
    },

    _cacheHomePayload(payload) {
        this.globalData.homePageData = payload;
        this.globalData.homePageDataExpireAt = Date.now() + HOME_PAGE_ASSET_TTL;
        this.globalData.homePageDataVersion = '';
        const configs = payload?.configs || payload?.resources?.configs || {};
        if (configs) {
            this.globalData.brandName = configs.brand_name || this.globalData.brandName;
            this.globalData.shareTitle = configs.share_title || this.globalData.shareTitle;
            this.globalData.customerServiceWechat = configs.customer_service_wechat || this.globalData.customerServiceWechat;
        }
        try { wx.removeStorageSync(HOME_PAGE_CACHE_KEY); } catch (_) {}
    }
};
