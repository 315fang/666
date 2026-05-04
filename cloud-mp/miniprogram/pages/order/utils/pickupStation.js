function normalizeLookupIds(values = []) {
    const seen = new Set();
    const result = [];
    (Array.isArray(values) ? values : [values]).forEach((value) => {
        if (Array.isArray(value)) {
            normalizeLookupIds(value).forEach((item) => {
                if (seen.has(item)) return;
                seen.add(item);
                result.push(item);
            });
            return;
        }
        if (value === null || value === undefined || value === '') return;
        const text = String(value).trim();
        if (!text || seen.has(text)) return;
        seen.add(text);
        result.push(text);
    });
    return result;
}

function getPickupStationLookupIds(station = {}) {
    if (typeof station !== 'object' || !station) {
        return normalizeLookupIds(station);
    }
    return normalizeLookupIds([
        station._id,
        station.id,
        station.station_id,
        station.station_key,
        station._legacy_id,
        station.legacy_id,
        station.lookup_ids
    ]);
}

function resolvePickupStationId(station = {}) {
    return getPickupStationLookupIds(station)[0] || '';
}

function pickupStationMatches(left = {}, right = {}) {
    const leftIds = new Set(getPickupStationLookupIds(left));
    if (!leftIds.size) return false;
    return getPickupStationLookupIds(right).some((id) => leftIds.has(id));
}

module.exports = {
    getPickupStationLookupIds,
    resolvePickupStationId,
    pickupStationMatches
};
