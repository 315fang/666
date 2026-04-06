const { post } = require('./request');
const { listFavorites, clearFavorites } = require('./localUserContent');

/**
 * 登录成功后：把本地收藏合并到云端，成功后清空本地收藏列表（避免双份数据源）
 */
async function syncLocalFavoritesToCloud() {
    try {
        const token = wx.getStorageSync('token');
        if (!token) return;
        const local = listFavorites();
        if (!local.length) return;
        const product_ids = local.map((x) => x.id);
        const res = await post('/user/favorites/sync', { product_ids }, { showError: false });
        if (res && res.code === 0) clearFavorites();
    } catch (e) {
        console.warn('[favoriteSync] sync failed', e);
    }
}

module.exports = { syncLocalFavoritesToCloud };
