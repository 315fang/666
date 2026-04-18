const { get } = require('../../utils/request');
const { ensureUserLocationPermission, getCurrentLocation } = require('./utils/location');
const SINGLE_STATION_SCALE = 14;
const WEEK_DAY_LABELS = {
    1: '周一',
    2: '周二',
    3: '周三',
    4: '周四',
    5: '周五',
    6: '周六',
    0: '周日',
    7: '周日'
};

function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeBusinessDays(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (typeof item === 'number' || /^\d+$/.test(String(item || ''))) {
                return WEEK_DAY_LABELS[Number(item)] || '';
            }
            return compactText(item);
        })
        .filter(Boolean);
}

function normalizeStationDisplay(row = {}) {
    const fullAddress = compactText([
        row.province,
        row.city,
        row.district,
        row.address
    ].filter(Boolean).join(' '));
    const businessDays = normalizeBusinessDays(row.business_days);
    const businessHoursText = row.business_time_start && row.business_time_end
        ? `${row.business_time_start} - ${row.business_time_end}`
        : '';
    return {
        ...row,
        fullAddress,
        introText: compactText(row.intro || row.description || row.desc || ''),
        logoUrl: compactText(row.logo_url || row.image_url || row.cover_image || ''),
        businessDaysText: businessDays.join(' / '),
        businessHoursText,
        pickupEnabled: Number(row.is_pickup_point ?? row.pickup_enabled ?? 1) === 1
    };
}

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
        const list = (payload.list || []).map(normalizeStationDisplay);
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

        const hasStationCoords = points.length > 0;
        const markers = mergeUserMarker(stationMarkers, userLa, userLo, userMarkerMode, '');

        let mapLat = null;
        let mapLng = null;
        let scale = 12;
        let includePoints = [];
        let regionBanner = '';
        let mapUnavailableText = '';

        if (userLa != null && userLo != null) {
            if (hasStationCoords) {
                const viewport = computeCurrentCityViewport(list, userLa, userLo, regionObj);
                mapLat = viewport.mapLat;
                mapLng = viewport.mapLng;
                scale = viewport.scale;
                includePoints = viewport.includePoints;
            } else {
                mapLat = userLa;
                mapLng = userLo;
                scale = 12;
                includePoints = [{ latitude: userLa, longitude: userLo }];
                mapUnavailableText = '当前暂不支持地图查看，可查看下方门店信息。';
            }
            const label =
                regionObj && (regionObj.city || regionObj.district)
                    ? `${regionObj.city || ''}${regionObj.district || ''}`.trim()
                    : '';
            if (!hasStationCoords) {
                regionBanner = '已定位当前位置；门店缺少坐标，请查看下方地址列表';
            } else if (label) {
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
            mapUnavailableText = '当前暂不支持地图查看，可查看下方门店信息。';
            regionBanner = '当前仅能查看站点地址列表';
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
            regionBanner,
            mapUnavailableText
        });
    } catch (e) {
        page.setData({ loading: false });
    }
}

module.exports = {
    loadStations
};
