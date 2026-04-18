const { get } = require('./request');

function normalizeLimitedSpotMode(mode, offer = null) {
    const raw = String(mode || '').trim().toLowerCase();
    if (['points', 'point', 'redeem', 'exchange', 'limited_points'].includes(raw)) {
        return offer && offer.enable_points === false ? 'money' : 'points';
    }
    if (['money', 'cash', 'buy', 'sale', 'limited_money'].includes(raw)) {
        return offer && offer.enable_money === false ? 'points' : 'money';
    }
    if (offer && offer.enable_money !== false) return 'money';
    if (offer && offer.enable_points !== false) return 'points';
    return 'money';
}

function buildLimitedSpotProductUrl({ productId, cardId, offerId, mode }) {
    const params = [
        `id=${encodeURIComponent(productId)}`,
        `limited_spot_card_id=${encodeURIComponent(cardId)}`,
        `limited_spot_offer_id=${encodeURIComponent(offerId)}`,
        `limited_spot_mode=${encodeURIComponent(mode)}`
    ];
    return `/pages/product/detail?${params.join('&')}`;
}

function navigateToLimitedSpotProduct({ productId, cardId, offerId, mode }) {
    if (!productId || !cardId || !offerId) {
        wx.showToast({ title: '活动商品参数缺失', icon: 'none' });
        return;
    }
    wx.navigateTo({
        url: buildLimitedSpotProductUrl({
            productId,
            cardId,
            offerId,
            mode: normalizeLimitedSpotMode(mode)
        })
    });
}

async function fetchLimitedSpotContext(cardId, offerId) {
    if (!cardId) {
        throw new Error('活动参数缺失');
    }
    const res = await get('/activity/limited-spot/detail', { card_id: cardId });
    if (res.code !== 0 || !res.data) {
        throw new Error(res.message || '加载活动失败');
    }
    const card = res.data.card || null;
    const products = Array.isArray(res.data.products) ? res.data.products : [];
    const offer = products.find((item) => String(item.offer_id) === String(offerId)) || null;
    if (!offer) {
        throw new Error('专享商品不存在或已下架');
    }
    return {
        card,
        offer,
        mode: normalizeLimitedSpotMode('', offer)
    };
}

module.exports = {
    normalizeLimitedSpotMode,
    buildLimitedSpotProductUrl,
    navigateToLimitedSpotProduct,
    fetchLimitedSpotContext
};
