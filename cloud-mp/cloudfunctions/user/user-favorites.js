'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const { getAllRecords } = require('./shared/utils');

/**
 * 获取收藏列表
 */
async function getFavorites(openid, params = {}) {
    const res = await db.collection('user_favorites')
        .where({ openid })
        .orderBy('created_at', 'desc')
        .limit(100)
        .get()
        .catch(() => ({ data: [] }));
    return res.data || [];
}

/**
 * 添加收藏
 */
async function addFavorite(openid, productId) {
    if (!productId) throw new Error('缺少商品 ID');

    // 检查是否已收藏
    const existing = await db.collection('user_favorites')
        .where({ openid, product_id: productId })
        .limit(1).get().catch(() => ({ data: [] }));
    if (existing.data && existing.data.length > 0) {
        return { success: true, message: '已收藏' };
    }

    // 获取商品信息
    const product = await db.collection('products').doc(productId).get().catch(() => ({ data: null }));
    const productName = product.data ? product.data.name : '';
    const productImage = product.data && Array.isArray(product.data.images) ? product.data.images[0] : '';

    const result = await db.collection('user_favorites').add({
        data: {
            openid,
            product_id: productId,
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

    await db.collection('user_favorites')
        .where({ openid, product_id: productId })
        .remove();

    return { success: true };
}

/**
 * 删除收藏（按收藏记录 ID）
 */
async function removeFavoriteById(openid, favoriteId) {
    const fav = await db.collection('user_favorites').doc(favoriteId).get().catch(() => ({ data: null }));
    if (!fav.data || fav.data.openid !== openid) {
        throw new Error('收藏记录不存在');
    }
    await db.collection('user_favorites').doc(favoriteId).remove();
    return { success: true };
}

/**
 * 同步收藏（批量设置，前端传全量列表）
 */
async function syncFavorites(openid, productIds) {
    if (!Array.isArray(productIds)) throw new Error('productIds 必须是数组');

    // 获取当前收藏（分页获取，突破 100 条限制）
    const current = await getAllRecords(db, 'user_favorites', { openid }).catch(() => []);
    const currentIds = (current || []).map(f => f.product_id);

    // 添加新增的
    const toAdd = productIds.filter(id => !currentIds.includes(id));
    for (const pid of toAdd) {
        await addFavorite(openid, pid);
    }

    // 删除多余的
    const toRemove = currentIds.filter(id => !productIds.includes(id));
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

module.exports = {
    getFavorites,
    addFavorite,
    removeFavorite,
    removeFavoriteById,
    syncFavorites,
    clearAllFavorites,
};
