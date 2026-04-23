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

function normalizeLimitedSpotPayload(rawPayload = null, fallbackMode = '') {
    if (!rawPayload || typeof rawPayload !== 'object') return null;

    const source = rawPayload.slot_id || rawPayload.item_id
        ? 'limited_sale'
        : (rawPayload.card_id || rawPayload.offer_id ? 'limited_spot' : '');
    const slotId = String(rawPayload.slot_id || rawPayload.card_id || rawPayload.id || '').trim();
    const itemId = String(rawPayload.item_id || rawPayload.offer_id || '').trim();
    if (!slotId || !itemId) return null;

    const mode = normalizeLimitedSpotMode(
        rawPayload.mode || (rawPayload.redeem_points ? 'points' : fallbackMode),
        null
    );

    return {
        source: source || 'limited_sale',
        slot_id: slotId,
        item_id: itemId,
        card_id: slotId,
        offer_id: itemId,
        mode,
        redeem_points: mode === 'points',
        title: String(rawPayload.title || '').trim(),
        points_price: Math.max(0, Number(rawPayload.points_price || 0) || 0),
        money_price: Math.max(0, Number(rawPayload.money_price || 0) || 0)
    };
}

function buildLimitedSpotProductUrl({ productId, cardId, offerId, mode }) {
    const params = [
        `id=${encodeURIComponent(productId)}`,
        `limited_sale_slot_id=${encodeURIComponent(cardId)}`,
        `limited_sale_item_id=${encodeURIComponent(offerId)}`,
        `limited_spot_mode=${encodeURIComponent(mode)}`
    ];
    return `/pages/product/detail?${params.join('&')}`;
}

function navigateToLimitedSpotProduct({ productId, cardId, offerId, mode }) {
    if (!productId || !cardId || !offerId) {
        wx.showToast({ title: '限时商品参数缺失', icon: 'none' });
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
        throw new Error('档期参数缺失');
    }
    const res = await get('/activity/limited-spot/detail', { slot_id: cardId });
    if (res.code !== 0 || !res.data) {
        throw new Error(res.message || '加载限时商品失败');
    }
    const card = res.data.slot || res.data.card || null;
    const products = Array.isArray(res.data.items) ? res.data.items : (Array.isArray(res.data.products) ? res.data.products : []);
    const offer = products.find((item) => (
        String(item.item_id || item.offer_id || '') === String(offerId)
        || String(item.offer_id || '') === String(offerId)
    )) || null;
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
    normalizeLimitedSpotPayload,
    buildLimitedSpotProductUrl,
    navigateToLimitedSpotProduct,
    fetchLimitedSpotContext
};
