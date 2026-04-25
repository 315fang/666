// pages/order/confirm.js - 订单确认页
const { get } = require('../../utils/request');
const { resolveCloudImageUrl } = require('./utils/cloudAsset');
const { normalizeOrderItemSpec } = require('./orderSpecText');
const app = getApp();
const { getLightPromptModals } = require('../../utils/miniProgramConfig');
const { shouldShowDaily, markDailyShown } = require('../../utils/lightPrompt');
const {
    navigateToAddressList,
    refreshPickupAllowed,
    loadPickupStations,
    loadDefaultAddress,
    loadCartItems
} = require('./orderConfirmAddress');
const {
    recalcFinal,
    loadAvailableCoupons,
    selectCoupon,
    clearCoupon,
    getPointDeductionRule
} = require('./orderConfirmPricing');
const { submitOrder } = require('./orderConfirmSubmission');
const { normalizeLimitedSpotPayload } = require('../../utils/limitedSpot');
const {
    loadPointBalance,
    togglePoints,
    loadWalletBalance,
    toggleWallet
} = require('./orderConfirmAccount');

const DISCOUNT_RESTRICTED_ORDER_TYPES = new Set(['group', 'slash', 'limited_sale', 'limited_spot', 'bundle', 'exchange']);

function isDiscountRestrictedOrderType(orderType = '') {
    return DISCOUNT_RESTRICTED_ORDER_TYPES.has(String(orderType || '').trim().toLowerCase());
}

function isCouponRestrictedItem(item = {}) {
    return Number(item.allow_coupon) === 0
        || Number(item.is_explosive) === 1
        || String(item.product_tag || '').trim().toLowerCase() === 'hot'
        || String(item.activity_type || '').trim() !== '';
}

function isPointsRestrictedItem(item = {}) {
    return Number(item.allow_points) === 0
        || Number(item.is_explosive) === 1
        || String(item.product_tag || '').trim().toLowerCase() === 'hot'
        || String(item.activity_type || '').trim() !== '';
}

