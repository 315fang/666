// pages/order/refund-detail.js - 退款详情
const { get } = require('../../utils/request');

Page({
    data: {
        refund: null,
        loading: true,
        statusText: {
            pending: '审核中',
            approved: '审核通过，等待退款',
            rejected: '申请被拒绝',
            processing: '退款处理中',
            completed: '退款完成',
            cancelled: '已取消'
        },
        typeText: {
            refund_only: '仅退款',
            return_refund: '退货退款',
            exchange: '换货'
        },
        reasonText: {
            quality: '商品质量问题',
            wrong_item: '商品与描述不符',
            not_needed: '不想要了/买多了',
            damaged: '商品破损/缺件',
            other: '其他原因'
        }
    },

    onLoad(options) {
        if (options.id) {
            this.loadRefund(options.id);
        }
    },

    async loadRefund(id) {
        try {
            const res = await get(`/refunds/${id}`);
            if (res.code === 0 && res.data) {
                const refund = res.data;
                // 处理商品图片
                if (refund.order && refund.order.product && typeof refund.order.product.images === 'string') {
                    try { refund.order.product.images = JSON.parse(refund.order.product.images); } catch(e) { refund.order.product.images = []; }
                }
                this.setData({ refund, loading: false });
            }
        } catch (err) {
            this.setData({ loading: false });
            wx.showToast({ title: '加载失败', icon: 'none' });
        }
    }
});
