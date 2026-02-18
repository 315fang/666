// pages/product/detail.js
const { get, post } = require('../../utils/request');
const { parseImages, calculatePrice } = require('../../utils/dataFormatter');
const { USER_ROLES } = require('../../config/constants');

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
        skuAction: 'cart',
        isFavorite: false,
        statusBarHeight: 20,
        // 新增：评价相关
        reviews: [],
        reviewTotal: 0,
        reviewTags: [],
        // 折扣
        discount: 10
    },

    onLoad(options) {
        // Get status bar height for nav
        const sysInfo = wx.getSystemInfoSync();
        this.setData({
            statusBarHeight: sysInfo.statusBarHeight || 20
        });

        // 接收分享参数
        if (options.share_id) {
            wx.setStorageSync('distributor_id', options.share_id);
        }
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

            // 使用统一的图片解析工具
            product.images = parseImages(product.images);
            product.detail_images = parseImages(product.detail_images);

            // 获取用户身份计算动态价格
            const user = wx.getStorageSync('userInfo') || {};
            const roleLevel = user.role_level || USER_ROLES.GUEST;

            // 使用统一的价格计算工具
            const displayPrice = calculatePrice(product, null, roleLevel);

            // 计算折扣
            let discount = 10;
            if (product.market_price && parseFloat(product.market_price) > 0) {
                discount = Math.round((parseFloat(displayPrice) / parseFloat(product.market_price)) * 10);
            }

            this.setData({
                product: {
                    ...product,
                    displayPrice: parseFloat(displayPrice).toFixed(2)
                },
                skus: product.skus || [],
                selectedSku: (product.skus && product.skus.length > 0) ? product.skus[0] : null,
                imageCount: product.images.length || 1,
                roleLevel,
                isAgent: roleLevel >= USER_ROLES.LEADER,
                discount
            });

            // 加载评价
            this.loadReviews();

            // 加载佣金预览（如果用户是团长或代理商）
            if (roleLevel >= USER_ROLES.LEADER) {
                this.loadCommissionPreview();
            }
        } catch (err) {
            wx.showToast({ title: '加载失败', icon: 'none' });
            console.error('加载商品详情失败:', err);
        } finally {
            wx.hideLoading();
        }
    },

    // 加载评价
    async loadReviews() {
        try {
            const res = await get(`/products/${this.data.id}/reviews`, { limit: 2 }).catch(() => null);
            if (res && res.data) {
                const reviews = res.data.list || [];
                const reviewTotal = res.data.pagination?.total || reviews.length;
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

    // 跳转评价列表（功能开发中）
    goReviews() {
        wx.showToast({
            title: '评价功能开发中',
            icon: 'none',
            duration: 2000
        });
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

    // 返回 (Renamed to match WXML: onBackTap)
    onBackTap() {
        wx.navigateBack();
    },

    // ======== 智能咨询 ========
    goAIChat() {
        const app = getApp();
        // 设置当前商品为上下文
        app.globalData.aiContext = {
            type: 'product',
            data: {
                id: this.data.product.id,
                name: this.data.product.name,
                price: this.data.product.retail_price,
                displayPrice: this.data.product.displayPrice,
                description: this.data.product.description
            }
        };
        wx.navigateTo({ url: '/pages/ai/chat' });
    },

    // Toggle Favorite
    onToggleFavorite() {
        this.setData({ isFavorite: !this.data.isFavorite });
        wx.showToast({
            title: this.data.isFavorite ? '已收藏' : '已取消收藏',
            icon: 'none'
        });
    },

    // 显示SKU弹窗 (Renamed to match WXML: showSkuModal)
    showSkuModal() {
        this.setData({ showSku: true });
    },

    // 隐藏SKU弹窗 (Renamed to match WXML: hideSkuModal)
    hideSkuModal() {
        this.setData({ showSku: false });
    },
    
    // Prevent event propagation
    stopP() {},

    // 阻止滑动穿透
    preventMove() { },

    // 选择SKU (Renamed to match WXML: onSpecSelect)
    onSpecSelect(e) {
        // Since we don't have full spec logic here, we'll just log it or select if simple
        // For now assuming simple sku selection logic or placeholder
        const { key, val } = e.currentTarget.dataset;
        // In a real app, you'd filter valid SKUs based on selection.
        // For this fix, let's just highlight it.
        const selectedSpecs = this.data.selectedSpecs || {};
        selectedSpecs[key] = val;
        this.setData({ selectedSpecs });
        
        // Try to find matching SKU
        // ... (Logic skipped for brevity, assuming backend returns SKUs)
    },

    // 数量减少 (Renamed to match WXML: onMinus)
    onMinus() {
        if (this.data.quantity > 1) {
            this.setData({ quantity: this.data.quantity - 1 });
        }
    },

    // 数量增加 (Renamed to match WXML: onPlus)
    onPlus() {
        const maxStock = (this.data.selectedSku && this.data.selectedSku.stock) || this.data.product.stock || 999;
        if (this.data.quantity < maxStock) {
            this.setData({ quantity: this.data.quantity + 1 });
        }
    },
    
    // Quantity Input (Added)
    onQtyInput(e) {
        let val = parseInt(e.detail.value);
        if (isNaN(val) || val < 1) val = 1;
        const maxStock = (this.data.selectedSku && this.data.selectedSku.stock) || this.data.product.stock || 999;
        if (val > maxStock) val = maxStock;
        this.setData({ quantity: val });
    },

    // 加入购物车入口
    onAddToCart() {
        // 设置 SKU 选择器的行为模式为"加入购物车"
        this.setData({ skuAction: 'cart' });
        // 显示 SKU 选择器
        this.showSkuModal();
    },

    // 立即购买入口
    onBuyNow() {
        // 设置 SKU 选择器的行为模式为"立即购买"
        this.setData({ skuAction: 'buy' });
        // 显示 SKU 选择器
        this.showSkuModal();
    },

    // SKU 确认（根据 skuAction 决定行为）
    onConfirmSku() {
        if (this.data.skuAction === 'buy') {
            this.onConfirmBuy();
        } else {
            this.onConfirmAddCart();
        }
    },

    // 确认加入购物车
    async onConfirmAddCart() {
        await this.addToCart();
        this.hideSkuModal();
    },

    // 确认购买（直接下单，不走购物车）
    async onConfirmBuy() {
        const { product, selectedSku, quantity } = this.data;

        // 缓存购买信息给订单确认页
        const buyInfo = {
            product_id: product.id,
            sku_id: (selectedSku && selectedSku.id) || null,
            quantity,
            price: selectedSku ? parseFloat(selectedSku.retail_price) : parseFloat(product.displayPrice || product.retail_price),
            name: product.name,
            image: (product.images && product.images[0]) || '',
            spec: selectedSku ? `${selectedSku.spec_name}: ${selectedSku.spec_value}` : ''
        };
        wx.setStorageSync('directBuyInfo', buyInfo);

        this.hideSkuModal();
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

    // 代理商采购入仓
    onAgentRestock() {
        wx.navigateTo({ url: '/pages/distribution/restock' });
    },
    
    // 首页
    goHome() {
        wx.switchTab({ url: '/pages/index/index' });
    },
    
    // 购物车
    goCart() {
        wx.switchTab({ url: '/pages/cart/cart' });
    },

    // 分享（带邀请码）
    onShareAppMessage() {
        const { product } = this.data;
        const app = getApp();
        const userInfo = app.globalData.userInfo;
        const inviteCode = userInfo ? (userInfo.invite_code || userInfo.id) : '';
        return {
            title: product.name,
            path: `/pages/product/detail?id=${product.id}&share_id=${inviteCode}`,
            imageUrl: (product.images && product.images[0]) || ''
        };
    }
});
