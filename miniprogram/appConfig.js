const { get } = require('./utils/request');
const { cloneDefaults, mergeDeep, normalizeTabBarConfig } = require('./utils/miniProgramConfig');

module.exports = {
    applyMiniProgramConfig(config = {}) {
        const merged = mergeDeep(cloneDefaults(), config);
        if (merged.brand_config && merged.brand_config.tab_bar) {
            merged.brand_config.tab_bar = normalizeTabBarConfig(merged.brand_config.tab_bar);
        }
        const brandConfig = merged.brand_config || {};
        this.globalData.miniProgramConfig = merged;
        this.globalData.brandName = brandConfig.brand_name || '问兰';
        this.globalData.shareTitle = brandConfig.share_title || `${this.globalData.brandName} · 品牌甄选`;
        this.globalData.customerServiceWechat = brandConfig.customer_service_wechat || 'wl_service';
        this.globalData.customerServiceHours = brandConfig.customer_service_hours || '9:00-21:00';
        this.applyTabBarConfig(brandConfig.tab_bar || {});
    },

    fetchMiniProgramConfig() {
        const cacheKey = 'mini_program_config_cache';
        const cacheTtl = 15 * 60 * 1000;
        const now = Date.now();

        try {
            const cached = wx.getStorageSync(cacheKey);
            if (cached && cached.expireAt > now && cached.config) {
                this.applyMiniProgramConfig(cached.config);
            }
        } catch (_) { }

        get('/mini-program-config', {}, {
            showError: false,
            maxRetries: 0,
            timeout: 8000,
            ignore401: true
        }).then((res) => {
            if (res && res.code === 0 && res.data) {
                this.applyMiniProgramConfig(res.data);
                wx.setStorageSync(cacheKey, {
                    config: res.data,
                    expireAt: now + cacheTtl
                });
            }
        }).catch((err) => {
            console.warn('[MiniProgramConfig] 拉取失败，使用本地默认配置', err);
        });
    },

    applyTabBarConfig(tabBarConfig = {}) {
        if (!wx.setTabBarStyle || !wx.setTabBarItem) return;
        const tabBar = normalizeTabBarConfig(tabBarConfig);
        try {
            wx.setTabBarStyle({
                color: tabBar.color,
                selectedColor: tabBar.selectedColor,
                backgroundColor: tabBar.backgroundColor,
                borderStyle: tabBar.borderStyle
            });
            (tabBar.items || []).forEach((item) => {
                if (item && typeof item.index === 'number' && item.text) {
                    wx.setTabBarItem({
                        index: item.index,
                        text: item.text
                    });
                }
            });
        } catch (e) {
            console.warn('[MiniProgramConfig] 动态应用 TabBar 配置失败:', e);
        }
    },

    applyActiveTheme() {
        const cacheKey = 'active_theme_cache';
        const cacheTtl = 30 * 60 * 1000;
        const now = Date.now();

        try {
            const cached = wx.getStorageSync(cacheKey);
            if (cached && cached.expireAt > now) {
                this.injectThemeCssVars(cached.theme);
                console.log('[Theme] 命中缓存，应用主题:', cached.theme.theme_name);
                return;
            }
        } catch (e) { /* 读缓存失败不阻断 */ }

        get('/themes/active', {}, { showError: false, ignore401: true }).then((res) => {
            if (res && res.data) {
                const theme = res.data;
                this.injectThemeCssVars(theme);
                wx.setStorageSync(cacheKey, { theme, expireAt: now + cacheTtl });
                console.log('[Theme] 拉取并应用主题:', theme.theme_name);
            }
        }).catch((err) => {
            console.warn('[Theme] 主题担取失败，保持默认样式', err);
        });
    },

    injectThemeCssVars(theme) {
        if (!theme) return;
        try {
            const styles = {};
            if (theme.primary_color) {
                styles['--luxury-gold'] = theme.primary_color;
                styles['--color-primary'] = theme.primary_color;
            }
            if (theme.secondary_color) {
                styles['--luxury-black'] = theme.secondary_color;
                styles['--color-text-primary'] = theme.secondary_color;
            }
            if (theme.css_vars && typeof theme.css_vars === 'object') {
                Object.assign(styles, theme.css_vars);
            }
            if (Object.keys(styles).length > 0) {
                const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
                if (!pages.length) return;
                wx.setPageStyle({ style: styles });
            }
        } catch (e) {
            console.warn('[Theme] 注入 CSS 变量失败:', e);
        }
    }
};
