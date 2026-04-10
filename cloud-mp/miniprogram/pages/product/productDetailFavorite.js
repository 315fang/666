const { get, post, del } = require('../../utils/request');
const { normalizeProductId } = require('../../utils/dataFormatter');
const LocalUserContent = require('../../utils/localUserContent');

async function refreshFavoriteState(page) {
    const product = page.data.product;
    if (!product || product.id == null) return;
    const pid = normalizeProductId(product.id);
    const token = wx.getStorageSync('token');
    if (token) {
        try {
            const res = await get(
                '/user/favorites/status',
                { product_id: pid },
                { showError: false }
            );
            const favorited = !!(res && res.data && res.data.favorited);
            page.setData({ isFavorite: favorited });
        } catch (_) {
            page.setData({ isFavorite: false });
        }
    } else {
        page.setData({ isFavorite: LocalUserContent.isFavorite(pid) });
    }
}

async function toggleFavorite(page) {
    const { product, currentPrice } = page.data;
    if (!product || product.id == null) return;
    const pid = normalizeProductId(product.id);
    const token = wx.getStorageSync('token');

    if (token) {
        try {
            if (page.data.isFavorite) {
                await del(`/user/favorites/${pid}`, {}, { showError: false });
                page.setData({ isFavorite: false });
                wx.showToast({ title: '已取消收藏', icon: 'none' });
            } else {
                await post('/user/favorites', { product_id: pid }, { showError: false });
                page.setData({ isFavorite: true });
                wx.showToast({ title: '已收藏', icon: 'none' });
            }
        } catch (err) {
            const msg = err && err.message || '操作失败';
            wx.showToast({ title: String(msg).slice(0, 20), icon: 'none' });
        }
        return;
    }

    const added = LocalUserContent.toggleFavorite({
        id: pid,
        name: product.name,
        image: product.images && product.images[0] || '',
        price: String(currentPrice || product.displayPrice || '')
    });
    page.setData({ isFavorite: added });
    wx.showToast({
        title: added ? '已收藏到本机' : '已取消收藏',
        icon: 'none'
    });
}

module.exports = {
    refreshFavoriteState,
    toggleFavorite
};
