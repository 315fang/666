const USER_MARKER_ID = 900000001;
const CITY_LEVEL_SCALE = 12;
const REGION_FIT_SCALE = 11;
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

function onChooseMyLocationOnMap(page, helpers) {
    const { buildStationMarkersFromList, mergeUserMarker, centroidOf } = helpers;

    wx.chooseLocation({
        success: (res) => {
            const list = page.data.stations || [];
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
            list.forEach((station) => {
                const la = parseFloat(station.latitude);
                const lo = parseFloat(station.longitude);
                if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
                const distance = haversineKm(res.latitude, res.longitude, la, lo);
                if (distance < bestKm) {
                    bestKm = distance;
                    nearest = station;
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
                const center = centroidOf(includePoints);
                mapLat = center.latitude;
                mapLng = center.longitude;
                scale = REGION_FIT_SCALE;
                regionBanner = `最近门店：${nearest.name}（直线约 ${bestKm.toFixed(1)} km）`;
            }

            page.setData({
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
                page.showStationDetail(nearest);
            } else {
                wx.showToast({ title: '暂无带坐标门店', icon: 'none' });
            }
        },
        fail: () => {
            wx.showToast({ title: '未授权位置或已取消', icon: 'none' });
        }
    });
}

function onMarkerTap(page, event) {
    const markerId = event.detail.markerId;
    if (markerId === USER_MARKER_ID) {
        const mode = page.data.userMarkerMode;
        const msg =
            mode === 'choose'
                ? '此为地图选点的精确位置'
                : '此为当前位置；请点「选点查最近店」手动修正';
        wx.showToast({ title: msg, icon: 'none', duration: 2600 });
        return;
    }
    const station = page.data.stations.find((item) => item.id === markerId);
    if (station) page.showStationDetail(station);
}

function onSelectStation(page, event) {
    const id = event.currentTarget.dataset.id;
    const station = page.data.stations.find((item) => item.id === id);
    if (station) page.showStationDetail(station);
}

function showStationDetail(page, station) {
    const la = parseFloat(station.latitude);
    const lo = parseFloat(station.longitude);
    const hasCoord = Number.isFinite(la) && Number.isFinite(lo);
    const patch = {
        selectedStation: station,
        selectedId: station.id,
        scrollIntoView: `st-${station.id}`,
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
    page.setData(patch);
}

module.exports = {
    USER_MARKER_ID,
    onChooseMyLocationOnMap,
    onMarkerTap,
    onSelectStation,
    showStationDetail
};
