'use strict';

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function pickString(value, fallback = '') {
    if (!hasValue(value)) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    if (!hasValue(value)) return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function roundQuantity(value) {
    return Math.max(0, Math.floor(toNumber(value, 0)));
}

function normalizeLookupTokens(values = []) {
    const seen = new Set();
    const list = [];
    values.forEach((value) => {
        if (!hasValue(value)) return;
        const raw = String(value).trim();
        if (!raw) return;
        const candidates = [raw];
        const num = Number(raw);
        if (Number.isFinite(num)) candidates.push(String(num));
        candidates.forEach((candidate) => {
            if (!candidate || seen.has(candidate)) return;
            seen.add(candidate);
            list.push(candidate);
        });
    });
    return list;
}

function valuesMatch(left, right) {
    const leftTokens = normalizeLookupTokens([left]);
    if (!leftTokens.length) return false;
    const rightTokens = new Set(normalizeLookupTokens([right]));
    return leftTokens.some((token) => rightTokens.has(token));
}

function rowMatchesLookup(row = {}, lookup, extra = []) {
    const candidates = [
        row._id,
        row.id,
        row._legacy_id,
        row.station_id,
        row.product_id,
        row.sku_id,
        ...extra
    ];
    return candidates.some((candidate) => valuesMatch(candidate, lookup));
}

function buildStationStockDocId(stationId, productId, skuId = '') {
    const stationToken = pickString(stationId).replace(/[^a-zA-Z0-9_-]/g, '_') || 'station';
    const scopeToken = pickString(skuId)
        ? `sku_${pickString(skuId).replace(/[^a-zA-Z0-9_-]/g, '_')}`
        : `product_${pickString(productId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    return `station_stock_${stationToken}_${scopeToken}`;
}

function buildStationStockKey(stationId, productId, skuId = '') {
    return `${pickString(stationId)}::${pickString(skuId) || `product:${pickString(productId)}`}`;
}

function normalizeStationStockRow(row = {}) {
    return {
        ...row,
        _id: row._id || row.id || buildStationStockDocId(row.station_id, row.product_id, row.sku_id),
        id: row.id || row._id || buildStationStockDocId(row.station_id, row.product_id, row.sku_id),
        station_id: pickString(row.station_id),
        product_id: pickString(row.product_id),
        sku_id: pickString(row.sku_id),
        available_qty: roundQuantity(row.available_qty),
        reserved_qty: roundQuantity(row.reserved_qty),
        cost_price: roundMoney(row.cost_price)
    };
}

function findStationStockRow(rows = [], stationId, productId, skuId = '') {
    return rows
        .map((row) => normalizeStationStockRow(row))
        .find((row) => {
            if (!valuesMatch(row.station_id, stationId)) return false;
            if (pickString(skuId)) return valuesMatch(row.sku_id, skuId);
            return !pickString(row.sku_id) && valuesMatch(row.product_id, productId);
        }) || null;
}

function normalizePickupSelectionItem(item = {}) {
    return {
        product_id: pickString(item.product_id),
        sku_id: pickString(item.sku_id),
        quantity: Math.max(1, roundQuantity(item.quantity ?? item.qty ?? 1)),
        name: pickString(item.name || item.snapshot_name)
    };
}

function deriveStationStockStatus(availableQty, requiredQty = 0) {
    const available = roundQuantity(availableQty);
    const required = Math.max(0, roundQuantity(requiredQty));
    if (available < required || available <= 0) return 'insufficient';
    const remaining = Math.max(0, available - required);
    if (remaining <= 2) return 'tight';
    return 'sufficient';
}

function stockStatusText(status = '') {
    return ({
        sufficient: '库存充足',
        tight: '库存紧张',
        insufficient: '暂时无货'
    }[pickString(status)] || '库存未知');
}

function summarizeStationStockForItems(stockRows = [], stationId, items = []) {
    const normalizedItems = items.map((item) => normalizePickupSelectionItem(item));
    const lines = normalizedItems.map((item) => {
        const stockRow = findStationStockRow(stockRows, stationId, item.product_id, item.sku_id);
        const availableQty = roundQuantity(stockRow?.available_qty);
        const reservedQty = roundQuantity(stockRow?.reserved_qty);
        const status = deriveStationStockStatus(availableQty, item.quantity);
        const unitCost = roundMoney(stockRow?.cost_price);
        return {
            ...item,
            stock_id: stockRow?._id || stockRow?.id || buildStationStockDocId(stationId, item.product_id, item.sku_id),
            available_qty: availableQty,
            reserved_qty: reservedQty,
            cost_price: unitCost,
            stock_status: status,
            stock_status_text: stockStatusText(status),
            can_fulfill: status !== 'insufficient'
        };
    });
    const selectable = lines.every((item) => item.can_fulfill);
    const lockedSupplyTotal = roundMoney(lines.reduce((sum, item) => sum + roundMoney(item.cost_price * item.quantity), 0));
    const overallStatus = selectable
        ? (lines.some((item) => item.stock_status === 'tight') ? 'tight' : 'sufficient')
        : 'insufficient';
    return {
        selectable,
        stock_status: overallStatus,
        stock_status_text: stockStatusText(overallStatus),
        locked_supply_total: lockedSupplyTotal,
        lines
    };
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
    const sourceLat = Number(lat1);
    const sourceLng = Number(lng1);
    const targetLat = Number(lat2);
    const targetLng = Number(lng2);
    if (![sourceLat, sourceLng, targetLat, targetLng].every((value) => Number.isFinite(value))) return null;
    const toRad = (deg) => deg * Math.PI / 180;
    const earthRadius = 6371;
    const latDelta = toRad(targetLat - sourceLat);
    const lngDelta = toRad(targetLng - sourceLng);
    const a = Math.sin(latDelta / 2) ** 2
        + Math.cos(toRad(sourceLat)) * Math.cos(toRad(targetLat)) * Math.sin(lngDelta / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(earthRadius * c * 10) / 10;
}

function normalizeStationCoordinate(station = {}) {
    const latitude = toNumber(station.latitude ?? station.lat, NaN);
    const longitude = toNumber(station.longitude ?? station.lng, NaN);
    return {
        ...station,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null
    };
}

function normalizeCityText(value = '') {
    return pickString(value).replace(/\s+/g, '').toLowerCase();
}

function sortStationsByPickupPreference(stations = [], options = {}) {
    const sortCity = normalizeCityText(options.sortCity);
    const latitude = Number(options.lat);
    const longitude = Number(options.lng);
    return [...stations]
        .map((station) => {
            const normalized = normalizeStationCoordinate(station);
            const distanceKm = Number.isFinite(latitude) && Number.isFinite(longitude)
                ? haversineDistanceKm(latitude, longitude, normalized.latitude, normalized.longitude)
                : null;
            return {
                ...normalized,
                distance_km: distanceKm,
                sort_city_hit: sortCity && normalizeCityText(normalized.city) === sortCity ? 1 : 0
            };
        })
        .sort((left, right) => {
            const leftDistance = Number.isFinite(left.distance_km) ? left.distance_km : null;
            const rightDistance = Number.isFinite(right.distance_km) ? right.distance_km : null;
            if (leftDistance != null && rightDistance != null && leftDistance !== rightDistance) {
                return leftDistance - rightDistance;
            }
            if (leftDistance != null && rightDistance == null) return -1;
            if (leftDistance == null && rightDistance != null) return 1;
            if (left.sort_city_hit !== right.sort_city_hit) return right.sort_city_hit - left.sort_city_hit;
            const cityCompare = pickString(left.city).localeCompare(pickString(right.city), 'zh-Hans-CN');
            if (cityCompare !== 0) return cityCompare;
            return pickString(left.name).localeCompare(pickString(right.name), 'zh-Hans-CN');
        });
}

module.exports = {
    hasValue,
    pickString,
    toNumber,
    roundMoney,
    rowMatchesLookup,
    buildStationStockDocId,
    buildStationStockKey,
    normalizeStationStockRow,
    findStationStockRow,
    normalizePickupSelectionItem,
    deriveStationStockStatus,
    stockStatusText,
    summarizeStationStockForItems,
    haversineDistanceKm,
    sortStationsByPickupPreference
};
