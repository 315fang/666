// pages/address/list.js - 收货地址列表
const { get, post } = require('../../utils/request');

Page({
    data: {
        addresses: [],
        loading: true,
        selectMode: false // 是否为选择模式（从订单确认页进入）
    },

    onLoad(options) {
        if (options.select === 'true') {
            this.setData({ selectMode: true });
        }
    },

    onShow() {
        this.loadAddresses();
    },

    async loadAddresses() {
        try {
            this.setData({ loading: true });
            const res = await get('/addresses');
            const addresses = res.list || res.data || [];
            this.setData({ addresses, loading: false });
        } catch (err) {
            console.error('加载地址失败:', err);
            this.setData({ loading: false });
        }
    },

    // 选择地址（选择模式下点击地址卡片）
    onSelectAddress(e) {
        if (!this.data.selectMode) return;
        const index = e.currentTarget.dataset.index;
        const address = this.data.addresses[index];
        wx.setStorageSync('selectedAddress', address);
        wx.navigateBack();
    },

    // 新增地址
    onAddAddress() {
        wx.navigateTo({ url: '/pages/address/edit' });
    },

    // 编辑地址
    onEditAddress(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({ url: `/pages/address/edit?id=${id}` });
    },

    // 删除地址
    onDeleteAddress(e) {
        const id = e.currentTarget.dataset.id;
        // 找到索引
        const index = this.data.addresses.findIndex(item => item.id === id);
        
        wx.showModal({
            title: '确认删除',
            content: '确定要删除该地址吗？',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        // 先触发动画
                        if (index > -1) {
                            const key = `addresses[${index}].deleting`;
                            this.setData({ [key]: true });
                        }
                        
                        await require('../../utils/request').del(`/addresses/${id}`);
                        
                        // 动画结束后刷新列表
                        setTimeout(() => {
                            wx.showToast({ title: '删除成功', icon: 'success' });
                            this.loadAddresses();
                        }, 300);
                    } catch (err) {
                        // 恢复状态
                        if (index > -1) {
                             const key = `addresses[${index}].deleting`;
                             this.setData({ [key]: false });
                        }
                        wx.showToast({ title: '删除失败', icon: 'none' });
                    }
                }
            }
        });
    },

    // 设为默认
    async onSetDefault(e) {
        const id = e.currentTarget.dataset.id;
        try {
            await post(`/addresses/${id}/default`);
            wx.showToast({ title: '设置成功', icon: 'success' });
            this.loadAddresses();
        } catch (err) {
            wx.showToast({ title: '设置失败', icon: 'none' });
        }
    }
});
