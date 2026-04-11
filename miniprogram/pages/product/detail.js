// pages/product/detail.js
const { get, post } = require('../../utils/request');
const { normalizeActivityList } = require('../../utils/activityList');
const { normalizeProductId } = require('../../utils/dataFormatter');
const { USER_ROLES } = require('../../config/constants');
const { safeBack } = require('../../utils/navigator');
const { requireLogin } = require('../../utils/auth');
const { resolveSlashResumePayload } = require('../../utils/activityResume');
const { loadProduct, resolvePayableUnitPrice, PRODUCT_PLACEHOLDER } = require('./productDetailData');
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

function normalizeUserMessage(message, fallback) {
    const text = message ? String(message).trim() : '';
    if (!text || text === 'ok') return fallback;
    return text;
}

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
        servicePledges: [],
        groupActivity: null,
        slashActivity: null,
        availablePurchaseModes: [{ key: 'normal', label: '普通购买', hint: '加入购物袋后可与其他商品一起结算' }],
        purchaseMode: 'normal',
        purchaseModeHint: '加入购物袋后可与其他商品一起结算',
        actionLeftLabel: '加入购物袋',
        actionRightLabel: '立即购买'
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

    async loadActivityState(productId) {
        const normalizedId = normalizeProductId(productId || this.data.id);
        if (normalizedId === null || normalizedId === undefined || normalizedId === '') return;

        try {
            const [groupRes, slashRes] = await Promise.all([
                get('/group/activities', { product_id: normalizedId }, { showError: false }).catch(() => null),
                get('/slash/activities', { product_id: normalizedId }, { showError: false }).catch(() => null)
            ]);

            const groupActivity = this.findProductActivity(normalizeActivityList(groupRes && groupRes.data), normalizedId);
            const slashActivity = this.findProductActivity(normalizeActivityList(slashRes && slashRes.data), normalizedId);
            const availablePurchaseModes = this.buildPurchaseModes(groupActivity, slashActivity);
            const availableKeys = availablePurchaseModes.map((item) => item.key);
            const preferredMode = groupActivity ? 'group' : slashActivity ? 'slash' : 'normal';
            const purchaseMode = availableKeys.includes(this.data.purchaseMode) ? this.data.purchaseMode : preferredMode;

            this.setData({
                groupActivity,
                slashActivity,
                availablePurchaseModes,
                purchaseMode
            }, () => this.syncPurchaseActionState());
        } catch (err) {
            this.setData({
                groupActivity: null,
                slashActivity: null,
                availablePurchaseModes: [{ key: 'normal', label: '普通购买', hint: '加入购物袋后可与其他商品一起结算' }],
                purchaseMode: 'normal'
            }, () => this.syncPurchaseActionState());
        }
    },

    findProductActivity(list, productId) {
        const normalizedId = String(productId);
        const activities = Array.isArray(list) ? list : [];
        return activities.find((activity) => {
            const activityProductId = activity && activity.product && activity.product.id;
            return activityProductId != null && String(activityProductId) === normalizedId;
        }) || null;
    },

    buildPurchaseModes(groupActivity, slashActivity) {
        const modes = [
            { key: 'normal', label: '普通购买', hint: '加入购物袋后可与其他商品一起结算' }
        ];

        if (groupActivity) {
            const groupPrice = parseFloat(groupActivity.group_price || 0);
            modes.push({
                key: 'group',
                label: '拼团购买',
                hint: groupPrice > 0 ? `发起拼团价 ¥${groupPrice.toFixed(2)}` : '立即购买或发起拼团'
            });
        }

        if (slashActivity) {
            const floorPrice = parseFloat(slashActivity.floor_price || 0);
            modes.push({
                key: 'slash',
                label: '砍价购买',
                hint: floorPrice > 0 ? `最低可砍至 ¥${floorPrice.toFixed(2)}` : '立即购买或发起砍价'
            });
        }

        return modes;
    },

    syncPurchaseActionState() {
        const mode = this.data.purchaseMode || 'normal';
        const modeMeta = {
            normal: {
                purchaseModeHint: '加入购物袋后可与其他商品一起结算',
                actionLeftLabel: '加入购物袋',
                actionRightLabel: '立即购买',
                activityStatusCard: null,
                activityQuickLinks: []
            },
            group: {
                purchaseModeHint: this.getPurchaseHint('group'),
                actionLeftLabel: '立即购买',
                actionRightLabel: '去下单拼团',
                activityStatusCard: {
                    badge: '拼团说明',
                    title: '支付成功后可在订单或“我的拼团”继续查看进度',
                    desc: '拼团不是发起后立刻成团，支付完成后系统会为你建立或加入对应拼团。'
                },
                activityQuickLinks: [{
                    key: 'my-group',
                    label: '查看我的拼团',
                    desc: '回到我参与的拼团，继续看是否已成团'
                }]
            },
            slash: {
                purchaseModeHint: this.getPurchaseHint('slash'),
                actionLeftLabel: '立即购买',
                actionRightLabel: '发起砍价',
                activityStatusCard: {
                    badge: '砍价说明',
                    title: '发起后会自动进入你的砍价详情',
                    desc: '如果你已经发起过同一商品的砍价，我们会直接带你继续查看上次进度。'
                },
                activityQuickLinks: [{
                    key: 'my-slash',
                    label: '查看我的砍价',
                    desc: '继续看我已经发起的砍价记录与进度'
                }]
            }
        };
        const current = modeMeta[mode] || modeMeta.normal;
        this.setData(current);
    },

    getPurchaseHint(mode) {
        if (mode === 'group') {
            const groupPrice = parseFloat(this.data.groupActivity && this.data.groupActivity.group_price || 0);
            return groupPrice > 0 ? `当前拼团价 ¥${groupPrice.toFixed(2)}` : '可发起拼团购买';
        }
        if (mode === 'slash') {
            const floorPrice = parseFloat(this.data.slashActivity && this.data.slashActivity.floor_price || 0);
            return floorPrice > 0 ? `最低可砍至 ¥${floorPrice.toFixed(2)}` : '可发起砍价购买';
        }
        return '加入购物袋后可与其他商品一起结算';
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

            if (res.code === 0) {
                const data = res.data || res;
                const commissions = Array.isArray(data.commissions) ? data.commissions : [];

                // 计算我可以获得的佣金
                const myCommission = commissions
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

    onGalleryImageError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const product = this.data.product || {};
        const images = Array.isArray(product.images) ? product.images.slice() : [];
        if (!images.length) {
            images.push(PRODUCT_PLACEHOLDER);
        } else {
            images[index] = PRODUCT_PLACEHOLDER;
        }
        this.setData({
            'product.images': images,
            imageCount: images.length || 1
        });
    },

    onDetailImageError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const images = Array.isArray(this.data.detailImageList)
            ? this.data.detailImageList.filter((_, i) => i !== index)
            : [];
        this.setData({ detailImageList: images });
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
        const result = onSpecSelect(this, e, resolvePayableUnitPrice);
        this.syncPurchaseActionState();
        return result;
    },

    // 判断规格值是否可选（库存为0则灰化）
    isSpecValueDisabled(specName, specValue) {
        const { skus, selectedSpecs } = this.data;
        if (!skus || skus.length === 0) return false;

        // 构建临时选中状态
        const tempSpecs = { ...selectedSpecs, [specName]: specValue };

        // 检查是否存在匹配的 SKU 且有库存
        const matchedSku = skus.find((sku) => {
            const skuSpecs = Array.isArray(sku.specs) && sku.specs.length > 0
                ? sku.specs
                : (sku.spec_name && sku.spec_value ? [{ name: sku.spec_name, value: sku.spec_value }] : []);
            if (skuSpecs.length === 0) return false;
            return skuSpecs.every((s) => tempSpecs[s.name] === s.value);
        });

        if (matchedSku) {
            return (matchedSku.stock || 0) <= 0;
        }
        return false;
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

    onPurchaseModeChange(e) {
        const mode = e.currentTarget.dataset.mode || 'normal';
        if (mode === this.data.purchaseMode) return;
        this.setData({ purchaseMode: mode }, () => this.syncPurchaseActionState());
    },

    onActivityQuickActionTap(e) {
        const action = e.currentTarget.dataset.action;
        if (action === 'my-group') {
            return this.openMyGroupList();
        }
        if (action === 'my-slash') {
            return this.openMySlashList();
        }
    },

    openMyGroupList() {
        if (!requireLogin()) return;
        wx.navigateTo({ url: '/pages/group/list?tab=my' });
    },

    openMySlashList() {
        if (!requireLogin()) return;
        wx.navigateTo({ url: '/pages/slash/list?tab=my' });
    },

    onLeftActionTap() {
        if (this.data.purchaseMode === 'normal') {
            return this.onAddToCart();
        }
        return this.onBuyNow();
    },

    onRightActionTap() {
        if (this.data.purchaseMode === 'group') {
            return this.onStartGroup();
        }
        if (this.data.purchaseMode === 'slash') {
            return this.onStartSlash();
        }
        return this.onBuyNow();
    },

    async onStartGroup() {
        const activity = this.data.groupActivity;
        if (!activity) {
            wx.showToast({ title: '当前商品暂无拼团活动', icon: 'none' });
            return;
        }
        if (!requireLogin()) return;

        const roleLevel = app.globalData.userInfo && app.globalData.userInfo.role_level || 0;
        if (roleLevel < 1) {
            wx.showModal({
                title: '需要会员身份',
                content: '发起拼团需要会员身份，完成首单消费即可升级。',
                confirmText: '去购物',
                success: (res) => {
                    if (res.confirm) wx.switchTab({ url: '/pages/category/category' });
                }
            });
            return;
        }

        try {
            const hasSkuOptions = Array.isArray(this.data.skus) && this.data.skus.length > 0;
            const selectedSkuId = this.data.selectedSku && this.data.selectedSku.id;
            const activitySkuId = activity.sku_id != null && activity.sku_id !== '' ? activity.sku_id : null;
            if (hasSkuOptions && selectedSkuId == null && activitySkuId == null) {
                wx.showToast({ title: '请选择商品规格', icon: 'none' });
                return;
            }
            const product = this.data.product || {};
            const price = parseFloat(activity.group_price || activity.price || product.retail_price || product.price || this.data.currentPrice || 0);
            const skuId = selectedSkuId != null && selectedSkuId !== '' ? selectedSkuId : activitySkuId;
            const buyInfo = {
                product_id: normalizeProductId(product.id || this.data.id),
                category_id: product.category_id || null,
                sku_id: skuId || null,
                quantity: this.data.quantity || 1,
                price,
                name: product.name || activity.name || '拼团商品',
                image: product.images && product.images[0] || '',
                spec: this.data.selectedSkuText || (skuId ? '拼团·指定规格' : '拼团特惠'),
                type: 'group',
                group_activity_id: activity._id || activity.id,
                supports_pickup: product.supports_pickup ? 1 : 0
            };
            wx.setStorageSync('directBuyInfo', buyInfo);
            wx.navigateTo({ url: '/pages/order/confirm?from=direct' });
        } catch (err) {
            wx.showToast({ title: err && err.message ? String(err.message) : '网络错误', icon: 'none' });
        }
    },

    async onStartSlash() {
        const activity = this.data.slashActivity;
        if (!activity) {
            wx.showToast({ title: '当前商品暂无砍价活动', icon: 'none' });
            return;
        }
        if (!requireLogin()) return;

        try {
            const hasSkuOptions = Array.isArray(this.data.skus) && this.data.skus.length > 0;
            const selectedSkuId = this.data.selectedSku && this.data.selectedSku.id;
            const activitySkuId = activity.sku_id != null && activity.sku_id !== '' ? activity.sku_id : null;
            if (hasSkuOptions && selectedSkuId == null && activitySkuId == null) {
                wx.showToast({ title: '请选择商品规格', icon: 'none' });
                return;
            }
            const payload = { activity_id: activity.id };
            if (selectedSkuId != null && selectedSkuId !== '') {
                payload.sku_id = selectedSkuId;
            } else if (activitySkuId != null) {
                payload.sku_id = activitySkuId;
            }
            const res = await post('/slash/start', payload);
            const resume = resolveSlashResumePayload(res);
            if ((res.code === 0 || res.code === 1) && resume.resumable) {
                wx.navigateTo({ url: `/pages/slash/detail?slash_no=${resume.slashNo}` });
                return;
            }
            if (res.code === 0 || res.code === 1) {
                wx.showToast({ title: normalizeUserMessage(res.message, '砍价已发起，请到“我的砍价”继续查看'), icon: 'none' });
                setTimeout(() => this.openMySlashList(), 500);
                return;
            }
            wx.showToast({ title: normalizeUserMessage(res.message, '发起砍价失败'), icon: 'none' });
        } catch (err) {
            const message = err && err.message ? String(err.message) : '';
            if (message.includes('已发起过砍价')) {
                wx.showToast({ title: '你已参与过该砍价，正带你去查看', icon: 'none' });
                setTimeout(() => this.openMySlashList(), 500);
                return;
            }
            wx.showToast({ title: normalizeUserMessage(message, '网络错误，请稍后重试'), icon: 'none' });
        }
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
