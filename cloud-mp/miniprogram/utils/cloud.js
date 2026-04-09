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
        preventDup = false
    } = opts;

    const dupKey = `${name}:${data.action || ''}:${JSON.stringify(data)}`;
    if (preventDup && pendingCalls.has(dupKey)) {
        return pendingCalls.get(dupKey);
    }

    if (showLoading) wx.showLoading({ title: '加载中...', mask: true });

    const promise = wx.cloud.callFunction({ name, data })
        .then(res => {
            if (showLoading) wx.hideLoading();
            const result = res.result;
            if (!result) throw { code: -1, message: '云函数无返回值' };

            // 统一成功判断：{ success: true } 或 { code: 0 }
            if (result.success === true || result.code === 0) {
                return result;
            }

            // 业务错误
            const errMsg = result.message || '操作失败';
            if (showError) wx.showToast({ title: errMsg, icon: 'none', duration: 2500 });
            return Promise.reject(result);
        })
        .catch(err => {
            if (showLoading) wx.hideLoading();

            // 已在 .then 里处理过的业务错误直接透传
            if (err && (err.success === false || err.code !== undefined)) {
                return Promise.reject(err);
            }

            // 网络/云函数系统错误
            const errMsg = (err && err.errMsg) || '云函数调用失败';
            console.error(`[Cloud] callFn(${name}) 失败:`, err);
            if (showError) wx.showToast({ title: '网络错误，请稍后重试', icon: 'none', duration: 2500 });
            return Promise.reject({ code: -1, message: errMsg, raw: err });
        })
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
    deleteCloudFiles
};
