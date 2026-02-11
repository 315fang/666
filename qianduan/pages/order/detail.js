// pages/order/detail.js - 订单详情
const { get, post } = require('../../utils/request');
const { parseImages } = require('../../utils/dataFormatter');

Page({
    data: {
        order: null,
        loading: true,
        // ★ 退款相关
        activeRefund: null,
        hasActiveRefund: false,

        statusMap: {
            pending: '待付款',
            paid: '待发货',
            agent_confirmed: '代理已确认',
            shipping_requested: '发货申请中',
            shipped: '待收货',
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
            refunding: '退款申请处理中，请耐心等待',
            refunded: '退款已完成'
        },
        refundStatusText: {
            pending: '审核中',
            approved: '审核通过',
            processing: '退款处理中',
            completed: '退款完成',
            rejected: '申请被拒绝',
            cancelled: '已取消'
        }
    },

    onLoad(options) {
        if (options.id) {
            this.setData({ orderId: options.id });
            this.loadOrder(options.id);
        }
    },

    // ★ 每次显示刷新（从退款申请页返回时需要更新状态）
    onShow() {
        if (this.data.orderId) {
            this.loadOrder(this.data.orderId);
        }
    },

    async loadOrder(id) {
        try {
            // ★ 并行加载订单详情和该订单的退款记录
            const [orderRes, refundsRes] = await Promise.all([
                get(`/orders/${id}`),
                get('/refunds', { page: 1, limit: 10 }).catch(() => ({ data: { list: [] } }))
            ]);

            const order = orderRes.data;

            // 处理商品图片
            if (order && order.product) {
                order.product.images = parseImages(order.product.images);
            }

            // ★ 查找该订单的活跃退款
            const allRefunds = refundsRes.data?.list || [];
            const activeRefund = allRefunds.find(r =>
                r.order_id === parseInt(id) &&
                ['pending', 'approved', 'processing'].includes(r.status)
            );

            // 也找最近完成/拒绝的退款（用于展示历史信息）
            const latestRefund = allRefunds.find(r => r.order_id === parseInt(id));

            this.setData({
                order,
                loading: false,
                activeRefund: activeRefund || null,
                hasActiveRefund: !!activeRefund,
                latestRefund: latestRefund || null
            });
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

    // ★ 查看退款详情
    onViewRefund() {
        const { activeRefund, latestRefund } = this.data;
        const refund = activeRefund || latestRefund;
        if (refund) {
            wx.navigateTo({
                url: `/pages/order/refund-detail?id=${refund.id}`
            });
        }
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
