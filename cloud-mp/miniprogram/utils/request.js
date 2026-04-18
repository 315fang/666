/**
 * utils/request.js — 云开发兼容层（Cloud Function Router）
 *
 * 保持旧调用方式不变，只负责：
 * 1. 解析 REST 风格 URL
 * 2. 映射到云函数 + action
 * 3. 统一读写重试和上传逻辑
 */

const { callFn, uploadToCloud } = require('./cloud')
const { resolveRoute } = require('./requestRoutes')

const config = {
    baseUrl: '',
    timeout: 15000,
    maxRetries: 1,
    retryDelay: 300
}

function request(options = {}) {
    const {
        url = '',
        method = 'GET',
        data = {},
        showLoading = false,
        showError = true,
        maxRetries
    } = options

    const upperMethod = String(method).toUpperCase()
    const route = resolveRoute(url, upperMethod)

    if (!route) {
        const errMsg = `[request/cloud-shim] 未映射接口: ${upperMethod} ${url}`
        console.error(errMsg)
        if (showError) {
            wx.showToast({ title: '接口未适配云开发', icon: 'none', duration: 2500 })
        }
        return Promise.reject({ code: -1, message: errMsg, _unmapped: true })
    }

    const fnData = {}
    if (route.action) fnData.action = route.action
    if (route.pathId && route.idKey) fnData[route.idKey] = route.pathId
    if (route.queryParams) Object.assign(fnData, route.queryParams)
    Object.assign(fnData, data)

    const isReadOnly = upperMethod === 'GET'
    const resolvedMaxRetries = typeof maxRetries === 'number'
        ? Math.max(0, maxRetries)
        : (isReadOnly ? config.maxRetries : 0)

    return callFn(route.fn, fnData, {
        showLoading,
        showError,
        maxRetries: resolvedMaxRetries,
        retryDelay: config.retryDelay,
        readOnly: isReadOnly
    })
}

const get = (url, data, options = {}) => request({ url, method: 'GET', data, ...options })
const post = (url, data, options = {}) => request({ url, method: 'POST', data, ...options })
const put = (url, data, options = {}) => request({ url, method: 'PUT', data, ...options })
const del = (url, data, options = {}) => request({ url, method: 'DELETE', data, ...options })

function uploadFile(url, filePath, name = 'file', formData = {}, options = {}) {
    const ext = filePath.split('.').pop() || 'jpg'
    const ts = Date.now()
    const openid = wx.getStorageSync('openid') || 'unknown'
    let dir = 'uploads'
    if (url.includes('avatar')) dir = 'avatars'
    else if (url.includes('review') || url.includes('refund')) dir = 'reviews'
    const cloudPath = `${dir}/${openid}_${ts}.${ext}`
    return uploadToCloud(filePath, cloudPath, { showLoading: options.showLoading !== false })
        .then((fileID) => ({ code: 0, success: true, data: { url: fileID, fileID } }))
}

function addRequestInterceptor() {}
function addResponseInterceptor() {}

module.exports = {
    request,
    get,
    post,
    put,
    del,
    uploadFile,
    addRequestInterceptor,
    addResponseInterceptor,
    config
}
