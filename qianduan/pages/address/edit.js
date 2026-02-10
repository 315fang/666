// pages/address/edit.js - 地址新增/编辑
const { get, post, put } = require('../../utils/request');

Page({
    data: {
        id: null,
        form: {
            receiver_name: '',
            phone: '',
            province: '',
            city: '',
            district: '',
            detail: '',
            is_default: false
        },
        regionText: '',
        submitting: false
    },

    onLoad(options) {
        if (options.id) {
            this.setData({ id: options.id });
            wx.setNavigationBarTitle({ title: '编辑地址' });
            this.loadAddress(options.id);
        } else {
            wx.setNavigationBarTitle({ title: '新增地址' });
        }
    },

    // 加载已有地址
    async loadAddress(id) {
        try {
            const res = await get('/addresses');
            const addresses = res.list || res.data || [];
            const addr = addresses.find(a => String(a.id) === String(id));
            if (addr) {
                this.setData({
                    form: {
                        receiver_name: addr.receiver_name || '',
                        phone: addr.phone || '',
                        province: addr.province || '',
                        city: addr.city || '',
                        district: addr.district || '',
                        detail: addr.detail || '',
                        is_default: !!addr.is_default
                    },
                    regionText: [addr.province, addr.city, addr.district].filter(Boolean).join(' ')
                });
            }
        } catch (err) {
            console.error('加载地址失败:', err);
        }
    },

    // 输入事件
    onInputName(e) {
        this.setData({ 'form.receiver_name': e.detail.value });
    },
    onInputPhone(e) {
        this.setData({ 'form.phone': e.detail.value });
    },
    onInputDetail(e) {
        this.setData({ 'form.detail': e.detail.value });
    },
    onSwitchDefault(e) {
        this.setData({ 'form.is_default': e.detail.value });
    },

    // 选择省市区
    onRegionChange(e) {
        const region = e.detail.value;
        this.setData({
            'form.province': region[0],
            'form.city': region[1],
            'form.district': region[2],
            regionText: region.join(' ')
        });
    },

    // 表单验证
    validate() {
        const { receiver_name, phone, province, detail } = this.data.form;
        if (!receiver_name.trim()) {
            wx.showToast({ title: '请输入收货人姓名', icon: 'none' });
            return false;
        }
        if (!phone.trim() || !/^1\d{10}$/.test(phone.trim())) {
            wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
            return false;
        }
        if (!province) {
            wx.showToast({ title: '请选择所在地区', icon: 'none' });
            return false;
        }
        if (!detail.trim()) {
            wx.showToast({ title: '请输入详细地址', icon: 'none' });
            return false;
        }
        return true;
    },

    // 保存地址
    async onSave() {
        if (this.data.submitting) return;
        if (!this.validate()) return;

        this.setData({ submitting: true });

        try {
            const { form, id } = this.data;
            const data = {
                receiver_name: form.receiver_name.trim(),
                phone: form.phone.trim(),
                province: form.province,
                city: form.city,
                district: form.district,
                detail: form.detail.trim(),
                is_default: form.is_default ? 1 : 0
            };

            if (id) {
                await put(`/addresses/${id}`, data);
            } else {
                await post('/addresses', data);
            }

            this.setData({ submitting: false });
            wx.showToast({ title: '保存成功', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1000);
        } catch (err) {
            this.setData({ submitting: false });
            wx.showToast({ title: err.message || '保存失败', icon: 'none' });
        }
    }
});
