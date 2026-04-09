/**
 * requestUpload.js — 云开发版（转为云存储上传）
 */
const { uploadToCloud } = require('./cloud');

function createUploadFile(buildRequestUrl) {
    return function uploadFile(url, filePath, name = 'file', formData = {}, options = {}) {
        const { showLoading = true } = options;
        const openid = wx.getStorageSync('openid') || 'unknown';
        const ext = filePath.split('.').pop() || 'jpg';
        const ts = Date.now();
        let dir = 'uploads';
        if (url.includes('avatar')) dir = 'avatars';
        else if (url.includes('review') || url.includes('refund')) dir = 'reviews';
        else if (url.includes('product')) dir = 'products';
        const cloudPath = `${dir}/${openid}_${ts}.${ext}`;
        return uploadToCloud(filePath, cloudPath, { showLoading })
            .then(fileID => ({ code: 0, success: true, data: { url: fileID, fileID } }));
    };
}

module.exports = { createUploadFile };
