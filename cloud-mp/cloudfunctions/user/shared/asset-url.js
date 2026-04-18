'use strict';

/**
 * 与 cloudfunctions/shared/asset-url.js 保持一致（本云函数独立部署目录内须自带副本）
 */
const cloud = require('wx-server-sdk');

try {
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (_) {
    // ignore repeated init in shared module
}

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function isCloudFileId(value) {
    return /^cloud:\/\//i.test(pickString(value));
}

async function batchResolveCloudFileUrls(fileIds = []) {
    const uniqueIds = [...new Set((Array.isArray(fileIds) ? fileIds : []).map((item) => pickString(item)).filter(isCloudFileId))];
    const resolved = new Map();
    if (!uniqueIds.length || !cloud?.getTempFileURL) return resolved;

    for (let index = 0; index < uniqueIds.length; index += 50) {
        const chunk = uniqueIds.slice(index, index + 50);
        const result = await cloud.getTempFileURL({ fileList: chunk }).catch(() => ({ fileList: [] }));
        (result.fileList || []).forEach((item) => {
            if (!item || !item.fileID) return;
            resolved.set(item.fileID, pickString(item.tempFileURL || item.download_url || item.fileID));
        });
    }
    return resolved;
}

async function resolveSingleAssetUrl(value) {
    const raw = pickString(value);
    if (!isCloudFileId(raw)) return raw;
    const resolved = await batchResolveCloudFileUrls([raw]);
    return pickString(resolved.get(raw), raw);
}

async function resolveUserAvatarFields(user = {}) {
    const avatarRef = pickString(user.avatarUrl || user.avatar_url || user.avatar);
    if (!isCloudFileId(avatarRef)) return user;
    const resolvedAvatar = await resolveSingleAssetUrl(avatarRef);
    return {
        ...user,
        avatarUrl: resolvedAvatar,
        avatar_url: resolvedAvatar,
        avatar: resolvedAvatar
    };
}

module.exports = {
    batchResolveCloudFileUrls,
    resolveSingleAssetUrl,
    resolveUserAvatarFields,
    isCloudFileId,
    pickString
};
