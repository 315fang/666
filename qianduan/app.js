// app.js - 小程序入口文件
const { login } = require('./utils/auth');
const { getApiBaseUrl } = require('./config/env');

App({
    globalData: {
        userInfo: null,
        openid: null,
        token: null,
        isLoggedIn: false,
        baseUrl: getApiBaseUrl() // 从环境配置读取
    },

    onLaunch(options) {
        // 检查分享绑定
        this.checkShareBind(options);

        // 小程序启动时自动登录
        this.autoLogin();
    },

    // 检查是否通过分享进入（新版：邀请问卷）
    // 只存标记，由实际落地页（index.js）负责跳转，避免双重导航
    checkShareBind(options) {
        if (options && options.query && options.query.inviter_id) {
            const inviterId = options.query.inviter_id;
            console.log('通过邀请问卷进入, inviter_id:', inviterId);
            this.globalData.pendingInviterId = inviterId;
        } else if (options && options.query && options.query.scene) {
            const scene = decodeURIComponent(options.query.scene);
            console.log('扫码进入, scene:', scene);
            this.globalData.pendingInviterId = scene;
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
