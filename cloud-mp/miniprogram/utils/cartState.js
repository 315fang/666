'use strict';

const CART_STATE_KEY = 'cart_state_version';

function getAppSafe() {
    try {
        return typeof getApp === 'function' ? getApp() : null;
    } catch (_) {
        return null;
    }
}

function readStorageVersion() {
    try {
        const stored = wx.getStorageSync(CART_STATE_KEY);
        if (stored && typeof stored === 'object') {
            return Number(stored.version || 0) || 0;
        }
        return Number(stored || 0) || 0;
    } catch (_) {
        return 0;
    }
}

function getCartStateVersion() {
    const app = getAppSafe();
    const runtimeVersion = Number(app && app.globalData && app.globalData.cartStateVersion || 0) || 0;
    return runtimeVersion || readStorageVersion();
}

function markCartChanged(source = 'cart') {
    const version = Date.now();
    const app = getAppSafe();
    if (app && app.globalData) {
        app.globalData.cartStateVersion = version;
        app.globalData.cartStateSource = source;
    }
    try {
        wx.setStorageSync(CART_STATE_KEY, {
            version,
            source,
            updated_at: version
        });
    } catch (_) {}
    return version;
}

function markCartStateSeen(page) {
    if (!page) return;
    page._cartStateVersion = getCartStateVersion();
}

function shouldRefreshCartState(page) {
    const version = getCartStateVersion();
    if (!page) return true;
    if (page._cartStateVersion !== version) {
        page._cartStateVersion = version;
        return true;
    }
    return false;
}

module.exports = {
    getCartStateVersion,
    markCartChanged,
    markCartStateSeen,
    shouldRefreshCartState
};
