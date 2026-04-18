const { getTempUrls } = require('../../../utils/cloud');
const { parseImages, normalizeAssetUrl } = require('../../../utils/dataFormatter');

const tempUrlCache = new Map();

function isCloudFileId(value) {
    return /^cloud:\/\//i.test(String(value || '').trim());
}

function toRenderableImageList(value) {
    return parseImages(value).filter((item) => !isCloudFileId(item));
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
    const safeFallback = toRenderableImageList(fallback)[0] || '';
    if (!normalized) return safeFallback;
    if (!isCloudFileId(normalized)) return normalized;

    if (!tempUrlCache.has(normalized)) {
        await warmCloudTempUrls([normalized]);
    }

    return tempUrlCache.get(normalized) || safeFallback;
}

async function resolveCloudImageList(value, fallbackList = []) {
    const normalizedList = parseImages(value);
    const safeFallbackList = toRenderableImageList(
        Array.isArray(fallbackList) && fallbackList.length ? fallbackList : normalizedList
    );
    if (!normalizedList.length) return safeFallbackList;

    await warmCloudTempUrls(normalizedList);

    const resolved = normalizedList
        .map((item) => {
            if (!isCloudFileId(item)) return item;
            return tempUrlCache.get(item) || '';
        })
        .filter(Boolean);

    return resolved.length ? resolved : safeFallbackList;
}

module.exports = {
    isCloudFileId,
    resolveCloudImageUrl,
    resolveCloudImageList
};
