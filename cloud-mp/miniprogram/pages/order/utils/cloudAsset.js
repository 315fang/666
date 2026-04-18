const { getTempUrls } = require('../../../utils/cloud');
const { parseImages, normalizeAssetUrl } = require('../../../utils/dataFormatter');

const tempUrlCache = new Map();

function isCloudFileId(value) {
    return /^cloud:\/\//i.test(String(value || '').trim());
}

async function warmCloudTempUrls(urls = []) {
    const cloudIds = [...new Set(
        (Array.isArray(urls) ? urls : [])
            .map((item) => normalizeAssetUrl(item))
            .filter((item) => isCloudFileId(item) && !tempUrlCache.has(item))
    )];
    if (!cloudIds.length) return;

    try {
        const tempUrls = await getTempUrls(cloudIds);
        const list = Array.isArray(tempUrls) ? tempUrls : [tempUrls];
        cloudIds.forEach((cloudId, index) => {
            const tempUrl = String(list[index] || '').trim();
            if (tempUrl) {
                tempUrlCache.set(cloudId, tempUrl);
            }
        });
    } catch (err) {
        console.warn('[cloudAsset] getTempUrls failed:', err);
    }
}

async function resolveCloudImageUrl(value, fallback = '') {
    const normalized = normalizeAssetUrl(value);
    if (!normalized) return fallback;
    if (!isCloudFileId(normalized)) return normalized;

    if (!tempUrlCache.has(normalized)) {
        await warmCloudTempUrls([normalized]);
    }

    return tempUrlCache.get(normalized) || fallback;
}

async function resolveCloudImageList(value, fallbackList = []) {
    const normalizedList = parseImages(value);
    if (!normalizedList.length) return fallbackList;

    await warmCloudTempUrls(normalizedList);

    const resolved = normalizedList
        .map((item) => {
            if (!isCloudFileId(item)) return item;
            return tempUrlCache.get(item) || '';
        })
        .filter(Boolean);

    return resolved.length ? resolved : fallbackList;
}

module.exports = {
    isCloudFileId,
    resolveCloudImageUrl,
    resolveCloudImageList
};
