const { get } = require('../../utils/request');
const { normalizeProductId, resolveProductDisplayPrice } = require('../../utils/dataFormatter');
const { resolveRenderableImageList } = require('../../utils/cloudAssetRuntime');
const { ProductPosterCore } = require('./utils/productPosterCore');
const { collectProductGallerySources, PRODUCT_PLACEHOLDER } = require('./productDetailData');
const { formatPriceText, resolveInviteCode } = require('./productDetailShare');

const app = getApp();

function buildShareQuery(productId, inviteCode = '', coupon = null) {
    const params = [`id=${encodeURIComponent(String(productId || ''))}`];
    if (inviteCode) params.push(`invite=${encodeURIComponent(String(inviteCode))}`);
    if (coupon && (coupon.coupon_id || coupon.id)) {
        params.push(`cid=${encodeURIComponent(String(coupon.coupon_id || coupon.id))}`);
    }
    if (coupon && (coupon.ticket || coupon.ticket_id)) {
        params.push(`ticket=${encodeURIComponent(String(coupon.ticket || coupon.ticket_id))}`);
    }
    return params.join('&');
}

function readPosterDraft(productId) {
    try {
        const draft = wx.getStorageSync('productPosterDraft');
        if (draft && String(draft.id) === String(productId)) return draft;
    } catch (_) {
        // ignore storage failures
    }
    return null;
}

function normalizePosterProduct(draft = {}) {
    return {
        id: normalizeProductId(draft.id),
        name: draft.name || '问兰甄选好物',
        price: formatPriceText(draft.price) || '0',
        marketPrice: formatPriceText(draft.marketPrice),
        image: draft.image || '',
        specText: draft.specText || ''
    };
}

