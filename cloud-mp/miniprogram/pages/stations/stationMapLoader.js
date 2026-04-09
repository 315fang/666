const { get } = require('../../utils/request');
const { ensureUserLocationPermission, getCurrentLocation } = require('./utils/location');
const SINGLE_STATION_SCALE = 14;

async function loadStations(page, helpers) {
    const {
        buildStationMarkersFromList,
        mergeUserMarker,
        computeCurrentCityViewport,
        centroidOf,
        scaleForStationSpread
    } = helpers;

    page.setData({ loading: true });
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
            const granted = await ensureUserLocationPermission();
            if (granted) {
                const loc = await getCurrentLocation({ isHighAccuracy: true });
                if (loc && loc.ok) {
                    userLa = loc.latitude;
                    userLo = loc.longitude;
                    userMarkerMode = 'current';
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
            }
        } catch (_) {
            /* 未同意隐私或未开定位 */
        }

        const markers = mergeUserMarker(stationMarkers, userLa, userLo, userMarkerMode, '');

        let mapLat = 31.3;
        let mapLng = 121.5;
        let scale = 12;
        let includePoints = [];
        let regionBanner = '';

        if (userLa != null && userLo != null) {
            const viewport = computeCurrentCityViewport(list, userLa, userLo, regionObj);
            mapLat = viewport.mapLat;
            mapLng = viewport.mapLng;
            scale = viewport.scale;
            includePoints = viewport.includePoints;
            const label =
                regionObj && (regionObj.city || regionObj.district)
                    ? `${regionObj.city || ''}${regionObj.district || ''}`.trim()
                    : '';
            if (label) {
                regionBanner = `已按当前位置框选「${label}」附近门店；点右下角可选点查最近店`;
            } else if (geoConfigured === false) {
                regionBanner =
                    '已按当前位置调整地图；服务端未配置腾讯地图 Key 时无法解析行政区';
            } else {
                regionBanner = '已按当前位置调整地图；点「选点查最近店」可手动修正';
            }
        } else if (points.length === 1) {
            mapLat = points[0].latitude;
            mapLng = points[0].longitude;
            scale = SINGLE_STATION_SCALE;
        } else if (points.length > 1) {
            const center = centroidOf(points);
            mapLat = center.latitude;
            mapLng = center.longitude;
            scale = scaleForStationSpread(points, SINGLE_STATION_SCALE);
        } else if (list.length > 0) {
            wx.showToast({
                title: '站点未配置地图坐标，请查看下方地址',
                icon: 'none',
                duration: 2200
            });
        }

        page.setData({
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
        page.setData({ loading: false });
    }
}

module.exports = {
    loadStations
};
