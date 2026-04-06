function createUploadFile(buildRequestUrl) {
    return function uploadFile(url, filePath, name = 'file', formData = {}, options = {}) {
        const { showLoading = true, showError = true } = options;
        const token = wx.getStorageSync('token') || '';
        const openid = wx.getStorageSync('openid') || '';

        if (showLoading) wx.showLoading({ title: '上传中...', mask: true });

        return new Promise((resolve, reject) => {
            wx.uploadFile({
                url: buildRequestUrl(url),
                filePath,
                name,
                formData,
                header: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-openid': openid
                },
                success: (res) => {
                    if (showLoading) wx.hideLoading();
                    let data = res.data;
                    try {
                        data = JSON.parse(res.data);
                    } catch (e) { }

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        if (data && (data.code === 0 || data.success === true)) {
                            resolve(data);
                        } else {
                            if (showError) wx.showToast({ title: data.message || '上传失败', icon: 'none' });
                            reject(data);
                        }
                    } else {
                        if (showError) wx.showToast({ title: `上传错误 (${res.statusCode})`, icon: 'none' });
                        reject(data);
                    }
                },
                fail: (err) => {
                    if (showLoading) wx.hideLoading();
                    if (showError) wx.showToast({ title: '网络连接失败', icon: 'none' });
                    reject(err);
                }
            });
        });
    };
}

module.exports = {
    createUploadFile
};
