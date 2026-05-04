'use strict';

function hasLookupValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function normalizeLookupTokens(values = []) {
    const seen = new Set();
    const tokens = [];
    (Array.isArray(values) ? values : [values]).forEach((value) => {
        if (!hasLookupValue(value)) return;
        const raw = String(value).trim();
        if (!raw) return;
        const candidates = [raw];
        const numeric = Number(raw);
        if (Number.isFinite(numeric)) candidates.push(String(numeric));
        candidates.forEach((candidate) => {
            if (!candidate || seen.has(candidate)) return;
            seen.add(candidate);
            tokens.push(candidate);
        });
    });
    return tokens;
}

function buildStationLookupValues(station = {}) {
    return normalizeLookupTokens([
        station._id,
        station.id,
        station._legacy_id,
        station.legacy_id,
        station.station_id,
        station.station_key
    ]);
}

function stationMatchesLookup(station = {}, lookup) {
    const stationTokens = new Set(buildStationLookupValues(station));
    if (!stationTokens.size) return false;
    return normalizeLookupTokens([lookup]).some((token) => stationTokens.has(token));
}

function stationRowMatchesStation(row = {}, station = {}) {
    return stationMatchesLookup(station, row && row.station_id);
}

function buildStationLookupSet(stations = []) {
    const set = new Set();
    (Array.isArray(stations) ? stations : []).forEach((station) => {
        buildStationLookupValues(station).forEach((token) => set.add(token));
    });
    return set;
}

function buildStationLookupMap(stations = []) {
    const map = new Map();
    (Array.isArray(stations) ? stations : []).forEach((station) => {
        buildStationLookupValues(station).forEach((token) => {
            if (!map.has(token)) map.set(token, station);
        });
    });
    return map;
}

function findStationByLookup(stations = [], lookup) {
    return (Array.isArray(stations) ? stations : []).find((station) => stationMatchesLookup(station, lookup)) || null;
}

function findStationInLookupMap(stationMap, lookup) {
    if (!stationMap || typeof stationMap.get !== 'function') return null;
    for (const token of normalizeLookupTokens([lookup])) {
        const station = stationMap.get(token);
        if (station) return station;
    }
    return null;
}

module.exports = {
    normalizeLookupTokens,
    buildStationLookupValues,
    stationMatchesLookup,
    stationRowMatchesStation,
    buildStationLookupSet,
    buildStationLookupMap,
    findStationByLookup,
    findStationInLookupMap
};
