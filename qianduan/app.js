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

    // 检查是否通过分享进入（绑定上下级）
    checkShareBind(options) {
        if (options && options.query && options.query.scene) {
            // 扫码进入 scene=distributor_id
            const scene = decodeURIComponent(options.query.scene);
            console.log('扫码进入, scene:', scene);
            wx.setStorageSync('distributor_id', scene);
        } else if (options && options.query && options.query.share_id) {
            // 分享链接进入 share_id=distributor_id
            console.log('分享进入, share_id:', options.query.share_id);
            wx.setStorageSync('distributor_id', options.query.share_id);
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

            // 没有缓存，执行微信登录
            await this.wxLogin();
        } catch (err) {
            console.error('自动登录失败:', err);
        }
    },

    // 微信登录
    async wxLogin(distributorId = null) {
        try {
            // 获取缓存的推荐人ID
            if (!distributorId) {
                distributorId = wx.getStorageSync('distributor_id');
            }

            // 1. 获取微信登录 code
            const { code } = await this.promisify(wx.login)();
            console.log('获取到 code:', code);

            // 2. 发送给后端换取用户信息
            const result = await login({
                code,
                distributor_id: distributorId // 分销员邀请码
            });

            if (result.success) {
                // 3. 保存用户信息和 Token
                this.globalData.userInfo = result.userInfo;
                this.globalData.openid = result.openid;
                this.globalData.token = result.token;
                this.globalData.isLoggedIn = true;

                wx.setStorageSync('userInfo', result.userInfo);
                wx.setStorageSync('openid', result.openid);
                wx.setStorageSync('token', result.token);

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
