/**
 * 用户认证相关 API
 */
const { post } = require('./request');

/**
 * 微信登录
 * @param {Object} params
 * @param {string} params.code - wx.login 获取的 code
 * @param {string} params.distributor_id - 分销员邀请码（可选）
 */
function login(params) {
    return post('/login', params);
}

/**
 * 获取用户信息
 */
function getUserInfo() {
    return require('./request').get('/user/profile');
}

/**
 * 更新用户信息
 * @param {Object} data - 用户信息 { nickName, avatarUrl }
 */
function updateUserInfo(data) {
    return require('./request').put('/user/profile', data);
}

/**
 * 登录态守卫 — 消除页面中重复的 "if (!isLoggedIn)" 模板代码
 *
 * 用法一：直接调用，未登录时自动 Toast 并返回 false
 *   if (!requireLogin()) return;
 *
 * 用法二：传入回调，仅在已登录时执行
 *   requireLogin(() => { wx.navigateTo({ url: '/pages/xxx' }) });
 *
 * @param {Function} [callback] - 已登录时执行的函数
 * @param {string}   [message]  - 未登录时的 Toast 文案，默认"请先登录"
 * @returns {boolean} 是否已登录
 */
function requireLogin(callback, message) {
    const app = getApp();
    if (app && app.globalData && app.globalData.isLoggedIn) {
        if (typeof callback === 'function') callback();
        return true;
    }
    wx.showToast({ title: message || '请先登录', icon: 'none' });
    return false;
}

module.exports = {
    login,
    getUserInfo,
    updateUserInfo,
    requireLogin
};
