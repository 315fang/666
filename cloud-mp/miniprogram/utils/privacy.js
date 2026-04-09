const FALLBACK_PRIVACY_PAGE = '/pages/privacy/privacy';

let pendingPrivacyPromise = null;

function canUse(apiName) {
    return typeof wx !== 'undefined' && typeof wx[apiName] === 'function';
}

function getPrivacySetting() {
    return new Promise((resolve) => {
        if (!canUse('getPrivacySetting')) {
            resolve({
                supported: false,
                needAuthorization: false,
                privacyContractName: '小程序用户隐私保护指引'
            });
            return;
        }

        wx.getPrivacySetting({
            success(res) {
                resolve({
                    supported: true,
                    needAuthorization: !!res.needAuthorization,
                    privacyContractName: res.privacyContractName || '小程序用户隐私保护指引'
                });
            },
            fail(err) {
                console.warn('[Privacy] 获取隐私设置失败:', err);
                resolve({
                    supported: false,
                    needAuthorization: false,
                    privacyContractName: '小程序用户隐私保护指引',
                    error: err
                });
            }
        });
    });
}

function openPrivacyContract(options = {}) {
    const {
        fallbackUrl = FALLBACK_PRIVACY_PAGE,
        showFailToast = true
    } = options;

    return new Promise((resolve, reject) => {
        if (canUse('openPrivacyContract')) {
            wx.openPrivacyContract({
                success(res) {
                    resolve(res);
                },
                fail(err) {
                    console.warn('[Privacy] 打开微信隐私保护指引失败:', err);
                    if (fallbackUrl && canUse('navigateTo')) {
                        wx.navigateTo({
                            url: fallbackUrl,
                            success: resolve,
                            fail(navErr) {
                                if (showFailToast) {
                                    wx.showToast({ title: '暂时无法打开隐私指引', icon: 'none' });
                                }
                                reject(navErr);
                            }
                        });
                        return;
                    }
                    if (showFailToast) {
                        wx.showToast({ title: '暂时无法打开隐私指引', icon: 'none' });
                    }
                    reject(err);
                }
            });
            return;
        }

        if (fallbackUrl && canUse('navigateTo')) {
            wx.navigateTo({
                url: fallbackUrl,
                success: resolve,
                fail(err) {
                    if (showFailToast) {
                        wx.showToast({ title: '暂时无法打开隐私指引', icon: 'none' });
                    }
                    reject(err);
                }
            });
            return;
        }

        reject(new Error('当前环境不支持打开隐私指引'));
    });
}

function ensurePrivacyAuthorization(options = {}) {
    const { showDeniedToast = true } = options;

    if (pendingPrivacyPromise) {
        return pendingPrivacyPromise;
    }

    pendingPrivacyPromise = new Promise((resolve, reject) => {
        getPrivacySetting().then((setting) => {
            if (!setting.supported || !setting.needAuthorization || !canUse('requirePrivacyAuthorize')) {
                pendingPrivacyPromise = null;
                resolve(setting);
                return;
            }

            wx.requirePrivacyAuthorize({
                success() {
                    pendingPrivacyPromise = null;
                    resolve({
                        ...setting,
                        authorized: true
                    });
                },
                fail(err) {
                    pendingPrivacyPromise = null;
                    console.warn('[Privacy] 用户未同意隐私保护指引:', err);
                    if (showDeniedToast) {
                        wx.showToast({ title: '请先同意隐私保护指引', icon: 'none' });
                    }
                    reject(err);
                }
            });
        }).catch((err) => {
            pendingPrivacyPromise = null;
            console.warn('[Privacy] 隐私授权检查异常:', err);
            resolve({
                supported: false,
                needAuthorization: false,
                privacyContractName: '小程序用户隐私保护指引',
                error: err
            });
        });
    });

    return pendingPrivacyPromise;
}

module.exports = {
    getPrivacySetting,
    openPrivacyContract,
    ensurePrivacyAuthorization
};
