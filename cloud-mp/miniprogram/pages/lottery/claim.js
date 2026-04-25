const { get, post } = require('../../utils/request');
const { ErrorHandler } = require('../../utils/errorHandler');

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function formatAddress(address = {}) {
    if (!address) return '';
    return [
        pickString(address.province),
        pickString(address.city),
        pickString(address.district),
        pickString(address.detail || address.detail_address || address.address)
    ].filter(Boolean).join('');
}

function normalizeRewardType(record = {}) {
    const raw = pickString(record.reward_actual_type || record.prize_type || record.type, 'miss').toLowerCase();
    return raw === 'point' ? 'points' : raw;
}

function buildAutoIssuedHint(record = {}) {
    const rewardType = normalizeRewardType(record);
    if (rewardType === 'coupon') return '奖品已直接发放到券包，无需填写收货地址。';
    if (rewardType === 'points') return '奖品已直接发放到积分账户，无需填写收货地址。';
    if (rewardType === 'goods_fund') return '奖品已直接发放到货款钱包，无需填写收货地址。';
    if (rewardType === 'miss') return '该记录无需领取信息。';
    return '当前奖品无需填写收货地址。';
}

Page({
    data: {
        recordId: '',
        loading: true,
        submitting: false,
        record: null,
        claim: null,
        requiresClaim: false,
        autoIssuedHint: '',
        canSubmit: false,
        address: null,
        addressText: '',
        addressId: '',
        phone: '',
        remark: ''
    },

    onLoad(options = {}) {
        const recordId = pickString(options.record_id || options.id);
        if (!recordId) {
            wx.showToast({ title: '缺少领奖记录', icon: 'none' });
            return;
        }
        this.setData({ recordId });
        this.loadDetail();
    },

    onShow() {
        if (!this.data.requiresClaim) return;
        const selectedAddress = wx.getStorageSync('selectedAddress');
        if (selectedAddress) {
            wx.removeStorageSync('selectedAddress');
            this.setData({
                address: selectedAddress,
                addressText: formatAddress(selectedAddress),
                addressId: selectedAddress._id || selectedAddress.id || '',
                phone: pickString(selectedAddress.phone || selectedAddress.contact_phone || this.data.phone)
            });
        }
    },

    async loadDefaultAddress() {
        try {
            const res = await get('/addresses/default', {}, { showError: false });
            const address = Object.prototype.hasOwnProperty.call(res || {}, 'data')
                ? (res.data || null)
                : (res || null);
            if (address) {
                this.setData({
                    address,
                    addressText: formatAddress(address),
                    addressId: address._id || address.id || '',
                    phone: pickString(address.phone || address.contact_phone || this.data.phone)
                });
            }
        } catch (_) {}
    },

    async loadDetail() {
        this.setData({ loading: true });
        try {
            const res = await get(`/lottery/claims/${encodeURIComponent(this.data.recordId)}`, {}, { showError: false });
            const data = res && (res.data || res) ? (res.data || res) : {};
            const claim = data.claim || null;
            const record = data.record || null;
            const addressSnapshot = claim && claim.address_snapshot ? claim.address_snapshot : null;
            const requiresClaim = !!(record && record.claim_required);
            this.setData({
                record,
                claim,
                requiresClaim,
                autoIssuedHint: requiresClaim ? '' : buildAutoIssuedHint(record || {}),
                canSubmit: !!data.can_submit,
                address: addressSnapshot,
                addressText: formatAddress(addressSnapshot),
                addressId: claim ? pickString(claim.address_id) : '',
                phone: pickString((claim && claim.phone) || (addressSnapshot && addressSnapshot.phone) || ''),
                remark: pickString((claim && claim.remark) || '')
            });
            if (!claim && data.can_submit && requiresClaim) {
                await this.loadDefaultAddress();
            }
        } catch (err) {
            ErrorHandler.handle(err, { customMessage: '加载领奖信息失败' });
        } finally {
            this.setData({ loading: false });
        }
    },

    onChooseAddress() {
        if (!this.data.requiresClaim) return;
        const selectedId = this.data.addressId ? `&selectedId=${encodeURIComponent(this.data.addressId)}` : '';
        wx.navigateTo({ url: `/pages/address/list?select=true${selectedId}` });
    },

    onPhoneInput(e) {
        this.setData({ phone: e.detail.value || '' });
    },

    onRemarkInput(e) {
        this.setData({ remark: e.detail.value || '' });
    },

    async onSubmit() {
        if (this.data.submitting || !this.data.canSubmit || !this.data.requiresClaim) return;
        if (!this.data.addressId) {
            wx.showToast({ title: '请选择收货地址', icon: 'none' });
            return;
        }
        if (!pickString(this.data.phone)) {
            wx.showToast({ title: '请填写联系电话', icon: 'none' });
            return;
        }
        this.setData({ submitting: true });
        try {
            const res = await post('/lottery/claims', {
                record_id: this.data.recordId,
                address_id: this.data.addressId,
                phone: this.data.phone,
                remark: this.data.remark
            }, { showError: false });
            if (res.code !== 0) {
                wx.showToast({ title: res.message || '提交失败', icon: 'none' });
                return;
            }
            wx.showToast({ title: '提交成功', icon: 'success' });
            await this.loadDetail();
        } catch (err) {
            ErrorHandler.handle(err, { customMessage: '提交领奖失败' });
        } finally {
            this.setData({ submitting: false });
        }
    },

    formatRecordStatus() {
        return pickString(this.data.record && this.data.record.fulfillment_status_text, '处理中');
    }
});
