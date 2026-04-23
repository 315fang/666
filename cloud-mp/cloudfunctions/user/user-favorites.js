'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { getAllRecords } = require('./shared/utils');

function pickString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function parseTimestamp(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const ts = new Date(value).getTime();
        return Number.isFinite(ts) ? ts : 0;
    }
    if (typeof value === 'object') {
        if (typeof value._seconds === 'number') return value._seconds * 1000;
        if (typeof value.seconds === 'number') return value.seconds * 1000;
        if (value.$date !== undefined) return parseTimestamp(value.$date);
    }
    return 0;
}

function parseImageList(rawValue) {
    if (!rawValue) return [];
    if (Array.isArray(rawValue)) {
        return rawValue.map((item) => pickString(item)).filter(Boolean);
    }
    if (typeof rawValue === 'string') {
        const text = rawValue.trim();
        if (!text) return [];
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed)
                ? parsed.map((item) => pickString(item)).filter(Boolean)
                : [pickString(parsed)].filter(Boolean);
        } catch (_) {
            return [text];
        }
    }
    return [pickString(rawValue)].filter(Boolean);
}

function pickFavoriteImage(product = {}, favorite = {}) {
    return parseImageList(
        product.images
        || product.image
        || product.image_url
        || product.cover_image
        || favorite.product_image
    )[0] || '';
}

function mapFavoriteToClient(favorite = {}, product = null) {
    const productId = favorite.product_id;
    return {
        favorite_id: favorite._id || favorite.id || '',
        id: productId,
        product_id: productId,
        name: pickString(product?.name || favorite.product_name || '商品'),
        image: pickFavoriteImage(product || {}, favorite),
        price: product ? Number(toNumber(product.retail_price ?? product.price, 0)).toFixed(2) : '',
        saved_at: favorite.created_at || favorite.saved_at || '',
        unavailable: !(product && toNumber(product.status, 1) === 1)
    };
}

function buildProductIdClauses(productId) {
    const normalized = String(productId || '').trim();
    if (!normalized) return [];
    const clauses = [normalized];
    const numericId = Number(normalized);
    if (Number.isFinite(numericId)) {
        clauses.push(numericId);
    }
    return clauses;
}

function buildFavoriteLookupWhere(openid, productId) {
    const clauses = buildProductIdClauses(productId).map((value) => ({ openid, product_id: value }));
    if (!clauses.length) return { openid, product_id: '' };
    return clauses.length === 1 ? clauses[0] : _.or(clauses);
}

async function getProductsByIds(productIds = []) {
    const ids = Array.from(new Set(productIds.map((item) => String(item || '').trim()).filter(Boolean)));
    if (!ids.length) return new Map();
    const numericIds = ids
        .map((item) => Number(item))
        .filter((value) => Number.isFinite(value));
    const tasks = [];
    if (numericIds.length) {
        tasks.push(
            getAllRecords(db, 'products', { id: _.in(numericIds) }).catch(() => [])
        );
    }
    tasks.push(
        Promise.all(ids.map((id) => db.collection('products').doc(id).get().then((res) => res.data).catch(() => null)))
    );
    const map = new Map();
    (await Promise.all(tasks)).flat().filter(Boolean).forEach((row) => {
        const keys = [row._id, row.id, row._legacy_id].map((item) => String(item || '').trim()).filter(Boolean);
        keys.forEach((key) => map.set(key, row));
    });
    return map;
}

/**
 * 获取收藏列表
 */
async function getFavorites(openid, params = {}) {
    void params;
    const rows = await getAllRecords(db, 'user_favorites', { openid }).catch(() => []);
    const sortedRows = (rows || []).slice().sort((left, right) => {
        return parseTimestamp(right.created_at || right.saved_at) - parseTimestamp(left.created_at || left.saved_at);
    });
    const productMap = await getProductsByIds(sortedRows.map((item) => item.product_id));
    return sortedRows.map((favorite) => mapFavoriteToClient(favorite, productMap.get(String(favorite.product_id || '').trim()) || null));
}

