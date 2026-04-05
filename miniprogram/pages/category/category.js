// pages/category/category.js - 分类页合并版
// 结构：666-main 三级分类（顶部 Tab → 侧边栏 → 商品列表）+ 分页加载
// 联动：当前版本 scroll sync（calculateCategoryHeights + onRightScroll + leftToView）
// 购物车：当前版本改进逻辑（items / summary.total_amount + cart_ids 结算）
const { get, post } = require('../../utils/request');
const { getFirstImage, formatMoney, parseImages, calculatePrice } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');
const { USER_ROLES } = require('../../config/constants');
const app = getApp();

Page({
    data: {
        // 一级分类（顶部 Tab）
        topCategories: [
            { id: 1, name: '精品好物', icon: '/assets/icons/gift.svg' },
            { id: 2, name: '甄选套餐', icon: '/assets/icons/package.svg' },
            { id: 3, name: '镜像原创', icon: '/assets/icons/sparkles.svg' }
        ],
        currentTopCategory: 1,

        // 二级分类（侧边栏）
        categories: [],
        currentCategory: '',
        currentCategoryName: '',
        currentCategoryBanner: '',

        // 滚动联动（来自当前版本）
        toView: '',
        leftToView: '',
        categoryHeights: [],
        isManualClick: false,

        // 三级商品
        products: [],
        loading: false,
        hasMore: true,
        page: 1,
        limit: 10,

        // 购物车
        cartCount: 0,
        cartTotal: '0.00',
        _cartItemIds: '',

        // 详情弹窗
        showDetailModal: false,
        selectedProduct: null,
        statusBarHeight: 20,
        currentImage: 0,
        imageCount: 1,
        isFavorite: false,

        // 评价（用于弹窗内展示）
        reviews: [],
        reviewTotal: 0,
        reviewTags: [],

        // SKU 弹窗
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
        this.loadSidebarCategories(this.data.currentTopCategory);
    },

    onPullDownRefresh() {
        this.setData({ page: 1, hasMore: true });
        this.loadProducts().then(() => {
            wx.stopPullDownRefresh();
        });
    },

    onSearchTap() {
        wx.navigateTo({ url: '/pages/search/search' });
    },

    // 上拉加载更多
    onLoadMore() {
        if (!this.data.hasMore || this.data.loading) return;
        this.setData({ page: this.data.page + 1 });
        this.loadProducts(true);
    },

    // ===== 一级分类 =====

    onTopCategoryTap(e) {
        const id = e.currentTarget.dataset.id;
        if (id === this.data.currentTopCategory) return;

        this.setData({
            currentTopCategory: id,
            categories: [],
            products: [],
            page: 1,
            hasMore: true
        });
        this.loadSidebarCategories(id);
    },

    async loadSidebarCategories(topId) {
        try {
            const res = await get('/categories');
            let allCats = res.data || [];
            let filteredCats = [];

            if (topId === 1) {
                if (allCats.length > 0) {
                    filteredCats = allCats.map((c, i) => i === 0
                        ? { ...c, name: c.name || '测试', icon: c.icon || '/assets/icons/gift.svg', image: c.image || '' }
                        : c
                    );
                } else {
                    filteredCats = [{ id: 'test_cat', name: '精品好物', icon: '/assets/icons/gift.svg', image: '' }];
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

    // ===== 二级分类（侧边栏点击）=====

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
            products: [],
            // 联动：滚动右侧到顶部（来自 666-main）
            toView: '',
            // 联动：高亮左侧对应项（来自当前版本）
            leftToView: `left-${categoryId}`,
            isManualClick: true
        });
        this.loadProducts();

        // 动画完成后释放手动点击标记
        setTimeout(() => {
            this.setData({ isManualClick: false });
        }, 800);
    },

    // ===== 右侧滚动联动左侧菜单（来自当前版本）=====

    onRightScroll(e) {
        if (this.data.isManualClick) return;

        const scrollTop = e.detail.scrollTop;
        const { categoryHeights, categories } = this.data;
        const offset = 50;

        for (let i = 0; i < categoryHeights.length; i++) {
            if (scrollTop + offset >= categoryHeights[i][0] && scrollTop + offset < categoryHeights[i][1]) {
                const catId = categories[i]?.id;
                if (catId && this.data.currentCategory !== catId) {
                    this.setData({
                        currentCategory: catId,
                        leftToView: `left-${catId}`
                    });
                }
                break;
            }
        }
    },

    // 计算右侧各分类区域高度（来自当前版本）
    // 注意：当前版本用于连贯滚动架构；本版本商品列表是单分类展示（切换分类重新加载）
    // 保留此方法以备扩展（如未来切换为连贯滚动）
    calculateCategoryHeights() {
        const query = wx.createSelectorQuery();
        query.selectAll('.cat-section').boundingClientRect();
        query.exec((res) => {
            if (!res[0] || res[0].length === 0) return;
            let top = 0;
            const heights = res[0].map(rect => {
                const range = [top, top + rect.height];
                top += rect.height;
                return range;
            });
            this.setData({ categoryHeights: heights });
        });
    },

    // ===== 三级商品加载 =====

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

    // ===== 详情弹窗逻辑（来自 666-main，与当前版本一致）=====

    async onSelectProduct(e) {
        const item = e.currentTarget.dataset.item;
        if (!item) return;

        this.setData({
            showDetailModal: true,
            selectedProduct: item
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
                    reviewTags: ['质量好', '物流快', '包装精美']
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

    // ===== SKU 弹窗 =====

    showSkuModal() {
        this.setData({ showSku: true });
    },

    hideSkuModal() {
        this.setData({ showSku: false });
    },

    // 加入购物车 + 飞入动画
    async onAddToCart() {
        if (!this.data.selectedProduct) return;
        try {
            wx.showLoading({ title: '加入中' });
            await post('/cart', {
                product_id: this.data.selectedProduct.id,
                quantity: this.data.modalQuantity
            });
            wx.hideLoading();

            this.triggerFlyAnimation();
            wx.showToast({ title: '已加入购物车', icon: 'success' });
            this.hideDetailModal();
            this.updateCartData();
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '加入失败', icon: 'none' });
        }
    },

    // 飞入购物车动画
    triggerFlyAnimation() {
        const product = this.data.selectedProduct;
        if (!product) return;

        this.setData({
            flyImage: product.images?.[0] || product.image || ''
        });

        if (this.brandAnimation) {
            const query = wx.createSelectorQuery();
            query.select('.cart-checkout-btn').boundingClientRect();
            query.exec((res) => {
                if (res[0]) {
                    const endX = res[0].left + res[0].width / 2;
                    const endY = res[0].top;
                    const startX = 375 / 2;
                    const startY = 400;
                    this.brandAnimation.flyToCart(startX, startY, endX, endY, this.data.flyImage);
                }
            });
        }
    },

    // 立即购买
    async onBuyNow() {
        if (!this.data.selectedProduct) return;
        try {
            const product = this.data.selectedProduct;
            const quantity = this.data.modalQuantity;

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
            wx.navigateTo({ url: '/pages/order/confirm?from=direct' });
        } catch (err) {
            wx.showToast({ title: '操作失败', icon: 'none' });
        }
    },

    onConfirmAddToCart() {
        this.onConfirmAddCart();
    },

    onConfirmBuyNow() {
        this.onBuyNow();
    },

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
            this.updateCartData();
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '失败', icon: 'none' });
        }
    },

    async onConfirmBuy() {
        if (!this.data.selectedProduct) return;
        await this.onConfirmAddCart();
        wx.navigateTo({ url: '/pages/order/confirm' });
    },

    stopProp() { },

    // ===== 购物车逻辑（来自当前版本，适配 items + summary.total_amount）=====

    async updateCartData() {
        try {
            const res = await get('/cart');
            if (res.code === 0) {
                // 适配后端 items 结构
                const items = res.data?.items || res.data || [];
                const count = items.reduce((s, i) => s + i.quantity, 0);

                // 优先使用后端汇总金额，其次前端计算
                let total = res.data?.summary?.total_amount || 0;
                if (!total && items.length > 0) {
                    total = items.reduce((s, i) => s + (parseFloat(i.effective_price || i.sku?.retail_price || 0) * i.quantity), 0);
                }

                this.setData({
                    cartCount: count,
                    cartTotal: parseFloat(total).toFixed(2),
                    _cartItemIds: items.map(item => item.id).join(',')
                });
            }
        } catch (err) {
            console.error('更新购物车失败:', err);
        }
    },

    onToggleCartPopup() {
        wx.switchTab({ url: '/pages/cart/cart' });
    },

    onCheckout() {
        const { cartCount, _cartItemIds } = this.data;
        if (cartCount > 0 && _cartItemIds) {
            // 带上购物车商品 ID 结算（来自当前版本）
            wx.navigateTo({
                url: `/pages/order/confirm?from=cart&cart_ids=${_cartItemIds}`
            });
        } else {
            wx.showToast({ title: '请先选购商品', icon: 'none' });
        }
    }
});
