// app.js - 小程序入口文件
const { login } = require('./utils/auth');
const { syncLocalFavoritesToCloud } = require('./utils/favoriteSync');
const { getApiBaseUrl } = require('./config/env');
const { get } = require('./utils/request');
const { getPrivacySetting } = require('./utils/privacy');
const { cloneDefaults, mergeDeep, normalizeTabBarConfig } = require('./utils/miniProgramConfig');

App({
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

    // 启动时仅恢复本地缓存登录态，不主动向微信发起登录
    // 真正的登录由用户在"我的"页面点击按钮触发（app.triggerLogin）
    _captureInviteFromLaunch(options) {
        try {
            const q = options && options.query;
            if (q && q.invite) {
                wx.setStorageSync('pending_invite_code', String(q.invite).trim());
            }
            // 与首页 onLoad 一致：扫码进小程序时 query.scene 常为 i%3D会员码 或会员码（无限码 scene=i=码）
            if (q && q.scene != null && q.scene !== '') {
                this._parseSceneToPendingInvite(q.scene);
            }
        } catch (e) {
            /* ignore */
        }
    },

    /** 解析小程序码 scene，写入 pending_invite_code，下次 wxLogin 带给后端绑上级 */
    _parseSceneToPendingInvite(raw) {
        try {
            let r = raw;
            if (typeof r === 'number') r = String(r);
            r = String(r);
            try {
                r = decodeURIComponent(r);
            } catch (e) {
                /* 保持原样 */
            }
            let code = '';
            const m = r.match(/^i=([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8})$/i);
            if (m) code = m[1];
            else if (/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/i.test(r)) code = r;
            if (code) wx.setStorageSync('pending_invite_code', code.toUpperCase());
        } catch (e) {
            /* ignore */
        }
    },

    async autoLogin() {
        try {
            const userInfo = wx.getStorageSync('userInfo');
            const openid = wx.getStorageSync('openid');
            const token = wx.getStorageSync('token');

            if (userInfo && openid && token) {
                this.globalData.userInfo = userInfo;
                this.globalData.openid = openid;
                this.globalData.token = token;
                this.globalData.isLoggedIn = true;
                console.log('[Auth] 从缓存恢复登录状态');
            } else {
                console.log('[Auth] 无登录缓存，等待用户主动触发登录');
            }
        } catch (err) {
            console.error('[Auth] 恢复缓存登录状态失败:', err);
        }
    },

    // 由"我的"页面登录按钮调用，含隐私授权前置
    async triggerLogin() {
        const { ensurePrivacyAuthorization } = require('./utils/privacy');
        try {
            await ensurePrivacyAuthorization();
        } catch (err) {
            return { success: false, reason: 'privacy_denied' };
        }
        try {
            return await this.wxLogin(false);
        } catch (err) {
            return { success: false, reason: 'login_failed', err };
        }
    },

    // 微信登录（默认走静默登录，头像昵称在个人中心单独维护）
    async wxLogin(withProfile = false) {
        try {
            // 1. 获取微信登录 code
            const { code } = await this.promisify(wx.login)();
            console.log('获取到 code:', code);

            // 2. 2024+ 头像昵称已拆分到 chooseAvatar / nickname 组件，这里不再调用 getUserProfile
            let profileData = {};
            if (withProfile) {
                console.log('跳过 getUserProfile，头像昵称请在个人中心手动补充');
            }

            // 3. 发送给后端换取用户信息
            const loginPayload = {
                code,
                ...profileData
            };
            try {
                const pending = wx.getStorageSync('pending_invite_code');
                if (pending) {
                    const memberCode = String(pending).trim().toUpperCase();
                    loginPayload.invite_code = memberCode;
                    loginPayload.member_no = memberCode;
                    loginPayload.member_code = memberCode;
                }
            } catch (e) { /* ignore */ }

            const result = await login(loginPayload);

            if (result.success) {
                try {
                    wx.removeStorageSync('pending_invite_code');
                } catch (e) { /* ignore */ }
                // 4. 保存用户信息和 Token
                this.globalData.userInfo = result.userInfo;
                this.globalData.openid = result.openid;
                this.globalData.token = result.token;
                this.globalData.isLoggedIn = true;

                wx.setStorageSync('userInfo', result.userInfo);
                wx.setStorageSync('openid', result.openid);
                wx.setStorageSync('token', result.token);

                // ★ 首次登录标记 — 用于触发 welcome 品牌动画
                if (result.is_new_user) {
                    this.globalData.isNewUser = true;
                    try {
                        const { formatPromptBody } = require('./utils/lightPrompt');
                        const merged = mergeDeep(cloneDefaults(), this.globalData.miniProgramConfig || {});
                        const rc = merged.light_prompt_modals && merged.light_prompt_modals.register_coupon;
                        if (rc && rc.enabled) {
                            const issued = Number(result.register_coupons_issued || 0);
                            if (issued > 0 || rc.show_without_coupon) {
                                const tpl = issued > 0 && rc.body_when_issued
                                    ? rc.body_when_issued
                                    : rc.body;
                                this.globalData.pendingRegisterCouponPrompt = {
                                    title: rc.title || '新人礼券',
                                    content: formatPromptBody(tpl, { count: issued })
                                };
                            }
                        }
                    } catch (e) {
                        console.warn('[light prompt] register coupon', e);
                    }
                }

                // ★ 等级提升标记 — 用于触发 levelUp 品牌动画
                if (result.level_up) {
                    this.globalData.levelUpInfo = {
                        levelName: result.level_name || ''
                    };
                }

                console.log('登录成功:', result.userInfo);
                syncLocalFavoritesToCloud();
                return result;
            } else {
                throw new Error(result.message || '登录失败');
            }
        } catch (err) {
            console.error('微信登录失败:', err);
            throw err;
        }
    },

    // 退出登录
    logout() {
        this.globalData.userInfo = null;
        this.globalData.openid = null;
        this.globalData.token = null;
        this.globalData.isLoggedIn = false;
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('openid');
        wx.removeStorageSync('token');
    },

    applyMiniProgramConfig(config = {}) {
        const merged = mergeDeep(cloneDefaults(), config);
        if (merged.brand_config?.tab_bar) {
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
        const CACHE_KEY = 'mini_program_config_cache';
        const CACHE_TTL = 15 * 60 * 1000;
        const now = Date.now();

        try {
            const cached = wx.getStorageSync(CACHE_KEY);
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
            if (res?.code === 0 && res.data) {
                this.applyMiniProgramConfig(res.data);
                wx.setStorageSync(CACHE_KEY, {
                    config: res.data,
                    expireAt: now + CACHE_TTL
                });
            }
        }).catch((err) => {
            console.warn('[MiniProgramConfig] 拉取失败，使用本地默认配置', err);
        });
    },

    applyTabBarConfig(tabBarConfig = {}) {
        if (!wx.setTabBarStyle || !wx.setTabBarItem) return;
        const tb = normalizeTabBarConfig(tabBarConfig);
        try {
            wx.setTabBarStyle({
                color: tb.color,
                selectedColor: tb.selectedColor,
                backgroundColor: tb.backgroundColor,
                borderStyle: tb.borderStyle
            });
            (tb.items || []).forEach((item) => {
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

    /**
     * ★ 拉取并应用激活主题（一键换肤阅环）
     * 缓存策略：评 Storage 30分钟，邏辑层可强制刷新
     */
    applyActiveTheme() {
        const THEME_CACHE_KEY = 'active_theme_cache';
        const CACHE_TTL = 30 * 60 * 1000;
        const now = Date.now();

        // 先读缓存
        try {
            const cached = wx.getStorageSync(THEME_CACHE_KEY);
            if (cached && cached.expireAt > now) {
                this.injectThemeCssVars(cached.theme);
                console.log('[Theme] 命中缓存，应用主题:', cached.theme.theme_name);
                return;
            }
        } catch (e) { /* 读缓存失败不阻断 */ }

        // 拉取激活主题
        get('/themes/active', {}, { showError: false, ignore401: true }).then(res => {
            if (res && res.data) {
                const theme = res.data;
                this.injectThemeCssVars(theme);
                wx.setStorageSync(THEME_CACHE_KEY, { theme, expireAt: now + CACHE_TTL });
                console.log('[Theme] 拉取并应用主题:', theme.theme_name);
            }
        }).catch(err => {
            console.warn('[Theme] 主题担取失败，保持默认样式', err);
        });
    },

    /**
     * ★ 注入主题 CSS 变量到 page 根节点
     * 小程序无法直接操作 DOM，用 wx.setPageStyle 注入 CSS 变量
     * 所有使用 var(--color-primary) 的组件全部自动生效
     */
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
            // 如果主题有自定义扩展变量（theme.css_vars 字段）
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
    },

    /**
     * ★ 首页数据预拉取 + 持久化双层缓存
     * 冷启动时立即发起请求，结果存 globalData + Storage
     * 首页 onLoad 优先读 globalData.homePageData，没有再读 Storage，都没有才发新请求
     * 缓存有效期：5 分钟（轮播/首页内容需要更快刷新）
     */
    prefetchHomeData() {
        const CACHE_KEY = 'home_config_cache';
        const CACHE_TTL = 5 * 60 * 1000; // 5 分钟
        const now = Date.now();

        // 先读持久化缓存（冷启动命中）
        try {
            const stored = wx.getStorageSync(CACHE_KEY);
            if (stored && stored.expireAt > now) {
                this.globalData.homePageData = stored.data;
                console.log('[Prefetch] 首页配置命中持久化缓存');
                return Promise.resolve(stored.data);
            }
        } catch (e) { /* 读缓存失败不阻断 */ }

        // 缓存未命中，发起预拉取：优先统一 page-content，失败再回退旧接口
        const promise = get('/page-content/home').then(res => {
            const pageData = res?.data;
            const payload = pageData?.resources?.legacy_payload || pageData?.resources || null;
            if (!payload) {
                throw new Error('empty page-content payload');
            }
            this.globalData.homePageData = payload;
            if (payload.configs) {
                this.globalData.brandName = payload.configs.brand_name || this.globalData.brandName;
                this.globalData.shareTitle = payload.configs.share_title || this.globalData.shareTitle;
                this.globalData.customerServiceWechat = payload.configs.customer_service_wechat || this.globalData.customerServiceWechat;
            }
            wx.setStorageSync(CACHE_KEY, {
                data: payload,
                expireAt: now + CACHE_TTL
            });
            console.log('[Prefetch] 首页页面编排预拉取完成并缓存');
            return payload;
        }).catch(() => {
            return get('/homepage-config').then(res => {
                if (res && res.data) {
                    this.globalData.homePageData = res.data;
                    if (res.data.configs) {
                        this.globalData.brandName = res.data.configs.brand_name || this.globalData.brandName;
                        this.globalData.shareTitle = res.data.configs.share_title || this.globalData.shareTitle;
                        this.globalData.customerServiceWechat = res.data.configs.customer_service_wechat || this.globalData.customerServiceWechat;
                    }
                    wx.setStorageSync(CACHE_KEY, {
                        data: res.data,
                        expireAt: now + CACHE_TTL
                    });
                    console.log('[Prefetch] 首页配置预拉取完成并缓存');
                    return res.data;
                }
                return null;
            }).catch(err => {
                console.warn('[Prefetch] 首页配置预拉取失败（不影响首页兜底渲染）', err);
                return null;
            });
        });

        this.globalData.homeDataPromise = promise;
        return promise;
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

    /**
     * ★ 预拉取开屏动画配置
     * 缓存策略：15 分钟（配置改动后下次启动生效即可）
     * splash 页 onLoad 直接读 globalData.splashConfig，不等网络
     */
    prefetchSplashConfig() {
        if (this.globalData.splashConfigPromise) {
            return this.globalData.splashConfigPromise;
        }

        const CACHE_KEY = 'splash_config_cache';
        const CACHE_TTL = 5 * 60 * 1000;
        const now = Date.now();

        // 先读缓存
        try {
            const cached = wx.getStorageSync(CACHE_KEY);
            if (cached && cached.expireAt > now) {
                this.globalData.splashConfig = cached.config;
                console.log('[Splash] 命中缓存:', cached.config.show_mode);
                this.globalData.splashConfigPromise = Promise.resolve(cached.config);
                return this.globalData.splashConfigPromise;
            }
        } catch (e) { /* 读缓存失败不阻断 */ }

        // 缓存未命中，拉取
        this.globalData.splashConfigPromise = get('/splash/active').then(res => {
            if (res && res.data) {
                this.globalData.splashConfig = res.data;
                wx.setStorageSync(CACHE_KEY, {
                    config: res.data,
                    expireAt: now + CACHE_TTL
                });
                console.log('[Splash] 配置拉取完成:', res.data.show_mode);
            }
            return this.globalData.splashConfig;
        }).catch(err => {
            console.warn('[Splash] 配置拉取失败（不影响启动）', err);
            return null;
        }).finally(() => {
            this.globalData.splashConfigPromise = null;
        });

        return this.globalData.splashConfigPromise;
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
