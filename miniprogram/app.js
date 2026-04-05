// app.js - 小程序入口文件
const { login } = require('./utils/auth');
const { getApiBaseUrl } = require('./config/env');
const { get } = require('./utils/request');

App({
    globalData: {
        userInfo: null,
        openid: null,
        token: null,
        isLoggedIn: false,
        baseUrl: getApiBaseUrl(), // 从环境配置读取
        statusBarHeight: 20,
        splashConfig: null       // 开屏动画配置（onLaunch prefetch）
    },

    onLaunch(options) {
        // 获取系统信息
        const sysInfo = wx.getSystemInfoSync();
        this.globalData.statusBarHeight = sysInfo.statusBarHeight || 20;

        // 检查分享绑定
        this.checkShareBind(options);

        // 小程序启动时自动登录
        this.autoLogin();

        // ★ 并行预拉取首页数据（登录前就开始，首页 onLoad 直接读缓存）
        this.prefetchHomeData();

        // ★ 预拉取开屏动画配置（splash 页 onLoad 时直接读 globalData，零延迟）
        this.prefetchSplashConfig();

        // ★ 静默/强制版本更新检测
        this.checkUpdate();

        // ★ 拉取并应用激活主题（一键换肤）
        this.applyActiveTheme();
    },

    // 检查是否通过分享进入（新版：邀请问卷）
    // 只存标记，由实际落地页（index.js）负责跳转，避免双重导航
    checkShareBind(options) {
        if (options && options.query && options.query.inviter_id) {
            const inviterId = options.query.inviter_id;
            console.log('通过邀请问卷进入, inviter_id:', inviterId);
            this.globalData.pendingInviterId = inviterId;
        } else if (options && options.query && options.query.scene) {
            const rawScene = decodeURIComponent(options.query.scene || '');
            console.log('扫码进入, scene (raw):', rawScene);
            // ★ 安全校验：scene 只接受纯数字格式（用户ID），防止注入
            if (/^\d+$/.test(rawScene)) {
                this.globalData.pendingInviterId = rawScene;
            } else {
                console.warn('scene 参数格式非法，已忽略:', rawScene);
            }
        }
    },

    // 自动登录
    async autoLogin() {
        try {
            // 检查本地是否有登录信息
            const userInfo = wx.getStorageSync('userInfo');
            const openid = wx.getStorageSync('openid');
            const token = wx.getStorageSync('token');

            if (userInfo && openid && token) {
                this.globalData.userInfo = userInfo;
                this.globalData.openid = openid;
                this.globalData.token = token;
                this.globalData.isLoggedIn = true;
                console.log('从缓存恢复登录状态');
                return;
            }

            // 没有缓存，执行静默微信登录（不收集用户资料）
            // 用户首次登录时，会在个人中心页面看到"立即登录"按钮
            // 点击该按钮会调用 wxLogin(true) 来收集资料
            await this.wxLogin(false);
        } catch (err) {
            console.error('自动登录失败:', err);
        }
    },

    // 微信登录（支持静默登录和授权登录）
    async wxLogin(withProfile = false) {
        try {
            // 1. 获取微信登录 code
            const { code } = await this.promisify(wx.login)();
            console.log('获取到 code:', code);

            // 2. 如果需要用户资料，调用 getUserProfile
            let profileData = {};
            if (withProfile) {
                try {
                    const profile = await this.promisify(wx.getUserProfile)({
                        desc: '用于完善会员资料'
                    });
                    profileData = {
                        nickName: profile.userInfo.nickName,
                        avatarUrl: profile.userInfo.avatarUrl
                    };
                    console.log('获取用户资料成功:', profileData);
                } catch (err) {
                    console.log('用户取消授权或获取资料失败:', err);
                    // 不阻断登录流程
                }
            }

            // 3. 发送给后端换取用户信息
            const result = await login({
                code,
                ...profileData // 携带用户资料（如果有）
            });

            if (result.success) {
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
                }

                // ★ 等级提升标记 — 用于触发 levelUp 品牌动画
                if (result.level_up) {
                    this.globalData.levelUpInfo = {
                        levelName: result.level_name || ''
                    };
                }

                console.log('登录成功:', result.userInfo);
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
        get('/admin/api/themes/active').then(res => {
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
     * 缓存有效期：30 分钟（homePageConfig 变化慢）
     */
    prefetchHomeData() {
        const CACHE_KEY = 'home_config_cache';
        const CACHE_TTL = 30 * 60 * 1000; // 30 分钟
        const now = Date.now();

        // 先读持久化缓存（冷启动命中）
        try {
            const stored = wx.getStorageSync(CACHE_KEY);
            if (stored && stored.expireAt > now) {
                this.globalData.homePageData = stored.data;
                console.log('[Prefetch] 首页配置命中持久化缓存');
                return;
            }
        } catch (e) { /* 读缓存失败不阻断 */ }

        // 缓存未命中，发起预拉取
        get('/homepage-config').then(res => {
            if (res && res.data) {
                this.globalData.homePageData = res.data;
                wx.setStorageSync(CACHE_KEY, {
                    data: res.data,
                    expireAt: now + CACHE_TTL
                });
                console.log('[Prefetch] 首页配置预拉取完成并缓存');
            }
        }).catch(err => {
            console.warn('[Prefetch] 首页配置预拉取失败（不影响首页兜底渲染）', err);
        });
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
        const CACHE_KEY = 'splash_config_cache';
        const CACHE_TTL = 15 * 60 * 1000;
        const now = Date.now();

        // 先读缓存
        try {
            const cached = wx.getStorageSync(CACHE_KEY);
            if (cached && cached.expireAt > now) {
                this.globalData.splashConfig = cached.config;
                console.log('[Splash] 命中缓存:', cached.config.show_mode);
                return;
            }
        } catch (e) { /* 读缓存失败不阻断 */ }

        // 缓存未命中，拉取
        get('/api/splash/active').then(res => {
            if (res && res.data) {
                this.globalData.splashConfig = res.data;
                wx.setStorageSync(CACHE_KEY, {
                    config: res.data,
                    expireAt: now + CACHE_TTL
                });
                console.log('[Splash] 配置拉取完成:', res.data.show_mode);
            }
        }).catch(err => {
            console.warn('[Splash] 配置拉取失败（不影响启动）', err);
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
