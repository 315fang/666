/**
 * appPrefetch.js — 云开发版
 *
 * 原版通过 GET /page-content/home 与 GET /splash/active 预拉取，
 * 云开发版改为调用 config 云函数。
 */
const { callFn } = require('./utils/cloud');

module.exports = {
    prefetchHomeData() {
        const cacheKey = 'home_config_cache';
        const cacheTtl = 5 * 60 * 1000;
        const now = Date.now();

        try {
            const stored = wx.getStorageSync(cacheKey);
            if (stored && stored.expireAt > now) {
                this.globalData.homePageData = stored.data;
                console.log('[Prefetch] 首页配置命中持久化缓存');
                return Promise.resolve(stored.data);
            }
        } catch (e) {}

        // ★ 改为调用云函数
        const promise = callFn('config', { action: 'homeContent' }, { showError: false })
            .then(res => {
                const pageData = res && res.data;
                if (!pageData) throw new Error('empty home content');

                const payload = pageData.resources
                    ? (pageData.resources.legacy_payload || pageData.resources)
                    : pageData;

                this._cacheHomePayload(payload, now + cacheTtl, cacheKey);
                console.log('[Prefetch] 首页页面编排预拉取完成并缓存');
                return payload;
            })
            .catch(err => {
                console.warn('[Prefetch] 首页配置预拉取失败（不影响首页兜底渲染）', err);
                return null;
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

    _cacheHomePayload(payload, expireAt, cacheKey) {
        this.globalData.homePageData = payload;
        if (payload && payload.configs) {
            this.globalData.brandName = payload.configs.brand_name || this.globalData.brandName;
            this.globalData.shareTitle = payload.configs.share_title || this.globalData.shareTitle;
            this.globalData.customerServiceWechat = payload.configs.customer_service_wechat || this.globalData.customerServiceWechat;
        }
        wx.setStorageSync(cacheKey, { data: payload, expireAt });
    }
};
