'use strict';

const https = require('https');

const COUPON_CLAIM_PAGE = 'pages/coupon/claim';
const DEFAULT_ENV_VERSION = 'release';
const DEFAULT_WIDTH = 280;
const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = 7200;
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const ALLOWED_ENV_VERSIONS = new Set(['develop', 'trial', 'release']);

const accessTokenCache = new Map();

function normalizeEnvVersion(value) {
    const envVersion = String(value || DEFAULT_ENV_VERSION).trim().toLowerCase();
    return ALLOWED_ENV_VERSIONS.has(envVersion) ? envVersion : DEFAULT_ENV_VERSION;
}

function normalizeMiniProgramPage(page = COUPON_CLAIM_PAGE) {
    const normalized = String(page || COUPON_CLAIM_PAGE).trim().replace(/^\/+/, '');
    return normalized || COUPON_CLAIM_PAGE;
}

function normalizeSceneValue(scene = '') {
    return String(scene || '').trim();
}

function buildMiniProgramPath(page = COUPON_CLAIM_PAGE, query = '') {
    const normalizedPage = normalizeMiniProgramPage(page);
    const normalizedQuery = String(query || '').trim().replace(/^\?+/, '');
    return normalizedQuery ? `/${normalizedPage}?${normalizedQuery}` : `/${normalizedPage}`;
}

function buildCouponSharePath(couponId) {
    return `/pages/coupon/claim?id=${encodeURIComponent(String(couponId || '').trim())}`;
}

function buildCouponWxacodeScene(couponId) {
    return `id=${encodeURIComponent(String(couponId || '').trim())}`;
}

function normalizeWxacodeBase64(buffer) {
    if (!buffer) return '';
    if (Buffer.isBuffer(buffer)) return buffer.toString('base64');
    if (buffer instanceof ArrayBuffer) return Buffer.from(buffer).toString('base64');
    if (ArrayBuffer.isView(buffer)) {
        return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength).toString('base64');
    }
    return Buffer.from(buffer).toString('base64');
}

function buildWxacodeFallback({
    page = COUPON_CLAIM_PAGE,
    scene = '',
    mpPath = '',
    envVersion = DEFAULT_ENV_VERSION,
    error = null,
    extra = {}
} = {}) {
    return {
        ...extra,
        page: normalizeMiniProgramPage(page),
        scene: normalizeSceneValue(scene),
        env_version: normalizeEnvVersion(envVersion),
        mp_path: mpPath || buildMiniProgramPath(page),
        wxacode_base64: null,
        error
    };
}

function buildCouponWxacodeFallback({ couponId, envVersion = DEFAULT_ENV_VERSION, error = null } = {}) {
    return {
        ...buildWxacodeFallback({
            page: COUPON_CLAIM_PAGE,
            scene: buildCouponWxacodeScene(couponId),
            mpPath: buildCouponSharePath(couponId),
            envVersion,
            error,
            extra: {
                coupon_id: String(couponId || '').trim()
            }
        })
    };
}

function getWechatCredentials({ appId, appSecret } = {}) {
    const resolvedAppId = String(
        appId
        || process.env.WX_APP_ID
        || process.env.WECHAT_APP_ID
        || process.env.WECHAT_APPID
        || process.env.WECHAT_MINIPROGRAM_APP_ID
        || process.env.WECHAT_MINIPROGRAM_APPID
        || process.env.MINIPROGRAM_APP_ID
        || process.env.PAYMENT_WECHAT_APPID
        || ''
    ).trim();
    const resolvedAppSecret = String(
        appSecret
        || process.env.WX_APP_SECRET
        || process.env.WECHAT_APP_SECRET
        || process.env.WECHAT_SECRET
        || process.env.WECHAT_MINIPROGRAM_APP_SECRET
        || process.env.MINIPROGRAM_APP_SECRET
        || ''
    ).trim();

    return { appId: resolvedAppId, appSecret: resolvedAppSecret };
}

