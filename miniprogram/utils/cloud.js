/**
 * utils/cloud.js — 云开发调用封装
 */

const pendingCalls = new Map();

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

    if (showLoading) {
        wx.showLoading({ title: '加载中...', mask: true });
    }

    const promise = wx.cloud.callFunction({ name, data })
        .then((res) => {
            if (showLoading) wx.hideLoading();
            const result = res.result;
            if (!result) {
                throw { code: -1, message: '云函数无返回值' };
            }

            if (result.success === true || result.code === 0) {
                return result;
            }

            const errMsg = result.message || '操作失败';
            if (showError) {
                wx.showToast({ title: errMsg, icon: 'none', duration: 2500 });
            }
            return Promise.reject(result);
        })
        .catch((err) => {
            if (showLoading) wx.hideLoading();

            if (err && (err.success === false || err.code !== undefined)) {
                return Promise.reject(err);
            }

            const errMsg = (err && err.errMsg) || '云函数调用失败';
            console.error(`[Cloud] callFn(${name}) 失败:`, err);
            if (showError) {
                wx.showToast({ title: '网络错误，请稍后重试', icon: 'none', duration: 2500 });
            }
            return Promise.reject({ code: -1, message: errMsg, raw: err });
        })
        .finally(() => {
            if (preventDup) {
                pendingCalls.delete(dupKey);
            }
        });

    if (preventDup) {
        pendingCalls.set(dupKey, promise);
    }

    return promise;
}

function uploadToCloud(tempFilePath, cloudPath, opts = {}) {
    const { showLoading = true } = opts;
    if (showLoading) {
        wx.showLoading({ title: '上传中...', mask: true });
    }

    return wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath })
        .then((res) => {
            if (showLoading) wx.hideLoading();
            if (!res.fileID) {
                throw new Error('上传失败，未获取到 fileID');
            }
            return res.fileID;
        })
        .catch((err) => {
            if (showLoading) wx.hideLoading();
            console.error('[Cloud] 上传失败:', err);
            wx.showToast({ title: '文件上传失败', icon: 'none' });
            return Promise.reject(err);
        });
}

async function getTempUrls(fileList) {
    const isArray = Array.isArray(fileList);
    const list = isArray ? fileList : [fileList];
    const res = await wx.cloud.getTempFileURL({ fileList: list });
    const urls = res.fileList.map((item) => item.tempFileURL);
    return isArray ? urls : urls[0];
}

function deleteCloudFiles(fileList) {
    return wx.cloud.deleteFile({ fileList });
}

module.exports = {
    callFn,
    uploadToCloud,
    getTempUrls,
    deleteCloudFiles
};
