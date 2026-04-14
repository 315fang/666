const { get } = require('../../utils/request');
const { loadStations } = require('./stationMapLoader');
const {
    USER_MARKER_ID,
    onChooseMyLocationOnMap,
    onMarkerTap,
    onSelectStation,
    showStationDetail
} = require('./stationMapActions');

/** 使用 include-points 框选市区时的兜底 scale（微信会自动缩放到包含各点） */
const REGION_FIT_SCALE = 11;
/** 市/城区级缩放（无逆地理或未配置 Key 时） */
const CITY_LEVEL_SCALE = 12;
const SINGLE_STATION_SCALE = 14;
const DETAIL_SCALE = 16;

function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function normalizeSeg(name) {
    return String(name || '')
        .trim()
        .replace(/市$/u, '')
        .replace(/区$/u, '')
        .replace(/县$/u, '');
}

/** 与逆地理结果比对：优先市+区；区缺失时仅比市 */
function stationMatchesRegion(st, region) {
    if (!region || !region.city) return true;
    const rc = normalizeSeg(region.city);
    const sc = normalizeSeg(st.city || '');
    const cityOk = !sc || !rc || sc === rc || sc.includes(rc) || rc.includes(sc);
    if (!cityOk) return false;
    const rd = (region.district || '').trim();
    if (!rd) return true;
    const sd = (st.district || '').trim();
    if (!sd) return true;
    return sd === rd || sd.includes(rd) || rd.includes(sd);
}

function stationMatchesCityOnly(st, region) {
    if (!region || !region.city) return true;
    const rc = normalizeSeg(region.city);
    const sc = normalizeSeg(st.city || '');
    return !sc || !rc || sc === rc || sc.includes(rc) || rc.includes(sc);
}

function buildStationMarkersFromList(list) {
    const stationMarkers = [];
    const points = [];
    list.forEach((s) => {
        const la = parseFloat(s.latitude);
        const lo = parseFloat(s.longitude);
        if (Number.isFinite(la) && Number.isFinite(lo)) {
            stationMarkers.push({
                id: s.id,
                latitude: la,
                longitude: lo,
                title: s.name || '',
                width: 28,
                height: 28
            });
            points.push({ latitude: la, longitude: lo });
        }
    });
    return { stationMarkers, points };
}

function mergeUserMarker(stationMarkers, userLa, userLo, mode, displayName) {
    const markers = stationMarkers.slice();
    if (userLa == null || userLo == null) return markers;
    const isPick = mode === 'choose';
    const title = isPick ? displayName || '地图选点' : '我的位置';
    const calloutText = isPick ? '地图选点（精确）' : '当前位置';
    markers.unshift({
        id: USER_MARKER_ID,
        latitude: userLa,
        longitude: userLo,
        title,
        width: 32,
        height: 32,
        zIndex: 999,
        callout: {
            content: calloutText,
            display: 'BYCLICK',
            fontSize: 12,
            borderRadius: 8,
            padding: 6
        }
    });
    return markers;
}

function centroidOf(points) {
    if (!points.length) return null;
    let la = 0;
    let lo = 0;
    points.forEach((p) => {
        la += p.latitude;
        lo += p.longitude;
    });
    return { latitude: la / points.length, longitude: lo / points.length };
}

function scaleForStationSpread(points, singleScale) {
    if (points.length < 2) return singleScale;
    let minLa = 90;
    let maxLa = -90;
    let minLo = 180;
    let maxLo = -180;
    points.forEach((p) => {
        minLa = Math.min(minLa, p.latitude);
        maxLa = Math.max(maxLa, p.latitude);
        minLo = Math.min(minLo, p.longitude);
        maxLo = Math.max(maxLo, p.longitude);
    });
    const dLa = maxLa - minLa;
    const dLo = maxLo - minLo;
    const spread = Math.max(dLa, dLo);
    if (spread > 10) return 5;
    if (spread > 4) return 7;
    if (spread > 1) return 9;
    if (spread > 0.2) return 11;
    return 13;
}

/**
 * 当前坐标 + 逆地理市/区 → 地图视野优先框选「本市区内」门店与当前位置
 */