function buildWechatApiError(payload = {}, fallback = 'wechat_api_failed') {
    const errCode = payload.errcode ?? payload.errCode ?? '';
    const errMsg = payload.errmsg || payload.errMsg || fallback;
    return errCode !== '' ? `errCode: ${errCode} | errMsg: ${errMsg}` : errMsg;
}

function shouldRefreshAccessToken(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('access_token') || message.includes('40001') || message.includes('42001');
}

function looksLikeJson(buffer) {
    if (!buffer || !buffer.length) return false;
    const text = buffer.toString('utf8').trim();
    return text.startsWith('{') || text.startsWith('[');
}

function requestWechatApi({ path, method = 'GET', body = null, timeoutMs = 10000, requestImpl = https.request } = {}) {
    return new Promise((resolve, reject) => {
        const bodyText = body == null ? '' : JSON.stringify(body);
        const req = requestImpl({
            hostname: 'api.weixin.qq.com',
            port: 443,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, image/jpeg, image/png, application/octet-stream',
                'User-Agent': 'cloud-mp-admin-api/1.0',
                'Content-Length': Buffer.byteLength(bodyText)
            }
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => { chunks.push(Buffer.from(chunk)); });
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const contentType = String(res.headers?.['content-type'] || '').toLowerCase();
                let json = null;
                if (contentType.includes('application/json') || looksLikeJson(buffer)) {
                    try {
                        json = JSON.parse(buffer.toString('utf8'));
                    } catch (error) {
                        reject(new Error(`invalid_wechat_json_response: ${error.message}`));
                        return;
                    }
                }

                resolve({
                    statusCode: res.statusCode || 0,
                    headers: res.headers || {},
                    buffer,
                    json
                });
            });
        });

        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('wechat_api_timeout'));
        });
        if (bodyText) req.write(bodyText);
        req.end();
    });
}

async function getStableAccessToken({ appId, appSecret, forceRefresh = false, requestImpl } = {}) {
    const credentials = getWechatCredentials({ appId, appSecret });
    if (!credentials.appId || !credentials.appSecret) {
        throw new Error('wx_app_credentials_missing');
    }

    const cacheKey = credentials.appId;
    const cached = accessTokenCache.get(cacheKey);
    if (!forceRefresh && cached && cached.token && cached.expiresAt > (Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS)) {
        return cached.token;
    }

    const response = await requestWechatApi({
        path: '/cgi-bin/stable_token',
        method: 'POST',
        body: {
            grant_type: 'client_credential',
            appid: credentials.appId,
            secret: credentials.appSecret,
            force_refresh: !!forceRefresh
        },
        requestImpl
    });

    if (response.statusCode >= 400) {
        throw new Error(buildWechatApiError(response.json, `stable_token_http_${response.statusCode}`));
    }

    if (!response.json || !response.json.access_token || response.json.errcode) {
        throw new Error(buildWechatApiError(response.json, 'stable_token_failed'));
    }

    const expiresIn = Number(response.json.expires_in || DEFAULT_ACCESS_TOKEN_EXPIRES_IN);
    accessTokenCache.set(cacheKey, {
        token: response.json.access_token,
        expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEFAULT_ACCESS_TOKEN_EXPIRES_IN) * 1000
    });

    return response.json.access_token;
}

async function fetchWxacodeBuffer({
    accessToken,
    page = COUPON_CLAIM_PAGE,
    scene = '',
    envVersion = DEFAULT_ENV_VERSION,
    width = DEFAULT_WIDTH,
    requestImpl
} = {}) {
    if (!accessToken) throw new Error('wx_access_token_missing');

    const response = await requestWechatApi({
        path: `/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`,
        method: 'POST',
        body: {
            scene: normalizeSceneValue(scene),
            page: normalizeMiniProgramPage(page),
            env_version: normalizeEnvVersion(envVersion),
            width: Number.isFinite(Number(width)) && Number(width) > 0 ? Number(width) : DEFAULT_WIDTH,
            check_path: false,
            is_hyaline: false
        },
        requestImpl
    });

    if (response.statusCode >= 400) {
        throw new Error(buildWechatApiError(response.json, `getwxacodeunlimit_http_${response.statusCode}`));
    }

    if (response.json && (response.json.errcode != null || response.json.errCode != null)) {
        throw new Error(buildWechatApiError(response.json, 'getwxacodeunlimit_failed'));
    }

    if (!response.buffer || !response.buffer.length) {
        throw new Error('empty_buffer');
    }

    return response.buffer;
}

