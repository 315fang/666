const { get, post } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');

function getStationSubmitId(station = {}) {
    return String(station.binding_station_id || station.id || station._id || station._legacy_id || '');
}

function stationMatchesSelectedId(station = {}, selectedId = '') {
    const target = String(selectedId || '');
    if (!target) return false;
    return [
        station.binding_station_id,
        station.id,
        station._id,
        station._legacy_id,
        ...(Array.isArray(station.station_lookup_ids) ? station.station_lookup_ids : [])
    ].some((value) => String(value || '') === target);
}

Page({
    data: {
        code: '',
        qrToken: '',
        loading: false,
        loadingQr: false,
        scopeLoading: true,
        verifyScope: null,
        selectedStationId: '',
        selectedStationIndex: 0,
        lastResult: null
    },

    onLoad(options) {
        if (!requireLogin()) {
            setTimeout(() => wx.navigateBack(), 100);
            return;
        }
        if (options.station_id) {
            this.setData({ selectedStationId: String(options.station_id) });
        }
        this.loadVerifyScope();
    },

    async loadVerifyScope() {
        this.setData({ scopeLoading: true });
        try {
            const res = await get('/stations/my-scope', {}, { showError: false });
            const scope = res.data || null;
            const stations = scope?.stations || [];
            const matchedIndex = stations.findIndex((item) => stationMatchesSelectedId(item, this.data.selectedStationId));
            const nextStationId = matchedIndex >= 0
                ? getStationSubmitId(stations[matchedIndex])
                : (stations.length === 1 ? getStationSubmitId(stations[0]) : '');
            this.setData({
                verifyScope: scope,
                selectedStationId: nextStationId,
                selectedStationIndex: matchedIndex >= 0 ? matchedIndex : 0,
                scopeLoading: false
            });
        } catch (_) {
            this.setData({
                verifyScope: null,
                scopeLoading: false
            });
        }
    },

    onStationChange(e) {
        const index = Number(e.detail.value || 0);
        const station = (this.data.verifyScope?.stations || [])[index];
        this.setData({
            selectedStationIndex: index,
            selectedStationId: station ? getStationSubmitId(station) : ''
        });
    },

    onCodeInput(e) {
        this.setData({ code: (e.detail.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '') });
    },

    onTokenInput(e) {
        this.setData({ qrToken: (e.detail.value || '').trim() });
    },

    getSelectedStationId() {
        const { verifyScope, selectedStationId } = this.data;
        if (!verifyScope?.has_verify_access) return null;
        if ((verifyScope.stations || []).length === 1) {
            return getStationSubmitId(verifyScope.stations[0]);
        }
        if (!selectedStationId) {
            wx.showToast({ title: '请选择当前核销门店', icon: 'none' });
            return null;
        }
        return selectedStationId;
    },

    async onVerifyCode() {
        if (!requireLogin()) return;
        const stationId = this.getSelectedStationId();
        if (!stationId) return;
        const c = (this.data.code || '').trim();
        if (c.length !== 16) {
            wx.showToast({ title: '请输入16位核销码', icon: 'none' });
            return;
        }
        this.setData({ loading: true, lastResult: null });
        try {
            const res = await post('/pickup/verify-code', { pickup_code: c, station_id: stationId }, { showLoading: true });
            wx.showToast({ title: '核销成功', icon: 'success' });
            this.setData({
                code: '',
                lastResult: {
                    success: true,
                    title: '核销成功',
                    desc: `订单 ${res.data?.order_no || ''} 已完成核销`
                }
            });
        } catch (e) {
            this.setData({
                lastResult: {
                    success: false,
                    title: '核销失败',
                    desc: e.message || '当前订单不属于你所在门店，或订单状态不可核销'
                }
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    onScan() {
        wx.scanCode({
            scanType: ['qrCode', 'barCode'],
            success: (res) => {
                const raw = (res.result || '').trim();
                this.setData({ qrToken: raw });
            },
            fail: () => wx.showToast({ title: '未识别', icon: 'none' })
        });
    },

    async onVerifyQr() {
        if (!requireLogin()) return;
        const stationId = this.getSelectedStationId();
        if (!stationId) return;
        const t = (this.data.qrToken || '').trim();
        if (!t) {
            wx.showToast({ title: '请扫码或粘贴内容', icon: 'none' });
            return;
        }
        this.setData({ loadingQr: true, lastResult: null });
        try {
            const res = await post('/pickup/verify-qr', { qr_token: t, station_id: stationId }, { showLoading: true });
            wx.showToast({ title: '核销成功', icon: 'success' });
            this.setData({
                qrToken: '',
                lastResult: {
                    success: true,
                    title: '核销成功',
                    desc: `订单 ${res.data?.order_no || ''} 已完成核销`
                }
            });
        } catch (e) {
            this.setData({
                lastResult: {
                    success: false,
                    title: '核销失败',
                    desc: e.message || '当前订单不属于你所在门店，或订单状态不可核销'
                }
            });
        } finally {
            this.setData({ loadingQr: false });
        }
    },

    goPendingOrders() {
        const stationId = this.getSelectedStationId();
        if (!stationId) return;
        wx.navigateTo({ url: `/pages/pickup/orders?station_id=${stationId}` });
    }
});
