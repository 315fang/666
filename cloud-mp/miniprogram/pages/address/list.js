// pages/address/list.js - 收货地址列表
const { get, post } = require('../../utils/request');

function getAddressId(address = {}) {
    return String(address._id || address.address_id || address.id || '');
}

function isDefaultAddress(address = {}) {
    return address.is_default === true || address.is_default === 1 || address.is_default === '1';
}

Page({
    data: {
        addresses: [],
        loading: true,
        selectMode: false, // 是否为选择模式（从订单确认页进入）
        pickSource: '', // order | limited_spot
        selectedAddressId: ''
    },

    onLoad(options = {}) {
        if (options.select === 'true' || options.from === 'limited_spot') {
            const selectedAddressId = options.selectedId ? decodeURIComponent(options.selectedId) : this.getStoredSelectedAddressId(options);
            this.setData({
                selectMode: true,
                pickSource: options.from === 'limited_spot' ? 'limited_spot' : 'order',
                selectedAddressId
            });
        }
    },

    onShow() {
        this.loadAddresses();
    },

    async loadAddresses() {
        try {
            this.setData({ loading: true });
            const res = await get('/addresses');
            const rawAddresses = res.data?.list || res.list || res.data || [];
            const selectedAddressId = this.data.selectMode ? this.data.selectedAddressId : '';
            const addresses = this.markSelectedAddresses(rawAddresses, selectedAddressId);
            this.setData({ addresses, loading: false });
        } catch (err) {
            console.error('加载地址失败:', err);
            this.setData({ loading: false });
        }
    },

    markSelectedAddresses(addresses = [], selectedAddressId = '') {
        const targetId = String(selectedAddressId || '');
        const defaultAddress = addresses.find(isDefaultAddress);
        const activeId = targetId || getAddressId(defaultAddress);
        return addresses.map((item) => ({
            ...item,
            id: getAddressId(item),
            is_default: isDefaultAddress(item),
            selected: !!activeId && getAddressId(item) === activeId
        }));
    },

    getStoredSelectedAddressId(options = {}) {
        try {
            if (options.from === 'limited_spot') {
                const picked = wx.getStorageSync('limited_spot_pick_address');
                return picked && picked.id ? String(picked.id) : '';
            }
            const selected = wx.getStorageSync('selectedAddress');
            return selected && (selected._id || selected.id) ? String(selected._id || selected.id) : '';
        } catch (_err) {
            return '';
        }
    },

    // 选择地址（选择模式下点击地址卡片）
    onSelectAddress(e) {
        if (!this.data.selectMode) return;
        const index = e.currentTarget.dataset.index;
        const address = this.data.addresses[index];
        const selectedAddressId = getAddressId(address);
        if (this.data.pickSource === 'limited_spot') {
            const summary = `${address.receiver_name} ${address.phone} ${address.province || ''}${address.city || ''}${address.district || ''}${address.detail || ''}`;
            wx.setStorageSync('limited_spot_pick_address', { id: selectedAddressId, summary });
        } else {
            wx.setStorageSync('selectedAddress', address);
        }
        this.setData({
            selectedAddressId,
            addresses: this.markSelectedAddresses(this.data.addresses, selectedAddressId)
        });
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
        const index = this.data.addresses.findIndex(item => getAddressId(item) === id);
        
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
        const id = String(e.currentTarget.dataset.id || '');
        if (!id) {
            wx.showToast({ title: '地址信息异常，请刷新后重试', icon: 'none' });
            return;
        }
        const target = this.data.addresses.find((item) => getAddressId(item) === id);
        if (target && isDefaultAddress(target)) {
            return;
        }
        try {
            const addresses = this.data.addresses.map((item) => ({
                ...item,
                is_default: getAddressId(item) === id
            }));
            this.setData({
                selectedAddressId: this.data.selectMode ? id : '',
                addresses: this.markSelectedAddresses(addresses, id)
            });
            await post(`/addresses/${id}/default`);
            wx.showToast({ title: '设置成功', icon: 'success' });
            this.loadAddresses();
        } catch (err) {
            this.loadAddresses();
            wx.showToast({ title: '设置失败', icon: 'none' });
        }
    }
});
