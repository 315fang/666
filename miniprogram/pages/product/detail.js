// pages/product/detail.js
const { get } = require('../../utils/request');
const { normalizeProductId } = require('../../utils/dataFormatter');
const { USER_ROLES } = require('../../config/constants');
const { safeBack } = require('../../utils/navigator');
const { loadProduct, resolvePayableUnitPrice } = require('./productDetailData');
const { refreshFavoriteState, toggleFavorite } = require('./productDetailFavorite');
const {
    onSpecSelect,
    getMaxStock,
    onMinus,
    onPlus,
    onQtyInput,
    onBuyNow,
    addToCart
} = require('./productDetailActions');
const app = getApp();

Page({
    data: {
        id: null,
        product: {},
        skus: [],
        selectedSku: null,
        selectedSkuText: '',
        selectedSpecs: {},
        quantity: 1,
        currentImage: 0,
        imageCount: 1,
        isFavorite: false,
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        reviews: [],
        reviewTotal: 0,
        reviewTags: [],
        discount: 10,
        currentPrice: '',
        currentStock: 0,
        isOutOfStock: false,
        detailImageList: [],
        hasRichDetail: false,
        roleLevel: USER_ROLES.GUEST,
        isAgent: false,
        commission: '0.00',
        pageLoading: true,
        servicePledges: []
    },

    onLoad(options) {
        // Get status bar height for nav
        const roleLevel = app.globalData.userInfo?.role_level || 0;

        this.setData({
            statusBarHeight: app.globalData.statusBarHeight,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44,
            roleLevel
        });

        if (!options.id) {
            return;
        }

        const normalizedId = normalizeProductId(options.id);

        // 视频号直播商品、商品橱窗等：apiCategory 为 nativeFunctionalized 时，微信会套一层原生购买壳并出现「查看完整详情」。
        // 对同一路径 reLaunch 一次，多数环境下可回到全屏自有详情页（仅一次，避免循环）。不处理 embedded，以免误伤「半屏打开小程序」宿主场景。
        let apiCategory = '';
        try {
            if (typeof wx.getEnterOptionsSync === 'function') {
                apiCategory = wx.getEnterOptionsSync().apiCategory || '';
            }
        } catch (_) {
            /* ignore */
        }

        if (apiCategory === 'nativeFunctionalized') {
            const rid = String(normalizedId);
            const prev = app.globalData.productDetailNfRelaunchKey;
            if (prev !== rid) {
                app.globalData.productDetailNfRelaunchKey = rid;
                wx.reLaunch({
                    url: `/pages/product/detail?id=${encodeURIComponent(rid)}`,
                    fail: () => {
                        app.globalData.productDetailNfRelaunchKey = '';
                        this.setData({ id: normalizedId });
                        this.loadProduct(normalizedId);
                    }
                });
                return;
            }
            app.globalData.productDetailNfRelaunchKey = '';
        }

        this.setData({ id: normalizedId });
        this.loadProduct(normalizedId);
    },

    onShow() {
        if (this.data.product && this.data.product.id != null) {
            this.refreshFavoriteState();
        }
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
    },

    onUnload() {},

    // 加载商品详情
    async loadProduct(id) {
        return loadProduct(this, id);
    },

    // 加载评价
    async loadReviews() {
        try {
            const res = await get(`/products/${this.data.id}/reviews`, { limit: 2 }).catch(() => null);
            if (res && res.data) {
                const reviews = res.data.list || [];
                const reviewTotal = res.data.pagination?.total || res.data.total || reviews.length;
                // 生成评价标签
                const reviewTags = this.generateReviewTags(reviews);
                this.setData({ reviews, reviewTotal, reviewTags });
            }
        } catch (err) {
            console.log('暂无评价数据');
        }
    },

    // 生成评价标签
    generateReviewTags(reviews) {
        const tags = [];
        const keywords = ['质量好', '物流快', '包装精美', '性价比高', '颜色正', '尺码准'];
        reviews.forEach((r, i) => {
            if (i < 3) tags.push(keywords[i % keywords.length]);
        });
        return tags;
    },

    // 加载佣金预览
    async loadCommissionPreview() {
        try {
            const { id, selectedSku, quantity } = this.data;
            const params = {
                product_id: id,
                quantity: quantity || 1
            };

            if (selectedSku) {
                params.sku_id = selectedSku.id;
            }

            const res = await get('/commissions/preview', params);

            if (res.code === 0 && res.data) {
                const data = res.data;

                // 计算我可以获得的佣金
                const myCommission = data.commissions
                    .filter(c => c.level === 0 || c.level === 1)
                    .reduce((sum, c) => sum + c.amount, 0);

                this.setData({
                    commission: myCommission.toFixed(2),
                    commissionDetail: data,
                    showCommissionTip: true
                });
            }
        } catch (err) {
            console.error('加载佣金预览失败:', err);
            // 不影响主流程，静默失败
        }
    },

    // 获取购物袋数量
    // 图片切换
    onImageChange(e) {
        this.setData({ currentImage: e.detail.current });
    },

    // 图片预览
    onPreviewImage(e) {
        const images = this.data.product.images || [];
        const index = Number(e.currentTarget.dataset.index || 0);
        if (!images.length) return;
        wx.previewImage({
            current: images[index] || images[0],
            urls: images
        });
    },

    onPreviewDetailImage(e) {
        const images = this.data.detailImageList || [];
        const index = Number(e.currentTarget.dataset.index || 0);
        if (!images.length) return;
        wx.previewImage({
            current: images[index] || images[0],
            urls: images
        });
    },

    // 返回 (Renamed to match WXML: onBackTap)
    onBackTap() {
        safeBack();
    },

    async refreshFavoriteState() {
        return refreshFavoriteState(this);
    },

    async onToggleFavorite() {
        return toggleFavorite(this);
    },

    // 选择规格
    onSpecSelect(e) {
        return onSpecSelect(this, e, resolvePayableUnitPrice);
    },

    getMaxStock() {
        return getMaxStock(this);
    },

    // 数量减少 (Renamed to match WXML: onMinus)
    onMinus() {
        return onMinus(this);
    },

    // 数量增加 (Renamed to match WXML: onPlus)
    onPlus() {
        return onPlus(this);
    },

    // Quantity Input (Added)
    onQtyInput(e) {
        return onQtyInput(this, e);
    },

    /** 详情页「到店自提」仅为说明；不支持则提示，支持则引导至下单页切换 */
    onDeliveryPreviewPickupTap() {
        const pu = Number(this.data.product && this.data.product.supports_pickup);
        if (!pu) {
            wx.showToast({
                title: '该商品不支持到店自提，将为您快递配送',
                icon: 'none',
                duration: 2800
            });
            return;
        }
        wx.showToast({
            title: '立即购买或去购物袋结算后，在确认订单页切换为到店自提',
            icon: 'none',
            duration: 2800
        });
    },

    // 加入购物袋入口（防重复点击）
    onAddToCart() {
        if (this._addingToCart) return;
        if (this.data.isOutOfStock) {
            wx.showToast({ title: '该商品暂时缺货', icon: 'none' });
            return;
        }
        this.addToCart();
    },

    onBuyNow() {
        return onBuyNow(this, resolvePayableUnitPrice);
    },

    // 加入购物袋
    async addToCart() {
        return addToCart(this);
    },

    // 触发飞入购物袋动画（使用 brand-animation 组件）
    triggerFlyAnim() {
        if (!this.brandAnimation) {
            this.brandAnimation = this.selectComponent('#brandAnimation');
        }
        if (!this.brandAnimation) return;

        const sysInfo = wx.getSystemInfoSync();
        // 起点：商品图中心
        const startX = sysInfo.windowWidth / 2;
        const startY = sysInfo.windowHeight * 0.3;

        // 终点：查询购物袋图标位置
        const query = wx.createSelectorQuery().in(this);
        query.select('.fly-cart-target').boundingClientRect((rect) => {
            const endX = rect ? rect.left + rect.width / 2 : sysInfo.windowWidth * 0.35;
            const endY = rect ? rect.top + rect.height / 2 : sysInfo.windowHeight - 50;

            const image = this.data.product.images && this.data.product.images[0] || '';
            this.brandAnimation.flyToCart(startX, startY, endX, endY, image);
        }).exec();
    },

    // 联系客服
    onCustomerService() {
        wx.showToast({ title: '请点击客服按钮', icon: 'none' });
    },

    // 代理商采购入仓
    onAgentRestock() {
        wx.navigateTo({ url: '/pages/distribution/stock-logs' });
    },

    // 分享商品详情
    onShareAppMessage() {
        const { product } = this.data;
        const path = `/pages/product/detail?id=${product.id}`;
        return {
            title: product.name,
            path,
            imageUrl: (product.images && product.images[0]) || ''
        };
    }
});
