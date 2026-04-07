const { buildStationAddressString, geocodeFullAddress } = require('./tencentGeocoder');

function hasValidCoords(lat, lng) {
    const la = parseFloat(lat);
    const lo = parseFloat(lng);
    return Number.isFinite(la) && Number.isFinite(lo);
}

function normalizeCoordBody(body) {
    if (!body) return { explicit: false };
    if (body.latitude === undefined && body.longitude === undefined) return { explicit: false };
    if (hasValidCoords(body.latitude, body.longitude)) {
        return { explicit: true, lat: parseFloat(body.latitude), lng: parseFloat(body.longitude) };
    }
    return { explicit: false };
}

function hasTencentKey() {
    return !!(process.env.TENCENT_MAP_KEY || '').trim();
}

/**
 * 创建网点：手动填了合法经纬度则不再解析；否则用省市区+地址请求腾讯
 */
async function resolveCoordsForCreate(body, addressFields) {
    const { explicit, lat, lng } = normalizeCoordBody(body);
    if (explicit) {
        return { latitude: lat, longitude: lng, geocode_note: null };
    }
    const full = buildStationAddressString(addressFields);
    if (!full) {
        return {
            latitude: null,
            longitude: null,
            geocode_note: '未填写可用于解析的地址（至少省、市），可手动填写经纬度'
        };
    }
    try {
        const loc = await geocodeFullAddress(full);
        if (loc) {
            return {
                latitude: loc.latitude,
                longitude: loc.longitude,
                geocode_note: '已根据地址自动解析经纬度（腾讯位置服务）'
            };
        }
    } catch (e) {
        console.warn('[stationGeocode] create geocode error', e.message || e);
    }
    if (hasTencentKey()) {
        return {
            latitude: null,
            longitude: null,
            geocode_note: '地址解析未返回坐标，请核对地址或手动填写经纬度'
        };
    }
    return {
        latitude: null,
        longitude: null,
        geocode_note: '未配置 TENCENT_MAP_KEY，已跳过自动解析；请手动填写经纬度或在 .env 中配置 Key'
    };
}

/**
 * 更新网点：body 中带合法经纬度优先；否则地址相对上次有变化则重新解析
 */
async function resolveCoordsForUpdate(station, body) {
    const { explicit } = normalizeCoordBody(body);
    if (explicit) {
        /* 合法经纬度已在控制器中写入 station */
        return { apply: false, geocode_note: null };
    }

    const merged = {
        province: body.province !== undefined ? body.province : station.province,
        city: body.city !== undefined ? body.city : station.city,
        district: body.district !== undefined ? body.district : station.district,
        address: body.address !== undefined ? body.address : station.address
    };
    const prevFull = buildStationAddressString(station);
    const newFull = buildStationAddressString(merged);
    if (prevFull === newFull || !newFull) {
        return { apply: false, geocode_note: null };
    }

    try {
        const loc = await geocodeFullAddress(newFull);
        if (loc) {
            return {
                apply: true,
                latitude: loc.latitude,
                longitude: loc.longitude,
                geocode_note: '已根据新地址自动更新经纬度（腾讯位置服务）'
            };
        }
    } catch (e) {
        console.warn('[stationGeocode] update geocode error', e.message || e);
    }
    if (hasTencentKey()) {
        return {
            apply: false,
            geocode_note: '地址已变更但解析失败，原经纬度未改，请手动修正'
        };
    }
    return {
        apply: false,
        geocode_note: '未配置 TENCENT_MAP_KEY，无法自动更新坐标；请手动填写经纬度'
    };
}

module.exports = {
    buildStationAddressString,
    hasValidCoords,
    normalizeCoordBody,
    resolveCoordsForCreate,
    resolveCoordsForUpdate
};
