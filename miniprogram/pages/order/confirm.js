// pages/order/confirm.js - 订单确认页
const { get } = require('../../utils/request');
const app = getApp();
const { getLightPromptModals } = require('../../utils/miniProgramConfig');
const { shouldShowDaily, markDailyShown } = require('../../utils/lightPrompt');
const {
    navigateToAddressList,
    refreshPickupAllowed,
    loadPickupStations,
    locateForPickupSort,
    chooseRefLocation,
    loadDefaultAddress,
    loadCartItems
} = require('./orderConfirmAddress');
const {
    recalcFinal,
    loadAvailableCoupons,
    selectCoupon,
    clearCoupon
} = require('./orderConfirmPricing');
const { submitOrder } = require('./orderConfirmSubmission');
const {
    loadPointBalance,
    togglePoints,
    loadWalletBalance,
    toggleWallet
} = require('./orderConfirmAccount');

Page({
    data: {
        loading: true,
        submitting: false,
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
        roleLevel: 0,
        // 优惠券
        availableCoupons: [],
        selectedCoupon: null,
        showCouponPicker: false,
        couponDiscount: '0.00',
        finalAmount: '0.00',
        shippingFee: 0,
        // 积分抵扣
        pointBalance: 0,
        usePoints: false,
        pointsToUse: 0,
        pointsDeduction: '0.00',
        // 活动单号
        slashNo: null,
        groupNo: null,
        // B端货款余额支付
        walletBalance: 0,
        useWallet: false,
        isAgent: false,
        // 到店自提（需商品 supports_pickup + 后台维护自提门店）
        pickupAllowed: false,
        deliveryType: 'express',
        pickupStations: [],
        pickupStation: null,
        refLat: null,
        refLng: null,
        refLocationName: '',
        /** 无参考坐标时列表不展示距离，用于提示用户可定位 */
        pickupDistanceHint: false,
        lightTipShow: false,
        lightTipTitle: '',
        lightTipContent: ''
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
    },

    onLoad(options) {
        const roleLevel = app.globalData.userInfo?.role_level || 0;
        this.setData({ 
            from: options.from || 'cart',
            roleLevel
        });

        if (options.from === 'direct') {
            const directBuy = wx.getStorageSync('directBuyInfo');
            if (directBuy) {
                const amt = (parseFloat(directBuy.price) * directBuy.quantity).toFixed(2);
                this.setData({
                    orderItems: [directBuy],
                    totalAmount: amt,
                    finalAmount: amt,
                    totalCount: directBuy.quantity,
                    slashNo: directBuy.slash_no || null,
                    groupNo: directBuy.group_no || null,
                    loading: false
                });
                this._refreshPickupAllowed();
                this.loadAvailableCoupons();
            } else {
                wx.showToast({ title: '商品信息丢失', icon: 'none' });
                this.setData({ loading: false });
            }
        } else if (options.cart_ids) {
            // 购物袋结算 - 加载选中的购物袋项
            this.loadCartItems(options.cart_ids);
        } else {
            this.setData({ loading: false });
        }

        // 加载默认地址
        this.loadDefaultAddress();
        // 加载积分余额
        this.loadPointBalance();
        // 加载B端货款余额
        this.loadWalletBalance();
    },

    onShow() {
        // 从地址选择页返回时刷新地址
        const selectedAddress = wx.getStorageSync('selectedAddress');
        if (selectedAddress) {
            this.setData({ address: selectedAddress });
            wx.removeStorageSync('selectedAddress');
            if (this.data.deliveryType === 'pickup') {
                this.loadPickupStations();
            }
            this._tryAutoCouponUsagePrompt();
            return;
        }
        if (!this.data.address) {
            this.loadDefaultAddress();
        }
        this._tryAutoCouponUsagePrompt();
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
            wx.showToast({ title: '暂无可展示说明', icon: 'none' });
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

    /** 当前购物袋/直购是否全部支持自提 */
    _refreshPickupAllowed() {
        return refreshPickupAllowed(this);
    },

    onDeliveryTypeChange(e) {
        const v = e.currentTarget.dataset.type;
        if (v !== 'express' && v !== 'pickup') return;
        if (v === 'pickup' && !this.data.pickupAllowed) {
            wx.showToast({ title: '当前商品不支持到店自提', icon: 'none' });
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

    /**
     * 方案 A：仅 wx.getFuzzyLocation + wx.chooseLocation，不传 wx.getLocation（易过审）。
     * 模糊坐标 → pickup-options 展示距离并由近到远排序；更准请用 onChooseRefLocation。
     */
    async onLocateForPickupSort() {
        return locateForPickupSort(this);
    },

    onSelectPickupStation(e) {
        const id = e.currentTarget.dataset.id;
        const station = (this.data.pickupStations || []).find((s) => s.id === id);
        if (station) this.setData({ pickupStation: station });
    },

    /** 用地图选点（微信原生能力，不产生腾讯位置服务按次计费） */
    onChooseRefLocation() {
        return chooseRefLocation(this);
    },

    clearRefLocation() {
        this.setData({ refLat: null, refLng: null, refLocationName: '' });
        this.loadPickupStations();
    },

    /** 全量服务站点地图（分包页），未登录也可浏览 */
    onOpenStationsMap() {
        wx.navigateTo({ url: '/pages/stations/map' });
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
        return loadAvailableCoupons(this, app.globalData.isLoggedIn);
    },

    // 点击优惠券行，打开选择器
    onCouponTap() {
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
        navigateToAddressList();
    },

    // 新增地址
    onAddAddress() {
        navigateToAddressList();
    },

    // 备注输入
    onRemarkInput(e) {
        this.setData({ remark: e.detail.value });
    },

    // 提交订单
    async onSubmit() {
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
        return loadWalletBalance(this, app);
    },

    onToggleWallet(e) {
        return toggleWallet(this, e.detail.value);
    }
});
