/**
 * 腾讯位置服务 WebService：地址解析（地理编码）
 * 文档：https://lbs.qq.com/service/webService/webServiceGuide/webServiceGcoder
 * 需配置环境变量 TENCENT_MAP_KEY（WebServiceAPI Key）
 */
const https = require('https');

const GEOCODE_HOST = 'apis.map.qq.com';

/**
 * 拼接完整地址供地理编码（省市区 + 详细地址，无分隔符）
 * @param {{ province?: string, city?: string, district?: string, address?: string }} parts
 */
function buildStationAddressString(parts) {
    if (!parts) return '';
    const segs = [parts.province, parts.city, parts.district, parts.address]
        .filter((x) => x != null && String(x).trim() !== '')
        .map((s) => String(s).trim());
    return segs.join('');
}

/**
 * @param {string} fullAddress
 * @returns {Promise<{ latitude: number, longitude: number } | null>}
 */
function geocodeFullAddress(fullAddress) {
    const key = (process.env.TENCENT_MAP_KEY || '').trim();
    if (!key || !fullAddress || !String(fullAddress).trim()) {
        return Promise.resolve(null);
    }
    const addr = encodeURIComponent(String(fullAddress).trim());
    const path = `/ws/geocoder/v1/?address=${addr}&key=${encodeURIComponent(key)}`;

    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: GEOCODE_HOST,
                path,
                method: 'GET',
                timeout: 15000
            },
            (res) => {
                let body = '';
                res.on('data', (c) => {
                    body += c;
                });
                res.on('end', () => {
                    try {
                        const j = JSON.parse(body);
                        if (j.status !== 0) {
                            console.warn('[tencentGeocoder]', j.status, j.message || j.msg || '');
                            resolve(null);
                            return;
                        }
                        const loc = j.result && j.result.location;
                        if (!loc || loc.lat == null || loc.lng == null) {
                            resolve(null);
                            return;
                        }
                        const latitude = parseFloat(loc.lat);
                        const longitude = parseFloat(loc.lng);
                        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                            resolve(null);
                            return;
                        }
                        resolve({ latitude, longitude });
                    } catch (e) {
                        reject(e);
                    }
                });
            }
        );
        req.on('error', (e) => reject(e));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('geocoder timeout'));
        });
        req.end();
    });
}

/**
 * 逆地址解析（经纬度 → 省市区）
 * 文档：https://lbs.qq.com/service/webService/webServiceGuide/webServiceGuideGcoder
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{ province: string, city: string, district: string, street?: string } | null>}
 */
function reverseGeocode(latitude, longitude) {
    const key = (process.env.TENCENT_MAP_KEY || '').trim();
    if (!key || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return Promise.resolve(null);
    }
    const location = `${latitude},${longitude}`;
    const path = `/ws/geocoder/v1/?location=${encodeURIComponent(location)}&key=${encodeURIComponent(key)}`;

    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: GEOCODE_HOST,
                path,
                method: 'GET',
                timeout: 15000
            },
            (res) => {
                let body = '';
                res.on('data', (c) => {
                    body += c;
                });
                res.on('end', () => {
                    try {
                        const j = JSON.parse(body);
                        if (j.status !== 0) {
                            console.warn('[tencentGeocoder] reverse', j.status, j.message || j.msg || '');
                            resolve(null);
                            return;
                        }
                        const ac = j.result && j.result.address_component;
                        if (!ac) {
                            resolve(null);
                            return;
                        }
                        resolve({
                            province: String(ac.province || '').trim(),
                            city: String(ac.city || '').trim(),
                            district: String(ac.district || '').trim(),
                            street: ac.street != null ? String(ac.street).trim() : ''
                        });
                    } catch (e) {
                        reject(e);
                    }
                });
            }
        );
        req.on('error', (e) => reject(e));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('reverse geocoder timeout'));
        });
        req.end();
    });
}

module.exports = {
    buildStationAddressString,
    geocodeFullAddress,
    reverseGeocode
};
