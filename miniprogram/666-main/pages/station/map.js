// pages/station/map.js
const { get, post } = require('../../utils/request');
const app = getApp();

// eCharts 懒加载初始化
let chart;
function initChart(canvas, width, height, dpr) {
    try {
        const echarts = requirePlugin('echarts');
        chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr });
        return chart;
    } catch (e) {
        console.warn('[Station] eCharts plugin not loaded:', e.message);
        return null;
    }
}

Page({
    data: {
        statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
        stations: [],
        claimedCount: 0,
        pickupCount: 0,
        ec: {
            onInit: initChart,
            lazyLoad: true
        },
        // claim modal
        showClaimModal: false,
        claimStationId: null,
        claimForm: { real_name: '', phone: '', intro: '' }
    },

    onLoad() {
        this.loadStations();
    },

    async loadStations() {
        try {
            const res = await get('/stations');
            if (res.code === 0) {
                const { list, echarts: echartsData } = res.data;
                const claimedCount = list.filter(s => s.claimant_id).length;
                const pickupCount = list.filter(s => s.is_pickup_point).length;
                this.setData({ stations: list, claimedCount, pickupCount });
                // 渲染 eCharts 地图
                if (echartsData && echartsData.length > 0) {
                    this.renderMap(echartsData);
                }
            }
        } catch (e) {
            console.error('加载站点失败:', e);
        }
    },

    renderMap(echartsData) {
        if (!chart) return;

        const option = {
            backgroundColor: '#F7F8FA',
            tooltip: {
                trigger: 'item',
                formatter: (params) => {
                    const { name, value } = params;
                    return `${name}<br/>成交：${value[2]}单`;
                }
            },
            geo: {
                map: 'china',
                roam: true,
                zoom: 1.2,
                itemStyle: {
                    areaColor: '#EEF2FF',
                    borderColor: '#C7D2FE'
                },
                emphasis: {
                    itemStyle: { areaColor: '#A5B4FC' }
                }
            },
            series: [{
                type: 'scatter',
                coordinateSystem: 'geo',
                data: echartsData,
                symbolSize: (val) => Math.max(12, Math.min(40, val[2] * 2 + 12)),
                itemStyle: {
                    color: '#6366F1',
                    opacity: 0.85
                },
                emphasis: {
                    itemStyle: { color: '#4F46E5', opacity: 1 }
                },
                label: {
                    show: false
                }
            }]
        };

        try {
            chart.setOption(option);
        } catch (e) {
            console.warn('[Station] eCharts setOption failed:', e.message);
        }
    },

    onStationTap(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({ url: `/pages/station/detail?id=${id}` });
    },

    onClaimTap(e) {
        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        const id = e.currentTarget.dataset.id;
        this.setData({ showClaimModal: true, claimStationId: id });
    },

    closeClaimModal() { this.setData({ showClaimModal: false }); },

    onRealNameInput(e) { this.setData({ 'claimForm.real_name': e.detail.value }); },
    onPhoneInput(e) { this.setData({ 'claimForm.phone': e.detail.value }); },
    onIntroInput(e) { this.setData({ 'claimForm.intro': e.detail.value }); },

    async submitClaim() {
        const { real_name, phone, intro } = this.data.claimForm;
        if (!real_name || !phone) {
            wx.showToast({ title: '请填写必填项', icon: 'none' });
            return;
        }
        if (!/^1[3-9]\d{9}$/.test(phone)) {
            wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
            return;
        }
        try {
            const res = await post(`/stations/${this.data.claimStationId}/claim`, { real_name, phone, intro });
            wx.showToast({ title: res.message || '提交成功', icon: res.code === 0 ? 'success' : 'none' });
            this.setData({ showClaimModal: false });
        } catch {
            wx.showToast({ title: '提交失败，请重试', icon: 'none' });
        }
    },

    stopPropagation() { },
    onBack() { wx.navigateBack(); }
});
