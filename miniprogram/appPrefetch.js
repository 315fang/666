const { get } = require('./utils/request');

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
        } catch (e) { /* 读缓存失败不阻断 */ }

        const promise = get('/page-content/home').then((res) => {
            const pageData = res && res.data;
            const payload = pageData && pageData.resources
                ? (pageData.resources.legacy_payload || pageData.resources)
                : null;
            if (!payload) {
                throw new Error('empty page-content payload');
            }
            this._cacheHomePayload(payload, now + cacheTtl, cacheKey);
            console.log('[Prefetch] 首页页面编排预拉取完成并缓存');
            return payload;
        }).catch(() => {
            return get('/homepage-config').then((res) => {
                if (!res || !res.data) {
                    return null;
                }
                this._cacheHomePayload(res.data, now + cacheTtl, cacheKey);
                console.log('[Prefetch] 首页配置预拉取完成并缓存');
                return res.data;
            }).catch((err) => {
                console.warn('[Prefetch] 首页配置预拉取失败（不影响首页兜底渲染）', err);
                return null;
            });
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
                console.log('[Splash] 命中缓存:', cached.config.show_mode);
                this.globalData.splashConfigPromise = Promise.resolve(cached.config);
                return this.globalData.splashConfigPromise;
            }
        } catch (e) { /* 读缓存失败不阻断 */ }

        this.globalData.splashConfigPromise = get('/splash/active').then((res) => {
            if (res && res.data) {
                this.globalData.splashConfig = res.data;
                wx.setStorageSync(cacheKey, {
                    config: res.data,
                    expireAt: now + cacheTtl
                });
                console.log('[Splash] 配置拉取完成:', res.data.show_mode);
            }
            return this.globalData.splashConfig;
        }).catch((err) => {
            console.warn('[Splash] 配置拉取失败（不影响启动）', err);
            return null;
        }).finally(() => {
            this.globalData.splashConfigPromise = null;
        });

        return this.globalData.splashConfigPromise;
    },

    _cacheHomePayload(payload, expireAt, cacheKey) {
        this.globalData.homePageData = payload;
        if (payload.configs) {
            this.globalData.brandName = payload.configs.brand_name || this.globalData.brandName;
            this.globalData.shareTitle = payload.configs.share_title || this.globalData.shareTitle;
            this.globalData.customerServiceWechat = payload.configs.customer_service_wechat || this.globalData.customerServiceWechat;
        }
        wx.setStorageSync(cacheKey, {
            data: payload,
            expireAt
        });
    }
};