async function fetchCouponWxacodeBuffer({ accessToken, couponId, envVersion = DEFAULT_ENV_VERSION, width = DEFAULT_WIDTH, requestImpl } = {}) {
    return fetchWxacodeBuffer({
        accessToken,
        page: COUPON_CLAIM_PAGE,
        scene: buildCouponWxacodeScene(couponId),
        envVersion,
        width,
        requestImpl
    });
}

async function generateWxacode({
    page = COUPON_CLAIM_PAGE,
    scene = '',
    mpPath = '',
    envVersion = DEFAULT_ENV_VERSION,
    width = DEFAULT_WIDTH,
    appId,
    appSecret,
    requestImpl,
    tokenFetcher,
    wxacodeFetcher
} = {}) {
    const fallback = buildWxacodeFallback({
        page,
        scene,
        mpPath,
        envVersion,
        error: null
    });
    const resolveToken = tokenFetcher || getStableAccessToken;
    const fetchCode = wxacodeFetcher || fetchWxacodeBuffer;

    try {
        let accessToken = await resolveToken({
            appId,
            appSecret,
            requestImpl
        });
        let buffer;

        try {
            buffer = await fetchCode({
                accessToken,
                page: fallback.page,
                scene: fallback.scene,
                envVersion: fallback.env_version,
                width,
                requestImpl
            });
        } catch (error) {
            if (!shouldRefreshAccessToken(error)) throw error;

            accessToken = await resolveToken({
                appId,
                appSecret,
                requestImpl,
                forceRefresh: true
            });
            buffer = await fetchCode({
                accessToken,
                page: fallback.page,
                scene: fallback.scene,
                envVersion: fallback.env_version,
                width,
                requestImpl
            });
        }

        const base64 = normalizeWxacodeBase64(buffer);
        if (!base64) {
            return { ...fallback, error: 'empty_buffer' };
        }

        return {
            ...fallback,
            wxacode_base64: base64
        };
    } catch (error) {
        return {
            ...fallback,
            error: error?.message || error?.errMsg || 'wxacode_failed'
        };
    }
}

async function generateCouponWxacode({
    couponId,
    envVersion = DEFAULT_ENV_VERSION,
    width = DEFAULT_WIDTH,
    appId,
    appSecret,
    requestImpl,
    tokenFetcher,
    wxacodeFetcher
} = {}) {
    const result = await generateWxacode({
        page: COUPON_CLAIM_PAGE,
        scene: buildCouponWxacodeScene(couponId),
        mpPath: buildCouponSharePath(couponId),
        envVersion,
        width,
        appId,
        appSecret,
        requestImpl,
        tokenFetcher,
        wxacodeFetcher: wxacodeFetcher
            ? async ({ accessToken, envVersion: nextEnvVersion, width: nextWidth, requestImpl: nextRequestImpl }) => wxacodeFetcher({
                accessToken,
                couponId,
                envVersion: nextEnvVersion,
                width: nextWidth,
                requestImpl: nextRequestImpl
            })
            : undefined
    });

    return {
        ...result,
        coupon_id: String(couponId || '').trim()
    };
}

function clearAccessTokenCache() {
    accessTokenCache.clear();
}

module.exports = {
    COUPON_CLAIM_PAGE,
    buildCouponSharePath,
    buildCouponWxacodeScene,
    buildCouponWxacodeFallback,
    buildMiniProgramPath,
    buildWxacodeFallback,
    clearAccessTokenCache,
    fetchCouponWxacodeBuffer,
    fetchWxacodeBuffer,
    generateCouponWxacode,
    generateWxacode,
    getStableAccessToken,
    normalizeEnvVersion
};
