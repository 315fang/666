const { ensurePrivacyAuthorization } = require('../../../utils/privacy');

function getSettingAsync() {
    return new Promise((resolve, reject) => {
        wx.getSetting({
            success: resolve,
            fail: reject
        });
    });
}

function openSettingAsync() {
    return new Promise((resolve, reject) => {
        wx.openSetting({
            success: resolve,
            fail: reject
        });
    });
}

function getLocationAsync(options = {}) {
    return new Promise((resolve, reject) => {
        wx.getLocation({
            type: options.type || 'gcj02',
            isHighAccuracy: options.isHighAccuracy !== false,
            success: resolve,
            fail: reject
        });
    });
}

function normalizeAuthState(settingValue) {
    if (settingValue === true) return 'authorized';
    if (settingValue === false) return 'denied';
    return 'unauthorized';
}

async function getLocationPermissionState() {
    try {
        const res = await getSettingAsync();
        return normalizeAuthState(res?.authSetting?.['scope.userLocation']);
    } catch (_) {
        return 'unauthorized';
    }
}

async function ensureUserLocationPermission() {
    try {
        await ensurePrivacyAuthorization({ showDeniedToast: true });
    } catch (_) {
        return false;
    }

    const state = await getLocationPermissionState();
    if (state === 'authorized') return true;

    if (state === 'denied') {
        try {
            const res = await openSettingAsync();
            return normalizeAuthState(res?.authSetting?.['scope.userLocation']) === 'authorized';
        } catch (_) {
            return false;
        }
    }

    try {
        await getLocationAsync();
        return true;
    } catch (_) {
        return false;
    }
}

async function getCurrentLocation(options = {}) {
    try {
        try {
            await ensurePrivacyAuthorization({ showDeniedToast: true });
        } catch (_) {
            return {
                ok: false,
                permissionState: 'unauthorized',
                code: 'privacy_denied'
            };
        }

        const permissionState = await getLocationPermissionState();
        if (permissionState !== 'authorized') {
            return {
                ok: false,
                permissionState,
                code: permissionState === 'denied' ? 'permission_denied' : 'permission_required'
            };
        }

        const res = await getLocationAsync(options);
        return {
            ok: true,
            permissionState: 'authorized',
            latitude: res.latitude,
            longitude: res.longitude,
            accuracy: res.accuracy,
            source: 'gps'
        };
    } catch (error) {
        return {
            ok: false,
            permissionState: 'authorized',
            code: 'location_failed',
            error
        };
    }
}

module.exports = {
    normalizeAuthState,
    getLocationPermissionState,
    ensureUserLocationPermission,
    getCurrentLocation
};
