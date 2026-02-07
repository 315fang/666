// pages/order/confirm.js - 订单确认页（简化版）
Page({
    data: { loading: true },
    onLoad(options) {
        console.log('订单确认页参数:', options);
        this.setData({ loading: false });
    }
});
