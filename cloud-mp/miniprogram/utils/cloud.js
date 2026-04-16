/**
 * utils/cloud.js — 云开发调用封装
 *
 * 替代旧版 request.js 的 wx.request 方案。
 * 所有业务请求改为调用对应云函数，云函数内部操作云数据库。
 *
 * 使用方式：
 *   const { callFn, uploadToCloud } = require('./cloud');
 *
 *   // 调用云函数
 *   const res = await callFn('products', { action: 'list', page: 1 });
 *
 *   // 上传文件到云存储
 *   const url = await uploadToCloud(tempFilePath, 'avatars/xxx.jpg');
 */

// 防重复调用 Map（key = fnName:action:JSON(data)）
const pendingCalls = new Map();
const TRANSIENT_DB_PATTERNS = [
    'DATABASE_REQUEST_FAILED',
    'collection.get:fail',
    'i/o timeout',
    'handshake failure',
    'Invoking task timed out after',
    'database request fail'
];
const TRANSIENT_DB_USER_MESSAGE = '服务暂时繁忙，请稍后重试';

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error) {
    if (!error) return '';
    if (typeof error === 'string') return error;
    if (typeof error.message === 'string' && error.message) return error.message;
    if (typeof error.errMsg === 'string' && error.errMsg) return error.errMsg;
    if (typeof error.errorMessage === 'string' && error.errorMessage) return error.errorMessage;
    return '';
}

function isTransientDbError(error) {
    const message = getErrorMessage(error);
    if (!message) return false;
    return TRANSIENT_DB_PATTERNS.some((pattern) => message.includes(pattern));
}

function normalizeBusinessError(result) {
    const rawMessage = result && typeof result.message === 'string' ? result.message : '操作失败';
    const transientDb = isTransientDbError(rawMessage)
        || (result && result.errorType === 'transient_db')
        || (result && result.data && result.data.errorType === 'transient_db');
    return {
        ...result,
        code: result && result.code !== undefined ? result.code : -1,
        success: false,
        errorType: transientDb ? 'transient_db' : (result && result.errorType) || 'business',
        rawMessage,
        message: transientDb ? TRANSIENT_DB_USER_MESSAGE : rawMessage
    };
}

function normalizeSystemError(error) {
    const rawMessage = getErrorMessage(error) || '云函数调用失败';
    const transientDb = isTransientDbError(error) || isTransientDbError(rawMessage);
    return {
        code: error && error.code !== undefined ? error.code : -1,
        success: false,
        errorType: transientDb ? 'transient_db' : 'system',
        rawMessage,
        message: transientDb ? TRANSIENT_DB_USER_MESSAGE : rawMessage,
        raw: error
    };
}

function unwrapSuccessResult(result) {
    if (result.data !== undefined && result.data !== null) {
        const data = result.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            return {
                code: result.code,
                success: result.success,
                message: result.message,
                timestamp: result.timestamp,
                data,
                ...data
            };
        }
        return result;
    }
    return result;
}

/**
 * 调用云函数
 * @param {string} name - 云函数名称
 * @param {object} data - 传入参数（必须包含 action 字段区分子功能）
 * @param {object} opts
 * @param {boolean} opts.showLoading  - 是否显示 loading，默认 false
 * @param {boolean} opts.showError    - 是否自动 Toast 错误，默认 true
 * @param {boolean} opts.preventDup   - 是否防重复调用，默认 false
 * @returns {Promise<any>} result.data 字段
 */
function callFn(name, data = {}, opts = {}) {
    const {
        showLoading = false,
        showError = true,
        preventDup = false,
        maxRetries = 0,
        retryDelay = 300,
        readOnly = false
    } = opts;

    const dupKey = `${name}:${data.action || ''}:${JSON.stringify(data)}`;
    if (preventDup && pendingCalls.has(dupKey)) {
        return pendingCalls.get(dupKey);
    }

    const promise = (async () => {
        if (showLoading) wx.showLoading({ title: '加载中...', mask: true });
        try {
            const totalAttempts = Math.max(0, Number(maxRetries) || 0) + 1;
            for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
                try {
                    const res = await wx.cloud.callFunction({ name, data });
                    const result = res.result;
                    if (!result) {
                        throw normalizeSystemError({ message: '云函数无返回值' });
                    }

                    if (result.success === true || result.code === 0) {
                        return unwrapSuccessResult(result);
                    }

                    throw normalizeBusinessError(result);
                } catch (error) {
                    const normalized = (error && error.success === false) || (error && error.errorType)
                        ? error
                        : normalizeSystemError(error);
                    const canRetry = readOnly && attempt < totalAttempts && normalized.errorType === 'transient_db';
                    if (canRetry) {
                        console.warn(`[Cloud] callFn(${name}) 第 ${attempt} 次失败，准备重试:`, normalized.rawMessage || normalized.message);
                        await delay(Math.max(0, Number(retryDelay) || 0));
                        continue;
                    }

                    console.error(`[Cloud] callFn(${name}) 失败:`, normalized.raw || normalized);
                    if (showError) {
                        wx.showToast({
                            title: normalized.errorType === 'transient_db' ? TRANSIENT_DB_USER_MESSAGE : normalized.message,
                            icon: 'none',
                            duration: 2500
                        });
                    }
                    throw normalized;
                }
            }

            throw normalizeSystemError({ message: '云函数调用失败' });
        } finally {
            if (showLoading) wx.hideLoading();
        }
    })()
        .finally(() => {
            if (preventDup) pendingCalls.delete(dupKey);
        });

    if (preventDup) pendingCalls.set(dupKey, promise);
    return promise;
}

/**
 * 上传文件到云存储
 * @param {string} tempFilePath  - wx.chooseImage 等返回的临时路径
 * @param {string} cloudPath     - 云存储路径，如 'avatars/openid_123.jpg'
 * @param {object} opts
 * @param {boolean} opts.showLoading - 是否显示 loading，默认 true
 * @returns {Promise<string>} 文件的永久 fileID（可直接用于 image src）
 */
function uploadToCloud(tempFilePath, cloudPath, opts = {}) {
    const { showLoading = true } = opts;
    if (showLoading) wx.showLoading({ title: '上传中...', mask: true });

    return wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath })
        .then(res => {
            if (showLoading) wx.hideLoading();
            if (!res.fileID) throw new Error('上传失败，未获取到 fileID');
            return res.fileID;
        })
        .catch(err => {
            if (showLoading) wx.hideLoading();
            console.error('[Cloud] 上传失败:', err);
            wx.showToast({ title: '文件上传失败', icon: 'none' });
            return Promise.reject(err);
        });
}

/**
 * 获取文件临时访问链接（适用于私有云存储文件）
 * @param {string|string[]} fileList - fileID 或 fileID 数组
 * @returns {Promise<string|string[]>} 临时链接（单个/数组）
 */
async function getTempUrls(fileList) {
    const isArray = Array.isArray(fileList);
    const list = isArray ? fileList : [fileList];
    const res = await wx.cloud.getTempFileURL({ fileList: list });
    const urls = res.fileList.map(f => f.tempFileURL);
    return isArray ? urls : urls[0];
}

/**
 * 删除云存储文件
 * @param {string[]} fileList - fileID 数组
 */
function deleteCloudFiles(fileList) {
    return wx.cloud.deleteFile({ fileList });
}

module.exports = {
    callFn,
    uploadToCloud,
    getTempUrls,
    deleteCloudFiles,
    isTransientDbError,
    TRANSIENT_DB_USER_MESSAGE
};
