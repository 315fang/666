// pages/product/detail.js
const { get, post } = require('../../utils/request');
const { processProduct, calculatePrice } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');
const { USER_ROLES } = require('../../config/constants');
const app = getApp();

Page({
    data: {
        id: null,
        product: {},
        skus: [],
        selectedSku: null,
        quantity: 1,
        currentImage: 0,
        imageCount: 1,
        cartCount: 0,
        isFavorite: false,
        statusBarHeight: 20,
        // 新增：评价相关
        reviews: [],
        reviewTotal: 0,
        reviewTags: [],
        // 折扣
        discount: 10,
        // 当前显示的价格和库存
        currentPrice: '',
        currentStock: 0
    },

    onLoad(options) {
        // Get status bar height for nav
        const roleLevel = app.globalData.userInfo?.role_level || 0;

        this.setData({
            statusBarHeight: app.globalData.statusBarHeight,
            roleLevel
        });

        // 新版邀请：通过 inviter_id 温和提示（不强制跳走，用户是来看商品的）
        if (options.inviter_id) {
            this._pendingInviterId = options.inviter_id;
            // 延迟弹窗，先让用户看到商品
            setTimeout(() => {
                wx.showModal({
                    title: '邀请加入',
                    content: '您的好友邀请您加入团队，是否填写邀请问卷？',
                    confirmText: '去填写',
                    cancelText: '先逛逛',
                    success: (res) => {
                        if (res.confirm) {
                            wx.navigateTo({
                                url: `/pages/questionnaire/fill?inviter_id=${this._pendingInviterId}`
                            });
                        }
                    }
                });
            }, 2000);
        }
        if (options.id) {
            this.setData({ id: options.id });
            this.loadProduct(options.id);
        }
    },

    onShow() {
        this.getCartCount();
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
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

            // 将 skus 转换为 specs 格式用于页面展示
            let specs = [];
            if (product.skus && product.skus.length > 0) {
                // 提取所有规格名称和值
                const specMap = {};
                product.skus.forEach(sku => {
                    if (sku.spec_name && sku.spec_value) {
                        if (!specMap[sku.spec_name]) {
                            specMap[sku.spec_name] = new Set();
                        }
                        specMap[sku.spec_name].add(sku.spec_value);
                    }
                });
                
                // 转换为数组格式
                specs = Object.keys(specMap).map(name => ({
                    name: name,
                    values: Array.from(specMap[name])
                }));
            }
            
            // 将 specs 添加到 product 对象
            product.specs = specs;

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

            // 初始化选中第一个SKU
            const firstSku = (product.skus && product.skus.length > 0) ? product.skus[0] : null;
            const selectedSpecs = {};
            if (firstSku && firstSku.spec_name) {
                selectedSpecs[firstSku.spec_name] = firstSku.spec_value;
            }

            // 设置当前价格和库存
            const currentPrice = firstSku ? firstSku.retail_price : parseFloat(displayPrice).toFixed(2);
            const currentStock = firstSku ? firstSku.stock : (product.stock || 999);

            this.setData({
                product: {
                    ...product,
                    displayPrice: parseFloat(displayPrice).toFixed(2)
                },
                skus: product.skus || [],
                selectedSku: firstSku,
                selectedSpecs,
                selectedSkuText: firstSku ? `${firstSku.spec_name}: ${firstSku.spec_value}` : '默认规格',
                imageCount: product.images.length || 1,
                roleLevel,
                isAgent: roleLevel >= USER_ROLES.LEADER,
                discount,
                currentPrice,
                currentStock
            });

            // 加载评价
            this.loadReviews();

            // 加载佣金预览（如果用户是团长或代理商）
            if (roleLevel >= USER_ROLES.LEADER) {
                this.loadCommissionPreview();
            }
        } catch (err) {
            ErrorHandler.handle(err, { customMessage: '商品加载失败' });
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

    // 跳转评价列表
    goReviews() {
        wx.navigateTo({ url: `/pages/product/reviews?id=${this.data.id}` });
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

    // 选择规格
    onSpecSelect(e) {
        const { key, val } = e.currentTarget.dataset;
        const selectedSpecs = this.data.selectedSpecs || {};
        selectedSpecs[key] = val;

        // 查找匹配的SKU
        const { skus, product } = this.data;
        let selectedSku = null;

        if (skus && skus.length > 0) {
            selectedSku = skus.find(sku => {
                const specName = sku.spec_name || '';
                const specValue = sku.spec_value || '';
                return selectedSpecs[specName] === specValue;
            });
        }

        // 更新选中状态和显示文本，同时更新价格和库存
        const currentPrice = selectedSku ? selectedSku.retail_price : product.displayPrice;
        const currentStock = selectedSku ? selectedSku.stock : (product.stock || 999);

        this.setData({
            selectedSpecs,
            selectedSku,
            selectedSkuText: selectedSku ? `${selectedSku.spec_name}: ${selectedSku.spec_value}` : '请选择规格',
            currentPrice,
            currentStock
        });
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
        this.addToCart();
    },

    onBuyNow() {
        const { product, selectedSku, quantity } = this.data;

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

            // 触发飞入动画
            this.triggerFlyAnim();

            wx.showToast({ title: '已加入购物车', icon: 'success' });

            this.getCartCount();
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '加入失败', icon: 'none' });
            console.error('加入购物车失败:', err);
        }
    },

    // 触发飞入购物车动画（使用 brand-animation 组件）
    triggerFlyAnim() {
        if (!this.brandAnimation) {
            this.brandAnimation = this.selectComponent('#brandAnimation');
        }
        if (!this.brandAnimation) return;

        const sysInfo = wx.getSystemInfoSync();
        // 起点：商品图中心
        const startX = sysInfo.windowWidth / 2;
        const startY = sysInfo.windowHeight * 0.3;

        // 终点：查询购物车图标位置
        const query = wx.createSelectorQuery().in(this);
        query.select('.cart-target').boundingClientRect((rect) => {
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

    // 分享（带邀请人信息）
    onShareAppMessage() {
        const { product } = this.data;
        const app = getApp();
        const userInfo = app.globalData.userInfo;
        const userId = userInfo ? userInfo.id : '';
        // 未登录时不带 inviter_id
        const path = userId
            ? `/pages/product/detail?id=${product.id}&inviter_id=${userId}`
            : `/pages/product/detail?id=${product.id}`;
        return {
            title: product.name,
            path,
            imageUrl: (product.images && product.images[0]) || ''
        };
    }
});
