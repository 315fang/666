const app = getApp();
const { get } = require('../../utils/request');
const { navigateToLimitedSpotProduct, normalizeLimitedSpotMode } = require('../../utils/limitedSpot');

function preferredMode(offer) {
    return normalizeLimitedSpotMode('', offer);
}

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        cardId: '',
        card: null,
        products: [],
        loading: true
    },

    onLoad(query) {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navBarHeight: app.globalData.navBarHeight || 44,
            cardId: query.id || query.card_id || ''
        });
        this.loadDetail();
    },

    onBack() {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/activity/activity' }) });
    },

    async loadDetail() {
        this.setData({ loading: true });
        try {
            const params = this.data.cardId ? { card_id: this.data.cardId } : {};
            const res = await get('/activity/limited-spot/detail', params);
            if (res.code !== 0 || !res.data) {
                throw new Error(res.message || '加载失败');
            }
            this.setData({
                card: res.data.card || null,
                cardId: (res.data.card && (res.data.card.id || '')) || this.data.cardId,
                products: Array.isArray(res.data.products) ? res.data.products : [],
                loading: false
            });
        } catch (e) {
            this.setData({ loading: false, card: null, products: [] });
            wx.showToast({ title: e.message || '加载失败', icon: 'none' });
        }
    },

    _findOffer(offerId) {
        return (this.data.products || []).find((item) => String(item.offer_id) === String(offerId)) || null;
    },

    openOffer(offer, mode) {
        if (!offer || !offer.product_id) return;
        navigateToLimitedSpotProduct({
            productId: offer.product_id,
            cardId: this.data.cardId,
            offerId: offer.offer_id,
            mode: normalizeLimitedSpotMode(mode, offer)
        });
    },

    onOpenDetail(e) {
        const offer = this._findOffer(e.currentTarget.dataset.offerId);
        this.openOffer(offer, preferredMode(offer));
    },

    onOpenMoney(e) {
        const offer = this._findOffer(e.currentTarget.dataset.offerId);
        this.openOffer(offer, 'money');
    },

    onOpenPoints(e) {
        const offer = this._findOffer(e.currentTarget.dataset.offerId);
        this.openOffer(offer, 'points');
    },

    onGoodsImageError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const products = Array.isArray(this.data.products) ? this.data.products.slice() : [];
        if (!products[index]) return;
        const product = {
            ...(products[index].product || {}),
            images: ['/assets/images/placeholder.svg']
        };
        products[index] = {
            ...products[index],
            product
        };
        this.setData({ products });
    },

    onShareAppMessage() {
        const card = this.data.card || {};
        const cardId = this.data.cardId || '';
        return {
            title: card.title || '限时专享商品',
            path: cardId ? `/pages/activity/limited-spot?id=${encodeURIComponent(cardId)}` : '/pages/activity/limited-spot'
        };
    }
});
