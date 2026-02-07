// pages/order/list.js
const { get, put } = require('../../utils/request');

Page({
    data: {
        orders: [],
        currentStatus: '',
        loading: false,
        hasMore: true,
        page: 1,
        limit: 10,
        statusText: {
            pending: '待付款',
            paid: '待发货',
            shipped: '待收货',
            completed: '已完成',
            cancelled: '已取消',
            refunding: '退款中'
        }
    },

    onLoad(options) {
        if (options.status) {
            this.setData({ currentStatus: options.status });
        }
        this.loadOrders();
    },

    onShow() {
        // 每次显示时刷新
        this.setData({ page: 1, hasMore: true });
        this.loadOrders();
    },

    onPullDownRefresh() {
        this.setData({ page: 1, hasMore: true });
        this.loadOrders().then(() => {
            wx.stopPullDownRefresh();
        });
    },

    // 加载订单
    async loadOrders(append = false) {
        if (this.data.loading) return;

        this.setData({ loading: true });

        try {
            const { currentStatus, page, limit } = this.data;
            const params = { page, limit };

            if (currentStatus) params.status = currentStatus;

            const res = await get('/orders', params);
            let newOrders = res.data?.list || res.data || [];

            // 计算每个订单的商品总数
            newOrders = newOrders.map(order => {
                const items = order.items || [];
                order.totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

                // 处理商品图片
                items.forEach(item => {
                    if (item.product && typeof item.product.images === 'string') {
                        try {
                            item.product.images = JSON.parse(item.product.images);
                        } catch (e) {
                            item.product.images = item.product.images ? [item.product.images] : [];
                        }
                    }
                });

                return order;
            });

            this.setData({
                orders: append ? [...this.data.orders, ...newOrders] : newOrders,
                hasMore: newOrders.length >= limit,
                loading: false
            });
        } catch (err) {
            console.error('加载订单失败:', err);
            this.setData({ loading: false });
        }
    },

    // Tab切换
    onTabChange(e) {
        const status = e.currentTarget.dataset.status;
        this.setData({
            currentStatus: status,
            page: 1,
            hasMore: true
        });
        this.loadOrders();
    },

    // 加载更多
    onLoadMore() {
        if (!this.data.hasMore || this.data.loading) return;
        this.setData({ page: this.data.page + 1 });
        this.loadOrders(true);
    },

    // 订单点击
    onOrderTap(e) {
        const order = e.currentTarget.dataset.order;
        wx.navigateTo({ url: `/pages/order/detail?id=${order.id}` });
    },

    // 取消订单
    onCancelOrder(e) {
        const order = e.currentTarget.dataset.order;

        wx.showModal({
            title: '确认取消',
            content: '确定要取消该订单吗？',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        await put(`/orders/${order.id}/cancel`);
                        wx.showToast({ title: '订单已取消', icon: 'success' });
                        this.loadOrders();
                    } catch (err) {
                        wx.showToast({ title: '取消失败', icon: 'none' });
                    }
                }
            }
        });
    },

    // 去付款
    onPayOrder(e) {
        const order = e.currentTarget.dataset.order;
        wx.navigateTo({ url: `/pages/order/detail?id=${order.id}` });
    },

    // 确认收货
    onConfirmReceive(e) {
        const order = e.currentTarget.dataset.order;

        wx.showModal({
            title: '确认收货',
            content: '确定已收到商品吗？',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        await put(`/orders/${order.id}/confirm`);
                        wx.showToast({ title: '已确认收货', icon: 'success' });
                        this.loadOrders();
                    } catch (err) {
                        wx.showToast({ title: '操作失败', icon: 'none' });
                    }
                }
            }
        });
    },

    // 再次购买
    onBuyAgain(e) {
        const order = e.currentTarget.dataset.order;
        // 跳转到首页或商品详情
        if (order.items && order.items.length > 0) {
            const productId = order.items[0].product_id;
            wx.navigateTo({ url: `/pages/product/detail?id=${productId}` });
        } else {
            wx.switchTab({ url: '/pages/index/index' });
        }
    }
});
