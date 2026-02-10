// pages/order/detail.js - 订单详情
const { get, post } = require('../../utils/request');

Page({
    data: {
        order: null,
        loading: true,
        statusMap: {
            pending: '待付款',
            paid: '待发货',
            agent_confirmed: '代理商已确认',
            shipping_requested: '发货申请中',
            shipped: '配送中',
            completed: '已完成',
            cancelled: '已取消',
            refunding: '退款中',
            refunded: '已退款'
        },
        statusDescMap: {
            pending: '请尽快完成支付',
            paid: '已支付成功，等待商家发货',
            agent_confirmed: '代理商已确认，正在准备发货',
            shipping_requested: '发货申请已提交，等待仓库处理',
            shipped: '商品已发出，请注意查收快递',
            completed: '交易已完成，佣金将在7天后结算',
            cancelled: '订单已取消',
            refunded: '退款已完成'
        }
    },

    onLoad(options) {
        if (options.id) {
            this.setData({ orderId: options.id });
            this.loadOrder(options.id);
        }
    },

    async loadOrder(id) {
        try {
            const res = await get(`/orders/${id}`);
            const order = res.data;

            // 处理商品图片
            if (order && order.product && typeof order.product.images === 'string') {
                try {
                    order.product.images = JSON.parse(order.product.images);
                } catch (e) {
                    order.product.images = [];
                }
            }

            this.setData({ order, loading: false });
        } catch (err) {
            console.error('加载订单失败:', err);
            this.setData({ loading: false });
            wx.showToast({ title: '加载失败', icon: 'none' });
        }
    },

    // 支付订单（模拟支付）
    async onPayOrder() {
        const { order } = this.data;

        wx.showModal({
            title: '确认支付',
            content: `确认支付 ¥${order.total_amount}？\n(当前为模拟支付，不会真实扣款)`,
            success: async (res) => {
                if (res.confirm) {
                    try {
                        wx.showLoading({ title: '支付中...' });
                        const payRes = await post(`/orders/${order.id}/pay`);
                        wx.hideLoading();

                        if (payRes.code === 0) {
                            wx.showToast({ title: '支付成功！', icon: 'success' });
                            this.loadOrder(order.id);
                        } else {
                            wx.showToast({ title: payRes.message || '支付失败', icon: 'none' });
                        }
                    } catch (err) {
                        wx.hideLoading();
                        wx.showToast({ title: '支付失败', icon: 'none' });
                    }
                }
            }
        });
    },

    // 确认收货
    async onConfirmReceive() {
        const { order } = this.data;

        wx.showModal({
            title: '确认收货',
            content: '确认已收到商品？确认后佣金将在7天后结算给推荐人。',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        const confirmRes = await post(`/orders/${order.id}/confirm`);
                        if (confirmRes.code === 0) {
                            wx.showToast({ title: '已确认收货', icon: 'success' });
                            this.loadOrder(order.id);
                        }
                    } catch (err) {
                        wx.showToast({ title: '操作失败', icon: 'none' });
                    }
                }
            }
        });
    },

    // 取消订单
    async onCancelOrder() {
        const { order } = this.data;

        wx.showModal({
            title: '取消订单',
            content: '确定要取消该订单吗？',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        await post(`/orders/${order.id}/cancel`);
                        wx.showToast({ title: '订单已取消', icon: 'success' });
                        this.loadOrder(order.id);
                    } catch (err) {
                        wx.showToast({ title: '取消失败', icon: 'none' });
                    }
                }
            }
        });
    },

    // 申请退款
    onApplyRefund() {
        const { order } = this.data;
        wx.navigateTo({
            url: `/pages/order/refund-apply?order_id=${order.id}`
        });
    },

    // 查看物流
    onViewLogistics() {
        const { order } = this.data;
        if (order.tracking_no) {
            wx.navigateTo({
                url: `/pages/order/logistics?id=${order.id}`
            });
        } else {
            wx.showToast({ title: '暂无物流信息', icon: 'none' });
        }
    },

    // 复制单号
    onCopyTrackingNo() {
        const { order } = this.data;
        if (order.tracking_no) {
            wx.setClipboardData({
                data: order.tracking_no,
                success: () => {
                    wx.showToast({ title: '单号已复制', icon: 'success' });
                }
            });
        }
    }
});
