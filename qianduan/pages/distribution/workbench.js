// pages/distribution/workbench.js - 代理商发货工作台
const { get, post } = require('../../utils/request');

Page({
    data: {
        workbench: {},
        orders: [],
        activeStatus: 'pending',
        loading: false,
        // 发货弹窗
        showShipPopup: false,
        shipOrder: {},
        shipCompany: '',
        shipTrackingNo: ''
    },

    onShow() {
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
        this.setData({ activeStatus: status });
        this.loadOrders();
    },

    // 打开发货弹窗
    onShipTap(e) {
        const order = e.currentTarget.dataset.order;
        this.setData({
            showShipPopup: true,
            shipOrder: order,
            shipCompany: '',
            shipTrackingNo: ''
        });
    },

    hideShipPopup() {
        this.setData({ showShipPopup: false });
    },

    onCompanyInput(e) {
        this.setData({ shipCompany: e.detail.value });
    },

    onTrackingInput(e) {
        this.setData({ shipTrackingNo: e.detail.value });
    },

    // 确认发货
    async confirmShip() {
        const { shipOrder, shipTrackingNo, shipCompany, workbench } = this.data;
        if (!shipTrackingNo.trim()) {
            wx.showToast({ title: '请填写物流单号', icon: 'none' });
            return;
        }

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

        wx.showLoading({ title: '发货中...' });
        try {
            const res = await post(`/agent/ship/${shipOrder.id}`, {
                tracking_no: shipTrackingNo.trim(),
                tracking_company: shipCompany.trim()
            });
            wx.hideLoading();
            if (res.code === 0) {
                wx.showToast({ title: '发货成功！', icon: 'success' });
                this.hideShipPopup();
                this.loadWorkbench();
                this.loadOrders();
            } else {
                wx.showToast({ title: res.message || '发货失败', icon: 'none' });
            }
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: err.message || '发货失败', icon: 'none' });
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
