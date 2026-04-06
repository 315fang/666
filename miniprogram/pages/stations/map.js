const { get } = require('../../utils/request');
const { ensurePrivacyAuthorization } = require('../../utils/privacy');
const { getFuzzyCoordinates } = require('./utils/fuzzyLocation');

/** 与数据库 id 不冲突；用于用户参考位置标记 */
const USER_MARKER_ID = 900000001;

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
    const title = isPick ? displayName || '地图选点' : '我的大致位置';
    const calloutText = isPick ? '地图选点（精确）' : '微信模糊定位（约市/区级）';
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

function tryGetUserFuzzyLocation() {
    return getFuzzyCoordinates();
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
 * 模糊点 + 逆地理市/区 → 地图视野优先框选「本市区内」门店与模糊点
 */
function computeFuzzyCityViewport(list, userLa, userLo, regionObj) {
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
        /** 顶部说明：模糊→市区视野；选点后→最近店提示 */
        regionBanner: ''
    },

    onLoad() {
        this.loadStations();
    },

    noop() {},

    async loadStations() {
        this.setData({ loading: true });
        try {
            const res = await get('/stations', { status: 'active' }, { showError: true });
            const payload = res.data || {};
            const list = payload.list || [];
            const { stationMarkers, points } = buildStationMarkersFromList(list);

            let userLa = null;
            let userLo = null;
            let userMarkerMode = null;
            let regionObj = null;
            let geoConfigured = false;

            try {
                await ensurePrivacyAuthorization({ showDeniedToast: false });
                const loc = await tryGetUserFuzzyLocation();
                if (loc) {
                    userLa = loc.latitude;
                    userLo = loc.longitude;
                    userMarkerMode = 'fuzzy';
                    try {
                        const geo = await get(
                            '/stations/region-from-point',
                            { lat: userLa, lng: userLo },
                            { showError: false }
                        );
                        const pack = geo && geo.data;
                        regionObj = pack && pack.region ? pack.region : null;
                        geoConfigured = !!(pack && pack.configured);
                    } catch (_) {
                        regionObj = null;
                    }
                }
            } catch (_) {
                /* 未同意隐私或未开定位 */
            }

            const markers = mergeUserMarker(stationMarkers, userLa, userLo, userMarkerMode, '');

            let mapLat = 31.3;
            let mapLng = 121.5;
            let scale = CITY_LEVEL_SCALE;
            let includePoints = [];
            let regionBanner = '';

            if (userLa != null && userLo != null) {
                const vp = computeFuzzyCityViewport(list, userLa, userLo, regionObj);
                mapLat = vp.mapLat;
                mapLng = vp.mapLng;
                scale = vp.scale;
                includePoints = vp.includePoints;
                const label =
                    regionObj && (regionObj.city || regionObj.district)
                        ? `${regionObj.city || ''}${regionObj.district || ''}`.trim()
                        : '';
                if (label) {
                    regionBanner = `已按模糊定位框选「${label}」内门店；点右下角选精确位置查看最近店`;
                } else if (geoConfigured === false) {
                    regionBanner =
                        '模糊定位已用于地图视野（服务端未配置腾讯地图 Key 时无法解析行政区）；请用选点查最近店';
                } else {
                    regionBanner = '已按模糊定位调整地图；点「选点查最近店」获取精确位置';
                }
            } else if (points.length === 1) {
                mapLat = points[0].latitude;
                mapLng = points[0].longitude;
                scale = SINGLE_STATION_SCALE;
            } else if (points.length > 1) {
                const c = centroidOf(points);
                mapLat = c.latitude;
                mapLng = c.longitude;
                scale = scaleForStationSpread(points, SINGLE_STATION_SCALE);
            } else if (list.length > 0) {
                wx.showToast({
                    title: '站点未配置地图坐标，请查看下方地址',
                    icon: 'none',
                    duration: 2200
                });
            }

            this.setData({
                stations: list,
                markers,
                mapLat,
                mapLng,
                scale,
                includePoints,
                loading: false,
                selectedId: null,
                scrollIntoView: '',
                userMarkerMode,
                regionBanner
            });
        } catch (e) {
            this.setData({ loading: false });
        }
    },

    /** 地图选点：精确位置，计算同城最近门店并弹出详情 */
    onChooseMyLocationOnMap() {
        wx.chooseLocation({
            success: (res) => {
                const list = this.data.stations || [];
                const { stationMarkers } = buildStationMarkersFromList(list);
                const markers = mergeUserMarker(
                    stationMarkers,
                    res.latitude,
                    res.longitude,
                    'choose',
                    res.name || '已选位置'
                );

                let nearest = null;
                let bestKm = Infinity;
                list.forEach((s) => {
                    const la = parseFloat(s.latitude);
                    const lo = parseFloat(s.longitude);
                    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
                    const d = haversineKm(res.latitude, res.longitude, la, lo);
                    if (d < bestKm) {
                        bestKm = d;
                        nearest = s;
                    }
                });

                let includePoints = [];
                let mapLat = res.latitude;
                let mapLng = res.longitude;
                let scale = CITY_LEVEL_SCALE;
                let regionBanner = '已选精确位置';

                if (nearest && Number.isFinite(parseFloat(nearest.latitude))) {
                    const nla = parseFloat(nearest.latitude);
                    const nlo = parseFloat(nearest.longitude);
                    includePoints = [
                        { latitude: res.latitude, longitude: res.longitude },
                        { latitude: nla, longitude: nlo }
                    ];
                    const c = centroidOf(includePoints);
                    mapLat = c.latitude;
                    mapLng = c.longitude;
                    scale = REGION_FIT_SCALE;
                    regionBanner = `最近门店：${nearest.name}（直线约 ${bestKm.toFixed(1)} km）`;
                }

                this.setData({
                    markers,
                    mapLat,
                    mapLng,
                    scale,
                    includePoints,
                    userMarkerMode: 'choose',
                    regionBanner
                });

                if (nearest) {
                    wx.showToast({
                        title: `最近：${nearest.name} · ${bestKm.toFixed(1)}km`,
                        icon: 'none',
                        duration: 2800
                    });
                    this.showStationDetail(nearest);
                } else {
                    wx.showToast({ title: '暂无带坐标门店', icon: 'none' });
                }
            },
            fail: () => {
                wx.showToast({ title: '未授权位置或已取消', icon: 'none' });
            }
        });
    },

    onMarkerTap(e) {
        const mid = e.detail.markerId;
        if (mid === USER_MARKER_ID) {
            const mode = this.data.userMarkerMode;
            const msg =
                mode === 'choose'
                    ? '此为地图选点的精确位置'
                    : '此为模糊定位（约市/区级）；请点「选点查最近店」';
            wx.showToast({ title: msg, icon: 'none', duration: 2600 });
            return;
        }
        const st = this.data.stations.find((x) => x.id === mid);
        if (st) this.showStationDetail(st);
    },

    onSelectStation(e) {
        const id = e.currentTarget.dataset.id;
        const st = this.data.stations.find((x) => x.id === id);
        if (st) this.showStationDetail(st);
    },

    showStationDetail(st) {
        const la = parseFloat(st.latitude);
        const lo = parseFloat(st.longitude);
        const hasCoord = Number.isFinite(la) && Number.isFinite(lo);
        const patch = {
            selectedStation: st,
            selectedId: st.id,
            scrollIntoView: `st-${st.id}`,
            includePoints: []
        };
        if (hasCoord) {
            patch.mapLat = la;
            patch.mapLng = lo;
            patch.scale = DETAIL_SCALE;
        } else {
            wx.showToast({
                title: '该门店暂无坐标，地图无法定位',
                icon: 'none',
                duration: 2200
            });
        }
        this.setData(patch);
    },

    onCloseDetail() {
        this.setData({ selectedStation: null, selectedId: null });
    }
});
