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

function buildCheckoutGuide(page) {
    const data = page.data || {};
    const availableCount = Number((data.availableCoupons || []).length || 0);
    const unusedCount = Number(data.unusedCouponCount || 0);
    const estimatedReward = Math.max(0, Math.floor(Number(data.finalAmount || data.totalAmount || 0)));

    let processTip = '';
    if (data.selectedCoupon) {
        processTip = `本单已使用优惠券，立省 ¥${data.couponDiscount || '0.00'}`;
    } else if (availableCount > 0) {
        processTip = `当前有 ${availableCount} 张优惠券可选，点击上方立即选择`;
    } else if (unusedCount > 0) {
        processTip = `你还有 ${unusedCount} 张优惠券暂不适用于本单`;
    }

    return {
        processTip,
        rewardTip: estimatedReward > 0 ? `支付完成预计获得 ${estimatedReward} 积分与成长值` : '',
        resultTip: data.deliveryType === 'pickup'
            ? '支付成功后可在“我的订单”查看，并按所选门店信息完成自提'
            : '支付成功后可在“我的订单”查看发货与售后进度'
    };
}

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
        unusedCouponCount: 0,
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
        groupActivityId: null,
        orderType: '',
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
        lightTipContent: '',
        checkoutGuide: {
            processTip: '',
            rewardTip: '',
            resultTip: ''
        }
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
                    groupActivityId: directBuy.group_activity_id || null,
                    orderType: directBuy.type || '',
                    loading: false
                });
                this._refreshPickupAllowed();
                this.loadAvailableCoupons();
                this._syncCheckoutGuide();
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
        const roleLevel = app.globalData.userInfo?.role_level || 0;
        if (roleLevel !== this.data.roleLevel) {
            this.setData({ roleLevel });
        }
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
        if ((this.data.orderItems || []).length > 0) {
            this.loadPointBalance();
            this.loadWalletBalance();
        }
        if ((this.data.orderItems || []).length > 0 && ((app.globalData.isLoggedIn && (this.data.availableCoupons || []).length === 0) || (this.data.availableCoupons || []).length === 0)) {
            this.loadAvailableCoupons();
        }
        this._tryAutoCouponUsagePrompt();
        this._syncCheckoutGuide();
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
        this.setData({ deliveryType: v, pickupStation: v === 'pickup' ? this.data.pickupStation : null }, () => this._syncCheckoutGuide());
        if (v === 'pickup') {
            this.loadPickupStations();
        }
    },

    async loadPickupStations() {
        return loadPickupStations(this);
    },

    /**
     * 当前位置授权后，按当前坐标请求门店距离并排序；
     * 若用户不在取货地，可继续用地图选点修正参考位置。
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
        const result = recalcFinal(this);
        this._syncCheckoutGuide();
        return result;
    },

    // 加载可用优惠券
    async loadAvailableCoupons() {
        await loadAvailableCoupons(this);
        this._syncCheckoutGuide();
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
        const result = await loadPointBalance(this);
        this._syncCheckoutGuide();
        return result;
    },

    onTogglePoints(e) {
        return togglePoints(this, e.detail.value);
    },

    async loadWalletBalance() {
        const result = await loadWalletBalance(this, app);
        this._syncCheckoutGuide();
        return result;
    },

    onToggleWallet(e) {
        return toggleWallet(this, e.detail.value);
    },

    _syncCheckoutGuide() {
        this.setData({ checkoutGuide: buildCheckoutGuide(this) });
    }
});
