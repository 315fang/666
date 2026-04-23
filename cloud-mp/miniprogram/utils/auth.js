/**
 * utils/auth.js — 云开发版
 *
 * 页面侧统一通过 openid + userInfo 判定登录态。
 * token 仅作历史兼容清理，不再作为任何登录依据。
 */

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function getAppInstance() {
    try {
        return getApp();
    } catch (_err) {
        return null;
    }
}

function readStorage(key) {
    try {
        return wx.getStorageSync(key);
    } catch (_err) {
        return '';
    }
}

function resolveOpenid() {
    const candidates = Array.prototype.slice.call(arguments);
    for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i];
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
        if (isPlainObject(candidate) && typeof candidate.openid === 'string' && candidate.openid.trim()) {
            return candidate.openid.trim();
        }
    }
    return '';
}

function normalizeLoginPrompt(input) {
    if (typeof input === 'string') {
        return { message: input };
    }

    if (isPlainObject(input)) {
        return {
            ...input,
            message: input.message || input.content || input.title || '请先登录'
        };
    }

    return { message: '请先登录' };
}

function syncLoginSnapshot(app, snapshot) {
    const globalData = app && app.globalData;
    if (globalData) {
        globalData.userInfo = snapshot.userInfo;
        globalData.openid = snapshot.openid || null;
        globalData.isLoggedIn = snapshot.isLoggedIn;
    }

    try {
        wx.removeStorageSync('token');
        if (snapshot.isLoggedIn) {
            wx.setStorageSync('userInfo', snapshot.userInfo);
            wx.setStorageSync('openid', snapshot.openid);
        }
    } catch (_err) {
        // ignore storage sync failures
    }
}

function getLoginState() {
    const app = getAppInstance();
    const globalData = app && app.globalData ? app.globalData : null;
    const cachedUserInfo = readStorage('userInfo');
    const cachedOpenid = readStorage('openid');
    const openid = resolveOpenid(
        globalData && globalData.openid,
        globalData && globalData.userInfo,
        cachedOpenid,
        cachedUserInfo
    );
    const rawUserInfo = isPlainObject(globalData && globalData.userInfo)
        ? globalData.userInfo
        : (isPlainObject(cachedUserInfo) ? cachedUserInfo : null);
    const userInfo = rawUserInfo && openid && rawUserInfo.openid !== openid
        ? { ...rawUserInfo, openid }
        : rawUserInfo;
    const isLoggedIn = !!(openid && userInfo);
    const snapshot = {
        app,
        userInfo: isLoggedIn ? userInfo : null,
        openid: isLoggedIn ? openid : '',
        isLoggedIn
    };

    syncLoginSnapshot(app, snapshot);
    return snapshot;
}

function hasLoginSession() {
    return getLoginState().isLoggedIn;
}

function requireLogin(callback, message) {
    if (hasLoginSession()) {
        if (typeof callback === 'function') callback();
        return true;
    }

    const prompt = normalizeLoginPrompt(message);
    wx.showToast({ title: prompt.message, icon: 'none' });
    return false;
}

/**
 * 触发登录（供页面调用）
 * 优先走 app.triggerLogin，让隐私授权与登录流程保持单一入口。
 */
async function triggerLogin(options) {
    const app = getAppInstance();
    if (!app) {
        return { success: false, reason: 'no_app' };
    }
    if (typeof app.triggerLogin === 'function') {
        return app.triggerLogin(options);
    }
    if (typeof app.wxLogin === 'function') {
        return app.wxLogin(options);
    }
    return { success: false, reason: 'no_login_method' };
}

async function ensureLogin(options) {
    const snapshot = getLoginState();
    if (snapshot.isLoggedIn) {
        return snapshot;
    }

    const result = await triggerLogin(options);
    const nextSnapshot = getLoginState();
    if (nextSnapshot.isLoggedIn) {
        return nextSnapshot;
    }

    const prompt = normalizeLoginPrompt(options);
    const error = new Error(
        (result && result.message)
        || prompt.message
        || '登录失败'
    );
    error.reason = (result && result.reason) || 'login_failed';
    error.result = result;
    throw error;
}

module.exports = {
    getLoginState,
    hasLoginSession,
    requireLogin,
    triggerLogin,
    ensureLogin
};
