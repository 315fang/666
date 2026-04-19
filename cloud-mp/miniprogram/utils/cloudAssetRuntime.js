const { getTempUrls } = require('./cloud');
const { normalizeAssetUrl, parseImages, isTemporarySignedAssetUrl } = require('./dataFormatter');

const tempUrlCache = new Map();

function isCloudFileId(value) {
    return /^cloud:\/\//i.test(String(value || '').trim());
}

function toAssetList(value) {
    if (Array.isArray(value)) {
        return value
            .map((item) => pickPreferredAssetRef(item))
            .filter(Boolean);
    }
    if (value && typeof value === 'object') {
        const picked = pickPreferredAssetRef(value);
        return picked ? [picked] : [];
    }
    return parseImages(value);
}

function toRenderableImageList(value) {
    return toAssetList(value).filter((item) => item && !isCloudFileId(item) && !isTemporarySignedAssetUrl(item));
}

function normalizeHttpCandidate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    return '';
}

function pickDirectAssetUrl(record = {}) {
    if (!record) return '';

    if (Array.isArray(record)) {
        for (let i = 0; i < record.length; i += 1) {
            const matched = pickDirectAssetUrl(record[i]);
            if (matched) return matched;
        }
        return '';
    }

    if (typeof record === 'string') {
        const httpCandidate = normalizeHttpCandidate(record);
        if (httpCandidate) return httpCandidate;
        const normalized = normalizeAssetUrl(record);
        return normalized && !isCloudFileId(normalized) ? normalized : '';
    }

    if (typeof record !== 'object') {
        return '';
    }

    const directCandidates = [
        record.image_url,
        record.imageUrl,
        record.url,
        record.temp_url,
        record.image,
        record.cover_image,
        record.coverImage,
        record.cover,
        record.cover_url,
        record.coverUrl,
        record.thumb,
        record.thumbnail
    ];

    for (let i = 0; i < directCandidates.length; i += 1) {
        const httpCandidate = normalizeHttpCandidate(directCandidates[i]);
        if (httpCandidate) return httpCandidate;
    }

    for (let i = 0; i < directCandidates.length; i += 1) {
        const normalized = normalizeAssetUrl(directCandidates[i]);
        if (normalized && !isCloudFileId(normalized)) return normalized;
    }

    return '';
}

function pickPreferredAssetRef(record = {}) {
    if (!record) return '';
    if (typeof record === 'string') return normalizeAssetUrl(record);
    if (typeof record !== 'object') return normalizeAssetUrl(record);

    const fileId = normalizeAssetUrl(record.file_id || record.fileId || '');
    if (fileId) return fileId;

    const candidates = [
        record.image_url,
        record.imageUrl,
        record.url,
        record.temp_url,
        record.image,
        record.cover_image,
        record.coverImage,
        record.cover,
        record.cover_url,
        record.coverUrl,
        record.thumb,
        record.thumbnail
    ];

    for (const candidate of candidates) {
        const normalized = normalizeAssetUrl(candidate);
        if (normalized) return normalized;
    }

    return '';
}

async function warmCloudTempUrls(urls = []) {
    const cloudIds = [...new Set(
        (Array.isArray(urls) ? urls : [])
            .map((item) => pickPreferredAssetRef(item))
            .filter((item) => isCloudFileId(item) && !tempUrlCache.has(item))
    )];
    if (!cloudIds.length) return;

    try {
        const tempUrls = await getTempUrls(cloudIds);
        const list = Array.isArray(tempUrls) ? tempUrls : [tempUrls];
        cloudIds.forEach((cloudId, index) => {
            const tempUrl = String(list[index] || '').trim();
            if (tempUrl) tempUrlCache.set(cloudId, tempUrl);
        });
    } catch (err) {
        console.warn('[cloudAssetRuntime] getTempUrls failed:', err);
    }
}

async function resolveCloudImageUrl(value, fallback = '') {
    const preferred = Array.isArray(value) ? (toAssetList(value)[0] || '') : pickPreferredAssetRef(value);
    const directUrl = pickDirectAssetUrl(value);
    const safeFallback = directUrl || toRenderableImageList(fallback)[0] || pickDirectAssetUrl(fallback) || '';
    if (!preferred) return safeFallback;
    if (!isCloudFileId(preferred)) return preferred;

    if (!tempUrlCache.has(preferred)) {
        await warmCloudTempUrls([preferred]);
    }

    return tempUrlCache.get(preferred) || safeFallback;
}

async function resolveCloudImageList(value, fallbackList = []) {
    const normalizedList = toAssetList(value);
    const safeFallbackList = toRenderableImageList(fallbackList);
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
    isTemporarySignedAssetUrl,
    pickDirectAssetUrl,
    pickPreferredAssetRef,
    resolveCloudImageUrl,
    resolveCloudImageList
};
