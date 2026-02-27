// pages/distribution/workbench.js - 代理商工作台
const { get, post } = require('../../utils/request');

Page({
    data: {
        workbench: {},
        orders: [],
        activeStatus: 'all',
        sliderLeft: 0,  // 滑动条位置
        loading: false,
        // 发货弹窗
        showShipPopup: false,
        shipOrder: {},
        shipCompany: '',
        shipTrackingNo: ''
    },

    // 计算滑动条位置
    calcSliderLeft(status) {
        const statusMap = {
            'all': 0,
            'pending': 1,
            'shipping_requested': 2,
            'shipped': 3
        };
        const index = statusMap[status] || 0;
        // 使用百分比偏移，每个 tab 占 100% (相对于 slider 宽度)
        return index * 100;
    },

    onShow() {
        // 初始化滑动条位置
        const sliderLeft = this.calcSliderLeft(this.data.activeStatus);
        this.setData({ sliderLeft: sliderLeft });
        this.loadWorkbench();
        this.loadOrders();
    },

    onPullDownRefresh() {
        Promise.all([this.loadWorkbench(), this.loadOrders()]).finally(() => {
            wx.stopPullDownRefresh();
        });
    },

    // 加载工作台数据
    async loadWorkbench() {
        try {
            const res = await get('/agent/workbench');
            if (res.code === 0) {
                this.setData({ workbench: res.data });
            }
        } catch (err) {
            console.error('加载工作台失败:', err);
        }
    },

    // 加载订单列表
    async loadOrders() {
        this.setData({ loading: true });
        try {
            const statusMap = {
                'pending': 'pending_ship',
                'shipped': 'shipped',
                'all': ''
            };
            const status = statusMap[this.data.activeStatus] || '';
            const params = { page: 1, limit: 50 };
            if (status) params.status = status;

            const res = await get('/agent/orders', params);
            if (res.code === 0) {
                let list = res.data.list || [];
                // 解析 address_snapshot
                list = list.map(item => {
                    if (item.address_snapshot && typeof item.address_snapshot === 'string') {
                        try { item.address_snapshot = JSON.parse(item.address_snapshot); } catch (e) { }
                    }
                    // 解析 images
                    if (item.product && typeof item.product.images === 'string') {
                        try { item.product.images = JSON.parse(item.product.images); } catch (e) { item.product.images = []; }
                    }
                    return item;
                });
                this.setData({ orders: list });
            }
        } catch (err) {
            console.error('加载订单失败:', err);
        }
        this.setData({ loading: false });
    },

    // 切换状态 Tab
    onStatusChange(e) {
        const status = e.currentTarget.dataset.status;
        const sliderLeft = this.calcSliderLeft(status);
        this.setData({
            activeStatus: status,
            sliderLeft: sliderLeft
        });
        this.loadOrders();
    },

    // 跳转采购入仓
    goRestock() {
        wx.navigateTo({ url: '/pages/distribution/restock' });
    },

    // 跳转库存明细
    goStockLogs() {
        wx.navigateTo({ url: '/pages/distribution/stock-logs' });
    }
});
