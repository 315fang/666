function copyAgentPortalLink(options) {
    const { mode = 'toast' } = options || {};
    const app = getApp();
    const baseUrl = (app && app.globalData && app.globalData.baseUrl) || '';
    const h5Base = baseUrl.replace('/api', '').replace('/miniapi', '');
    const portalUrl = `${h5Base}/agent/`;

    wx.setClipboardData({
        data: portalUrl,
        success: () => {
            if (mode === 'modal') {
                wx.showModal({
                    title: '已复制网页端链接',
                    content: '请在浏览器打开该链接进入代理网页端。',
                    showCancel: false,
                    confirmText: '知道了'
                });
            } else {
                wx.showToast({ title: '网页端链接已复制', icon: 'none' });
            }
        }
    });
}

module.exports = {
    copyAgentPortalLink
};
