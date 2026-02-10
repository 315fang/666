/**
 * 网络请求封装（改进版）
 * 统一处理请求头、错误处理、Loading、重试等
 */

const { getApiBaseUrl, isLogEnabled } = require('../config/env');

// 请求配置
const config = {
    baseUrl: getApiBaseUrl(), // 从环境配置读取
    timeout: 15000,
    maxRetries: 1, // 最大重试次数
    retryDelay: 1000 // 重试延迟（毫秒）
};

// 正在进行的请求（用于防止重复请求）
const pendingRequests = new Map();

// 请求拦截器队列
const requestInterceptors = [];
const responseInterceptors = [];

/**
 * 添加请求拦截器
 * @param {Function} fulfilled - 成功拦截器
 * @param {Function} rejected - 失败拦截器
 */
function addRequestInterceptor(fulfilled, rejected) {
    requestInterceptors.push({ fulfilled, rejected });
}

/**
 * 添加响应拦截器
 * @param {Function} fulfilled - 成功拦截器
 * @param {Function} rejected - 失败拦截器
 */
function addResponseInterceptor(fulfilled, rejected) {
    responseInterceptors.push({ fulfilled, rejected });
}

/**
 * 生成请求唯一标识
 */
function generateRequestKey(url, method, data) {
    return `${method}:${url}:${JSON.stringify(data)}`;
}

/**
 * 发起网络请求（改进版）
 * @param {Object} options - 请求配置
 * @param {string} options.url - 接口路径（不含 baseUrl）
 * @param {string} options.method - 请求方法，默认 GET
 * @param {Object} options.data - 请求数据
 * @param {boolean} options.showLoading - 是否显示 loading，默认 false
 * @param {boolean} options.showError - 是否显示错误提示，默认 true
 * @param {boolean} options.preventDuplicate - 是否防止重复请求，默认 false
 * @param {number} options.retryCount - 当前重试次数（内部使用）
 */
function request(options) {
    return new Promise(async (resolve, reject) => {
        const {
            url,
            method = 'GET',
            data = {},
            showLoading = false,
            showError = true,
            preventDuplicate = false,
            retryCount = 0
        } = options;

        // 防止重复请求
        const requestKey = generateRequestKey(url, method, data);
        if (preventDuplicate && pendingRequests.has(requestKey)) {
            return pendingRequests.get(requestKey);
        }

        // 执行请求拦截器
        let requestConfig = { url, method, data, showLoading, showError };
        for (const interceptor of requestInterceptors) {
            if (interceptor.fulfilled) {
                try {
                    requestConfig = await interceptor.fulfilled(requestConfig);
                } catch (error) {
                    if (interceptor.rejected) {
                        interceptor.rejected(error);
                    }
                    return reject(error);
                }
            }
        }

        // 显示加载提示
        if (requestConfig.showLoading) {
            wx.showLoading({ title: '加载中...', mask: true });
        }

        // 获取用户标识
        const token = wx.getStorageSync('token') || '';
        const openid = wx.getStorageSync('openid') || '';

        const requestPromise = new Promise((resolveRequest, rejectRequest) => {
            wx.request({
                url: config.baseUrl + requestConfig.url,
                method: requestConfig.method,
                data: requestConfig.data,
                header: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-openid': openid
                },
                timeout: config.timeout,
                success: async (res) => {
                    if (requestConfig.showLoading) wx.hideLoading();

                    // 执行响应拦截器
                    let response = res;
                    for (const interceptor of responseInterceptors) {
                        if (interceptor.fulfilled) {
                            try {
                                response = await interceptor.fulfilled(response);
                            } catch (error) {
                                if (interceptor.rejected) {
                                    interceptor.rejected(error);
                                }
                                return rejectRequest(error);
                            }
                        }
                    }

                    // HTTP 状态码检查
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        // 业务状态码检查（统一为 code === 0 表示成功）
                        if (response.data && (response.data.code === 0 || response.data.success === true || (response.data.success !== false && response.data.code !== -1))) {
                            resolveRequest(response.data);
                        } else {
                            // 业务错误
                            if (requestConfig.showError) {
                                wx.showToast({
                                    title: response.data.message || '请求失败',
                                    icon: 'none',
                                    duration: 2500
                                });
                            }
                            rejectRequest(response.data);
                        }
                    } else if (response.statusCode === 401) {
                        // 登录过期处理
                        handleLoginExpired();
                        rejectRequest({ code: 401, message: '登录已过期' });
                    } else {
                        // 其他 HTTP 错误
                        const errorMessage = `请求错误 (${response.statusCode})`;
                        if (requestConfig.showError) {
                            wx.showToast({
                                title: errorMessage,
                                icon: 'none',
                                duration: 2500
                            });
                        }
                        rejectRequest({ code: response.statusCode, message: errorMessage });
                    }
                },
                fail: (err) => {
                    if (requestConfig.showLoading) wx.hideLoading();

                    // 网络错误，尝试重试
                    if (retryCount < config.maxRetries) {
                        console.log(`请求失败，${config.retryDelay}ms 后重试 (${retryCount + 1}/${config.maxRetries})`);
                        setTimeout(() => {
                            request({ ...options, retryCount: retryCount + 1 })
                                .then(resolveRequest)
                                .catch(rejectRequest);
                        }, config.retryDelay);
                    } else {
                        if (requestConfig.showError) {
                            wx.showToast({
                                title: '网络连接失败',
                                icon: 'none',
                                duration: 2500
                            });
                        }
                        rejectRequest({ code: -1, message: '网络连接失败', error: err });
                    }
                }
            });
        });

        // 如果启用了防重复，将 Promise 存入 Map
        if (preventDuplicate) {
            pendingRequests.set(requestKey, requestPromise);
            requestPromise.finally(() => {
                pendingRequests.delete(requestKey);
            });
        }

        requestPromise.then(resolve).catch(reject);
    });
}

// 登录刷新锁和队列
let isRefreshingToken = false;
let refreshSubscribers = [];

/**
 * Token 刷新成功后通知所有等待的请求
 */
function onTokenRefreshed() {
    refreshSubscribers.forEach(callback => callback());
    refreshSubscribers = [];
}

/**
 * 添加等待 Token 刷新的请求到队列
 */
function addRefreshSubscriber(callback) {
    refreshSubscribers.push(callback);
}

/**
 * 登录过期处理（带防重复刷新机制）
 */
function handleLoginExpired() {
    // 如果正在刷新 token，直接返回
    if (isRefreshingToken) {
        return new Promise((resolve) => {
            addRefreshSubscriber(() => {
                resolve();
            });
        });
    }

    isRefreshingToken = true;

    // 清除本地登录信息
    wx.removeStorageSync('token');
    wx.removeStorageSync('openid');
    wx.removeStorageSync('userInfo');

    // 显示提示
    wx.showToast({
        title: '登录已过期，正在重新登录...',
        icon: 'none',
        duration: 2500
    });

    // 尝试自动重新登录
    const appInstance = getApp();
    if (appInstance && appInstance.wxLogin) {
        return appInstance.wxLogin()
            .then(() => {
                isRefreshingToken = false;
                onTokenRefreshed();
            })
            .catch((error) => {
                isRefreshingToken = false;
                refreshSubscribers = [];
                console.error('自动登录失败:', error);
            });
    } else {
        isRefreshingToken = false;
        return Promise.reject(new Error('无法自动登录'));
    }
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
    del,
    addRequestInterceptor,
    addResponseInterceptor,
    config
};
