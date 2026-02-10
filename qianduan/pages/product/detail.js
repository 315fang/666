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
        skuAction: 'cart', // cart or buy
        isFavorite: false,
        statusBarHeight: 20 // Default fallback
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

            // 处理图片
            if (typeof product.images === 'string') {
                try {
                    product.images = JSON.parse(product.images);
                } catch (e) {
                    product.images = product.images ? [product.images] : [];
                }
            }

            // 处理详情图片
            if (typeof product.detail_images === 'string') {
                try {
                    product.detail_images = JSON.parse(product.detail_images);
                } catch (e) {
                    product.detail_images = product.detail_images ? [product.detail_images] : [];
                }
            }
            if (!product.detail_images) product.detail_images = [];

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

    // 返回 (Renamed to match WXML: onBackTap)
    onBackTap() {
        wx.navigateBack();
    },
    
    // Toggle Favorite (Added as placeholder)
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

    // 选择SKU规格
    // 增强的SKU选择逻辑，支持多规格组合
    onSpecSelect(e) {
        const { key, value } = e.currentTarget.dataset;

        if (!key || !value) {
            console.error('规格选择参数错误', { key, value });
            return;
        }

        // 更新选中的规格
        const selectedSpecs = { ...this.data.selectedSpecs };
        selectedSpecs[key] = value;

        // 查找匹配的SKU
        const matchedSku = this.findMatchingSku(selectedSpecs);

        if (matchedSku) {
            // 找到匹配的SKU
            this.setData({
                selectedSpecs,
                selectedSku: matchedSku,
                displayPrice: matchedSku.retail_price || matchedSku.price || this.data.product.displayPrice,
                quantity: Math.min(this.data.quantity, matchedSku.stock || 999)
            });

            // 如果库存不足，提示用户
            if (matchedSku.stock <= 0) {
                wx.showToast({
                    title: '该规格已售罄',
                    icon: 'none'
                });
            }
        } else {
            // 没有找到匹配的SKU，仅更新选中状态
            this.setData({
                selectedSpecs,
                selectedSku: null
            });

            // 检查是否所有规格都已选择
            const product = this.data.product;
            const allSpecsSelected = product.specs && product.specs.every(spec =>
                selectedSpecs[spec.name]
            );

            if (allSpecsSelected) {
                wx.showToast({
                    title: '该规格组合无货',
                    icon: 'none'
                });
            }
        }
    },

    // 查找匹配的SKU
    // 根据选中的规格组合查找对应的SKU
    findMatchingSku(selectedSpecs) {
        const { product } = this.data;

        if (!product.skus || product.skus.length === 0) {
            return null;
        }

        // 单规格产品：直接返回第一个SKU
        if (product.skus.length === 1) {
            return product.skus[0];
        }

        // 多规格产品：根据规格组合匹配
        return product.skus.find(sku => {
            // 检查SKU的规格值是否与选中的规格完全匹配
            if (!sku.specs) return false;

            // 确保所有选中的规格都匹配
            return Object.keys(selectedSpecs).every(specName => {
                const selectedValue = selectedSpecs[specName];
                const skuSpecValue = sku.specs[specName];
                return skuSpecValue === selectedValue;
            });
        });
    },

    // 检查规格是否可选（库存检查）
    // 用于在UI中禁用无库存的规格选项
    isSpecValueAvailable(specName, specValue) {
        const { product, selectedSpecs } = this.data;

        if (!product.skus || product.skus.length === 0) {
            return true;
        }

        // 构建临时规格组合（包含当前选择）
        const tempSpecs = { ...selectedSpecs, [specName]: specValue };

        // 检查是否有匹配的SKU且有库存
        const hasStock = product.skus.some(sku => {
            if (!sku.specs) return false;

            // 检查是否匹配已选规格
            const matches = Object.keys(tempSpecs).every(key => {
                return sku.specs[key] === tempSpecs[key];
            });

            return matches && (sku.stock > 0);
        });

        return hasStock;
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
        this.setData({ skuAction: 'cart' });
        // If sku not showing, show it
        if (!this.data.showSku) {
            this.showSkuModal();
        } else {
             // Confirm logic
             this.onConfirmAddCart();
        }
    },

    // 立即购买入口
    onBuyNow() {
        this.setData({ skuAction: 'buy' });
        // If sku not showing, show it
        if (!this.data.showSku) {
            this.showSkuModal();
        } else {
             // Confirm logic
             this.onConfirmBuy();
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