function computeCurrentCityViewport(list, userLa, userLo, regionObj) {
    let subset = list.filter((s) => {
        const la = parseFloat(s.latitude);
        const lo = parseFloat(s.longitude);
        return Number.isFinite(la) && Number.isFinite(lo) && stationMatchesRegion(s, regionObj);
    });
    if (subset.length === 0 && regionObj && regionObj.city) {
        subset = list.filter((s) => {
            const la = parseFloat(s.latitude);
            const lo = parseFloat(s.longitude);
            return Number.isFinite(la) && Number.isFinite(lo) && stationMatchesCityOnly(s, regionObj);
        });
    }

    const coords = [];
    subset.forEach((s) => {
        coords.push({ latitude: parseFloat(s.latitude), longitude: parseFloat(s.longitude) });
    });
    coords.push({ latitude: userLa, longitude: userLo });

    let mapLat = userLa;
    let mapLng = userLo;
    let scale = CITY_LEVEL_SCALE;
    let includePoints = [];

    if (coords.length >= 2) {
        const c = centroidOf(coords);
        mapLat = c.latitude;
        mapLng = c.longitude;
        includePoints = coords;
        scale = REGION_FIT_SCALE;
        return { mapLat, mapLng, scale, includePoints };
    }

    const all = [];
    list.forEach((s) => {
        const la = parseFloat(s.latitude);
        const lo = parseFloat(s.longitude);
        if (Number.isFinite(la) && Number.isFinite(lo)) {
            all.push({ latitude: la, longitude: lo });
        }
    });
    all.push({ latitude: userLa, longitude: userLo });
    if (all.length >= 2) {
        const c = centroidOf(all);
        return {
            mapLat: c.latitude,
            mapLng: c.longitude,
            scale: REGION_FIT_SCALE,
            includePoints: all
        };
    }

    return { mapLat: userLa, mapLng: userLo, scale: CITY_LEVEL_SCALE, includePoints: [] };
}

Page({
    data: {
        loading: true,
        stations: [],
        markers: [],
        mapLat: 31.3,
        mapLng: 121.5,
        scale: CITY_LEVEL_SCALE,
        includePoints: [],
        selectedStation: null,
        selectedId: null,
        scrollIntoView: '',
        userMarkerMode: null,
        /** 顶部说明：当前位置→附近门店；选点后→最近店提示 */
        regionBanner: '',
        mapUnavailableText: ''
    },

    onLoad() {
        this.loadStations();
    },

    noop() {},

    async loadStations() {
        return loadStations(this, {
            buildStationMarkersFromList,
            mergeUserMarker,
            computeCurrentCityViewport,
            centroidOf,
            scaleForStationSpread
        });
    },

    /** 地图选点：精确位置，计算同城最近门店并弹出详情 */
    onChooseMyLocationOnMap() {
        return onChooseMyLocationOnMap(this, {
            buildStationMarkersFromList,
            mergeUserMarker,
            centroidOf
        });
    },

    onMarkerTap(e) {
        return onMarkerTap(this, e);
    },

    onSelectStation(e) {
        return onSelectStation(this, e);
    },

    showStationDetail(st) {
        return showStationDetail(this, st);
    },

    onOpenStationLocation() {
        const station = this.data.selectedStation;
        if (!station) return;
        const latitude = Number(station.latitude);
        const longitude = Number(station.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            wx.showToast({ title: '该门店暂无地图坐标', icon: 'none' });
            return;
        }
        wx.openLocation({
            latitude,
            longitude,
            name: station.name || '服务站点',
            address: station.fullAddress || station.address || '',
            scale: DETAIL_SCALE
        });
    },

    onCopyStationAddress() {
        const station = this.data.selectedStation;
        if (!station) return;
        const text = station.fullAddress || station.address || '';
        if (!text) {
            wx.showToast({ title: '暂无门店地址', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: text,
            success: () => wx.showToast({ title: '地址已复制', icon: 'success' })
        });
    },

    onCallStation() {
        const station = this.data.selectedStation;
        const phone = String(station?.contact_phone || '').trim();
        if (!phone) {
            wx.showToast({ title: '门店暂未配置电话', icon: 'none' });
            return;
        }
        wx.makePhoneCall({ phoneNumber: phone });
    },

    onCloseDetail() {
        this.setData({ selectedStation: null, selectedId: null });
    }
});
