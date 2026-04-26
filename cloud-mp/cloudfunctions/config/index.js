'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const {
    CloudBaseError, cloudFunctionWrapper, withTransientDbReadRetry
} = require('./shared/errors');
const {
    success, badRequest, serverError
} = require('./shared/response');
const { getAllRecords, toNumber } = require('./shared/utils');

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

async function buildCachedPayload(cacheKey, builder) {
    const version = await configCache.getCacheVersion(cacheKey);
    const cached = configCache.getCachedModel(cacheKey, version);
    if (cached !== null) {
        return {
            value: cached,
            cacheHit: true
        };
    }
    const value = await builder();
    configCache.setCachedModel(cacheKey, value, version);
    return {
        value,
        cacheHit: false
    };
}

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

const HOME_BANNER_POSITIONS = new Set(['home', 'home_mid', 'home_bottom']);

function isHomeBannerPosition(position = '') {
    return HOME_BANNER_POSITIONS.has(pickString(position).trim());
}

function isCloudFileId(value) {
    return /^cloud:\/\//i.test(pickString(value));
}

function isHttpAsset(value) {
    return /^https?:\/\//i.test(pickString(value));
}

function isTemporarySignedAsset(value) {
    const text = pickString(value).toLowerCase();
    if (!text || !/^https?:\/\//i.test(text)) return false;
    if (!text.includes('tcb.qcloud.la')) return false;
    return /[?&]sign=/.test(text) && /[?&]t=/.test(text);
}

function pickAssetRef(source = {}) {
    if (!source || typeof source !== 'object') return pickString(source);
    const fileId = pickString(source.file_id || source.fileId);
    const direct = pickString(
        source.image_url
        || source.url
        || source.image
        || source.cover_image
        || source.coverImage
        || toArray(source.images)[0]
        || toArray(source.preview_images)[0]
        || toArray(source.previewImages)[0]
    );
    if (fileId) return fileId;
    return direct;
}

function parseMaybeJsonValue(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (trimmed[0] !== '{' && trimmed[0] !== '[') return value;
    try {
        return JSON.parse(trimmed);
    } catch (_) {
        return value;
    }
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
    if (!isHttpAsset(fallback)) return '';
    return fallback;
}

function buildRuntimeAssetUrl(record = {}, resolvedMap = new Map()) {
    const fileId = pickFileId(record);
    if (fileId) {
        return pickString(resolvedMap.get(fileId)) || fileId;
    }
    const fallback = pickAssetRef(record);
    if (isTemporarySignedAsset(fallback)) return '';
    if (isHttpAsset(fallback) || isCloudFileId(fallback)) return fallback;
    return pickString(fallback);
}

async function normalizeFestivalConfigPayload(config = {}) {
    const raw = config && typeof config === 'object' ? config : {};
    const bannerFileId = pickFileId({
        file_id: raw.banner_file_id,
        image: raw.banner
    });
    const posters = toArray(raw.card_posters);
    const posterFileIds = posters.map((item) => pickFileId({
        file_id: item && item.file_id,
        image: item && item.image
    }));
    const resolvedMap = await batchResolveManagedFileUrls([bannerFileId, ...posterFileIds]);
    return {
        ...raw,
        banner_file_id: bannerFileId || pickString(raw.banner_file_id),
        banner: buildRuntimeAssetUrl({
            file_id: bannerFileId,
            image: raw.banner
        }, resolvedMap),
        card_posters: posters.map((item = {}) => {
            const fileId = pickFileId({
                file_id: item.file_id,
                image: item.image
            });
            return {
                ...item,
                file_id: fileId || pickString(item.file_id),
                image: buildRuntimeAssetUrl({
                    file_id: fileId,
                    image: item.image,
                    url: item.url,
                    image_url: item.image_url
                }, resolvedMap)
            };
        })
    };
}

function normalizeLotteryPrizeType(value) {
    const raw = pickString(value || 'miss').toLowerCase();
    if (raw === 'point') return 'points';
    if (['miss', 'points', 'coupon', 'goods_fund', 'physical', 'mystery'].includes(raw)) return raw;
    return 'miss';
}

function getLotteryPrizeVisual(type = 'miss') {
    return {
        miss: { emoji: '🍀', badge: '好运签', theme: '#6B7280', accent: '#D1D5DB' },
        points: { emoji: '⭐', badge: '积分奖', theme: '#2563EB', accent: '#93C5FD' },
        coupon: { emoji: '🎫', badge: '优惠券', theme: '#10B981', accent: '#6EE7B7' },
        goods_fund: { emoji: '💰', badge: '货款奖', theme: '#0F766E', accent: '#5EEAD4' },
        physical: { emoji: '🎁', badge: '实物奖', theme: '#F59E0B', accent: '#FDE68A' },
        mystery: { emoji: '✨', badge: '神秘大奖', theme: '#7C3AED', accent: '#C4B5FD' }
    }[type] || { emoji: '🎁', badge: '奖品', theme: '#6B7280', accent: '#D1D5DB' };
}

function formatLotteryPrizeValue(row = {}, type = 'miss') {
    const prizeValue = toNumber(row.prize_value != null ? row.prize_value : row.value, 0);
    const couponAmount = toNumber(row.coupon_amount != null ? row.coupon_amount : prizeValue, 0);
    if (type === 'points' && prizeValue > 0) return `${Math.floor(prizeValue)} 积分`;
    if (type === 'coupon' && couponAmount > 0) return `${couponAmount} 元券`;
    if (type === 'goods_fund' && prizeValue > 0) return `¥${prizeValue} 货款`;
    if (type === 'physical') return '实物礼品';
    if (type === 'mystery') return '人工兑奖';
    return '试试下一次好运';
}

function pickBannerProductId(item = {}) {
    if (hasValue(item?.product_id)) return item.product_id;
    const linkType = pickString(item?.link_type).toLowerCase();
    if (linkType !== 'product') return null;
    const linkValue = pickString(item?.link_value);
    return hasValue(linkValue) ? linkValue : null;
}

const ACTIVE_BANNER_STATUS_CONDITIONS = [
    { status: true },
    { status: 1 },
    { status: '1' },
    { status: 'active' },
    { status: 'enabled' },
    { is_active: true },
    { is_active: 1 },
    { is_active: '1' }
];
const ACTIVE_STATUS_CONDITIONS = [
    { status: true },
    { status: 1 },
    { status: '1' },
    { status: 'active' },
    { status: 'enabled' },
    { status: 'on_sale' },
    { is_active: true },
    { is_active: 1 },
    { is_active: '1' }
];

function buildActiveBannerWhere(position = '') {
    const activeCondition = _.or(ACTIVE_BANNER_STATUS_CONDITIONS);
    if (!position) return activeCondition;
    return _.and([activeCondition, { position }]);
}

function buildActiveStatusWhere(extra = null) {
    const activeCondition = _.or(ACTIVE_STATUS_CONDITIONS);
    if (!extra || typeof extra !== 'object') return activeCondition;
    return _.and([activeCondition, extra]);
}

function bannerFieldProjection() {
    return {
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
        product_id: true
    };
}

async function resolveProductCoverImage(product = {}) {
    const candidates = [
        product.cover_image,
        product.image_url,
        product.image,
        ...toArray(product.images),
        ...toArray(product.preview_images),
        ...toArray(product.previewImages)
    ].filter(Boolean);
    const resolvedMap = await batchResolveManagedFileUrls(candidates.filter((value) => isCloudFileId(pickString(value))));
    for (const candidate of candidates) {
        const imageUrl = buildResolvedAssetUrl({
            file_id: candidate,
            image_url: candidate,
            image: candidate,
            cover_image: candidate
        }, resolvedMap);
        if (imageUrl) return imageUrl;
    }
    return '';
}

async function normalizeBannerRecords(records = []) {
    const list = Array.isArray(records) ? records : [];
    const resolvedMap = await batchResolveManagedFileUrls(list.map((item) => pickFileId(item)));
    const productMap = await loadProductsByActivityIds(list.map((item) => pickBannerProductId(item)));
    return Promise.all(list.map(async (item) => {
        const fileId = pickFileId(item);
        let imageUrl = buildResolvedAssetUrl(item, resolvedMap);
        const bannerProductId = pickBannerProductId(item);
        if (!imageUrl && bannerProductId != null) {
            const product = productMap[String(bannerProductId)] || null;
            if (product) {
                imageUrl = await resolveProductCoverImage(product);
            }
        }
        const position = pickString(item.position, 'home');
        const imageOnly = isHomeBannerPosition(position);
        return {
            ...item,
            title: imageOnly ? '' : pickString(item.title),
            subtitle: imageOnly ? '' : pickString(item.subtitle),
            kicker: imageOnly ? '' : pickString(item.kicker),
            position,
            file_id: fileId,
            image_url: imageUrl,
            image: imageUrl,
            url: imageUrl,
            cover_image: imageUrl,
            coverImage: imageUrl
        };
    }));
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
    const previewImages = toArray(product.preview_images).concat(toArray(product.previewImages));
    const coverImage = pickString(
        product.cover_image
        || product.image_url
        || product.image
        || product.cover
        || images[0]
        || previewImages[0]
    );
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
        image: coverImage,
        image_url: coverImage,
        cover_image: coverImage,
        images,
        preview_images: previewImages,
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

function isMallVisibleProduct(product = {}) {
    if (!product || typeof product !== 'object') return false;
    const active = isTruthyActiveFlag(product.status ?? product.is_active ?? product.enabled, true);
    if (!active) return false;
    return !(product.visible_in_mall === false || product.visible_in_mall === 0 || product.visible_in_mall === '0');
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
            if (!product || !isMallVisibleProduct(product)) return;
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
        for (let i = 0; i < normalizedKeys.length; i += 1) {
            const currentKey = normalizedKeys[i];
            const row = configRes.data.find((item) => pickString(item.config_key || item.key || item._id) === currentKey);
            if (row) {
                return parseMaybeJsonValue(row.config_value !== undefined ? row.config_value : (row.value !== undefined ? row.value : fallback));
            }
        }
    }

    for (let i = 0; i < normalizedKeys.length; i += 1) {
        const value = await getAppConfigValue(normalizedKeys[i], null);
        if (value !== null && value !== undefined) return parseMaybeJsonValue(value);
    }
    return fallback;
}

async function getActivityLinksConfigValue() {
    const value = await getConfigValueByKeys(['activity_links', 'activity_links_config'], {});
    return value && typeof value === 'object' ? value : {};
}

function normalizeBrandNewsCategoryKey(value, fallback = 'latest_activity') {
    const raw = pickString(value).toLowerCase().replace(/[\s-]+/g, '_');
    if (!raw) return fallback;
    if (['latest_activity', 'latest', 'activity', 'activities', 'news', 'newest', '最新活动'].includes(raw)) return 'latest_activity';
    if (['industry_frontier', 'industry', 'frontier', 'trend', '行业前沿'].includes(raw)) return 'industry_frontier';
    if (['mall_notice', 'notice', 'notices', 'announcement', 'announcements', '商城公告'].includes(raw)) return 'mall_notice';
    return fallback;
}

function normalizeBrandNewsEntry(item = {}, index = 0) {
    return {
        ...item,
        id: pickString(item.id || item._id || `brand-news-${index}`),
        title: pickString(item.title),
        summary: pickString(item.summary),
        cover_image: pickString(item.cover_image || item.image || item.image_url),
        cover_file_id: pickString(item.cover_file_id || item.file_id),
        file_id: pickString(item.file_id || item.cover_file_id),
        content_html: pickString(item.content_html || item.content || item.body),
        sort_order: Number(item.sort_order || 0),
        category_key: normalizeBrandNewsCategoryKey(item.category_key || item.category || item.type),
        enabled: isTruthyActiveFlag(item.enabled ?? item.is_active ?? item.status, true),
        created_at: item.created_at || '',
        updated_at: item.updated_at || ''
    };
}

async function getConfiguredBrandNewsEntries() {
    const configValue = await getActivityLinksConfigValue();
    const rows = Array.isArray(configValue.brand_news) ? configValue.brand_news : [];
    return rows
        .map((item, index) => normalizeBrandNewsEntry(item, index))
        .filter((item) => item.enabled && item.title)
        .sort((a, b) => {
            const sortDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
            if (sortDiff !== 0) return sortDiff;
            return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        });
}

function isExpiredTime(value) {
    if (!hasValue(value)) return false;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts <= Date.now() : false;
}

function isLimitedCardEnabled(card = {}) {
    return isTruthyActiveFlag(card.enabled ?? card.status ?? card.is_active ?? card.active, true) && !isExpiredTime(card.end_time || card.end_at);
}

function sortLimitedSaleSlots(rows = []) {
    return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
        const sortDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (sortDiff !== 0) return sortDiff;
        return parseDateTs(a.start_time) - parseDateTs(b.start_time);
    });
}