Page({
    data: {
        loading: true,
        submitting: false,
        cartLoadStatus: 'loading',
        cartLoadError: '',
        addressLoadStatus: 'idle',
        addressLoadError: '',
        pointsLoadStatus: 'idle',
        pointsLoadError: '',
        walletLoadStatus: 'idle',
        walletLoadError: '',
        couponLoadStatus: 'idle',
        couponLoadError: '',
        // 来源：cart（购物袋）或 direct（直接购买）
        from: 'cart',
        // 收货地址
        address: null,
        // 商品列表
        orderItems: [],
        // 备注
        remark: '',
        // 合计
        totalAmount: '0.00',
        totalCount: 0,
        bundleOrder: false,
        bundleMeta: null,
        bundlePrice: '0.00',
        bundleDiscount: '0.00',
        roleLevel: 0,
        // 优惠券
        availableCoupons: [],
        unusedCouponCount: 0,
        selectedCoupon: null,
        showCouponPicker: false,
        couponDiscount: '0.00',
        allowCoupon: true,
        finalAmount: '0.00',
        shippingFee: 0,
        // 积分抵扣
        pointBalance: 0,
        usePoints: false,
        pointsToUse: 0,
        pointsDeduction: '0.00',
        // 是否允许积分抵扣（由商品属性决定）
        allowPoints: true,
        pointsRuleHint: '1积分抵0.1元，最多抵扣订单70%',
        // 活动单号
        slashNo: null,
        groupNo: null,
        groupActivityId: null,
        orderType: '',
        exchangeMode: false,
        exchangeCouponId: '',
        exchangeCouponTitle: '',
        limitedSpotOrder: false,
        limitedSpotSource: '',
        limitedSpotMode: '',
        limitedSpotTitle: '',
        limitedSpotPointsPrice: 0,
        limitedSpotMoneyPrice: 0,
        limitedSpotPayload: null,
        // B端货款余额支付
        walletBalance: 0,
        walletBalanceDisplay: '0.00',
        useWallet: false,
        isAgent: false,
        // 到店自提（需商品 supports_pickup + 后台维护自提门店）
        pickupAllowed: false,
        deliveryType: 'express',
        pickupStations: [],
        pickupStation: null,
        lightTipShow: false,
        lightTipTitle: '',
        lightTipContent: ''
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
    },

    async onLoad(options) {
        const safeOptions = options || {};
        this._loadOptions = { ...safeOptions };
        const roleLevel = app.globalData.userInfo?.role_level || 0;
        this.setData({
            from: safeOptions.from || 'cart',
            roleLevel,
            isAgent: roleLevel >= 3,
            cartLoadStatus: 'loading',
            cartLoadError: ''
        });

        const primaryReady = await this._loadPrimaryOrderData(safeOptions);
        if (primaryReady) {
            await this._loadSupplementaryData();
        }
        this._hasShownOnce = false;
        this._tryAutoCouponUsagePrompt();
    },

    async onShow() {
        const roleLevel = app.globalData.userInfo?.role_level || 0;
        if (roleLevel !== this.data.roleLevel) {
            this.setData({
                roleLevel,
                isAgent: roleLevel >= 3
            });
        }
        if (!this._hasShownOnce) {
            this._hasShownOnce = true;
            return;
        }
        const selectedPickupStation = wx.getStorageSync('selectedPickupStation');
        if (selectedPickupStation) {
            wx.removeStorageSync('selectedPickupStation');
            const selectedId = String(selectedPickupStation.id || selectedPickupStation._id || selectedPickupStation.station_key || '');
            const latestStation = (this.data.pickupStations || [])
                .find((item) => String(item.id || item._id || '') === selectedId);
            const station = latestStation || selectedPickupStation;
            if (station.selectable === false) {
                wx.showToast({ title: '该门店当前无货，请重新选择', icon: 'none' });
            } else {
                this.setData({ pickupStation: station });
            }
            this._tryAutoCouponUsagePrompt();
            return;
        }
        // 从地址选择页返回时刷新地址
        const selectedAddress = wx.getStorageSync('selectedAddress');
        if (selectedAddress) {
            this.setData({
                address: selectedAddress,
                addressLoadStatus: 'success',
                addressLoadError: ''
            });
            wx.removeStorageSync('selectedAddress');
            if (this.data.deliveryType === 'pickup') {
                this.loadPickupStations();
            }
            this._tryAutoCouponUsagePrompt();
            return;
        }
        if (this.data.cartLoadStatus !== 'success') {
            return;
        }
        if ((this.data.orderItems || []).length > 0) {
            await this._refreshMiniProgramConfigAndPricing(this.data.orderItems || []);
        }
        if (!this.data.address && this.data.addressLoadStatus !== 'loading') {
            this.loadDefaultAddress();
        }
        if (!this.data.exchangeMode && !this.data.limitedSpotOrder) {
            if (this.data.pointsLoadStatus !== 'loading') {
                this.loadPointBalance();
            }
            if (this.data.isAgent && this.data.walletLoadStatus !== 'loading') {
                this.loadWalletBalance();
            }
        }
        if (!this.data.exchangeMode
            && !this.data.limitedSpotOrder
            && this.data.allowCoupon !== false
            && (this.data.orderItems || []).length > 0
            && this.data.couponLoadStatus !== 'loading'
        ) {
            this.loadAvailableCoupons();
        }
        this._tryAutoCouponUsagePrompt();
    },

    async _loadPrimaryOrderData(options = {}) {
        if (options.from === 'direct') {
            const directBuy = wx.getStorageSync('directBuyInfo');
            if (!directBuy) {
                this.setData({
                    loading: false,
                    cartLoadStatus: 'error',
                    cartLoadError: '订单信息已失效，请返回重新下单'
                });
                return false;
            }
            if (directBuy.bundle_mode) {
                const bundleItems = Array.isArray(directBuy.items) ? directBuy.items : [];
                const resolvedItems = await Promise.all(bundleItems.map(async (item) => normalizeOrderItemSpec({
                    ...item,
                    image: await resolveCloudImageUrl(item.image, '/assets/images/placeholder.svg')
                })));
                const originalAmount = Number(directBuy.bundle_original_amount || 0);
                const bundlePrice = Number(directBuy.bundle_price || 0);
                const totalCount = resolvedItems.reduce((sum, item) => sum + Number(item.quantity || item.qty || 1), 0);
                this.setData({
                    orderItems: resolvedItems,
                    totalAmount: originalAmount.toFixed(2),
                    finalAmount: bundlePrice.toFixed(2),
                    totalCount,
                    bundleOrder: true,
                    bundleMeta: {
                        id: directBuy.bundle_id || '',
                        title: directBuy.bundle_title || '',
                        subtitle: directBuy.bundle_subtitle || '',
                        cover_image: directBuy.bundle_cover_image || '',
                        bundle_price: bundlePrice,
                        original_amount: originalAmount
                    },
                    bundlePrice: bundlePrice.toFixed(2),
                    bundleDiscount: Math.max(0, originalAmount - bundlePrice).toFixed(2),
                    slashNo: null,
                    groupNo: null,
                    groupActivityId: null,
                    orderType: 'bundle',
                    exchangeMode: false,
                    exchangeCouponId: '',
                    exchangeCouponTitle: '',
                    limitedSpotOrder: false,
                    limitedSpotSource: '',
                    limitedSpotMode: '',
                    limitedSpotTitle: '',
                    limitedSpotPointsPrice: 0,
                    limitedSpotMoneyPrice: 0,
                    limitedSpotPayload: null,
                    allowCoupon: false,
                    allowPoints: false,
                    usePoints: false,
                    pointsToUse: 0,
                    pointsDeduction: '0.00',
                    useWallet: false,
                    couponDiscount: '0.00',
                    selectedCoupon: null,
                    cartLoadStatus: 'success',
                    cartLoadError: ''
                });
                this._updatePointsConfig(resolvedItems);
                this._refreshPickupAllowed();
                await this._refreshMiniProgramConfigAndPricing(resolvedItems);
                return true;
            }
            const image = await resolveCloudImageUrl(directBuy.image, '/assets/images/placeholder.svg');
            const amt = (parseFloat(directBuy.price) * directBuy.quantity).toFixed(2);
            const limitedSpotPayload = normalizeLimitedSpotPayload(
                directBuy.limited_sale || directBuy.limited_spot || null,
                directBuy.limited_spot_mode || ''
            );
            const limitedSpotMode = limitedSpotPayload ? limitedSpotPayload.mode : '';
            const directBuyItem = normalizeOrderItemSpec({ ...directBuy, image });
            this.setData({
                orderItems: [directBuyItem],
                totalAmount: amt,
                finalAmount: amt,
                totalCount: directBuy.quantity,
                bundleOrder: false,
                bundleMeta: null,
                bundlePrice: '0.00',
                bundleDiscount: '0.00',
                slashNo: directBuy.slash_no || null,
                groupNo: directBuy.group_no || null,
                groupActivityId: directBuy.group_activity_id || null,
                orderType: directBuy.type || '',
                exchangeMode: !!directBuy.exchange_mode,
                exchangeCouponId: directBuy.exchange_coupon_id || '',
                exchangeCouponTitle: directBuy.exchange_title || '',
                limitedSpotOrder: !!limitedSpotPayload,
                limitedSpotSource: limitedSpotPayload?.source || directBuy.limited_spot_source || '',
                limitedSpotMode,
                limitedSpotTitle: directBuy.limited_spot_title || limitedSpotPayload?.title || '',
                limitedSpotPointsPrice: Number(directBuy.limited_spot_points_price || limitedSpotPayload?.points_price || 0),
                limitedSpotMoneyPrice: Number(directBuy.limited_spot_money_price || limitedSpotPayload?.money_price || 0),
                limitedSpotPayload,
                allowCoupon: (directBuy.exchange_mode || limitedSpotPayload) ? false : true,
                allowPoints: (directBuy.exchange_mode || limitedSpotPayload) ? false : true,
                usePoints: false,
                useWallet: false,
                cartLoadStatus: 'success',
                cartLoadError: ''
            });
            this._updatePointsConfig([directBuyItem]);
            this._refreshPickupAllowed();
            await this._refreshMiniProgramConfigAndPricing([directBuyItem]);
            return true;
        }

        if (options.cart_ids) {
            const result = await this.loadCartItems(options.cart_ids);
            if (!result || !result.ok) {
                return false;
            }
            await this._refreshMiniProgramConfigAndPricing(this.data.orderItems || []);
            return true;
        }

        this.setData({
            loading: false,
            cartLoadStatus: 'error',
            cartLoadError: '订单加载失败，请重试'
        });
        return false;
    },

    async _loadSupplementaryData() {
        const tasks = [this.loadDefaultAddress()];
        if (this.data.exchangeMode || this.data.limitedSpotOrder) {
            this.setData({
                pointsLoadStatus: 'success',
                pointsLoadError: '',
                walletLoadStatus: this.data.isAgent ? 'success' : 'idle',
                walletLoadError: '',
                couponLoadStatus: 'success',
                couponLoadError: ''
            });
            this.setData({ loading: false });
            return;
        }
        if (this.data.bundleOrder) {
            tasks.push(this.loadPointBalance());
            if (this.data.isAgent) {
                tasks.push(this.loadWalletBalance());
            }
            this.setData({
                couponLoadStatus: 'success',
                couponLoadError: '',
                availableCoupons: [],
                unusedCouponCount: 0,
                selectedCoupon: null,
                couponDiscount: '0.00'
            });
            await Promise.allSettled(tasks);
            this.setData({ loading: false });
            return;
        }

        tasks.push(this.loadPointBalance());
        if (this.data.isAgent) {
            tasks.push(this.loadWalletBalance());
        } else {
            this.setData({
                walletLoadStatus: 'idle',
                walletLoadError: '',
                walletBalance: 0,
                walletBalanceDisplay: '0.00',
                useWallet: false
            });
        }
        if (this.data.allowCoupon !== false) {
            tasks.push(this.loadAvailableCoupons());
        } else {
            this.setData({
                couponLoadStatus: 'success',
                couponLoadError: '',
                availableCoupons: [],
                unusedCouponCount: 0,
                selectedCoupon: null,
                couponDiscount: '0.00'
            });
        }

        await Promise.allSettled(tasks);
        this.setData({ loading: false });
    },

    _tryAutoCouponUsagePrompt() {
        if (!app.globalData.isLoggedIn) return;
        const cu = getLightPromptModals().coupon_usage;
        if (!cu || !cu.enabled) return;
        if (!shouldShowDaily('light_tip_coupon')) return;
        markDailyShown('light_tip_coupon');
        this.setData({
            lightTipShow: true,
            lightTipTitle: cu.title || '优惠券说明',
            lightTipContent: cu.body || ''
        });
    },

    onCouponHelpTap(e) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        const cu = getLightPromptModals().coupon_usage;
        if (!cu || !cu.enabled) {
            wx.showToast({ title: '暂无说明', icon: 'none' });
            return;
        }
        this.setData({
            lightTipShow: true,
            lightTipTitle: cu.title || '优惠券说明',
            lightTipContent: cu.body || ''
        });
    },

    onLightTipClose() {
        this.setData({ lightTipShow: false });
    },

    /** 根据商品属性更新积分抵扣权限和规则提示文案 */
    _updatePointsConfig(items) {
        const orderType = String(this.data.orderType || '').trim().toLowerCase();
        const restrictedOrderType = isDiscountRestrictedOrderType(orderType);
        const hasCouponRestrictedItem = (items || []).some((item) => isCouponRestrictedItem(item));
        const hasPointsRestrictedItem = (items || []).some((item) => isPointsRestrictedItem(item));
        if (this.data.limitedSpotOrder) {
            this.setData({
                allowPoints: false,
                allowCoupon: false,
                pointsRuleHint: this.data.limitedSpotMode === 'points' ? '专享积分兑换订单不参与普通积分抵扣' : '专享秒杀订单不参与普通积分抵扣',
                usePoints: false,
                pointsToUse: 0,
                pointsDeduction: '0.00',
                selectedCoupon: null,
                couponDiscount: '0.00',
                availableCoupons: [],
                unusedCouponCount: 0
            });
            return;
        }
        if (this.data.bundleOrder) {
            this.setData({
                allowPoints: false,
                allowCoupon: false,
                pointsRuleHint: '组合订单不支持积分抵扣',
                usePoints: false,
                pointsToUse: 0,
                pointsDeduction: '0.00',
                selectedCoupon: null,
                couponDiscount: '0.00',
                availableCoupons: [],
                unusedCouponCount: 0
            });
            return;
        }
        if (this.data.exchangeMode) {
            this.setData({
                allowPoints: false,
                allowCoupon: false,
                pointsRuleHint: '兑换订单不支持积分抵扣',
                usePoints: false,
                pointsToUse: 0,
                pointsDeduction: '0.00',
                selectedCoupon: null,
                couponDiscount: '0.00',
                availableCoupons: [],
                unusedCouponCount: 0
            });
            return;
        }
        if (restrictedOrderType) {
            this.setData({
                allowPoints: false,
                allowCoupon: false,
                pointsRuleHint: orderType === 'group'
                    ? '拼团订单不支持积分抵扣'
                    : (orderType === 'slash' ? '砍价订单不支持积分抵扣' : '活动订单不支持积分抵扣'),
                usePoints: false,
                pointsToUse: 0,
                pointsDeduction: '0.00',
                selectedCoupon: null,
                couponDiscount: '0.00',
                availableCoupons: [],
                unusedCouponCount: 0
            });
            return;
        }
        // 只要有任一商品关闭了积分抵扣（allow_points === 0），整单禁用积分
        const allowPoints = (items || []).every(item => item.allow_points !== 0);
        const allowCoupon = !hasCouponRestrictedItem && (items || []).every(item => item.allow_coupon !== 0);
        const { yuanPerPoint, maxRatio } = getPointDeductionRule();
        const pct = Math.round(maxRatio * 100);
        const hint = `1积分抵${yuanPerPoint}元，最多抵扣订单${pct}%`;
        this.setData({
            allowPoints,
            allowCoupon,
            pointsRuleHint: hint,
            ...(allowCoupon ? {} : {
                selectedCoupon: null,
                couponDiscount: '0.00',
                availableCoupons: [],
                unusedCouponCount: 0
            })
        });
        if (!allowPoints || hasPointsRestrictedItem) {
            this.setData({
                usePoints: false,
                pointsToUse: 0,
                pointsDeduction: '0.00'
            });
        }
    },

    async _refreshMiniProgramConfigAndPricing(items) {
        if (typeof app.fetchMiniProgramConfig === 'function') {
            await app.fetchMiniProgramConfig();
        }
        if ((items || []).length > 0) {
            this._updatePointsConfig(items);
            this._recalcFinal();
        }
    },

    /** 当前购物袋/直购是否全部支持自提 */
    _refreshPickupAllowed() {
        return refreshPickupAllowed(this);
    },

    onDeliveryTypeChange(e) {
        const v = e.currentTarget.dataset.type;
        if (v !== 'express' && v !== 'pickup') return;
        if (v === 'pickup' && !this.data.pickupAllowed) {
            wx.showToast({ title: '该商品不支持到店自提', icon: 'none' });
            return;
        }
        this.setData({ deliveryType: v, pickupStation: v === 'pickup' ? this.data.pickupStation : null });
        if (v === 'pickup') {
            this.loadPickupStations();
        }
    },

    async loadPickupStations() {
        return loadPickupStations(this);
    },

    async onChoosePickupStation() {
        if (this.data.deliveryType !== 'pickup') return;
        if (!this.data.pickupAllowed) {
            wx.showToast({ title: '该商品不支持到店自提', icon: 'none' });
            return;
        }
        if ((this.data.pickupStations || []).length === 0) {
            await this.loadPickupStations();
        }
        const stations = this.data.pickupStations || [];
        if (stations.length === 0) {
            wx.showToast({ title: '暂无自提门店，请稍后再试', icon: 'none' });
            return;
        }
        wx.setStorageSync('pickupStationSelectPayload', {
            stations,
            selectedId: this.data.pickupStation ? (this.data.pickupStation.id || this.data.pickupStation._id || this.data.pickupStation.station_key || '') : '',
            updatedAt: Date.now()
        });
        wx.navigateTo({ url: '/pages/order/pickup-station-list' });
    },

    // 加载默认收货地址
    async loadDefaultAddress() {
        return loadDefaultAddress(this);
    },

    // 加载购物袋选中项
    async loadCartItems(cartIds) {
        return loadCartItems(this, cartIds);
    },

    // 重新计算最终价格（全程用整数分运算，避免浮点误差）
    _recalcFinal() {
        return recalcFinal(this);
    },

    // 加载可用优惠券
    async loadAvailableCoupons() {
        await loadAvailableCoupons(this);
    },

    async _ensureCouponReady(tryLogin) {
        if (!app.globalData.isLoggedIn) {
            if (!tryLogin) return false;
            try {
                await app.wxLogin(false);
            } catch (_err) {
                return false;
            }
        }
        await this.loadAvailableCoupons();
        return true;
    },

    // 点击优惠券行，打开选择器
    async onCouponTap() {
        if (this.data.exchangeMode) {
            wx.showToast({ title: '兑换订单不参与普通优惠券', icon: 'none' });
            return;
        }
        const ready = await this._ensureCouponReady(true);
        if (!ready) {
            wx.showToast({ title: '登录后可使用优惠券', icon: 'none' });
            return;
        }
        this.setData({ showCouponPicker: true });
    },

    // 关闭选择器（点遮罩）
    onCloseCouponPicker() {
        this.setData({ showCouponPicker: false });
    },

    // 选择一张优惠券
    onSelectCoupon(e) {
        const coupon = e.currentTarget.dataset.coupon;
        return selectCoupon(this, coupon);
    },

    // 清除已选优惠券
    onClearCoupon() {
        return clearCoupon(this);
    },

    // 选择地址
    onSelectAddress() {
        const address = this.data.address || {};
        navigateToAddressList(true, address._id || address.id || '');
    },

    // 新增地址
    onAddAddress() {
        const address = this.data.address || {};
        navigateToAddressList(true, address._id || address.id || '');
    },

    async onRetryCartLoad() {
        this.setData({
            address: null,
            orderItems: [],
            totalAmount: '0.00',
            totalCount: 0,
            finalAmount: '0.00',
            bundleOrder: false,
            bundleMeta: null,
            bundlePrice: '0.00',
            bundleDiscount: '0.00',
            availableCoupons: [],
            unusedCouponCount: 0,
            selectedCoupon: null,
            couponDiscount: '0.00',
            pointBalance: 0,
            usePoints: false,
            pointsToUse: 0,
            pointsDeduction: '0.00',
            walletBalance: 0,
            walletBalanceDisplay: '0.00',
            useWallet: false,
            pickupStations: [],
            pickupStation: null,
            loading: true,
            cartLoadStatus: 'loading',
            cartLoadError: ''
        });
        const ready = await this._loadPrimaryOrderData(this._loadOptions || {});
        if (ready) {
            await this._loadSupplementaryData();
        }
    },

    async onRetryAddressLoad() {
        await this.loadDefaultAddress();
    },

    async onRetryPointsLoad() {
        await this.loadPointBalance();
    },

    async onRetryWalletLoad() {
        await this.loadWalletBalance();
    },

    async onRetryCouponLoad() {
        await this.loadAvailableCoupons();
    },

    // 备注输入
    onRemarkInput(e) {
        this.setData({ remark: e.detail.value });
    },

    // 提交订单
    async onSubmit() {
        if (this.data.cartLoadStatus !== 'success') {
            wx.showToast({ title: this.data.cartLoadError || '订单仍在加载中', icon: 'none' });
            return;
        }
        if (this.data.deliveryType === 'express' && this.data.addressLoadStatus === 'error') {
            wx.showToast({ title: '地址加载失败，请重试', icon: 'none' });
            return;
        }
        return submitOrder(this, app, this.brandAnimation);
    },

    onViewOrder() {
        wx.redirectTo({
            url: '/pages/order/list?status=pending'
        });
    },

    onBackHome() {
        wx.switchTab({
            url: '/pages/index/index'
        });
    },

    async loadPointBalance() {
        return loadPointBalance(this);
    },

    onTogglePoints(e) {
        return togglePoints(this, e.detail.value);
    },

    async loadWalletBalance() {
        return loadWalletBalance(this);
    },

    onToggleWallet(e) {
        return toggleWallet(this, e.detail.value);
    }
});
