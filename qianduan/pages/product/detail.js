// pages/product/detail.js
const { get, post } = require('../../utils/request');

Page({
    data: {
        id: null,
        product: {},
        skus: [],
        selectedSku: null,
        quantity: 1,
        currentImage: 0,
        imageCount: 1,
        showSku: false,
        cartCount: 0,
        skuAction: 'cart' // cart or buy
    },

    onLoad(options) {
        if (options.id) {
            this.setData({ id: options.id });
            this.loadProduct(options.id);
        }
    },

    onShow() {
        this.getCartCount();
    },

    // 加载商品详情
    async loadProduct(id) {
        wx.showLoading({ title: '加载中...' });

        try {
            const res = await get(`/products/${id}`);
            const product = res.data || {};

            // 处理图片
            if (typeof product.images === 'string') {
                try {
                    product.images = JSON.parse(product.images);
                } catch (e) {
                    product.images = product.images ? [product.images] : [];
                }
            }

            // 获取用户身份计算动态价格
            const user = wx.getStorageSync('userInfo') || {};
            const roleLevel = user.role_level || 0;

            let displayPrice = product.retail_price;
            if (roleLevel === 1) {
                displayPrice = product.price_member || product.retail_price;
            } else if (roleLevel === 2) {
                displayPrice = product.price_leader || product.price_member || product.retail_price;
            } else if (roleLevel === 3) {
                displayPrice = product.price_agent || product.price_leader || product.price_member || product.retail_price;
            }

            this.setData({
                product: {
                    ...product,
                    displayPrice: parseFloat(displayPrice).toFixed(2)
                },
                skus: product.skus || [],
                selectedSku: (product.skus && product.skus.length > 0) ? product.skus[0] : null,
                imageCount: (product.images && product.images.length) || 1,
                roleLevel
            });

            wx.hideLoading();
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '加载失败', icon: 'none' });
            console.error('加载商品详情失败:', err);
        }
    },

    // 获取购物车数量
    async getCartCount() {
        try {
            const res = await get('/cart').catch(() => null);
            if (res && res.data) {
                const items = res.data.items || res.data || [];
                const count = Array.isArray(items) ? items.reduce((sum, item) => sum + item.quantity, 0) : 0;
                this.setData({ cartCount: count });
            }
        } catch (err) {
            console.error('获取购物车数量失败:', err);
        }
    },

    // 图片切换
    onImageChange(e) {
        this.setData({ currentImage: e.detail.current });
    },

    // 图片预览
    onPreviewImage(e) {
        const index = e.currentTarget.dataset.index;
        wx.previewImage({
            current: this.data.product.images[index],
            urls: this.data.product.images
        });
    },

    // 返回
    onBack() {
        wx.navigateBack();
    },

    // 显示SKU弹窗
    onShowSku() {
        this.setData({ showSku: true });
    },

    // 隐藏SKU弹窗
    onHideSku() {
        this.setData({ showSku: false });
    },

    // 阻止滑动穿透
    preventMove() { },

    // 选择SKU
    onSelectSku(e) {
        const sku = e.currentTarget.dataset.sku;
        if (sku.stock <= 0) return;
        this.setData({ selectedSku: sku });
    },

    // 数量减少
    onQuantityMinus() {
        if (this.data.quantity > 1) {
            this.setData({ quantity: this.data.quantity - 1 });
        }
    },

    // 数量增加
    onQuantityPlus() {
        const maxStock = (this.data.selectedSku && this.data.selectedSku.stock) || this.data.product.stock || 999;
        if (this.data.quantity < maxStock) {
            this.setData({ quantity: this.data.quantity + 1 });
        }
    },

    // 加入购物车入口
    onAddToCart() {
        this.setData({ skuAction: 'cart', showSku: true });
    },

    // 立即购买入口
    onBuyNow() {
        this.setData({ skuAction: 'buy', showSku: true });
    },

    // 确认加入购物车
    async onConfirmAddCart() {
        await this.addToCart();
        this.onHideSku();
    },

    // 确认购买
    async onConfirmBuy() {
        await this.addToCart();
        this.onHideSku();
        wx.navigateTo({ url: '/pages/order/confirm?from=direct' });
    },

    // 加入购物车
    async addToCart() {
        const { product, selectedSku, quantity } = this.data;

        try {
            wx.showLoading({ title: '加入购物车...' });

            await post('/cart', {
                product_id: product.id,
                sku_id: (selectedSku && selectedSku.id) || null,
                quantity
            });

            wx.hideLoading();
            wx.showToast({ title: '已加入购物车', icon: 'success' });

            this.getCartCount();
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '加入失败', icon: 'none' });
            console.error('加入购物车失败:', err);
        }
    },

    // 联系客服
    onCustomerService() {
        wx.showToast({ title: '请点击客服按钮', icon: 'none' });
    },

    // 分享
    onShareAppMessage() {
        const { product } = this.data;
        return {
            title: product.name,
            path: `/pages/product/detail?id=${product.id}`,
            imageUrl: (product.images && product.images[0]) || ''
        };
    }
});
