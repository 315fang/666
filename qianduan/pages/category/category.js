// pages/category/category.js
const { get, post } = require('../../utils/request');
const { getFirstImage, formatMoney, parseImages, calculatePrice } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');
const { USER_ROLES } = require('../../config/constants');
const app = getApp();

Page({
    data: {
        // 分类与产品数据
        categories: [],
        currentCategory: '',
        
        // 滚动联动相关
        toView: '',
        leftToView: '',
        categoryHeights: [], 
        isManualClick: false, // 标记是否为手动点击左侧菜单，防止滚动监听冲突
        
        loading: false,
        statusBarHeight: 20,

        // Cart
        cartCount: 0,
        cartTotal: '0.00',

        // Detail Modal
        showDetailModal: false,
        selectedProduct: null,
        currentImage: 0,
        imageCount: 1,
        isFavorite: false,

        // SKU in Modal
        showSku: false,
        skuAction: 'cart',
        modalQuantity: 1,
        selectedSku: null,
        selectedSkuText: '',
        selectedSkuImg: '',
        currentPrice: null,
        currentStock: null,
        discount: 10,

        // 飞入动画
        flyImage: ''
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
    },

    onShow() {
        this.updateCartData();
    },

    onLoad() {
        const sysInfo = wx.getSystemInfoSync();
        this.setData({
            statusBarHeight: sysInfo.statusBarHeight || 20
        });
        this.initCategoryData();
    },

    // 初始化分类及商品数据（连贯排列逻辑）
    async initCategoryData() {
        this.setData({ loading: true });
        try {
            // 1. 获取分类树
            const catRes = await get('/categories/tree');
            const rawCats = (catRes.data || catRes || []);
            // 取一级分类（或直接平铺，取决于后端返回结构）
            const topCats = Array.isArray(rawCats) ? rawCats : [];

            if (topCats.length === 0) {
                this.setData({ loading: false });
                return;
            }

            // 2. 并行拉取每个分类下的商品（最多取前 20 个分类）
            const slice = topCats.slice(0, 20);
            const productResults = await Promise.all(
                slice.map(cat =>
                    get('/products', { category_id: cat.id, limit: 10 })
                        .then(r => (r.data && r.data.list) ? r.data.list : (Array.isArray(r.data) ? r.data : []))
                        .catch(() => [])
                )
            );

            const categories = slice.map((cat, idx) => ({
                id: String(cat.id),
                name: cat.name,
                products: productResults[idx].map(p => ({
                    ...p,
                    image: getFirstImage(p.images)
                }))
            }));

            this.setData({
                categories,
                currentCategory: categories[0] ? String(categories[0].id) : '',
                loading: false
            });

            // 数据渲染后计算各分类高度
            setTimeout(() => {
                this.calculateCategoryHeights();
            }, 500);

        } catch (err) {
            console.error('初始化分类数据失败:', err);
            this.setData({ loading: false });
        }
    },

    // 计算右侧各分类区域的高度，用于滚动监听
    calculateCategoryHeights() {
        const query = wx.createSelectorQuery();
        query.selectAll('.cat-section').boundingClientRect();
        query.exec((res) => {
            let top = 0;
            const heights = res[0].map(rect => {
                const range = [top, top + rect.height];
                top += rect.height;
                return range;
            });
            this.setData({ categoryHeights: heights });
        });
    },

    // 左侧菜单点击
    onCategoryTap(e) {
        const id = e.currentTarget.dataset.id;
        this.setData({
            currentCategory: id,
            toView: `cat-${id}`,
            leftToView: `left-${id}`,
            isManualClick: true
        });
        
        // 动画结束后释放标记
        setTimeout(() => {
            this.setData({ isManualClick: false });
        }, 800);
    },

    // 右侧滚动监听
    onRightScroll(e) {
        if (this.data.isManualClick) return; // 手动点击中，不执行监听逻辑

        const scrollTop = e.detail.scrollTop;
        const { categoryHeights, categories } = this.data;
        
        // 增加 100rpx 的偏移量，当标题接近顶部时即切换
        const offset = 50; 
        
        for (let i = 0; i < categoryHeights.length; i++) {
            if (scrollTop + offset >= categoryHeights[i][0] && scrollTop + offset < categoryHeights[i][1]) {
                const catId = categories[i].id;
                if (this.data.currentCategory !== catId) {
                    this.setData({ 
                        currentCategory: catId,
                        leftToView: `left-${catId}` // 同步滚动左侧菜单
                    });
                }
                break;
            }
        }
    },

    // --- Full Screen Modal Logic ---

    // Open Detail Modal (Replaces onQuickAddToCart for "选购")
    async onSelectProduct(e) {
        const item = e.currentTarget.dataset.item;
        if (!item) return;

        this.setData({
            showDetailModal: true,
            selectedProduct: item // Temporary data while loading full details
        });

        this.loadProductDetail(item.id);
    },

    hideDetailModal() {
        this.setData({ showDetailModal: false, showSku: false });
    },

    async loadProductDetail(id) {
        wx.showLoading({ title: '加载详情...' });
        try {
            const res = await get(`/products/${id}`);
            const product = res.data || {};

            product.images = parseImages(product.images);
            product.detail_images = parseImages(product.detail_images);

            const user = wx.getStorageSync('userInfo') || {};
            const roleLevel = user.role_level || USER_ROLES.GUEST;
            const displayPrice = calculatePrice(product, null, roleLevel);

            let discount = 10;
            if (product.market_price && parseFloat(product.market_price) > 0) {
                discount = Math.round((parseFloat(displayPrice) / parseFloat(product.market_price)) * 10);
            }

            this.setData({
                selectedProduct: {
                    ...product,
                    displayPrice: parseFloat(displayPrice).toFixed(2)
                },
                skus: product.skus || [],
                selectedSku: (product.skus && product.skus.length > 0) ? product.skus[0] : null,
                imageCount: product.images.length || 1,
                discount,
                modalQuantity: 1
            });

            // Load Reviews
            this.loadReviews(id);

        } catch (err) {
            console.error('加载详情失败', err);
            wx.showToast({ title: '加载失败', icon: 'none' });
        } finally {
            wx.hideLoading();
        }
    },

    async loadReviews(id) {
        try {
            const res = await get(`/products/${id}/reviews`, { limit: 2 }).catch(() => null);
            if (res && res.data) {
                const reviews = res.data.list || [];
                const reviewTotal = res.data.pagination?.total || reviews.length;
                this.setData({
                    reviews,
                    reviewTotal,
                    reviewTags: ['质量好', '物流快', '包装精美'] // Mock tags
                });
            } else {
                this.setData({ reviews: [], reviewTotal: 0 });
            }
        } catch (err) {
            console.log('No reviews');
        }
    },

    onImageChange(e) {
        this.setData({ currentImage: e.detail.current });
    },

    onPreviewImage(e) {
        const src = e.currentTarget.dataset.src;
        wx.previewImage({
            current: src,
            urls: this.data.selectedProduct.images
        });
    },

    onToggleFavorite() {
        this.setData({ isFavorite: !this.data.isFavorite });
        wx.showToast({ title: this.data.isFavorite ? '已收藏' : '取消收藏', icon: 'none' });
    },

    // SKU Modal Logic
    showSkuModal() {
        this.setData({ showSku: true });
    },

    hideSkuModal() {
        this.setData({ showSku: false });
    },

    // 加入购物车 - 直接执行 + 飞入动画
    async onAddToCart() {
        if (!this.data.selectedProduct) return;
        try {
            wx.showLoading({ title: '加入中' });
            await post('/cart', {
                product_id: this.data.selectedProduct.id,
                quantity: this.data.modalQuantity
            });
            wx.hideLoading();

            // 触发飞入购物车动画
            this.triggerFlyAnimation();

            // 显示成功提示
            wx.showToast({ title: '已加入购物车', icon: 'success' });
            this.hideDetailModal();
            this.updateCartData();
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '加入失败', icon: 'none' });
        }
    },

    // 触发飞入购物车动画
    triggerFlyAnimation() {
        const product = this.data.selectedProduct;
        if (!product) return;

        // 设置飞入图片
        this.setData({
            flyImage: product.images?.[0] || product.image || ''
        });

        // 使用品牌动画组件
        if (this.brandAnimation) {
            // 获取购物车图标位置（底部栏右侧）
            const query = wx.createSelectorQuery();
            query.select('.cart-checkout-btn').boundingClientRect();
            query.exec((res) => {
                if (res[0]) {
                    const endX = res[0].left + res[0].width / 2;
                    const endY = res[0].top;
                    // 从屏幕中心开始飞
                    const startX = 375 / 2; // 假设屏幕宽度
                    const startY = 400;
                    this.brandAnimation.flyToCart(startX, startY, endX, endY, this.data.flyImage);
                }
            });
        }
    },

    // 立即购买 - 直接执行
    async onBuyNow() {
        if (!this.data.selectedProduct) return;
        try {
            const product = this.data.selectedProduct;
            const quantity = this.data.modalQuantity;

            // 存储直接购买信息到缓存
            const directBuyInfo = {
                product_id: product.id,
                sku_id: this.data.selectedSku?.id || null,
                quantity: quantity,
                price: product.displayPrice || product.price,
                name: product.name,
                image: product.images?.[0] || product.image || '',
                spec: this.data.selectedSkuText || ''
            };
            wx.setStorageSync('directBuyInfo', directBuyInfo);

            this.hideDetailModal();
            // 跳转到订单确认页面，标记为直接购买
            wx.navigateTo({ url: '/pages/order/confirm?from=direct' });
        } catch (err) {
            wx.showToast({ title: '操作失败', icon: 'none' });
        }
    },

    // 弹窗内确认加入购物车
    onConfirmAddToCart() {
        this.onConfirmAddCart();
    },

    // 弹窗内确认立即购买
    onConfirmBuyNow() {
        this.onBuyNow();
    },

    // 规格选择入口（默认显示双按钮）
    onSpecSelectorTap() {
        this.setData({ skuAction: 'both', showSku: true });
    },

    onModalMinus() {
        if (this.data.modalQuantity > 1) {
            this.setData({ modalQuantity: this.data.modalQuantity - 1 });
        }
    },

    onModalPlus() {
        this.setData({ modalQuantity: this.data.modalQuantity + 1 });
    },

    onQtyInput(e) {
        let val = parseInt(e.detail.value);
        if (isNaN(val) || val < 1) val = 1;
        this.setData({ modalQuantity: val });
    },

    async onConfirmAddCart() {
        if (!this.data.selectedProduct) return;
        try {
            wx.showLoading({ title: '加入中' });
            await post('/cart', {
                product_id: this.data.selectedProduct.id,
                quantity: this.data.modalQuantity
            });
            wx.hideLoading();
            wx.showToast({ title: '已加入', icon: 'success' });
            this.hideSkuModal();
            // this.hideDetailModal(); // Optional: Keep detail open? User usually wants to continue shopping.
            this.updateCartData();
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '失败', icon: 'none' });
        }
    },

    async onConfirmBuy() {
        if (!this.data.selectedProduct) return;
        // Proceed to checkout logic (usually add to cart then jump to confirm order)
        await this.onConfirmAddCart();
        wx.navigateTo({ url: '/pages/order/confirm' }); // Direct to confirm order
    },

    stopProp() { },

    // --- Global Cart Logic ---
    async updateCartData() {
        try {
            const res = await get('/cart');
            if (res.code === 0) {
                // 适配后端 items 结构
                const items = res.data?.items || res.data || [];
                const count = items.reduce((s, i) => s + i.quantity, 0);
                
                // 计算总价（如果是后端直接返回 summary.total_amount 更好，此处做前端汇总兜底）
                let total = res.data?.summary?.total_amount || 0;
                if (!total && items.length > 0) {
                    total = items.reduce((s, i) => s + (parseFloat(i.effective_price || i.sku?.retail_price || 0) * i.quantity), 0);
                }

                this.setData({
                    cartCount: count,
                    cartTotal: parseFloat(total).toFixed(2),
                    _cartItemIds: items.map(item => item.id).join(',') // 记录 ID 用于结算
                });
            }
        } catch (err) {
            console.error('更新购物车失败:', err);
        }
    },

    onToggleCartPopup() {
        // 跳转到购物车 Tab 页
        wx.switchTab({ url: '/pages/cart/cart' });
    },

    onCheckout() {
        const { cartCount, _cartItemIds } = this.data;
        if (cartCount > 0 && _cartItemIds) {
            // 直接带上当前购物车内所有商品的 ID 跳转结算
            wx.navigateTo({ 
                url: `/pages/order/confirm?from=cart&cart_ids=${_cartItemIds}` 
            });
        } else {
            wx.showToast({ title: '请先选购商品', icon: 'none' });
        }
    },

    onSearchTap() {
        wx.navigateTo({ url: '/pages/search/search' });
    }
});