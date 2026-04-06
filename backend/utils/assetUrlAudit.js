const TEMP_QUERY_KEYS = [
    'expires',
    'signature',
    'x-amz-algorithm',
    'x-amz-credential',
    'x-amz-date',
    'x-amz-expires',
    'x-amz-security-token',
    'x-amz-signature',
    'x-oss-signature',
    'x-oss-credential',
    'x-oss-date',
    'x-oss-expires',
    'x-cos-algorithm',
    'x-cos-credential',
    'x-cos-date',
    'x-cos-expires',
    'x-cos-security-token',
    'x-cos-signature',
    'token',
    'auth'
];

function toUrl(url) {
    try {
        return new URL(String(url || ''), 'http://placeholder.local');
    } catch (_) {
        return null;
    }
}

function getTemporaryKeys(url) {
    const parsed = toUrl(url);
    if (!parsed) return [];

    const keys = [];
    for (const [key] of parsed.searchParams.entries()) {
        const normalized = String(key || '').trim().toLowerCase();
        if (TEMP_QUERY_KEYS.includes(normalized)) {
            keys.push(normalized);
        }
    }

    return Array.from(new Set(keys));
}

function analyzeAssetUrl(url) {
    const rawUrl = String(url || '').trim();
    if (!rawUrl) {
        return {
            url: rawUrl,
            isTemporary: false,
            matchedKeys: [],
            normalizedUrl: ''
        };
    }

    const parsed = toUrl(rawUrl);
    const matchedKeys = getTemporaryKeys(rawUrl);
    if (!parsed) {
        return {
            url: rawUrl,
            isTemporary: false,
            matchedKeys,
            normalizedUrl: rawUrl
        };
    }

    parsed.search = '';
    parsed.hash = '';
    let normalizedUrl = parsed.toString();
    if (normalizedUrl.startsWith('http://placeholder.local')) {
        normalizedUrl = normalizedUrl.replace('http://placeholder.local', '');
    }

    return {
        url: rawUrl,
        isTemporary: matchedKeys.length > 0,
        matchedKeys,
        normalizedUrl
    };
}

function findTemporaryAssetUrls(urls = []) {
    return (Array.isArray(urls) ? urls : [])
        .map((url) => analyzeAssetUrl(url))
        .filter((item) => item.isTemporary);
}

function ensureNoTemporaryAssetUrls(urls, fieldLabel) {
    const flagged = findTemporaryAssetUrls(urls);
    if (!flagged.length) return;

    const keys = flagged.flatMap((item) => item.matchedKeys);
    const uniqueKeys = Array.from(new Set(keys));
    const suffix = uniqueKeys.length ? `（命中参数: ${uniqueKeys.join(', ')}）` : '';
    const error = new Error(`${fieldLabel} 不能保存临时签名链接，请改用稳定素材地址${suffix}`);
    error.statusCode = 400;
    error.code = 'TEMP_ASSET_URL';
    error.details = flagged;
    throw error;
}

module.exports = {
    TEMP_QUERY_KEYS,
    analyzeAssetUrl,
    findTemporaryAssetUrls,
    ensureNoTemporaryAssetUrls
};
