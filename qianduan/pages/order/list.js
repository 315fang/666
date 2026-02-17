// pages/order/list.js
const { get, post } = require('../../utils/request');
const { ORDER_STATUS, ORDER_STATUS_TEXT } = require('../../config/constants');
const { parseImages } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');

Page({
    data: {
        orders: [],
        currentStatus: '',
        loading: false,
        hasMore: true,
        page: 1,
        limit: 10
    },

    onLoad(options) {
        let status = options.status;
        if (status === 'all') status = '';
        if (status) {
            this.setData({ currentStatus: status }, () => {
                this.loadOrders();
            });
        } else {
            this.loadOrders();
        }
    },

    onShow() {
        // 每次显示时刷新（从详情页/退款页返回后应看到最新状态）
        this.setData({ page: 1, hasMore: true }, () => {
            this.loadOrders();
        });
    },

    onPullDownRefresh() {
        this.setData({ page: 1, hasMore: true });
        this.loadOrders().then(() => {
            wx.stopPullDownRefresh();
        });
    },

    // ★ 核心：加载订单 + 退款状态
    async loadOrders(append = false) {
        if (this.data.loading) return;

        this.setData({ loading: true });

        try {
            const { currentStatus, page, limit } = this.data;
            const params = { page, limit };

            // 「退款/售后」Tab 特殊处理：从 /refunds 接口拿
            if (currentStatus === 'refund') {
                await this._loadRefundOrders(append);
                return;
            }

            if (currentStatus) params.status = currentStatus;

            // ★ 并行加载订单列表 + 用户的活跃退款
            const [ordersRes, refundsRes] = await Promise.all([
                get('/orders', params),
                get('/refunds', { page: 1, limit: 100 }).catch(() => ({ data: { list: [] } }))
            ]);

            let newOrders = ordersRes.data?.list || ordersRes.data || [];
            const activeRefunds = (refundsRes.data?.list || [])
                .filter(r => ['pending', 'approved', 'processing'].includes(r.status));

            // 建立 order_id → refund 映射
            const refundMap = {};
            activeRefunds.forEach(r => {
                refundMap[r.order_id] = r;
            });

            // 处理每个订单
            newOrders = newOrders.map(order => {
                if (order.product && order.product.images) {
                    order.product.images = parseImages(order.product.images);
                }

                // ★ 检查该订单是否有活跃退款
                const activeRefund = refundMap[order.id];
                if (activeRefund) {
                    order.hasActiveRefund = true;
                    order.refundId = activeRefund.id;
                    order.refundStatus = activeRefund.status;
                    // 覆盖状态文本为退款状态
                    order.statusText = '退款中';
                    order.displayStatus = 'refunding';
                } else {
                    order.hasActiveRefund = false;
                    order.statusText = ORDER_STATUS_TEXT[order.status] || '未知状态';
                    order.displayStatus = order.status;
                }

                return order;
            });

            // 为新订单添加入场动画标记
            const ordersWithAnim = newOrders.map((order, index) => ({
                ...order,
                animateIn: !append  // 首次加载时添加动画
            }));

            this.setData({
                orders: append ? [...this.data.orders, ...ordersWithAnim] : ordersWithAnim,
                hasMore: newOrders.length >= limit,
                loading: false
            });

            // 清除动画标记
            if (!append) {
                setTimeout(() => {
                    const clearedOrders = this.data.orders.map(order => ({
                        ...order,
                        animateIn: false
                    }));
                    this.setData({ orders: clearedOrders });
                }, 800);
            }
        } catch (err) {
            ErrorHandler.handle(err, {
                customMessage: '加载订单失败，请稍后重试'
            });
            this.setData({ loading: false });
        }
    },

    // ★ 退款/售后 Tab 专用加载
    async _loadRefundOrders(append) {
        try {
            const { page, limit } = this.data;
            const res = await get('/refunds', { page, limit });
            const refundList = res.data?.list || [];

            // 将退款记录转换为类订单结构（便于复用同一个模板）
            const newOrders = refundList.map(refund => {
                const order = refund.order || {};
                if (order.product && typeof order.product.images === 'string') {
                    try { order.product.images = JSON.parse(order.product.images); } catch (e) { order.product.images = []; }
                }

                return {
                    ...order,
                    id: order.id,
                    hasActiveRefund: ['pending', 'approved', 'processing'].includes(refund.status),
                    refundId: refund.id,
                    refundStatus: refund.status,
                    statusText: this._getRefundStatusText(refund.status),
                    displayStatus: 'refund_' + refund.status,
                    refundType: refund.type,
                    refundAmount: refund.amount
                };
            });

            // 为新订单添加入场动画标记
            const ordersWithAnim = newOrders.map((order, index) => ({
                ...order,
                animateIn: !append
            }));

            this.setData({
                orders: append ? [...this.data.orders, ...ordersWithAnim] : ordersWithAnim,
                hasMore: refundList.length >= limit,
                loading: false
            });

            // 清除动画标记
            if (!append) {
                setTimeout(() => {
                    const clearedOrders = this.data.orders.map(order => ({
                        ...order,
                        animateIn: false
                    }));
                    this.setData({ orders: clearedOrders });
                }, 800);
            }
        } catch (err) {
            console.error('加载退款列表失败:', err);
            this.setData({ loading: false });
        }
    },

    _getRefundStatusText(status) {
        const map = {
            pending: '退款审核中',
            approved: '退款已通过',
            processing: '退款处理中',
            completed: '退款完成',
            rejected: '退款被拒绝',
            cancelled: '退款已取消'
        };
        return map[status] || '退款中';
    },

    // Tab切换
    onTabChange(e) {
        const status = e.currentTarget.dataset.status;
        this.setData({
            currentStatus: status,
            page: 1,
            hasMore: true,
            orders: []  // 清空旧数据，触发骨架屏
        }, () => {
            this.loadOrders();
        });
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

    // ★ 申请退款（从列表页直接操作）
    onApplyRefund(e) {
        const order = e.currentTarget.dataset.order;
        wx.navigateTo({
            url: `/pages/order/refund-apply?order_id=${order.id}`
        });
    },

    // ★ 查看退款详情
    onViewRefund(e) {
        const order = e.currentTarget.dataset.order;
        if (order.refundId) {
            wx.navigateTo({
                url: `/pages/order/refund-detail?id=${order.refundId}`
            });
        }
    },

    // 再次购买
    onBuyAgain(e) {
        const order = e.currentTarget.dataset.order;
        if (order.product_id) {
            wx.navigateTo({ url: `/pages/product/detail?id=${order.product_id}` });
        } else if (order.product && order.product.id) {
            wx.navigateTo({ url: `/pages/product/detail?id=${order.product.id}` });
        } else {
            wx.switchTab({ url: '/pages/index/index' });
        }
    }
});
