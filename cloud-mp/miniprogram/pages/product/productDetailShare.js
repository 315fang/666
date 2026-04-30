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

function parseQueryLike(value) {
    const result = {};
    const text = decodeSceneValue(value).trim();
    if (!text) return result;

    const withoutHash = text.split('#')[0];
    const queryText = withoutHash.includes('?')
        ? withoutHash.slice(withoutHash.indexOf('?') + 1)
        : withoutHash;
    if (!queryText) return result;

    queryText.split('&').forEach((pair) => {
        const [rawKey, ...rawValueParts] = pair.split('=');
        const key = decodeSceneValue(rawKey || '').trim();
        if (!key) return;
        result[key] = decodeSceneValue(rawValueParts.join('=') || '').trim();
    });

    if (result.scene) {
        Object.assign(result, parseScene(result.scene));
    }
    return result;
}

function normalizeProductLaunchOptions(options = {}) {
    const scene = parseScene(options.scene || '');
    const q = parseQueryLike(options.q || '');
    return {
        ...options,
        id: options.id || options.product_id || scene.pid || scene.product_id || scene.id || scene.p || q.id || q.product_id || q.pid || q.p || '',
        invite: options.invite || scene.i || scene.invite || q.invite || q.i || '',
        coupon_id: options.coupon_id || options.cid || scene.cid || scene.coupon_id || q.cid || q.coupon_id || '',
        ticket: options.ticket || options.ticket_id || options.t || scene.ticket || scene.ticket_id || scene.t || q.ticket || q.ticket_id || q.t || ''
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

function resolveSelectedPosterCoupon(page) {
    const data = page.data || {};
    if (data.selectedPosterCoupon && (data.selectedPosterCoupon.id || data.selectedPosterCoupon.coupon_id)) {
        return data.selectedPosterCoupon;
    }
    const selectedId = String(data.selectedPosterCouponId || '').trim();
    if (!selectedId) return null;
    return (data.posterCouponOptions || []).find((item) => String(item.id || item.coupon_id || '') === selectedId) || null;
}

function buildProductShareQuery(page, options = {}) {
    const data = page.data || {};
    const product = data.product || {};
    const app = getApp();
    const params = [];
    const coupon = options.coupon === undefined ? resolveSelectedPosterCoupon(page) : options.coupon;
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
    if (coupon) {
        appendQueryParam(params, 'cid', coupon.coupon_id || coupon.id);
        if (coupon.ticket_id || coupon.ticket) appendQueryParam(params, 'ticket', coupon.ticket_id || coupon.ticket);
    }
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
    const coupon = resolveSelectedPosterCoupon(page);

    return {
        id: normalizeProductId(product.id || data.id),
        name: product.name || '',
        price: formatPriceText(price),
        marketPrice: formatPriceText(marketPrice),
        image: currentImage,
        specText: data.selectedSkuText || product.specSummary || '',
        shareQuery: buildProductShareQuery(page, { coupon }),
        inviteCode: resolveInviteCode(getApp()),
        coupon: coupon ? {
            id: coupon.id || coupon.coupon_id || '',
            coupon_id: coupon.coupon_id || coupon.id || '',
            name: coupon.name || coupon.coupon_name || '',
            coupon_name: coupon.coupon_name || coupon.name || '',
            type: coupon.type || coupon.coupon_type || '',
            coupon_type: coupon.coupon_type || coupon.type || '',
            value: coupon.value != null ? coupon.value : coupon.coupon_value,
            coupon_value: coupon.coupon_value != null ? coupon.coupon_value : coupon.value,
            min_purchase: coupon.min_purchase || 0,
            valueText: coupon.valueText || '',
            thresholdText: coupon.thresholdText || '',
            poster_badge_text: coupon.poster_badge_text || '',
            ticket: coupon.ticket || '',
            ticket_id: coupon.ticket_id || ''
        } : null
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
    if (draft.coupon && (draft.coupon.coupon_id || draft.coupon.id)) {
        params.push(`cid=${encodeURIComponent(String(draft.coupon.coupon_id || draft.coupon.id))}`);
    }
    if (draft.coupon && (draft.coupon.ticket || draft.coupon.ticket_id)) {
        params.push(`ticket=${encodeURIComponent(String(draft.coupon.ticket || draft.coupon.ticket_id))}`);
    }
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
