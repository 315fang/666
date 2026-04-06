/**
 * service_stations.remark 存 JSON：分支代理的 branch_type/region_name + 自提分佣档位等
 */

function parseServiceStationRemark(remark) {
    if (remark == null || remark === '') return {};
    if (typeof remark === 'object' && !Array.isArray(remark)) return { ...remark };
    try {
        const o = JSON.parse(remark);
        return typeof o === 'object' && o && !Array.isArray(o) ? o : {};
    } catch (_) {
        return {};
    }
}

function normalizePickupTierKey(raw) {
    const s = String(raw == null || raw === '' ? 'A' : raw).trim().toUpperCase();
    return ['A', 'B', 'C', 'D'].includes(s) ? s : 'A';
}

module.exports = {
    parseServiceStationRemark,
    normalizePickupTierKey
};
