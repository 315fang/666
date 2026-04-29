const { normalizeProductId } = require('../../utils/dataFormatter');

function decodeSceneValue(value) {
    let text = value == null ? '' : String(value);
    for (let i = 0; i < 2; i += 1) {
        try {
            const decoded = decodeURIComponent(text);
            if (decoded === text) break;
            text = decoded;
        } catch (_) {
            break;
        }
    }
    return text;
}

function parseScene(scene) {
    const result = {};
    const text = decodeSceneValue(scene).trim();
    if (!text) return result;
    text.split('&').forEach((pair) => {
        const [rawKey, ...rawValueParts] = pair.split('=');
        const key = decodeSceneValue(rawKey || '').trim();
        if (!key) return;
        result[key] = decodeSceneValue(rawValueParts.join('=') || '').trim();
    });
    return result;
}

function normalizeProductLaunchOptions(options = {}) {
    const scene = parseScene(options.scene || '');
    return {
        ...options,
        id: options.id || options.product_id || scene.pid || scene.product_id || scene.id || scene.p || '',
        invite: options.invite || scene.i || scene.invite || ''
    };
}

function captureShareInvite(app, options = {}) {
    const normalized = normalizeProductLaunchOptions(options);
    if (normalized.invite) {
        try {
            wx.setStorageSync('pending_invite_code', String(normalized.invite).trim().toUpperCase());
        } catch (_) {
            // ignore storage failures
        }
    }
    if (app && typeof app._captureInviteFromLaunch === 'function') {
        app._captureInviteFromLaunch({ query: normalized });
    }
    return normalized;
}

function resolveInviteCode(app) {
    const userInfo = app && app.globalData && app.globalData.userInfo || {};
    return String(userInfo.invite_code || userInfo.my_invite_code || userInfo.member_no || '').trim();
}

function appendQueryParam(params, key, value) {
    if (value === null || value === undefined || value === '') return;
    params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
}

function buildProductShareQuery(page) {
    const data = page.data || {};
    const product = data.product || {};
    const app = getApp();
    const params = [];
    appendQueryParam(params, 'id', normalizeProductId(product.id || data.id));

    if (data.limitedSpotCardId && data.limitedSpotOfferId) {
        if (data.limitedSpotSource === 'limited_spot') {
            appendQueryParam(params, 'limited_spot_card_id', data.limitedSpotCardId);
            appendQueryParam(params, 'limited_spot_offer_id', data.limitedSpotOfferId);
        } else {
            appendQueryParam(params, 'limited_sale_slot_id', data.limitedSpotCardId);
            appendQueryParam(params, 'limited_sale_item_id', data.limitedSpotOfferId);
        }
        appendQueryParam(params, 'limited_spot_mode', data.limitedSpotMode || 'money');
    }

    appendQueryParam(params, 'invite', resolveInviteCode(app));
    return params.join('&');
}

function formatPriceText(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return '';
    return amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);
}

function buildProductShareTitle(page) {
    const data = page.data || {};
    const product = data.product || {};
    const price = formatPriceText(
        data.limitedSpotOffer && data.limitedSpotMode === 'money'
            ? data.limitedSpotOffer.money_price
            : (data.currentPrice || product.displayPrice || product.price)
    );
    const name = String(product.name || '问兰甄选好物').trim();
    return price ? `¥${price} ${name}` : name;
}

function buildProductSharePayload(page) {
    const product = page.data && page.data.product || {};
    const query = buildProductShareQuery(page);
    return {
        title: buildProductShareTitle(page),
        path: `/pages/product/detail${query ? '?' + query : ''}`,
        query,
        imageUrl: (product.images && product.images[0]) || product.image_url || ''
    };
}

function buildPosterDraft(page) {
    const data = page.data || {};
    const product = data.product || {};
    const images = Array.isArray(product.images) ? product.images : [];
    const currentImage = images[data.currentImage] || images[0] || product.image_url || product.image || '';
    const price = data.limitedSpotOffer && data.limitedSpotMode === 'money'
        ? data.limitedSpotOffer.money_price
        : (data.currentPrice || product.displayPrice || product.price || product.retail_price || '');
    const marketPrice = data.limitedSpotOffer && data.limitedSpotOriginalPrice
        ? data.limitedSpotOriginalPrice
        : (product.market_price || product.original_price || '');

    return {
        id: normalizeProductId(product.id || data.id),
        name: product.name || '',
        price: formatPriceText(price),
        marketPrice: formatPriceText(marketPrice),
        image: currentImage,
        specText: data.selectedSkuText || product.specSummary || '',
        shareQuery: buildProductShareQuery(page),
        inviteCode: resolveInviteCode(getApp())
    };
}

function openProductPoster(page) {
    const draft = buildPosterDraft(page);
    if (!draft.id) {
        wx.showToast({ title: '商品参数错误', icon: 'none' });
        return;
    }
    try {
        wx.setStorageSync('productPosterDraft', draft);
    } catch (_) {
        // Poster page can still refetch product detail.
    }
    const params = [`id=${encodeURIComponent(String(draft.id))}`];
    if (draft.inviteCode) params.push(`invite=${encodeURIComponent(draft.inviteCode)}`);
    wx.navigateTo({ url: `/pages/product/poster?${params.join('&')}` });
}

module.exports = {
    normalizeProductLaunchOptions,
    captureShareInvite,
    buildProductSharePayload,
    openProductPoster,
    resolveInviteCode,
    formatPriceText
};