function parseDateTs(value) {
    if (!value) return 0;
    const raw = pickString(value).trim();
    if (!raw) return 0;
    const normalized = /(?:z|[+-]\d{2}:\d{2})$/i.test(raw) ? raw : `${raw}+08:00`;
    const ts = new Date(normalized).getTime();
    return Number.isFinite(ts) ? ts : 0;
}

function isLimitedSaleSlotEnabled(slot = {}) {
    return isTruthyActiveFlag(slot.status ?? slot.is_active ?? slot.enabled, true);
}

function resolveLimitedSaleSlotRuntimeStatus(slot = {}, nowTs = Date.now()) {
    if (!isLimitedSaleSlotEnabled(slot)) return 'disabled';
    const startTs = parseDateTs(slot.start_time);
    const endTs = parseDateTs(slot.end_time);
    if (!startTs || !endTs || startTs >= endTs) return 'invalid';
    if (endTs <= nowTs) return 'ended';
    if (startTs > nowTs) return 'upcoming';
    return 'running';
}

function pickRecommendedLimitedSaleSlot(slots = []) {
    const running = slots.filter((slot) => slot.runtime_status === 'running');
    if (running.length) return running[0];
    const upcoming = slots.filter((slot) => slot.runtime_status === 'upcoming');
    if (upcoming.length) return upcoming[0];
    return null;
}

