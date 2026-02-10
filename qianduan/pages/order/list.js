// pages/order/list.js
const { get, post } = require('../../utils/request');

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
            agent_confirmed: '代理已确认',
            shipping_requested: '待平台发货',
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

            // 处理每个订单的商品图片（后端为单商品订单模式）
            newOrders = newOrders.map(order => {
                if (order.product && typeof order.product.images === 'string') {
                    try {
                        order.product.images = JSON.parse(order.product.images);
                    } catch (e) {
                        order.product.images = order.product.images ? [order.product.images] : [];
                    }
                }
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
                        await post(`/orders/${order.id}/cancel`);
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
                        await post(`/orders/${order.id}/confirm`);
                        wx.showToast({ title: '已确认收货', icon: 'success' });
                        this.loadOrders();
                    } catch (err) {
                        wx.showToast({ title: '操作失败', icon: 'none' });
                    }
                }
            }
        });
    },

    // 查看物流
    onViewLogistics(e) {
        const order = e.currentTarget.dataset.order;
        if (order.tracking_no) {
            wx.navigateTo({
                url: `/pages/order/logistics?id=${order.id}`
            });
        } else {
            wx.showToast({ title: '暂无物流信息', icon: 'none' });
        }
    },

    // 再次购买
    onBuyAgain(e) {
        const order = e.currentTarget.dataset.order;
        // ... (保持原有逻辑)
        if (order.product_id) {
            wx.navigateTo({ url: `/pages/product/detail?id=${order.product_id}` });
        } else if (order.product && order.product.id) {
            wx.navigateTo({ url: `/pages/product/detail?id=${order.product.id}` });
        } else {
            wx.switchTab({ url: '/pages/index/index' });
        }
    }
});