/**
 * 添加收藏
 */
async function addFavorite(openid, productId) {
    if (!productId) throw new Error('缺少商品 ID');
    const normalizedProductId = String(productId).trim();
    if (!normalizedProductId) throw new Error('缺少商品 ID');

    // 检查是否已收藏
    const existing = await db.collection('user_favorites')
        .where(buildFavoriteLookupWhere(openid, normalizedProductId))
        .limit(1).get().catch(() => ({ data: [] }));
    if (existing.data && existing.data.length > 0) {
        return { success: true, message: '已收藏' };
    }

    // 获取商品信息
    const productMap = await getProductsByIds([normalizedProductId]);
    const product = productMap.get(normalizedProductId) || null;
    const productName = product ? pickString(product.name) : '';
    const productImage = pickFavoriteImage(product || {}, {});

    const result = await db.collection('user_favorites').add({
        data: {
            openid,
            product_id: normalizedProductId,
            product_name: productName,
            product_image: productImage,
            created_at: db.serverDate(),
        },
    });

    return { success: true, id: result._id };
}

/**
 * 删除收藏（按 product_id）
 */
async function removeFavorite(openid, productId) {
    if (!productId) throw new Error('缺少商品 ID');
    const normalizedProductId = String(productId).trim();
    if (!normalizedProductId) throw new Error('缺少商品 ID');

    await db.collection('user_favorites')
        .where(buildFavoriteLookupWhere(openid, normalizedProductId))
        .remove();

    return { success: true };
}

/**
 * 删除收藏（按收藏记录 ID）
 */
async function removeFavoriteById(openid, favoriteId) {
    const fav = await db.collection('user_favorites').doc(favoriteId).get().catch(() => ({ data: null }));
    if (fav.data && fav.data.openid === openid) {
        await db.collection('user_favorites').doc(favoriteId).remove();
        return { success: true };
    }
    // 兼容旧客户端：有些页面把 product_id 当作收藏记录 id 传入。
    return removeFavorite(openid, favoriteId);
}

/**
 * 同步收藏（批量设置，前端传全量列表）
 */
async function syncFavorites(openid, productIds) {
    if (!Array.isArray(productIds)) throw new Error('productIds 必须是数组');

    // 获取当前收藏（分页获取，突破 100 条限制）
    const current = await getAllRecords(db, 'user_favorites', { openid }).catch(() => []);
    const currentIds = Array.from(new Set((current || []).map((item) => String(item.product_id || '').trim()).filter(Boolean)));
    const normalizedIds = Array.from(new Set(productIds.map((item) => String(item || '').trim()).filter(Boolean)));

    // 添加新增的
    const toAdd = normalizedIds.filter((id) => !currentIds.includes(id));
    for (const pid of toAdd) {
        await addFavorite(openid, pid);
    }

    // 删除多余的
    const toRemove = currentIds.filter((id) => !normalizedIds.includes(id));
    for (const pid of toRemove) {
        await removeFavorite(openid, pid);
    }

    return { success: true, added: toAdd.length, removed: toRemove.length };
}

/**
 * 清空所有收藏
 */
async function clearAllFavorites(openid) {
    await db.collection('user_favorites').where({ openid }).remove();
    return { success: true };
}

/**
 * 查询某商品是否已收藏
 */
async function getFavoriteStatus(openid, productId) {
    if (!productId) return { favorited: false };
    const normalizedProductId = String(productId).trim();
    if (!normalizedProductId) return { favorited: false };
    const res = await db.collection('user_favorites')
        .where(buildFavoriteLookupWhere(openid, normalizedProductId))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return { favorited: !!(res.data && res.data.length > 0) };
}

module.exports = {
    getFavorites,
    addFavorite,
    removeFavorite,
    removeFavoriteById,
    syncFavorites,
    clearAllFavorites,
    getFavoriteStatus,
};
