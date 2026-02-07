// pages/order/detail.js - 订单详情（简化版）
const { get, post } = require('../../utils/request');

Page({
    data: {
        order: null,
        loading: true
    },

    onLoad(options) {
        if (options.id) {
            this.loadOrder(options.id);
        }
    },

    async loadOrder(id) {
        try {
            const res = await get(`/orders/${id}`);
            this.setData({ order: res.data, loading: false });
        } catch (err) {
            console.error('加载订单失败:', err);
            this.setData({ loading: false });
        }
    }
});
