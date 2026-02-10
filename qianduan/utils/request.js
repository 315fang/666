/**
 * 网络请求封装
 * 统一处理请求头、错误处理、Loading 等
 */

const app = getApp();

// 请求配置
const config = {
    // 你的服务器后端地址
    baseUrl: 'https://api.jxalk.cn/api',
    timeout: 15000 // 超时改为15秒，避免慢网络误报
};

/**
 * 发起网络请求
 * @param {Object} options - 请求配置
 * @param {string} options.url - 接口路径（不含 baseUrl）
 * @param {string} options.method - 请求方法，默认 GET
 * @param {Object} options.data - 请求数据
 * @param {boolean} options.showLoading - 是否显示 loading，默认 false
 * @param {boolean} options.showError - 是否显示错误提示，默认 true
 */
function request(options) {
    return new Promise((resolve, reject) => {
        const { url, method = 'GET', data = {}, showLoading = false, showError = true } = options;

        // 显示加载提示
        if (showLoading) {
            wx.showLoading({ title: '加载中...', mask: true });
        }

        // 获取用户标识（用于身份验证）
        const token = wx.getStorageSync('token') || '';
        const openid = wx.getStorageSync('openid') || '';

        wx.request({
            url: config.baseUrl + url,
            method,
            data,
            header: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : '', // JWT Token 认证
                'x-openid': openid // 向下兼容（开发调试用）
            },
            timeout: config.timeout,
            success: (res) => {
                if (showLoading) wx.hideLoading();

                // HTTP 状态码检查
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    // 业务状态码检查（根据后端返回格式调整）
                    if (res.data.success !== false && res.data.code !== -1) {
                        resolve(res.data);
                    } else {
                        // 业务错误
                        if (showError) {
                            wx.showToast({
                                title: res.data.message || '请求失败',
                                icon: 'none',
                                duration: 2000
                            });
                        }
                        reject(res.data);
                    }
                } else if (res.statusCode === 401) {
                    // 未登录或登录过期，清除缓存并重新登录
                    wx.removeStorageSync('token');
                    wx.removeStorageSync('openid');
                    wx.removeStorageSync('userInfo');
                    wx.showToast({ title: '登录已过期，请重新进入', icon: 'none' });
                    // 尝试自动重新登录
                    const appInstance = getApp();
                    if (appInstance && appInstance.wxLogin) {
                        appInstance.wxLogin().catch(() => {});
                    }
                    reject({ code: 401, message: '登录已过期' });
                } else {
                    // 其他 HTTP 错误
                    if (showError) {
                        wx.showToast({
                            title: `请求错误 (${res.statusCode})`,
                            icon: 'none'
                        });
                    }
                    reject({ code: res.statusCode, message: '网络请求失败' });
                }
            },
            fail: (err) => {
                if (showLoading) wx.hideLoading();

                if (showError) {
                    wx.showToast({
                        title: '网络连接失败',
                        icon: 'none',
                        duration: 2000
                    });
                }
                reject({ code: -1, message: '网络连接失败', error: err });
            }
        });
    });
}

// 快捷方法
const get = (url, data, options = {}) => request({ url, method: 'GET', data, ...options });
const post = (url, data, options = {}) => request({ url, method: 'POST', data, ...options });
const put = (url, data, options = {}) => request({ url, method: 'PUT', data, ...options });
const del = (url, data, options = {}) => request({ url, method: 'DELETE', data, ...options });

module.exports = {
    request,
    get,
    post,
    put,
    del
};
