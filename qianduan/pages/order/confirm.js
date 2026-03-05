// pages/order/confirm.js - 订单确认页
const { get, post } = require('../../utils/request');
const { processProduct } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');
const { getDefaultAddress, navigateToAddressList, navigateToAddressEdit } = require('../../utils/address');
const app = getApp();

Page({
    data: {
        loading: true,
        submitting: false,
        // 来源：cart（购物车）或 direct（直接购买）
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
        finalAmount: '0.00'
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
            // 直接购买 - 从缓存读取购买信息
            const directBuy = wx.getStorageSync('directBuyInfo');
            if (directBuy) {
                const amt = (parseFloat(directBuy.price) * directBuy.quantity).toFixed(2);
                this.setData({
                    orderItems: [directBuy],
                    totalAmount: amt,
                    finalAmount: amt,
                    totalCount: directBuy.quantity,
                    loading: false
                });
                this.loadAvailableCoupons();
            } else {
                wx.showToast({ title: '商品信息丢失', icon: 'none' });
                this.setData({ loading: false });
            }
        } else if (options.cart_ids) {
            // 购物车结算 - 加载选中的购物车项
            this.loadCartItems(options.cart_ids);
        } else {
            this.setData({ loading: false });
        }

        // 加载默认地址
        this.loadDefaultAddress();
    },

    onShow() {
        // 从地址选择页返回时刷新地址
        const selectedAddress = wx.getStorageSync('selectedAddress');
        if (selectedAddress) {
            this.setData({ address: selectedAddress });
            wx.removeStorageSync('selectedAddress');
        }
    },

    // 加载默认收货地址
    async loadDefaultAddress() {
        try {
            const address = await getDefaultAddress();
            this.setData({ address });
        } catch (err) {
            ErrorHandler.handle(err, { showToast: false });
            console.error('加载默认地址失败:', err);
        }
    },

    // 加载购物车选中项
    async loadCartItems(cartIds) {
        try {
            const res = await get('/cart');
            const allItems = res.data?.items || res.data || [];
            const ids = cartIds.split(',').map(Number);
            const { roleLevel } = this.data;

            const selectedItems = allItems
                .filter(item => ids.includes(item.id))
                .map(item => {
                    const processed = processProduct(item.product, roleLevel);
                    return {
                        cart_id: item.id,
                        product_id: item.product_id,
                        sku_id: item.sku_id,
                        quantity: item.quantity,
                        // ★ 优先使用后端返回的等级价格，fallback 到工具函数计算出的等级价
                        price: parseFloat(item.effective_price || processed.displayPrice || 0),
                        name: processed.name || '商品',
                        image: item.sku?.image || processed.firstImage,
                        spec: item.sku ? `${item.sku.spec_name}: ${item.sku.spec_value}` : ''
                    };
                });

            let totalAmount = 0;
            let totalCount = 0;
            selectedItems.forEach(item => {
                totalAmount += item.price * item.quantity;
                totalCount += item.quantity;
            });

            this.setData({
                orderItems: selectedItems,
                totalAmount: totalAmount.toFixed(2),
                finalAmount: totalAmount.toFixed(2),
                totalCount,
                loading: false
            });
            this.loadAvailableCoupons();
        } catch (err) {
            console.error('加载购物车失败:', err);
            this.setData({ loading: false });
        }
    },

    // 重新计算最终价格
    _recalcFinal() {
        const total = parseFloat(this.data.totalAmount);
        const discount = parseFloat(this.data.couponDiscount);
        const final = Math.max(0, total - discount).toFixed(2);
        this.setData({ finalAmount: final });
    },

    // 加载可用优惠券
    async loadAvailableCoupons() {
        if (!app.globalData.isLoggedIn) return;
        try {
            const amount = this.data.totalAmount;
            const res = await get(`/coupons/available?amount=${amount}`);
            if (res.code === 0) {
                this.setData({ availableCoupons: res.data || [] });
            }
        } catch (e) {
            // 静默失败，不影响下单
        }
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
        // 若点击已选中的券则取消
        if (this.data.selectedCoupon && this.data.selectedCoupon.id === coupon.id) {
            this.onClearCoupon();
            return;
        }
        const total = parseFloat(this.data.totalAmount);
        let discount = 0;
        if (coupon.coupon_type === 'fixed') {
            discount = Math.min(parseFloat(coupon.coupon_value), total);
        } else if (coupon.coupon_type === 'percent') {
            discount = parseFloat((total * (1 - parseFloat(coupon.coupon_value))).toFixed(2));
        }
        this.setData({
            selectedCoupon: coupon,
            couponDiscount: discount.toFixed(2),
            showCouponPicker: false
        });
        this._recalcFinal();
    },

    // 清除已选优惠券
    onClearCoupon() {
        this.setData({
            selectedCoupon: null,
            couponDiscount: '0.00',
            showCouponPicker: false
        });
        this._recalcFinal();
    },

    // 选择地址
    onSelectAddress() {
        navigateToAddressList();
    },

    // 新增地址
    onAddAddress() {
        navigateToAddressEdit();
    },

    // 备注输入
    onRemarkInput(e) {
        this.setData({ remark: e.detail.value });
    },

    // 提交订单
    async onSubmit() {
        const { address, orderItems, remark, submitting, selectedCoupon } = this.data;

        if (submitting) return;

        if (!address) {
            wx.showToast({ title: '请选择收货地址', icon: 'none' });
            return;
        }

        if (orderItems.length === 0) {
            wx.showToast({ title: '没有可提交的商品', icon: 'none' });
            return;
        }

        this.setData({ submitting: true });

        try {
            const orderData = {
                address_id: address.id,
                remark,
                items: orderItems.map(item => ({
                    product_id: item.product_id,
                    sku_id: item.sku_id || null,
                    quantity: item.quantity,
                    cart_id: item.cart_id || null
                }))
            };

            if (selectedCoupon) {
                orderData.user_coupon_id = selectedCoupon.id;
            }

            // 提交订单
            const res = await post('/orders', orderData);

            this.setData({ submitting: false });

            // 清除直接购买缓存
            if (this.data.from === 'direct') {
                wx.removeStorageSync('directBuyInfo');
            }

            // 获取返回的订单 ID（支持单订单或拆单返回数组取第一个）
            const orderResult = Array.isArray(res.data) ? res.data[0] : res.data;
            const orderId = orderResult && orderResult.id;

            // 触发下单成功动画
            if (this.brandAnimation) {
                this.brandAnimation.show('success');
            }

            // 动画结束后跳转到订单详情页（用户在详情页完成支付）
            setTimeout(() => {
                if (orderId) {
                    wx.redirectTo({ url: `/pages/order/detail?id=${orderId}` });
                } else {
                    // 兜底：跳转到待付款列表
                    wx.redirectTo({ url: '/pages/order/list?status=pending' });
                }
            }, 1500);
        } catch (err) {
            this.setData({ submitting: false });
            ErrorHandler.handle(err, { customMessage: '下单失败，请稍后重试' });
            console.error('提交订单失败:', err);
        }
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
    }
});
