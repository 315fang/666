// pages/order/confirm.js - 订单确认页
const { get, post } = require('../../utils/request');

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
        totalCount: 0
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
    },

    onLoad(options) {
        this.setData({ from: options.from || 'cart' });

        if (options.from === 'direct') {
            // 直接购买 - 从缓存读取购买信息
            const directBuy = wx.getStorageSync('directBuyInfo');
            if (directBuy) {
                this.setData({
                    orderItems: [directBuy],
                    totalAmount: (parseFloat(directBuy.price) * directBuy.quantity).toFixed(2),
                    totalCount: directBuy.quantity,
                    loading: false
                });
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
            const res = await get('/addresses');
            const addresses = res.list || res.data || [];
            // 优先用默认地址，没有则用第一个
            const defaultAddr = addresses.find(a => a.is_default) || addresses[0] || null;
            this.setData({ address: defaultAddr });
        } catch (err) {
            console.error('加载地址失败:', err);
        }
    },

    // 加载购物车选中项
    async loadCartItems(cartIds) {
        try {
            const res = await get('/cart');
            const allItems = res.data?.items || res.data || [];
            const ids = cartIds.split(',').map(Number);

            const selectedItems = allItems
                .filter(item => ids.includes(item.id))
                .map(item => ({
                    cart_id: item.id,
                    product_id: item.product_id,
                    sku_id: item.sku_id,
                    quantity: item.quantity,
                    // ★ 使用后端返回的等级价格（effective_price），而非固定 retail_price
                    price: parseFloat(item.effective_price || item.sku?.retail_price || item.product?.retail_price || 0),
                    name: item.product?.name || '商品',
                    image: (item.product?.images && item.product.images[0]) || '',
                    spec: item.sku ? `${item.sku.spec_name}: ${item.sku.spec_value}` : ''
                }));

            let totalAmount = 0;
            let totalCount = 0;
            selectedItems.forEach(item => {
                totalAmount += item.price * item.quantity;
                totalCount += item.quantity;
            });

            this.setData({
                orderItems: selectedItems,
                totalAmount: totalAmount.toFixed(2),
                totalCount,
                loading: false
            });
        } catch (err) {
            console.error('加载购物车失败:', err);
            this.setData({ loading: false });
        }
    },

    // 选择地址
    onSelectAddress() {
        wx.navigateTo({ url: '/pages/address/list?select=true' });
    },

    // 新增地址
    onAddAddress() {
        wx.navigateTo({ url: '/pages/address/edit' });
    },

    // 备注输入
    onRemarkInput(e) {
        this.setData({ remark: e.detail.value });
    },

    // 提交订单
    async onSubmit() {
        const { address, orderItems, remark, submitting } = this.data;

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
            wx.showToast({ title: err.message || '下单失败', icon: 'none' });
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
