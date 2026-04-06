// pages/product/detail.js
const { get, post, del } = require('../../utils/request');
const { parseImages, calculatePrice, normalizeProductId } = require('../../utils/dataFormatter');

/** 优先使用后端下发的 displayPrice（与下单应付单价一致），缺省再本地 calculatePrice */
function parseApiDisplayPrice(v) {
    if (v === null || v === undefined || v === '') return null;
    const x = typeof v === 'number' ? v : parseFloat(String(v).trim());
    return Number.isFinite(x) && x >= 0 ? x : null;
}

function resolvePayableUnitPrice(product, sku, roleLevel) {
    if (sku && parseApiDisplayPrice(sku.displayPrice) != null) {
        return parseApiDisplayPrice(sku.displayPrice);
    }
    if (parseApiDisplayPrice(product.displayPrice) != null) {
        return parseApiDisplayPrice(product.displayPrice);
    }
    return calculatePrice(product, sku, roleLevel);
}
const { ErrorHandler } = require('../../utils/errorHandler');
const { USER_ROLES } = require('../../config/constants');
const { safeBack } = require('../../utils/navigator');
const LocalUserContent = require('../../utils/localUserContent');
const app = getApp();

const PLEDGE_ICONS = {
    seven_day: '/assets/icons/refresh-cw.svg',
    return_shipping: '/assets/icons/truck.svg',
    brand_guarantee: '/assets/icons/shield.svg',
    authentic: '/assets/icons/shield.svg',
    shipping_promise: '/assets/icons/truck.svg',
    after_sale: '/assets/icons/refresh-cw.svg'
};

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

            // 获取用户身份计算动态价格（从 globalData 读取，不信任可被篡改的 Storage）
            const roleLevel = app.globalData.userInfo?.role_level || USER_ROLES.GUEST;

            const displayPrice = resolvePayableUnitPrice(product, null, roleLevel);

            // 计算折扣
            let discount = 10;
            if (product.market_price && parseFloat(product.market_price) > 0) {
                discount = Math.round((Number(displayPrice) / parseFloat(product.market_price)) * 10);
            }

            // 初始化选中第一个SKU
            const firstSku = (product.skus && product.skus.length > 0) ? product.skus[0] : null;
            const selectedSpecs = {};
            if (firstSku && firstSku.spec_name) {
                selectedSpecs[firstSku.spec_name] = firstSku.spec_value;
            }

            const currentPrice = Number(
                resolvePayableUnitPrice(product, firstSku, roleLevel)
            ).toFixed(2);
            const currentStock = firstSku ? (firstSku.stock || 0) : (product.stock || 0);
            const isOutOfStock = currentStock <= 0;

            const pid = normalizeProductId(product.id);

            const rawPledges = Array.isArray(product.service_pledges) ? product.service_pledges : [];
            const servicePledges = rawPledges.map((p) => ({
                ...p,
                icon: PLEDGE_ICONS[p.id] || '/assets/icons/shield.svg'
            }));

            this.setData({
                product: {
                    ...product,
                    displayPrice: Number(displayPrice).toFixed(2)
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
                currentStock,
                isOutOfStock,
                detailImageList: product.detail_images || [],
                hasRichDetail: !!product.detail_html,
                servicePledges,
                pageLoading: false
            });

            LocalUserContent.recordFootprint({
                id: pid,
                name: product.name,
                image: (product.images && product.images[0]) || '',
                price: Number(displayPrice).toFixed(2)
            });

            this.refreshFavoriteState();

            // 加载评价
            this.loadReviews();

            // 加载佣金预览（如果用户是团长或代理商）
            if (roleLevel >= USER_ROLES.LEADER) {
                this.loadCommissionPreview();
            }
        } catch (err) {
            ErrorHandler.handle(err, { customMessage: '商品加载失败' });
            console.error('加载商品详情失败:', err);
            this.setData({ pageLoading: false });
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
        const p = this.data.product;
        if (!p || p.id == null) return;
        const pid = normalizeProductId(p.id);
        const token = wx.getStorageSync('token');
        if (token) {
            try {
                const res = await get(
                    '/user/favorites/status',
                    { product_id: pid },
                    { showError: false }
                );
                const favorited = !!(res && res.data && res.data.favorited);
                this.setData({ isFavorite: favorited });
            } catch (_) {
                this.setData({ isFavorite: false });
            }
        } else {
            this.setData({ isFavorite: LocalUserContent.isFavorite(pid) });
        }
    },

    async onToggleFavorite() {
        const { product, currentPrice } = this.data;
        if (!product || product.id == null) return;
        const pid = normalizeProductId(product.id);
        const token = wx.getStorageSync('token');

        if (token) {
            try {
                if (this.data.isFavorite) {
                    await del(`/user/favorites/${pid}`, {}, { showError: false });
                    this.setData({ isFavorite: false });
                    wx.showToast({ title: '已取消收藏', icon: 'none' });
                } else {
                    await post('/user/favorites', { product_id: pid }, { showError: false });
                    this.setData({ isFavorite: true });
                    wx.showToast({ title: '已收藏，可在「我的-收藏商品」查看', icon: 'none' });
                }
            } catch (err) {
                const msg = (err && err.message) || '操作失败';
                wx.showToast({ title: String(msg).slice(0, 20), icon: 'none' });
            }
            return;
        }

        const added = LocalUserContent.toggleFavorite({
            id: pid,
            name: product.name,
            image: (product.images && product.images[0]) || '',
            price: String(currentPrice || product.displayPrice || '')
        });
        this.setData({ isFavorite: added });
        wx.showToast({
            title: added ? '已收藏（本机），登录后可云端同步' : '已取消收藏',
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

        const currentPrice = Number(
            resolvePayableUnitPrice(product, selectedSku, this.data.roleLevel)
        ).toFixed(2);
        const currentStock = selectedSku ? (selectedSku.stock || 0) : (product.stock || 0);
        const isOutOfStock = currentStock <= 0;
        const nextQuantity = isOutOfStock ? 1 : Math.min(this.data.quantity, currentStock || 1);

        this.setData({
            selectedSpecs,
            selectedSku,
            selectedSkuText: selectedSku ? `${selectedSku.spec_name}: ${selectedSku.spec_value}` : '请选择规格',
            currentPrice,
            currentStock,
            isOutOfStock,
            quantity: nextQuantity
        });
    },

    getMaxStock() {
        const stock = Number(this.data.currentStock || 0);
        return Number.isFinite(stock) && stock > 0 ? stock : 0;
    },

    // 数量减少 (Renamed to match WXML: onMinus)
    onMinus() {
        if (this.data.quantity > 1) {
            this.setData({ quantity: this.data.quantity - 1 });
        }
    },

    // 数量增加 (Renamed to match WXML: onPlus)
    onPlus() {
        const maxStock = this.getMaxStock();
        if (this.data.quantity < maxStock) {
            this.setData({ quantity: this.data.quantity + 1 });
        }
    },

    // Quantity Input (Added)
    onQtyInput(e) {
        let val = parseInt(e.detail.value);
        if (isNaN(val) || val < 1) val = 1;
        const maxStock = this.getMaxStock();
        if (maxStock > 0 && val > maxStock) val = maxStock;
        this.setData({ quantity: val });
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
        if (this._buyingNow) return;
        if (this.data.isOutOfStock) {
            wx.showToast({ title: '该商品暂时缺货', icon: 'none' });
            return;
        }
        this._buyingNow = true;
        const { product, selectedSku, quantity } = this.data;

        const buyInfo = {
            product_id: normalizeProductId(product.id),
            category_id: product.category_id || null,
            sku_id: (selectedSku && selectedSku.id) || null,
            quantity,
            price: resolvePayableUnitPrice(product, selectedSku, this.data.roleLevel),
            name: product.name,
            image: (product.images && product.images[0]) || '',
            spec: selectedSku ? `${selectedSku.spec_name}: ${selectedSku.spec_value}` : '',
            supports_pickup: product.supports_pickup ? 1 : 0
        };
        wx.setStorageSync('directBuyInfo', buyInfo);

        wx.navigateTo({
            url: '/pages/order/confirm?from=direct',
            complete: () => { this._buyingNow = false; }
        });
    },

    // 加入购物袋
    async addToCart() {
        if (this._addingToCart) return;
        const { product, selectedSku, quantity } = this.data;
        this._addingToCart = true;
        let loadingShown = false;

        try {
            wx.showLoading({ title: '加入购物袋...', mask: true });
            loadingShown = true;

            await post(
                '/cart',
                {
                    product_id: normalizeProductId(product.id),
                    sku_id: (selectedSku && selectedSku.id) || null,
                    quantity
                },
                { showError: false }
            );

            wx.hideLoading();
            loadingShown = false;

            this.triggerFlyAnim();
            wx.showToast({ title: '已加入购物袋', icon: 'success' });
        } catch (err) {
            const msg = err && err.message ? String(err.message) : '加入失败';
            wx.showToast({ title: msg, icon: 'none' });
            console.error('加入购物袋失败:', err);
        } finally {
            if (loadingShown) wx.hideLoading();
            this._addingToCart = false;
        }
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
