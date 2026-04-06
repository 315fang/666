// pages/category/category.js
const { get, post } = require('../../utils/request');
const { getFirstImage, formatMoney, parseImages, calculatePrice } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');
const { USER_ROLES } = require('../../config/constants');
const app = getApp();

Page({
    data: {
        // Level 1 Categories
        topCategories: [
            { id: 1, name: '精品好物', icon: '/assets/icons/gift.svg' },
            { id: 2, name: '甄选套餐', icon: '/assets/icons/package.svg' },
            { id: 3, name: '镜像原创', icon: '/assets/icons/sparkles.svg' }
        ],
        currentTopCategory: 1,

        // Level 2 Categories
        categories: [],
        currentCategory: '',
        currentCategoryName: '',
        currentCategoryBanner: '',

        // Level 3 Products
        products: [],
        
        loading: false,
        hasMore: true,
        page: 1,
        limit: 10,
        
        // Cart
        cartCount: 0,
        cartTotal: '0.00',

        // Detail Modal
        showDetailModal: false,
        selectedProduct: null,
        statusBarHeight: 20,
        currentImage: 0,
        imageCount: 1,
        isFavorite: false,
        
        // Reviews in Modal
        reviews: [],
        reviewTotal: 0,
        reviewTags: [],
        
        // SKU in Modal
        showSku: false,
        skuAction: 'cart', // 'cart' or 'buy'
        modalQuantity: 1,
        selectedSku: null,
        selectedSkuText: '',
        selectedSkuImg: '',
        currentPrice: null,
        currentStock: null,
        discount: 10
    },

    onShow() {
        this.updateCartData();
    },

    onLoad() {
        const sysInfo = wx.getSystemInfoSync();
        this.setData({
            statusBarHeight: sysInfo.statusBarHeight || 20
        });
        this.loadSidebarCategories(this.data.currentTopCategory);
    },

    onPullDownRefresh() {
        this.setData({ page: 1, hasMore: true });
        this.loadProducts().then(() => {
            wx.stopPullDownRefresh();
        });
    },

    // --- Level 1 Logic ---
    onTopCategoryTap(e) {
        const id = e.currentTarget.dataset.id;
        if (id === this.data.currentTopCategory) return;

        this.setData({
            currentTopCategory: id,
            categories: [],
            products: []
        });
        this.loadSidebarCategories(id);
    },

    async loadSidebarCategories(topId) {
        try {
            const res = await get('/categories');
            let allCats = res.data || [];
            let filteredCats = [];
            
            if (topId === 1) { // Boutique
                if (allCats.length > 0) {
                    filteredCats = allCats.map((c, i) => i === 0 ? { ...c, name: '测试', icon: '/assets/icons/gift.svg', image: 'https://resour.oss-cn-hangzhou.aliyuncs.com/jiaruwomen.jpg' } : c);
                } else {
                    filteredCats = [{ id: 'test_cat', name: '测试', icon: '/assets/icons/gift.svg', image: 'https://resour.oss-cn-hangzhou.aliyuncs.com/jiaruwomen.jpg' }];
                }
            } else if (topId === 2) {
                filteredCats = allCats.length > 1 ? allCats.slice(1) : allCats;
            } else {
                filteredCats = allCats;
            }

            if (filteredCats.length > 0) {
                const firstCat = filteredCats[0];
                this.setData({
                    categories: filteredCats,
                    currentCategory: firstCat.id,
                    currentCategoryName: firstCat.name,
                    currentCategoryBanner: firstCat.image || ''
                });
                this.loadProducts();
            } else {
                this.setData({ categories: [] });
            }
        } catch (err) {
            ErrorHandler.handle(err, { customMessage: '加载分类失败' });
        }
    },

    // --- Level 2 Logic ---
    onCategoryTap(e) {
        const categoryId = e.currentTarget.dataset.id;
        if (categoryId === this.data.currentCategory) return;
        const category = this.data.categories.find(c => c.id === categoryId);
        this.setData({
            currentCategory: categoryId,
            currentCategoryName: category?.name || '',
            currentCategoryBanner: category?.image || '',
            page: 1,
            hasMore: true,
            products: []
        });
        this.loadProducts();
    },

    // --- Level 3 Logic ---
    onProductTap(e) {
        this.onSelectProduct(e);
    },

    async loadProducts(append = false) {
        if (this.data.loading) return;
        this.setData({ loading: true });

        try {
            const { currentCategory, page, limit } = this.data;
            const params = { page, limit };
            if (currentCategory && currentCategory !== 'test_cat') {
                params.category_id = currentCategory;
            }

            const res = await get('/products', params);
            const rawProducts = res.data?.list || res.data || [];

            const newProducts = rawProducts.map(item => ({
                ...item,
                image: getFirstImage(item.images),
                price: item.retail_price || item.price || 0
            }));

            this.setData({
                products: append ? [...this.data.products, ...newProducts] : newProducts,
                hasMore: newProducts.length >= limit,
                loading: false
            });
        } catch (err) {
            console.error('加载商品失败:', err);
            this.setData({ loading: false });
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

    onAddToCart() {
        this.setData({ skuAction: 'cart' });
        if (!this.data.showSku) {
            this.showSkuModal();
        } else {
            this.onConfirmAddCart();
        }
    },

    onBuyNow() {
        this.setData({ skuAction: 'buy' });
        if (!this.data.showSku) {
            this.showSkuModal();
        } else {
            this.onConfirmBuy();
        }
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

    stopProp() {},

    // --- Global Cart Logic ---
    updateCartData() {
        get('/cart').then(res => {
            if (res.code === 0) {
                const list = res.data.list || [];
                const count = list.reduce((s, i) => s + i.quantity, 0);
                this.setData({
                    cartCount: count,
                    cartTotal: res.data.total_amount || '0.00'
                });
            }
        }).catch(() => {});
    },

    onToggleCartPopup() {
        // Since cart page is now "Welfare Zone", maybe we should show a popup or navigate to Order Confirm?
        // User said "discard existing cart page".
        // But checkout usually needs a cart.
        // For now, let's just toast or navigate to the new Welfare Zone (which is empty)
        wx.showToast({ title: '购物车功能升级中', icon: 'none' });
    },

    onCheckout() {
        if (this.data.cartCount > 0) {
             wx.navigateTo({ url: '/pages/order/confirm' });
        } else {
            wx.showToast({ title: '请先选购商品', icon: 'none' });
        }
    }
});