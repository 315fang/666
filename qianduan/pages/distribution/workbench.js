// pages/distribution/workbench.js - 代理商工作台
// 业务模型：工厂直接发货，代理商管理云库存
// 代理商职责：确认订单 + 扣除云库存，不负责实际发货和物流录入
const { get, post } = require('../../utils/request');

Page({
    data: {
        workbench: {},
        orders: [],
        activeStatus: 'all',
        sliderLeft: 0,  // 滑动条位置
        loading: false,
        // 订单确认弹窗
        showShipPopup: false,
        shipOrder: {}
    },

    // 计算滑动条位置
    calcSliderLeft(status) {
        const statusMap = {
            'all': 0,
            'pending': 1,
            'shipped': 2,
            'completed': 3
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

    // 打开订单确认弹窗
    onConfirmTap(e) {
        const order = e.currentTarget.dataset.order;
        this.setData({
            showShipPopup: true,
            shipOrder: order
        });
    },

    hideShipPopup() {
        this.setData({ showShipPopup: false });
    },

    // 确认订单 - 扣除云库存并通知工厂发货
    async confirmOrder() {
        const { shipOrder, workbench } = this.data;

        // Check Cloud Stock
        if ((workbench.stock_count || 0) < (shipOrder.quantity || 1)) {
            wx.showModal({
                title: '库存不足',
                content: `当前云仓库存 ${workbench.stock_count || 0} 件，该订单需要 ${shipOrder.quantity} 件。请先采购入仓。`,
                showCancel: true,
                cancelText: '取消',
                confirmText: '去采购',
                success: (res) => {
                    if (res.confirm) this.goRestock();
                }
            });
            return;
        }

        wx.showLoading({ title: '确认中...' });
        try {
            // 云库存模式：代理商确认订单后，系统自动扣除云库存
            // 工厂后台会收到发货通知，由工厂负责实际发货和物流录入
            const res = await post(`/agent/confirm-order/${shipOrder.id}`);
            wx.hideLoading();
            if (res.code === 0) {
                wx.showToast({ title: '确认成功，已通知工厂发货', icon: 'success' });
                this.hideShipPopup();
                this.loadWorkbench();
                this.loadOrders();
            } else {
                wx.showToast({ title: res.message || '操作失败', icon: 'none' });
            }
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        }
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
