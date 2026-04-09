/**
 * utils/auth.js — 云开发版
 *
 * 原版：post('/login', params) → HTTP 请求后端
 * 云开发版：wx.cloud.callFunction({ name: 'login' }) → 由 appAuth.wxLogin() 统一处理
 *
 * 此文件仅保留页面级帮助函数，不再处理 HTTP
 */

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

/**
 * 触发登录（供页面调用）
 * 等同于 getApp().triggerLogin()
 */
async function triggerLogin() {
    const app = getApp();
    return app ? app.triggerLogin() : { success: false, reason: 'no_app' };
}

module.exports = {
    requireLogin,
    triggerLogin
};
