/**
 * utils/favoriteSync.js — 云开发版
 *
 * 原版通过 POST /user/favorites/sync 同步收藏，
 * 云开发版改为调用 user 云函数（action: 'syncFavorites'）
 */
const { callFn } = require('./cloud');
const { listFavorites, clearFavorites } = require('./localUserContent');

/**
 * 登录成功后：把本地收藏合并到云端，成功后清空本地收藏列表
 */
async function syncLocalFavoritesToCloud() {
    try {
        const openid = wx.getStorageSync('openid');
        if (!openid) return;
        const local = listFavorites();
        if (!local.length) return;
        const product_ids = local.map(x => x.id);
        const res = await callFn('user', { action: 'syncFavorites', product_ids }, { showError: false });
        if (res && res.code === 0) clearFavorites();
    } catch (e) {
        console.warn('[favoriteSync] sync failed', e);
    }
}

module.exports = { syncLocalFavoritesToCloud };