async function normalizeLimitedSaleSlots(rawSlots = []) {
    const list = sortLimitedSaleSlots(rawSlots);
    const resolvedMap = await batchResolveManagedFileUrls(list.map((item) => pickFileId(item)));
    return list.map((item) => {
        const image = buildResolvedAssetUrl({
            file_id: item.file_id,
            image_url: item.cover_image || item.image_url || item.image,
            image: item.cover_image || item.image || item.image_url
        }, resolvedMap);
        return {
            ...item,
            id: item.id || item._legacy_id || item._id,
            title: pickString(item.title),
            subtitle: pickString(item.subtitle),
            file_id: pickString(item.file_id),
            cover_image: image,
            image_url: image,
            sort_order: Number(item.sort_order || 0),
            runtime_status: resolveLimitedSaleSlotRuntimeStatus(item),
            status: isLimitedSaleSlotEnabled(item) ? 1 : 0
        };
    });
}

async function getLimitedSaleSlotsSnapshot() {
    const rows = await getAllRecords(db, 'limited_sale_slots').catch(() => []);
    const normalized = await normalizeLimitedSaleSlots(rows || []);
    return normalized.filter((slot) => slot.runtime_status === 'running' || slot.runtime_status === 'upcoming');
}

async function countLimitedSaleReservedOrders(slotId, itemId) {
    if (!hasValue(slotId) || !hasValue(itemId)) return 0;
    const res = await db.collection('orders')
        .where({
            limited_sale_slot_id: String(slotId),
            limited_sale_item_id: String(itemId),
            status: _.neq('cancelled')
        })
        .count()
        .catch(() => ({ total: 0 }));
    return Number(res.total || 0);
}

