// pages/order/refund-apply.js - 申请退货/退款
const { get, post } = require('../../utils/request');

Page({
    data: {
        orderId: null,
        order: null,
        type: 'refund_only', // refund_only / return_refund
        reason: '',
        description: '',
        amount: '',
        refundQuantity: 0, // 退货数量，仅 return_refund 时有值
        reasons: [
            { value: 'quality', label: '商品质量问题' },
            { value: 'wrong_item', label: '商品与描述不符' },
            { value: 'not_needed', label: '不想要了/买多了' },
            { value: 'damaged', label: '商品破损/缺件' },
            { value: 'other', label: '其他原因' }
        ],
        reasonIndex: -1,
        submitting: false
    },

    onLoad(options) {
        if (options.order_id) {
            this.setData({ orderId: options.order_id });
            this.loadOrder(options.order_id);
        }
        if (options.type) {
            this.setData({ type: options.type });
        }
    },

    async loadOrder(id) {
        try {
            const res = await get(`/orders/${id}`);
            const order = res.data;
            if (order && order.product && typeof order.product.images === 'string') {
                try { order.product.images = JSON.parse(order.product.images); } catch(e) { order.product.images = []; }
            }
            this.setData({
                order,
                amount: order.total_amount
            });
        } catch (err) {
            wx.showToast({ title: '加载订单失败', icon: 'none' });
        }
    },

    onTypeChange(e) {
        const type = e.detail.value;
        this.setData({
            type,
            // 切换到退货退款时，默认退货数量 = 订单数量
            refundQuantity: type === 'return_refund' ? (this.data.order ? this.data.order.quantity : 0) : 0
        });
    },

    onReasonChange(e) {
        const index = parseInt(e.detail.value);
        this.setData({
            reasonIndex: index,
            reason: this.data.reasons[index].value
        });
    },

    onDescInput(e) {
        this.setData({ description: e.detail.value });
    },

    onAmountInput(e) {
        this.setData({ amount: e.detail.value });
    },

    onRefundQtyInput(e) {
        let qty = parseInt(e.detail.value) || 0;
        const maxQty = this.data.order ? this.data.order.quantity : 0;
        if (qty < 0) qty = 0;
        if (qty > maxQty) qty = maxQty;
        this.setData({ refundQuantity: qty });
    },

    onRefundQtyMinus() {
        if (this.data.refundQuantity > 1) {
            this.setData({ refundQuantity: this.data.refundQuantity - 1 });
        }
    },

    onRefundQtyPlus() {
        const maxQty = this.data.order ? this.data.order.quantity : 0;
        if (this.data.refundQuantity < maxQty) {
            this.setData({ refundQuantity: this.data.refundQuantity + 1 });
        }
    },

    async onSubmit() {
        const { orderId, type, reason, description, amount, refundQuantity, submitting } = this.data;

        if (submitting) return;

        if (!reason) {
            wx.showToast({ title: '请选择退款原因', icon: 'none' });
            return;
        }

        const refundAmount = parseFloat(amount);
        if (!refundAmount || refundAmount <= 0) {
            wx.showToast({ title: '请输入有效退款金额', icon: 'none' });
            return;
        }

        if (refundAmount > parseFloat(this.data.order.total_amount)) {
            wx.showToast({ title: '退款金额不能超过订单金额', icon: 'none' });
            return;
        }

        // ★ 退货退款必须填退货数量
        if (type === 'return_refund' && (!refundQuantity || refundQuantity <= 0)) {
            wx.showToast({ title: '请填写退货数量', icon: 'none' });
            return;
        }

        this.setData({ submitting: true });

        try {
            const params = {
                order_id: parseInt(orderId),
                type,
                reason,
                description,
                amount: refundAmount
            };
            // 退货退款传退货数量，仅退款不传（后端默认0）
            if (type === 'return_refund') {
                params.refund_quantity = refundQuantity;
            }

            const res = await post('/refunds', params);

            if (res.code === 0) {
                wx.showToast({ title: '申请已提交', icon: 'success' });
                setTimeout(() => {
                    wx.navigateBack();
                }, 1500);
            } else {
                wx.showToast({ title: res.message || '申请失败', icon: 'none' });
            }
        } catch (err) {
            wx.showToast({ title: err.message || '申请失败', icon: 'none' });
        } finally {
            this.setData({ submitting: false });
        }
    }
});
