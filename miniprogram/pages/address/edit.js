// pages/address/edit.js - 地址新增/编辑
const { get, post, put } = require('../../utils/request');
const { validatePhone, isEmpty } = require('../../utils/helpers');
const { ErrorHandler, showError, showSuccess } = require('../../utils/errorHandler');
const { ensurePrivacyAuthorization } = require('../../utils/privacy');
const app = getApp();

const { REGION_TREE } = require('./regions');

const PROVINCES = Object.keys(REGION_TREE);

const DISTRICT_ALIASES = {
    '江苏省/苏州市': {
        '高新区': '虎丘区',
        '苏州高新区': '虎丘区',
        '新区': '虎丘区',
        '园区': '苏州工业园区'
    },
    '四川省/成都市': {
        '高新区': '高新区',
        '成都高新区': '高新区'
    },
    '湖北省/武汉市': {
        '高新区': '东湖高新区',
        '武汉高新区': '东湖高新区'
    }
};

function normalizeRegionSelection(province = '', city = '', district = '') {
    const key = `${province}/${city}`;
    const districtAliasMap = DISTRICT_ALIASES[key] || {};
    return {
        province,
        city,
        district: districtAliasMap[district] || district
    };
}

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
        region: [],
        regionText: '',
        submitting: false,
        showRegionPanel: false,
        provinceOptions: PROVINCES,
        cityOptions: [],
        districtOptions: [],
        regionIndexes: [0, 0, 0]
    },

    onLoad(options) {
        if (options.id) {
            this.setData({ id: options.id });
            wx.setNavigationBarTitle({ title: '编辑地址' });
            this.loadAddress(options.id);
        } else {
            wx.setNavigationBarTitle({ title: '新增地址' });
        }
        this.ensureRegionOptions();
    },

    // 某些基础库在分包页动态设置 page style 时会检查页面滚动监听，这里提供空实现兜底。
    onPageScroll() {},

    // 加载已有地址
    async loadAddress(id) {
        try {
            const res = await get(`/addresses/${id}`);
            const addr = res.data || res;
            if (addr && addr.id) {
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
                    region: [addr.province, addr.city, addr.district].filter(Boolean),
                    regionText: [addr.province, addr.city, addr.district].filter(Boolean).join(' ')
                });
                const normalized = normalizeRegionSelection(addr.province, addr.city, addr.district);
                this.syncRegionIndexesByValue(normalized.province, normalized.city, normalized.district);
            }
        } catch (err) {
            ErrorHandler.handle(err, {
                customMessage: '加载地址失败，请稍后重试'
            });
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

    // 三级地址面板
    openRegionPanel() {
        this.ensureRegionOptions();
        this.setData({ showRegionPanel: true });
    },

    closeRegionPanel() {
        this.setData({ showRegionPanel: false });
    },

    onRegionPickerChange(e) {
        let [pIndex, cIndex, dIndex] = e.detail.value || [0, 0, 0];
        const province = PROVINCES[pIndex] || PROVINCES[0];
        const cities = Object.keys(REGION_TREE[province] || {});
        cIndex = Math.min(cIndex, Math.max(cities.length - 1, 0));
        const city = cities[cIndex] || '';
        const districts = (REGION_TREE[province] && REGION_TREE[province][city]) || [];
        dIndex = Math.min(dIndex, Math.max(districts.length - 1, 0));

        this.setData({
            cityOptions: cities,
            districtOptions: districts,
            regionIndexes: [pIndex, cIndex, dIndex]
        });
    },

    confirmRegionPanel() {
        const [pIndex, cIndex, dIndex] = this.data.regionIndexes || [0, 0, 0];
        const province = this.data.provinceOptions[pIndex] || '';
        const city = this.data.cityOptions[cIndex] || '';
        const district = this.data.districtOptions[dIndex] || '';
        const region = [province, city, district].filter(Boolean);

        this.setData({
            'form.province': province,
            'form.city': city,
            'form.district': district,
            region,
            regionText: region.join(' '),
            showRegionPanel: false
        });
    },

    ensureRegionOptions() {
        const pIndex = this.data.regionIndexes?.[0] || 0;
        const province = PROVINCES[pIndex] || PROVINCES[0];
        const cityOptions = Object.keys(REGION_TREE[province] || {});
        const cIndex = Math.min(this.data.regionIndexes?.[1] || 0, Math.max(cityOptions.length - 1, 0));
        const city = cityOptions[cIndex] || '';
        const districtOptions = (REGION_TREE[province] && REGION_TREE[province][city]) || [];
        const dIndex = Math.min(this.data.regionIndexes?.[2] || 0, Math.max(districtOptions.length - 1, 0));

        this.setData({
            cityOptions,
            districtOptions,
            regionIndexes: [pIndex, cIndex, dIndex]
        });
    },

    syncRegionIndexesByValue(province, city, district) {
        const normalized = normalizeRegionSelection(province, city, district);
        province = normalized.province;
        city = normalized.city;
        district = normalized.district;

        const pIndex = Math.max(PROVINCES.indexOf(province), 0);
        const cityOptions = Object.keys(REGION_TREE[PROVINCES[pIndex]] || {});
        const cIndex = Math.max(cityOptions.indexOf(city), 0);
        const districtOptions = (REGION_TREE[PROVINCES[pIndex]] && REGION_TREE[PROVINCES[pIndex]][cityOptions[cIndex]]) || [];
        const dIndex = Math.max(districtOptions.indexOf(district), 0);

        this.setData({
            cityOptions,
            districtOptions,
            regionIndexes: [pIndex, cIndex, dIndex]
        });
    },

    // 微信地址簿填充（用于部分机型 region picker 交互异常时兜底）
    onChooseWechatAddress() {
        wx.chooseAddress({
            success: (res) => {
                const normalized = normalizeRegionSelection(res.provinceName, res.cityName, res.countyName);
                const region = [normalized.province, normalized.city, normalized.district].filter(Boolean);
                this.setData({
                    'form.receiver_name': res.userName || this.data.form.receiver_name,
                    'form.phone': res.telNumber || this.data.form.phone,
                    'form.province': normalized.province || '',
                    'form.city': normalized.city || '',
                    'form.district': normalized.district || '',
                    'form.detail': res.detailInfo || this.data.form.detail,
                    region,
                    regionText: region.join(' ')
                });
                this.syncRegionIndexesByValue(normalized.province, normalized.city, normalized.district);
            },
            fail: (err) => {
                // 用户取消不提示；其他错误给出轻提示
                if (err && /cancel/i.test(err.errMsg || '')) return;
                wx.showToast({ title: '未获取到微信地址', icon: 'none' });
            }
        });
    },

    // 表单验证
    validate() {
        const { receiver_name, phone, province, detail } = this.data.form;
        if (isEmpty(receiver_name)) {
            showError('请输入收货人姓名');
            return false;
        }
        if (!validatePhone(phone.trim())) {
            showError('请输入正确的手机号');
            return false;
        }
        if (isEmpty(province)) {
            showError('请选择所在地区');
            return false;
        }
        if (isEmpty(detail)) {
            showError('请输入详细地址');
            return false;
        }
        return true;
    },

    // 保存地址
    async onSave() {
        if (this.data.submitting) return;
        if (!this.validate()) return;

        try {
            await ensurePrivacyAuthorization();
            if (!app.globalData.isLoggedIn) {
                await app.wxLogin(false);
            }
        } catch (err) {
            return;
        }

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

