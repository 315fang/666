const constants = require('../config/constants');

function getDefaultUserAvatarUrl() {
    const u = constants.USER?.DEFAULT_AVATAR_URL;
    const s = u != null ? String(u).trim() : '';
    return s || '/assets/images/default-avatar.svg';
}

function resolveUserAvatarUrl(avatarUrl) {
    if (avatarUrl != null && String(avatarUrl).trim() !== '') {
        return String(avatarUrl).trim();
    }
    return getDefaultUserAvatarUrl();
}

/** 与后台 SYSTEM.USER_DEFAULT_AVATAR_URL / env 一致（带 30s 缓存） */
async function resolveUserAvatarForApi(avatarRead) {
    const { getUserMaintenanceConfig } = require('./runtimeBusinessConfig');
    const { defaultAvatarUrl } = await getUserMaintenanceConfig();
    const fallback = (defaultAvatarUrl && String(defaultAvatarUrl).trim()) || getDefaultUserAvatarUrl();
    if (avatarRead != null && String(avatarRead).trim() !== '') {
        return String(avatarRead).trim();
    }
    return fallback;
}

module.exports = {
    getDefaultUserAvatarUrl,
    resolveUserAvatarUrl,
    resolveUserAvatarForApi
};