function normalizePosterCoupon(raw = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.coupon_id || raw.id || '';
    if (!id && !(raw.ticket || raw.ticket_id)) return null;
    const type = String(raw.coupon_type || raw.type || '').toLowerCase();
    const value = Number(raw.coupon_value != null ? raw.coupon_value : raw.value);
    let valueText = raw.valueText || '';
    if (!valueText && Number.isFinite(value)) {
        if (type === 'percent') {
            const discount = value <= 1 ? value * 10 : value;
            valueText = `${discount % 1 === 0 ? discount.toFixed(0) : discount.toFixed(1)}折`;
        } else {
            valueText = `¥${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
        }
    }
    const minPurchase = Number(raw.min_purchase || 0);
    return {
        id,
        coupon_id: id,
        ticket: raw.ticket || '',
        ticket_id: raw.ticket_id || '',
        name: raw.name || raw.coupon_name || '优惠券',
        coupon_name: raw.coupon_name || raw.name || '优惠券',
        valueText,
        thresholdText: raw.thresholdText || (minPurchase > 0 ? `满${minPurchase % 1 === 0 ? minPurchase.toFixed(0) : minPurchase.toFixed(2)}可用` : '无门槛'),
        poster_badge_text: raw.poster_badge_text || ''
    };
}

Page({
    data: {
        id: '',
        inviteCode: '',
        statusBarHeight: 20,
        navBarHeight: 44,
        product: {},
        coupon: null,
        posterGenerating: false,
        posterImagePath: '',
        posterPreviewReady: false,
        loadError: ''
    },

    onLoad(options = {}) {
        const id = normalizeProductId(options.id || options.product_id || '');
        const inviteCode = String(options.invite || '').trim() || resolveInviteCode(app);
        const couponId = String(options.cid || options.coupon_id || '').trim();
        const ticketId = String(options.ticket || options.ticket_id || options.t || '').trim();
        this.setData({
            id,
            inviteCode,
            coupon: couponId || ticketId ? { coupon_id: couponId, id: couponId, ticket: ticketId, ticket_id: ticketId } : null,
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navBarHeight: app.globalData.navBarHeight || 44
        });
        if (!id) {
            this.setData({ loadError: '商品参数错误' });
            wx.showToast({ title: '商品参数错误', icon: 'none' });
            return;
        }
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
        this.loadPosterProduct(id);
    },

    async loadPosterProduct(id) {
        const draft = readPosterDraft(id);
        if (draft) {
            this.setData({
                product: normalizePosterProduct(draft),
                coupon: normalizePosterCoupon(draft.coupon) || this.data.coupon,
                loadError: ''
            });
            await this.generatePoster();
            return;
        }

        try {
            wx.showLoading({ title: '加载商品...' });
            const res = await get(`/products/${id}`, {}, { showError: false });
            const product = res.data || res || {};
            const roleLevel = app.globalData.userInfo && app.globalData.userInfo.role_level || 0;
            const gallerySources = collectProductGallerySources(product);
            const images = await resolveRenderableImageList(
                gallerySources.length ? gallerySources : [product.image_url || product.image || PRODUCT_PLACEHOLDER],
                PRODUCT_PLACEHOLDER
            );
            const price = resolveProductDisplayPrice(product, roleLevel);
            const posterProduct = normalizePosterProduct({
                id: product.id || product._id || id,
                name: product.name,
                price,
                marketPrice: product.market_price || product.original_price || '',
                image: images[0] || PRODUCT_PLACEHOLDER,
                specText: product.specSummary || product.default_spec_text || ''
            });
            this.setData({ product: posterProduct, loadError: '' });
            await this.generatePoster();
        } catch (err) {
            console.error('加载商品海报数据失败:', err);
            this.setData({ loadError: '商品海报加载失败' });
            wx.showToast({ title: '商品海报加载失败', icon: 'none' });
        } finally {
            wx.hideLoading();
        }
    },

    onBack() {
        wx.navigateBack();
    },

    async generatePoster() {
        if (this.data.posterGenerating) return;
        const product = this.data.product || {};
        if (!product.id) return;

        this.setData({
            posterGenerating: true,
            posterImagePath: '',
            posterPreviewReady: false
        });

        try {
            const core = new ProductPosterCore(this, { canvasSelector: '#productPosterCanvas' });
            const tempPath = await core.generateToTempPath({
                product,
                inviteCode: this.data.inviteCode || '',
                coupon: this.data.coupon || null
            });
            this.setData({
                posterImagePath: tempPath,
                posterPreviewReady: false
            });
        } catch (err) {
            console.error('生成商品海报失败:', err);
            const msg = err && err.message ? String(err.message) : '';
            wx.showToast({
                title: msg.length > 18 ? '海报生成失败，请重试' : (msg || '海报生成失败，请重试'),
                icon: 'none'
            });
        } finally {
            this.setData({ posterGenerating: false });
        }
    },

    onRegeneratePoster() {
        this.generatePoster();
    },

    onPosterImageLoad() {
        if (!this.data.posterPreviewReady) {
            this.setData({ posterPreviewReady: true });
        }
    },

    onPosterImageError(err) {
        console.error('商品海报预览加载失败:', err);
        this.setData({ posterImagePath: '', posterPreviewReady: false });
        wx.showToast({ title: '海报预览失败，请重试', icon: 'none' });
    },

    onSavePoster() {
        const { posterImagePath, posterPreviewReady } = this.data;
        if (!posterImagePath || !posterPreviewReady) {
            wx.showToast({ title: '海报加载中，请稍候', icon: 'none' });
            return;
        }
        wx.saveImageToPhotosAlbum({
            filePath: posterImagePath,
            success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
            fail: (err) => {
                if (err.errMsg && err.errMsg.includes('auth deny')) {
                    wx.showModal({
                        title: '需要相册权限',
                        content: '请在设置中开启相册访问权限',
                        confirmText: '去设置',
                        success: (r) => {
                            if (r.confirm) wx.openSetting();
                        }
                    });
                } else {
                    wx.showToast({ title: '保存失败', icon: 'none' });
                }
            }
        });
    },

    onShareAppMessage() {
        const product = this.data.product || {};
        const query = buildShareQuery(product.id || this.data.id, this.data.inviteCode, this.data.coupon);
        return {
            title: product.price ? `¥${product.price} ${product.name}` : product.name,
            path: `/pages/product/detail?${query}`,
            imageUrl: this.data.posterImagePath || product.image || ''
        };
    },

    onShareTimeline() {
        const product = this.data.product || {};
        return {
            title: product.price ? `¥${product.price} ${product.name}` : product.name,
            query: buildShareQuery(product.id || this.data.id, this.data.inviteCode, this.data.coupon),
            imageUrl: this.data.posterImagePath || product.image || ''
        };
    }
});
