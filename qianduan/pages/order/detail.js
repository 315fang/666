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

    // 支付订单
    // TODO: 集成微信支付 - 生产环境需要替换为真实的微信支付流程
    async onPayOrder() {
        const { order } = this.data;

        // 生产环境集成步骤：
        // 1. 向后端请求预支付订单：POST /orders/{id}/prepay
        // 2. 后端调用微信统一下单接口，返回支付参数
        // 3. 调用 wx.requestPayment 发起支付
        // 4. 根据支付结果更新订单状态

        // 当前为模拟支付环境
        wx.showModal({
            title: '确认支付',
            content: `确认支付 ¥${order.total_amount}？\n\n⚠️ 当前为模拟支付环境，不会真实扣款\n生产环境请集成微信支付`,
            success: async (res) => {
                if (res.confirm) {
                    // 模拟支付流程
                    await this.mockPayment(order);
                }
            }
        });
    },

    // 模拟支付 - 生产环境替换为真实微信支付
    async mockPayment(order) {
        try {
            wx.showLoading({ title: '支付中...' });

            // 模拟支付API调用
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
    },

    // 真实微信支付实现示例（生产环境启用）
    // async realWeChatPayment(order) {
    //     try {
    //         wx.showLoading({ title: '正在拉起支付...' });
    //
    //         // 1. 向后端请求预支付参数
    //         const prepayRes = await post(`/orders/${order.id}/prepay`);
    //
    //         if (prepayRes.code !== 0) {
    //             throw new Error(prepayRes.message || '获取支付参数失败');
    //         }
    //
    //         const paymentParams = prepayRes.data; // 后端返回的支付参数
    //
    //         // 2. 调起微信支付
    //         await wx.requestPayment({
    //             timeStamp: paymentParams.timeStamp,
    //             nonceStr: paymentParams.nonceStr,
    //             package: paymentParams.package,
    //             signType: paymentParams.signType || 'RSA',
    //             paySign: paymentParams.paySign
    //         });
    //
    //         wx.hideLoading();
    //
    //         // 3. 支付成功处理
    //         wx.showToast({ title: '支付成功', icon: 'success' });
    //
    //         // 4. 刷新订单状态
    //         setTimeout(() => {
    //             this.loadOrder(order.id);
    //         }, 1500);
    //
    //     } catch (err) {
    //         wx.hideLoading();
    //
    //         // 处理支付错误
    //         if (err.errMsg) {
    //             if (err.errMsg.indexOf('cancel') > -1) {
    //                 wx.showToast({ title: '已取消支付', icon: 'none' });
    //             } else if (err.errMsg.indexOf('fail') > -1) {
    //                 wx.showToast({ title: '支付失败，请重试', icon: 'none' });
    //             }
    //         } else {
    //             wx.showToast({ title: err.message || '支付异常', icon: 'none' });
    //         }
    //     }
    // },

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
