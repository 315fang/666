'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const {
    CloudBaseError, cloudFunctionWrapper, withTransientDbReadRetry
} = require('./shared/errors');
const {
    success, badRequest, serverError
} = require('./shared/response');
const { getAllRecords } = require('./shared/utils');

const db = cloud.database();
const _ = db.command;

// ==================== 子模块导入 ====================
const configLoader = require('./config-loader');
const configCache = require('./config-cache');
const configContract = require('./config-contract');

// ==================== 主处理函数 ====================
const asyncHandler = (handler) => async (...args) => {
    try {
        return await handler(...args);
    } catch (err) {
        if (err instanceof CloudBaseError) throw err;
        if (err && typeof err === 'object' && 'code' in err && 'success' in err && 'message' in err) throw err;
        throw serverError(err.message || '操作失败');
    }
};

let isColdStart = true;

function buildTraceId(event) {
    const candidate = event && (
        event.trace_id
        || event.traceId
        || event.request_id
        || event.requestId
        || event.$requestId
    );
    if (candidate) return String(candidate);
    return `config_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseErrorCode(error) {
    if (!error) return 'unknown_error';
    if (error.code) return String(error.code);
    if (error.errCode) return String(error.errCode);
    return 'internal_error';
}

function logPerf(entry) {
    const payload = {
        kind: 'cf_perf',
        metric_version: 'phase1_v1',
        ts: new Date().toISOString(),
        function_name: 'config',
        db_ms: null,
        ...entry
    };
    console.log(JSON.stringify(payload));
}

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function isCloudFileId(value) {
    return /^cloud:\/\//i.test(pickString(value));
}

function isHttpAsset(value) {
    return /^https?:\/\//i.test(pickString(value));
}

function pickAssetRef(source = {}) {
    if (!source || typeof source !== 'object') return pickString(source);
    return pickString(source.file_id || source.image_url || source.url || source.image || source.cover_image || source.coverImage);
}

function pickFileId(source = {}) {
    if (!source || typeof source !== 'object') return '';
    const direct = pickString(source.file_id || source.fileId);
    if (isCloudFileId(direct)) return direct;
    const fallback = pickAssetRef(source);
    return isCloudFileId(fallback) ? fallback : '';
}

async function batchResolveManagedFileUrls(fileIds = []) {
    const ids = [...new Set((Array.isArray(fileIds) ? fileIds : []).filter(isCloudFileId))];
    const resolved = new Map();
    if (!ids.length || !cloud?.getTempFileURL) return resolved;

    for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const result = await cloud.getTempFileURL({ fileList: chunk }).catch(() => ({ fileList: [] }));
        (result.fileList || []).forEach((file) => {
            if (!file || !file.fileID) return;
            resolved.set(file.fileID, pickString(file.tempFileURL || file.download_url));
        });
    }
    return resolved;
}

function buildResolvedAssetUrl(record = {}, resolvedMap = new Map()) {
    const fileId = pickFileId(record);
    if (fileId) {
        const resolved = pickString(resolvedMap.get(fileId));
        if (resolved) return resolved;
    }
    const fallback = pickAssetRef(record);
    return isHttpAsset(fallback) ? fallback : '';
}

async function normalizeBannerRecords(records = []) {
    const list = Array.isArray(records) ? records : [];
    const resolvedMap = await batchResolveManagedFileUrls(list.map((item) => pickFileId(item)));
    return list.map((item) => {
        const imageUrl = buildResolvedAssetUrl(item, resolvedMap);
        return {
            ...item,
            file_id: pickFileId(item),
            image_url: imageUrl,
            image: imageUrl,
            url: imageUrl,
            cover_image: imageUrl,
            coverImage: imageUrl
        };
    });
}

async function normalizeSingleAssetRecord(record = {}) {
    const safeRecord = record && typeof record === 'object' ? { ...record } : {};
    const fileId = pickFileId(safeRecord);
    const resolvedMap = await batchResolveManagedFileUrls(fileId ? [fileId] : []);
    const imageUrl = buildResolvedAssetUrl(safeRecord, resolvedMap);
    return {
        ...safeRecord,
        file_id: fileId,
        image_url: imageUrl,
        image: imageUrl,
        url: imageUrl,
        cover_image: imageUrl,
        coverImage: imageUrl
    };
}

async function resolveHomeContentAssets(payload = {}) {
    const safePayload = payload && typeof payload === 'object' ? { ...payload } : {};
    const resources = safePayload.resources && typeof safePayload.resources === 'object'
        ? { ...safePayload.resources }
        : {};

    const bannerGroup = resources.banners && typeof resources.banners === 'object'
        ? { ...resources.banners }
        : (safePayload.banners && typeof safePayload.banners === 'object' ? { ...safePayload.banners } : {});

    const [homeBanners, midBanners, bottomBanners] = await Promise.all([
        normalizeBannerRecords(bannerGroup.home || []),
        normalizeBannerRecords(bannerGroup.home_mid || []),
        normalizeBannerRecords(bannerGroup.home_bottom || [])
    ]);

    const normalizedBanners = {
        home: homeBanners,
        home_mid: midBanners,
        home_bottom: bottomBanners
    };

    const popupSource = resources.popup_ad && typeof resources.popup_ad === 'object'
        ? resources.popup_ad
        : (safePayload.popupAd && typeof safePayload.popupAd === 'object' ? safePayload.popupAd : {});
    const normalizedPopup = await normalizeSingleAssetRecord(popupSource);

    resources.banners = normalizedBanners;
    resources.popup_ad = normalizedPopup;

    return {
        ...safePayload,
        banners: normalizedBanners,
        popupAd: normalizedPopup,
        resources
    };
}

function toArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!hasValue(value)) return [];
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed[0] === '[') {
            try {
                const parsed = JSON.parse(trimmed);
                return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
            } catch (_) {
                return [trimmed];
            }
        }
        return [trimmed];
    }
    return [];
}

function toDisplayPrice(value, centsField) {
    if (!hasValue(value)) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (centsField && Math.abs(num) >= 1000) return +(num / 100).toFixed(2);
    return +num.toFixed(2);
}

function firstPrice(values) {
    let fallback = 0;
    for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        if (value == null) continue;
        fallback = value;
        if (Number(value) > 0) return value;
    }
    return fallback;
}

function productSummary(product) {
    if (!product) return null;
    const images = toArray(product.images);
    const price = firstPrice([
        toDisplayPrice(product.retail_price, false),
        toDisplayPrice(product.price, false),
        toDisplayPrice(product.min_price, true)
    ]);
    const marketPrice = firstPrice([
        toDisplayPrice(product.market_price, false),
        toDisplayPrice(product.original_price, true)
    ]);
    const id = hasValue(product.id)
        ? product.id
        : (hasValue(product._legacy_id) ? product._legacy_id : product._id);

    return {
        _id: product._id,
        id,
        _legacy_id: product._legacy_id,
        name: product.name || product.title || '商品',
        description: product.description || product.subtitle || '',
        image: product.image || product.cover || images[0] || '',
        images,
        price,
        retail_price: price,
        min_price: price,
        displayPrice: price > 0 ? price.toFixed(2) : '0.00',
        market_price: marketPrice,
        original_price: marketPrice,
        stock: Number(product.stock || product.stock_quantity || 0),
        sales_count: Number(product.sales_count || product.sold_count || product.purchase_count || 0)
    };
}

function uniqueValues(values) {
    const seen = {};
    const list = [];
    values.forEach((value) => {
        if (!hasValue(value)) return;
        const key = String(value);
        if (seen[key]) return;
        seen[key] = true;
        list.push(value);
    });
    return list;
}

function isTruthyActiveFlag(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (value === false || value === 0 || value === '0') return false;
    const normalized = pickString(value).toLowerCase();
    if (!normalized) return fallback;
    if (['false', 'inactive', 'disabled', 'off'].includes(normalized)) return false;
    if (['true', 'active', 'enabled', 'on', 'show', 'visible'].includes(normalized)) return true;
    return fallback;
}

function boardLookupKeys(board) {
    return uniqueValues([
        board && board.id,
        board && board._id,
        board && board._legacy_id,
        board && board.board_key,
        board && board.key
    ]).map((value) => String(value));
}

async function loadBoardMapWithProducts() {
    const boards = await getAllRecords(db, 'content_boards').catch(() => []);
    const activeBoards = (boards || []).filter((board) => isTruthyActiveFlag(board?.is_visible ?? board?.is_active ?? board?.status, true));
    if (!activeBoards.length) return {};

    const relationRows = await getAllRecords(db, 'content_board_products').catch(() => []);
    const relationList = Array.isArray(relationRows) ? relationRows : [];
    const boardIdToKeys = {};
    const boardKeyToBoard = {};

    activeBoards.forEach((board) => {
        const keys = boardLookupKeys(board);
        const boardId = String(board.id || board._id || board.board_key || board.key || '');
        boardIdToKeys[boardId] = new Set(keys);
        const boardKey = board.board_key || board.key || board._id;
        if (boardKey) boardKeyToBoard[String(boardKey)] = board;
    });

    const activeRelations = relationList.filter((row) => {
        if (!isTruthyActiveFlag(row?.is_active, true)) return false;
        const boardId = String(row?.board_id ?? '');
        return Object.values(boardIdToKeys).some((keys) => keys.has(boardId));
    });

    const productMap = await loadProductsByActivityIds(activeRelations.map((row) => row.product_id));
    const groupedProducts = {};

    activeRelations
        .slice()
        .sort((a, b) => Number(b.sort_order || 0) - Number(a.sort_order || 0))
        .forEach((row) => {
            const relationBoardId = String(row.board_id ?? '');
            const matchedBoard = activeBoards.find((board) => boardLookupKeys(board).includes(relationBoardId));
            if (!matchedBoard) return;
            const boardKey = String(matchedBoard.board_key || matchedBoard.key || matchedBoard._id || '');
            if (!boardKey) return;
            if (!groupedProducts[boardKey]) groupedProducts[boardKey] = [];
            const product = productMap[String(row.product_id)] || null;
            if (!product) return;
            groupedProducts[boardKey].push({
                ...product,
                board_relation_id: row.id || row._id,
                board_sort_order: Number(row.sort_order || 0)
            });
        });

    const map = {};
    Object.keys(boardKeyToBoard).forEach((boardKey) => {
        const board = boardKeyToBoard[boardKey];
        map[boardKey] = {
            ...board,
            id: board.id || board._id,
            products: groupedProducts[boardKey] || []
        };
    });
    return map;
}

async function loadProductsByActivityIds(productIds) {
    const ids = uniqueValues(productIds);
    if (!ids.length) return {};

    const numberIds = uniqueValues(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)));
    const stringIds = uniqueValues(ids.map((id) => String(id)));
    const queries = [];

    if (numberIds.length) {
        queries.push(db.collection('products').where({ id: _.in(numberIds) }).limit(100).get());
        queries.push(db.collection('products').where({ _legacy_id: _.in(numberIds) }).limit(100).get());
    }
    if (stringIds.length) {
        queries.push(db.collection('products').where({ _id: _.in(stringIds) }).limit(100).get());
        queries.push(db.collection('products').where({ id: _.in(stringIds) }).limit(100).get());
        queries.push(db.collection('products').where({ _legacy_id: _.in(stringIds) }).limit(100).get());
    }

    const results = await Promise.all(queries.map((query) => query.catch(() => ({ data: [] }))));
    const productMap = {};
    results.forEach((res) => {
        (res.data || []).forEach((product) => {
            const summary = productSummary(product);
            if (!summary) return;
            [summary._id, summary.id, summary._legacy_id].forEach((key) => {
                if (hasValue(key)) productMap[String(key)] = summary;
            });
        });
    });
    return productMap;
}

async function hydrateActivitiesWithProducts(activities) {
    const list = Array.isArray(activities) ? activities : [];
    const productIds = list.map((activity) => activity && activity.product_id);
    const products = await loadProductsByActivityIds(productIds);
    return list.map((activity) => {
        if (!activity) return activity;
        const product = activity.product || products[String(activity.product_id)] || null;
        return {
            ...activity,
            product
        };
    });
}

async function getAppConfigValue(key, fallback = null) {
    const res = await db.collection('app_configs')
        .where({ config_key: key, status: true })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (res.data && res.data[0]) {
        const row = res.data[0];
        return row.config_value !== undefined ? row.config_value : (row.value !== undefined ? row.value : row);
    }
    return fallback;
}

async function getConfigValueByKeys(keys = [], fallback = null) {
    const normalizedKeys = uniqueValues(keys.map((key) => pickString(key)).filter(Boolean));
    if (!normalizedKeys.length) return fallback;

    const configRes = await db.collection('configs')
        .where(_.or([
            { config_key: _.in(normalizedKeys) },
            { key: _.in(normalizedKeys) }
        ]))
        .limit(20)
        .get()
        .catch(() => ({ data: [] }));
    if (configRes.data && configRes.data[0]) {
        const row = configRes.data.find((item) => normalizedKeys.includes(pickString(item.config_key || item.key || item._id)));
        if (row) {
            return row.config_value !== undefined ? row.config_value : (row.value !== undefined ? row.value : fallback);
        }
    }

    for (let i = 0; i < normalizedKeys.length; i += 1) {
        const value = await getAppConfigValue(normalizedKeys[i], null);
        if (value !== null && value !== undefined) return value;
    }
    return fallback;
}

async function getActivityLinksConfigValue() {
    const value = await getConfigValueByKeys(['activity_links', 'activity_links_config'], {});
    return value && typeof value === 'object' ? value : {};
}

function isExpiredTime(value) {
    if (!hasValue(value)) return false;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts <= Date.now() : false;
}

function isLimitedCardEnabled(card = {}) {
    return isTruthyActiveFlag(card.enabled ?? card.status ?? card.is_active ?? card.active, true) && !isExpiredTime(card.end_time || card.end_at);
}

function sortCardsByOrder(cards = []) {
    return [...(Array.isArray(cards) ? cards : [])].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

function pickLimitedCard(cards = [], cardId = '') {
    const sorted = sortCardsByOrder(cards);
    if (cardId) {
        return sorted.find((item) => String(item.id || item._id || '') === String(cardId)) || null;
    }
    return sorted.find((item) => isLimitedCardEnabled(item) && Array.isArray(item.spot_products) && item.spot_products.length > 0) || null;
}

async function countLimitedSpotReservedOrders(cardId, offerId) {
    if (!hasValue(cardId) || !hasValue(offerId)) return 0;
    const res = await db.collection('orders')
        .where({
            limited_spot_card_id: String(cardId),
            limited_spot_offer_id: String(offerId),
            status: _.neq('cancelled')
        })
        .count()
        .catch(() => ({ total: 0 }));
    return Number(res.total || 0);
}

async function getSingletonValue(key, fallback = null) {
    const doc = await db.collection('admin_singletons')
        .doc(String(key))
        .get()
        .catch(() => ({ data: null }));
    if (!doc.data) return fallback;
    return doc.data.value !== undefined ? doc.data.value : fallback;
}

async function getHomepageSettings() {
    const settings = await getSingletonValue('settings', {});
    return (settings && (settings.homepage || settings.HOMEPAGE)) || {};
}

async function getPopupAdConfig() {
    const popup = await getSingletonValue('popup-ad-config', null);
    const normalized = configContract.normalizePopupAdConfig(popup || {});
    return normalizeSingleAssetRecord(normalized);
}

async function findOneByAnyId(collectionName, rawId) {
    if (!hasValue(rawId)) return null;
    const id = String(rawId);
    const byDocId = await db.collection(collectionName).doc(id).get().catch(() => ({ data: null }));
    if (byDocId.data) return byDocId.data;
    const candidates = [id];
    const numericId = Number(id);
    if (Number.isFinite(numericId)) candidates.push(numericId);
    const res = await db.collection(collectionName)
        .where(_.or([
            { id: _.in(candidates) },
            { _legacy_id: _.in(candidates) }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

const handleAction = {
    // ===== 基础配置 =====
    'init': asyncHandler(async (params) => {
        const config = await configLoader.loadConfig();
        return success(config);
    }),

    'list': asyncHandler(async (params) => {
        const config = await configLoader.loadConfig();
        return success(config);
    }),

    'get': asyncHandler(async (params) => {
        const key = params.key;
        if (!key) throw badRequest('缺少 key 参数');
        const value = await configCache.getConfig(key);
        return success({ [key]: value });
    }),

    'getSystemConfig': asyncHandler(async (params) => {
        const config = await withTransientDbReadRetry(
            () => configLoader.loadConfig(),
            { action: 'getSystemConfig' }
        );
        return success(config);
    }),

    'miniProgramConfig': asyncHandler(async (params) => {
        const config = await withTransientDbReadRetry(
            () => configLoader.loadConfig(),
            { action: 'miniProgramConfig' }
        );
        return success(configContract.normalizeMiniProgramConfig(config.mini_program_config || config));
    }),

    // ===== 首页内容 =====
    'homeContent': asyncHandler(async (params) => {
        const cached = configCache.getCachedConfig('home_content_payload');
        if (cached && typeof cached === 'object') {
            // 首页缓存命中时刷新一次临时素材 URL，避免旧签名链接在客户端触发 403。
            const refreshed = await resolveHomeContentAssets(cached);
            configCache.setCachedConfig('home_content_payload', refreshed);
            return success(refreshed);
        }

        // 兼容旧数据字段：banners 用 status, products 用 status:true, page_layouts 用 page_key+status
        const [homeBannerRes, midBannerRes, bottomBannerRes, layoutsRes, productsRes, miniProgramRaw, homepageSettings, popupAd, boards] = await Promise.all([
            db.collection('banners')
                .where({ status: true, position: 'home' })
                .orderBy('sort_order', 'asc')
                .limit(10)
                .field({
                    _id: true,
                    images: true,
                    id: true,
                    _legacy_id: true,
                    name: true,
                    title: true,
                    subtitle: true,
                    link_type: true,
                    link_value: true,
                    position: true,
                    sort_order: true,
                    file_id: true,
                    image_url: true,
                    url: true,
                })
                .get().catch(() => ({ data: [] })),
            db.collection('banners')
                .where({ status: true, position: 'home_mid' })
                .orderBy('sort_order', 'asc')
                .limit(10)
                .field({
                    _id: true,
                    images: true,
                    id: true,
                    _legacy_id: true,
                    name: true,
                    title: true,
                    subtitle: true,
                    link_type: true,
                    link_value: true,
                    position: true,
                    sort_order: true,
                    file_id: true,
                    image_url: true,
                    url: true,
                })
                .get().catch(() => ({ data: [] })),
            db.collection('banners')
                .where({ status: true, position: 'home_bottom' })
                .orderBy('sort_order', 'asc')
                .limit(10)
                .field({
                    _id: true,
                    images: true,
                    id: true,
                    _legacy_id: true,
                    name: true,
                    title: true,
                    subtitle: true,
                    link_type: true,
                    link_value: true,
                    position: true,
                    sort_order: true,
                    file_id: true,
                    image_url: true,
                    url: true,
                })
                .get().catch(() => ({ data: [] })),
            db.collection('page_layouts')
                .where({ page_key: 'home', status: true })
                .field({
                    layout_schema: true,
                    sections: true
                })
                .limit(1)
                .get().catch(() => ({ data: [] })),
            db.collection('products')
                .where({ status: true })
                .orderBy('sales_count', 'desc')
                .field({
                    _id: true,
                    id: true,
                    _legacy_id: true,
                    name: true,
                    images: true,
                    min_price: true,
                    retail_price: true,
                    market_price: true,
                    sales_count: true,
                    purchase_count: true
                })
                .limit(10)
                .get().catch(() => ({ data: [] })),
            (async () => {
                const cachedMini = await configCache.getConfig('mini_program_config');
                if (cachedMini !== null) return cachedMini;
                const cfg = await configLoader.loadConfig();
                return cfg.mini_program_config || cfg;
            })(),
            getHomepageSettings(),
            getPopupAdConfig(),
            loadBoardMapWithProducts()
        ]);

        const miniProgramConfig = configContract.normalizeMiniProgramConfig(miniProgramRaw || {});
        const layout = layoutsRes.data && layoutsRes.data[0] ? layoutsRes.data[0] : null;
        const hotProducts = (productsRes.data || []).map((p) => ({
            _id: p._id,
            id: p.id || p._legacy_id || p._id,
            name: p.name,
            images: p.images || [],
            min_price: p.min_price || p.retail_price,
            retail_price: p.retail_price || p.min_price,
            original_price: p.original_price || p.market_price,
            sales_count: p.sales_count || p.purchase_count || 0,
        }));
        const payload = configContract.normalizeHomeContentPayload({
            miniProgramConfig,
            homepageSettings,
            bannersByPosition: {
                home: homeBannerRes.data || [],
                home_mid: midBannerRes.data || [],
                home_bottom: bottomBannerRes.data || []
            },
            hotProducts,
            popupAd,
            layout: layout ? layout.layout_schema || layout.sections || layout : null,
            latestActivity: {},
            boards
        });
        const resolvedPayload = await resolveHomeContentAssets(payload);

        configCache.setCachedConfig('home_content_payload', resolvedPayload);
        return success(resolvedPayload);
    }),

    // ===== Banners =====
    'banners': asyncHandler(async (params) => {
        const position = params.position || null;
        const query = position
            ? { status: true, position }
            : { status: true };
        const res = await db.collection('banners')
            .where(query)
            .orderBy('sort_order', 'asc')
            .limit(10)
            .get().catch(() => ({ data: [] }));
        const list = await normalizeBannerRecords(res.data || []);
        return success({ list });
    }),

    // ===== 开屏广告 =====
    'splash': asyncHandler(async (params) => {
        const singletonConfig = await getSingletonValue('splash_config', null);
        if (singletonConfig) {
            const normalized = configContract.normalizeSplashConfig(singletonConfig);
            return success(await normalizeSingleAssetRecord(normalized));
        }
        const res = await db.collection('splash_screens')
            .where({ is_active: true })
            .orderBy('created_at', 'desc')
            .limit(1)
            .get().catch(() => ({ data: [] }));
        const normalized = configContract.normalizeSplashConfig(res.data && res.data[0] ? res.data[0] : null);
        return success(await normalizeSingleAssetRecord(normalized));
    }),

    // ===== 主题 =====
    'activeTheme': asyncHandler(async (params) => {
        const res = await db.collection('configs')
            .where({ config_group: 'theme' })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        return success(res.data && res.data[0] ? (res.data[0].config_value || res.data[0].value) : { primary_color: '#ff6b35' });
    }),

    // ===== 活动列表 =====
    'activities': asyncHandler(async (params) => {
        const res = await db.collection('activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 拼团 =====
    'groups': asyncHandler(async (params) => {
        const res = await db.collection('group_activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        const list = await hydrateActivitiesWithProducts(res.data || []);
        return success({ list });
    }),

    'groupDetail': asyncHandler(async (params) => {
        const id = params.group_id || params.id;
        if (!id) throw badRequest('缺少拼团 ID');
        const activity = await findOneByAnyId('group_activities', id);
        if (!activity) throw badRequest('拼团活动不存在');
        const list = await hydrateActivitiesWithProducts([activity]);
        return success(list[0] || activity);
    }),

    'groupActivities': asyncHandler(async (params) => {
        const res = await db.collection('group_activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        const list = await hydrateActivitiesWithProducts(res.data || []);
        return success({ list });
    }),

    // ===== 砍价 =====
    'slashList': asyncHandler(async (params) => {
        const res = await db.collection('slash_activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        const list = await hydrateActivitiesWithProducts(res.data || []);
        return success({ list });
    }),

    'slashDetail': asyncHandler(async (params) => {
        const id = params.slash_id || params.id;
        if (!id) throw badRequest('缺少砍价活动 ID');
        const activity = await findOneByAnyId('slash_activities', id);
        if (!activity) throw badRequest('砍价活动不存在');
        const list = await hydrateActivitiesWithProducts([activity]);
        return success(list[0] || activity);
    }),

    'slashActivities': asyncHandler(async (params) => {
        const res = await db.collection('slash_activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        const list = await hydrateActivitiesWithProducts(res.data || []);
        return success({ list });
    }),

    // ===== 抽奖 =====
    'lottery': asyncHandler(async (params) => {
        const collectionRes = await db.collection('lottery_configs')
            .where({ is_active: true })
            .orderBy('updated_at', 'desc')
            .limit(1)
            .get().catch(() => ({ data: [] }));
        if (collectionRes.data && collectionRes.data[0]) {
            return success(collectionRes.data[0]);
        }
        const res = await db.collection('configs')
            .where({ config_group: 'lottery' })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        if (res.data && res.data[0]) return success(res.data[0].config_value || res.data[0].value || {});
        return success(await getAppConfigValue('lottery_config', {}));
    }),

    'lotteryPrizes': asyncHandler(async (params) => {
        const res = await db.collection('lottery_prizes')
            .where({ is_active: true })
            .orderBy('sort_order', 'asc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    'lotteryRecords': asyncHandler(async (params) => {
        const openid = params.openid;
        if (!openid) return success({ list: [] });
        const res = await db.collection('lottery_records')
            .where({ openid })
            .orderBy('created_at', 'desc')
            .limit(50)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 内容板块 =====
    'boardsMap': asyncHandler(async (params) => {
        const map = await loadBoardMapWithProducts();
        return success(map);
    }),

    // ===== 活动气泡/链接 =====
    'activityBubbles': asyncHandler(async (params) => {
        const res = await db.collection('activity_bubbles')
            .where({ is_active: true })
            .orderBy('sort_order', 'asc')
            .limit(10)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    'activityLinks': asyncHandler(async (params) => {
        const configValue = await getActivityLinksConfigValue();
        if (configValue && typeof configValue === 'object') {
            return success(configValue);
        }
        const res = await db.collection('activity_links')
            .where({ is_active: true })
            .orderBy('sort_order', 'asc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    'festivalConfig': asyncHandler(async (params) => {
        const res = await db.collection('configs')
            .where({ config_group: 'festival' })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        if (res.data && res.data[0]) return success(res.data[0].config_value || res.data[0].value || {});
        return success(await getAppConfigValue('activity_links_config', {}));
    }),

    // ===== 限量抢购 =====
    'limitedSpotDetail': asyncHandler(async (params) => {
        const cardId = String(params.card_id || params.id || '').trim();
        const normalizedLinks = await getActivityLinksConfigValue();
        const limitedCards = Array.isArray(normalizedLinks.limited) ? normalizedLinks.limited : [];
        const card = pickLimitedCard(limitedCards, cardId);

        if (!card || !isLimitedCardEnabled(card)) {
            return success({ card: null, products: [] });
        }

        const spotProducts = Array.isArray(card.spot_products) ? card.spot_products : [];
        const productMap = await loadProductsByActivityIds(spotProducts.map((item) => item.product_id));
        const products = await Promise.all(spotProducts.map(async (offer, index) => {
            const product = productSummary(productMap[String(offer.product_id)] || null);
            const dynamicSoldCount = await countLimitedSpotReservedOrders(card.id || card._id || cardId, offer.id || offer.offer_id || `${cardId}-${index}`);
            const soldCount = Math.max(Number(offer.sold_count || 0), dynamicSoldCount);
            const remaining = Math.max(0, Number(offer.stock_limit || 0) - soldCount);
            return {
                offer_id: offer.id || offer.offer_id || `${cardId}-${index}`,
                product_id: offer.product_id || '',
                sku_id: offer.sku_id || '',
                enable_points: offer.enable_points !== false,
                enable_money: offer.enable_money !== false,
                points_price: Number(offer.points_price || 0),
                money_price: Number(offer.money_price || 0),
                stock_limit: Number(offer.stock_limit || 0),
                sold_count: soldCount,
                remaining,
                product: product || {
                    id: offer.product_id || '',
                    name: '商品',
                    image: '',
                    images: []
                }
            };
        }));

        return success({
            card: {
                id: card.id || cardId,
                title: card.title || '',
                subtitle: card.subtitle || card.subTitle || '',
                image: buildResolvedAssetUrl(card, await batchResolveManagedFileUrls([pickFileId(card)])),
                end_time: card.end_time || null
            },
            products
        });
    }),

    // ===== 品牌动态 =====
    'brandNews': asyncHandler(async (params) => {
        const res = await db.collection('brand_news')
            .where({ is_active: true })
            .orderBy('created_at', 'desc')
            .limit(10)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 邀请卡 =====
    'nInviteCard': asyncHandler(async (params) => {
        const res = await db.collection('configs')
            .where({ config_group: 'invite-card' })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        return success(res.data && res.data[0] ? (res.data[0].config_value || res.data[0].value) : {});
    }),

    // ===== 问卷 =====
    'questionnaireActive': asyncHandler(async (params) => {
        const res = await db.collection('configs')
            .where({ config_group: 'questionnaire' })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        return success(res.data && res.data[0] ? (res.data[0].config_value || res.data[0].value) : null);
    }),

    // ===== 规则 =====
    'rules': asyncHandler(async (params) => {
        const key = params.key || 'general';
        const value = await configCache.getConfig(`rules_${key}`);
        if (value) return success(value);
        const res = await db.collection('configs')
            .where({ config_group: 'rules', config_key: `rules_${key}` })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        return success(res.data && res.data[0] ? (res.data[0].config_value || res.data[0].value) : {});
    }),
};

// ==================== 云函数导出 ====================
exports.main = cloudFunctionWrapper(async (event) => {
    const startedAt = Date.now();
    const coldStart = isColdStart;
    isColdStart = false;
    const traceId = buildTraceId(event || {});
    const action = event && event.action ? event.action : '';

    try {
        const { action: currentAction, ...params } = event;

        // lotteryRecords 必须使用当前登录用户的 openid，忽略 params.openid 防止枚举他人记录
        if (currentAction === 'lotteryRecords') {
            const wxContext = cloud.getWXContext();
            params.openid = wxContext.OPENID || '';  // 强制覆盖，不允许查他人
        }

        const handler = handleAction[currentAction];
        if (!handler) {
            throw badRequest(`未知 action: ${currentAction}`);
        }

        const result = await handler(params);
        logPerf({
            action: currentAction,
            trace_id: traceId,
            cold_start: coldStart,
            status: 'ok',
            code: 'ok',
            total_ms: Date.now() - startedAt
        });
        return result;
    } catch (error) {
        logPerf({
            action,
            trace_id: traceId,
            cold_start: coldStart,
            status: 'error',
            code: parseErrorCode(error),
            total_ms: Date.now() - startedAt
        });
        throw error;
    }
});