function buildLimitedSaleStockState(stockLimit, soldCount, productStockRaw) {
    const normalizedStockLimit = Math.max(0, Number(stockLimit || 0));
    const hasQuotaLimit = normalizedStockLimit > 0;
    const remainingByQuota = hasQuotaLimit ? Math.max(0, normalizedStockLimit - soldCount) : null;
    const hasFiniteProductStock = Number.isFinite(Number(productStockRaw)) && Number(productStockRaw) >= 0;
    const normalizedProductStock = hasFiniteProductStock ? Math.max(0, Number(productStockRaw)) : null;
    const remaining = normalizedProductStock != null
        ? (hasQuotaLimit ? Math.max(0, Math.min(remainingByQuota, normalizedProductStock)) : normalizedProductStock)
        : (hasQuotaLimit ? remainingByQuota : 1);
    const soldOut = normalizedProductStock != null
        ? (normalizedProductStock < 1 || (hasQuotaLimit && remainingByQuota < 1))
        : (hasQuotaLimit ? remainingByQuota < 1 : false);
    const stockLabel = hasQuotaLimit
        ? `剩余 ${remaining} / ${normalizedStockLimit}`
        : (normalizedProductStock != null ? `商品库存剩余 ${remaining} 件` : '库存以商品详情为准');

    return {
        remaining,
        soldOut,
        hasQuotaLimit,
        stockLabel,
        normalizedStockLimit
    };
}

