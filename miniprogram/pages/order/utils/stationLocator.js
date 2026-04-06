/**
 * 将 distance_km 转为数字；注意 Number(null)===0，不能把「无距离」误当成 0。
 */
function toNumber(value) {
    if (value == null || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function formatDistanceLabel(distanceKm) {
    const value = toNumber(distanceKm);
    if (value == null) return '';
    if (value < 1) {
        const meters = Math.round(value * 1000);
        if (meters <= 0) return '就在附近';
        return `约 ${meters} m`;
    }
    return `约 ${value.toFixed(value >= 10 ? 0 : 1)} km`;
}

function hasFiniteDistance(station) {
    return toNumber(station?.distance_km) != null;
}

function normalizeStation(station) {
    const distance = toNumber(station?.distance_km);
    return {
        ...station,
        distance_km: distance,
        _distanceLabel: formatDistanceLabel(distance)
    };
}

function pickNearestPickupStation(stations = []) {
    return stations.find((item) => Number(item?.is_pickup_point) === 1 && hasFiniteDistance(item)) || null;
}

function pickNearestStation(stations = []) {
    return stations.find((item) => hasFiniteDistance(item)) || null;
}

function buildStationCollections(stations = []) {
    const normalized = (stations || []).map(normalizeStation);
    const pickupStations = normalized.filter((item) => Number(item?.is_pickup_point) === 1);
    return {
        allStations: normalized,
        pickupStations,
        nearestPickupStation: pickNearestPickupStation(pickupStations),
        nearestStation: pickNearestStation(normalized)
    };
}

module.exports = {
    formatDistanceLabel,
    hasFiniteDistance,
    normalizeStation,
    pickNearestPickupStation,
    pickNearestStation,
    buildStationCollections
};