async function buildLimitedSaleDetailPayload(slotId = '') {
    const slots = await getLimitedSaleSlotsSnapshot();
    if (!slots.length) {
        return { slot: null, slots: [], items: [], recommended_slot_id: '' };
    }
    const activeSlot = slotId
        ? (slots.find((item) => String(item.id) === String(slotId)) || null)
        : pickRecommendedLimitedSaleSlot(slots);
    if (!activeSlot) {
        return {
            slot: null,
            slots,
            items: [],
            recommended_slot_id: pickRecommendedLimitedSaleSlot(slots)?.id || ''
        };
    }

    const itemRows = await getAllRecords(db, 'limited_sale_items').catch(() => []);
    const activeItems = (Array.isArray(itemRows) ? itemRows : [])
        .filter((item) => String(item.slot_id || '') === String(activeSlot.id))
        .filter((item) => isTruthyActiveFlag(item.status ?? item.is_active ?? item.enabled, true));
    const productMap = await loadProductsByActivityIds(activeItems.map((item) => item.product_id));
    const items = await Promise.all(sortCardsByOrder(activeItems).map(async (item) => {
        const product = productSummary(productMap[String(item.product_id)] || null);
        const soldCount = await countLimitedSaleReservedOrders(activeSlot.id, item.id || item._id || item.offer_id || '');
        const stockState = buildLimitedSaleStockState(
            item.stock_limit,
            soldCount,
            product && Object.prototype.hasOwnProperty.call(product, 'stock') ? product.stock : null
        );
        return {
            item_id: item.id || item._id || item.offer_id || '',
            offer_id: item.id || item._id || item.offer_id || '',
            product_id: item.product_id || '',
            sku_id: item.sku_id || '',
            enable_points: isTruthyActiveFlag(item.enable_points, true),
            enable_money: isTruthyActiveFlag(item.enable_money, true),
            points_price: Number(item.points_price || 0),
            money_price: Number(item.money_price || 0),
            stock_limit: stockState.normalizedStockLimit,
            sold_count: soldCount,
            remaining: stockState.remaining,
            quota_limited: stockState.hasQuotaLimit,
            sold_out: stockState.soldOut,
            stock_label: stockState.stockLabel,
            sort_order: Number(item.sort_order || 0),
            product: product || {
                id: item.product_id || '',
                name: '商品',
                image: '',
                images: []
            }
        };
    }));

    return {
        slot: activeSlot,
        slots,
        items,
        recommended_slot_id: pickRecommendedLimitedSaleSlot(slots)?.id || ''
    };
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

async function getPageLayoutByKey(pageKey = '') {
    const normalizedPageKey = pickString(pageKey);
    if (!normalizedPageKey) return null;
    const res = await db.collection('page_layouts')
        .where(buildActiveStatusWhere({ page_key: normalizedPageKey }))
        .field({
            layout_schema: true,
            sections: true,
            page_key: true
        })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const row = res.data && res.data[0] ? res.data[0] : null;
    return row ? (row.layout_schema || row.sections || row) : null;
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
        const cachedPayload = await buildCachedPayload('homeContent', async () => {
            // 兼容旧数据字段：banners 用 status, products 用 status:true, page_layouts 用 page_key+status
            const [homeBannerRes, midBannerRes, bottomBannerRes, layoutsRes, productsRes, miniProgramRaw, homepageSettings, popupAd, boards] = await Promise.all([
                db.collection('banners')
                    .where(buildActiveBannerWhere('home'))
                    .orderBy('sort_order', 'asc')
                    .limit(10)
                    .field(bannerFieldProjection())
                    .get().catch(() => ({ data: [] })),
                db.collection('banners')
                    .where(buildActiveBannerWhere('home_mid'))
                    .orderBy('sort_order', 'asc')
                    .limit(10)
                    .field(bannerFieldProjection())
                    .get().catch(() => ({ data: [] })),
                db.collection('banners')
                    .where(buildActiveBannerWhere('home_bottom'))
                    .orderBy('sort_order', 'asc')
                    .limit(10)
                    .field(bannerFieldProjection())
                    .get().catch(() => ({ data: [] })),
                db.collection('page_layouts')
                    .where(buildActiveStatusWhere({ page_key: 'home' }))
                    .field({
                        layout_schema: true,
                        sections: true
                    })
                    .limit(1)
                    .get().catch(() => ({ data: [] })),
                db.collection('products')
                    .where(buildActiveStatusWhere())
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
            const hotProducts = (productsRes.data || [])
                .filter((item) => isMallVisibleProduct(item))
                .map((p) => ({
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
            return resolveHomeContentAssets(payload);
        });
        const result = success(cachedPayload.value);
        result.__perf = { cache_hit: cachedPayload.cacheHit };
        return result;
    }),

    'pageContent': asyncHandler(async (params) => {
        const pageKey = pickString(params.page_key || params.pageKey);
        if (!pageKey) throw badRequest('缺少 page_key');
        if (pageKey === 'home') throw badRequest('首页请使用 /page-content/home');

        const cachedPayload = await buildCachedPayload(`pageContent:${pageKey}`, async () => {
            const layout = await getPageLayoutByKey(pageKey);
            const resources = {};

            if (pageKey === 'activity') {
                resources.activity_links = await getActivityLinksConfigValue();
            }

            return {
                page_key: pageKey,
                layout,
                resources
            };
        });

        const result = success(cachedPayload.value);
        result.__perf = { cache_hit: cachedPayload.cacheHit };
        return result;
    }),

    // ===== Banners =====
    'banners': asyncHandler(async (params) => {
        const position = params.position || null;
        const query = buildActiveBannerWhere(position || '');
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
            .where(buildActiveStatusWhere())
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 拼团 =====
    'groups': asyncHandler(async (params) => {
        const res = await db.collection('group_activities')
            .where(buildActiveStatusWhere())
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
            .where(buildActiveStatusWhere())
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        const list = await hydrateActivitiesWithProducts(res.data || []);
        return success({ list });
    }),

    // ===== 砍价 =====
    'slashList': asyncHandler(async (params) => {
        const res = await db.collection('slash_activities')
            .where(buildActiveStatusWhere())
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
            .where(buildActiveStatusWhere())
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
        const lotteryId = pickString(params.lottery_id || params.pool_id || 'default', 'default');
        const normalizePrizeScopes = (value) => {
            if (Array.isArray(value)) return [...new Set(value.map((item) => pickString(item)).filter(Boolean))];
            const raw = pickString(value);
            if (!raw) return [];
            if (raw.startsWith('[') && raw.endsWith(']')) {
                try { return normalizePrizeScopes(JSON.parse(raw)); } catch (_) { return []; }
            }
            return [...new Set(raw.split(',').map((item) => item.trim()).filter(Boolean))];
        };
        const prizeMatchesLottery = (row) => {
            const scopes = normalizePrizeScopes(row.lottery_ids || row.lottery_id || row.pool_ids || row.pool_id || row.pool);
            if (lotteryId === 'default') return scopes.length === 0 || scopes.includes('default');
            return scopes.includes(lotteryId);
        };
        const res = await db.collection('lottery_prizes')
            .where(_.or([
                { is_active: true },
                { is_active: 1 },
                { status: true },
                { status: 1 }
            ]))
            .orderBy('sort_order', 'asc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        const rows = (Array.isArray(res.data) ? res.data : []).filter(prizeMatchesLottery);
        const resolvedMap = await batchResolveManagedFileUrls(rows.map((item) => pickFileId(item)).filter(Boolean));
        const list = rows.map((row) => {
            const type = normalizeLotteryPrizeType(row.type);
            const visual = getLotteryPrizeVisual(type);
            const imageUrl = buildResolvedAssetUrl(row, resolvedMap);
            return {
                ...row,
                id: row.id || row._legacy_id || row._id,
                type,
                image_url: imageUrl,
                image: imageUrl,
                cover_image: imageUrl,
                display_emoji: pickString(row.display_emoji || visual.emoji),
                badge_text: pickString(row.badge_text || visual.badge),
                theme_color: pickString(row.theme_color || visual.theme),
                accent_color: pickString(row.accent_color || visual.accent),
                display_value: formatLotteryPrizeValue(row, type)
            };
        });
        return success({ list });
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
        const cachedPayload = await buildCachedPayload('activityLinks', async () => {
            const configValue = await getActivityLinksConfigValue();
            if (configValue && typeof configValue === 'object' && Object.keys(configValue).length > 0) {
                return configValue;
            }
            const res = await db.collection('activity_links')
                .where({ is_active: true })
                .orderBy('sort_order', 'asc')
                .limit(20)
                .get().catch(() => ({ data: [] }));
            return { list: res.data || [] };
        });
        const result = success(cachedPayload.value);
        result.__perf = { cache_hit: cachedPayload.cacheHit };
        return result;
    }),

    'festivalConfig': asyncHandler(async (params) => {
        const config = await getConfigValueByKeys([
            'festival_config'
        ], {
            active: false,
            name: '',
            theme: '',
            theme_colors: {},
            tags: [],
            card_posters: [],
            global_wallpaper: { enabled: false, preset: 'default' }
        });
        return success(await normalizeFestivalConfigPayload(config));
    }),

    // ===== 限时商品 =====
    'limitedSalesOverview': asyncHandler(async () => {
        const cachedPayload = await buildCachedPayload('limitedSalesOverview', async () => {
            const slots = await getLimitedSaleSlotsSnapshot();
            const recommended = pickRecommendedLimitedSaleSlot(slots);
            return {
                slots,
                recommended_slot_id: recommended ? String(recommended.id) : '',
                current_slot_id: recommended && recommended.runtime_status === 'running' ? String(recommended.id) : ''
            };
        });
        const result = success(cachedPayload.value);
        result.__perf = { cache_hit: cachedPayload.cacheHit };
        return result;
    }),

    'limitedSalesDetail': asyncHandler(async (params) => {
        const slotId = String(params.slot_id || params.id || '').trim();
        const payload = await buildLimitedSaleDetailPayload(slotId);
        return success(payload);
    }),

    'limitedSpotDetail': asyncHandler(async (params) => {
        const slotId = String(params.slot_id || params.id || '').trim();
        const nextPayload = await buildLimitedSaleDetailPayload(slotId);
        if (nextPayload.slot) {
            return success({
                card: {
                    id: nextPayload.slot.id,
                    title: nextPayload.slot.title || '',
                    subtitle: nextPayload.slot.subtitle || '',
                    image: nextPayload.slot.cover_image || '',
                    end_time: nextPayload.slot.end_time || null,
                    runtime_status: nextPayload.slot.runtime_status || ''
                },
                slots: nextPayload.slots || [],
                products: nextPayload.items || [],
                recommended_slot_id: nextPayload.recommended_slot_id || ''
            });
        }

        const cardId = String(params.card_id || params.slot_id || params.id || '').trim();
        const normalizedLinks = await getActivityLinksConfigValue();
        const limitedCards = Array.isArray(normalizedLinks.limited) ? normalizedLinks.limited : [];
        const card = pickLimitedCard(limitedCards, cardId);

        if (!card || !isLimitedCardEnabled(card)) {
            return success({ card: null, slots: [], products: [], recommended_slot_id: '' });
        }

        const spotProducts = Array.isArray(card.spot_products) ? card.spot_products : [];
        const productMap = await loadProductsByActivityIds(spotProducts.map((item) => item.product_id));
        const products = await Promise.all(spotProducts.map(async (offer, index) => {
            const product = productSummary(productMap[String(offer.product_id)] || null);
            const dynamicSoldCount = await countLimitedSpotReservedOrders(card.id || card._id || cardId, offer.id || offer.offer_id || `${cardId}-${index}`);
            const soldCount = Math.max(Number(offer.sold_count || 0), dynamicSoldCount);
            const stockState = buildLimitedSaleStockState(
                offer.stock_limit,
                soldCount,
                product && Object.prototype.hasOwnProperty.call(product, 'stock') ? product.stock : null
            );
            return {
                offer_id: offer.id || offer.offer_id || `${cardId}-${index}`,
                item_id: offer.id || offer.offer_id || `${cardId}-${index}`,
                product_id: offer.product_id || '',
                sku_id: offer.sku_id || '',
                enable_points: isTruthyActiveFlag(offer.enable_points, true),
                enable_money: isTruthyActiveFlag(offer.enable_money, true),
                points_price: Number(offer.points_price || 0),
                money_price: Number(offer.money_price || 0),
                stock_limit: stockState.normalizedStockLimit,
                sold_count: soldCount,
                remaining: stockState.remaining,
                quota_limited: stockState.hasQuotaLimit,
                sold_out: stockState.soldOut,
                stock_label: stockState.stockLabel,
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
            slots: [],
            products
        });
    }),

    // ===== 品牌动态 =====
    'brandNews': asyncHandler(async (params) => {
        const targetId = pickString(params.id || params.news_id);
        const categoryKey = pickString(params.category_key)
            ? normalizeBrandNewsCategoryKey(params.category_key)
            : '';
        const configuredEntries = await getConfiguredBrandNewsEntries();

        if (configuredEntries.length > 0) {
            if (targetId) {
                const article = configuredEntries.find((item) => item.id === targetId);
                return success(article || null);
            }
            const list = categoryKey
                ? configuredEntries.filter((item) => item.category_key === categoryKey)
                : configuredEntries;
            return success({ list });
        }

        const res = await db.collection('brand_news')
            .where({ is_active: true })
            .orderBy('created_at', 'desc')
            .limit(200)
            .get().catch(() => ({ data: [] }));
        const legacyEntries = (res.data || [])
            .map((item, index) => normalizeBrandNewsEntry(item, index))
            .filter((item) => item.enabled && item.title);

        if (targetId) {
            const article = legacyEntries.find((item) => item.id === targetId);
            return success(article || null);
        }

        const list = categoryKey
            ? legacyEntries.filter((item) => item.category_key === categoryKey)
            : legacyEntries;
        return success({ list });
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
        const perfMeta = result && typeof result === 'object' && result.__perf ? result.__perf : {};
        if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, '__perf')) {
            delete result.__perf;
        }
        logPerf({
            action: currentAction,
            trace_id: traceId,
            cold_start: coldStart,
            status: 'ok',
            code: 'ok',
            total_ms: Date.now() - startedAt,
            cache_hit: !!perfMeta.cache_hit
        });
        return result;
    } catch (error) {
        logPerf({
            action,
            trace_id: traceId,
            cold_start: coldStart,
            status: 'error',
            code: parseErrorCode(error),
            total_ms: Date.now() - startedAt,
            cache_hit: false
        });
        throw error;
    }
});
