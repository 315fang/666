'use strict';

function pickString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function normalizeAdministrativeRegionText(value) {
    let text = pickString(value).replace(/\s+/g, '').trim().toLowerCase();
    if (!text) return '';
    const suffixes = [
        '特别行政区',
        '维吾尔自治区',
        '壮族自治区',
        '回族自治区',
        '自治区',
        '自治州',
        '地区',
        '盟',
        '省',
        '市',
        '区',
        '县'
    ];
    let changed = true;
    while (changed) {
        changed = false;
        for (const suffix of suffixes) {
            if (text.length > suffix.length && text.endsWith(suffix)) {
                text = text.slice(0, -suffix.length);
                changed = true;
                break;
            }
        }
    }
    return text;
}

function normalizeCityText(city, province = '') {
    const normalizedCity = normalizeAdministrativeRegionText(city);
    const normalizedProvince = normalizeAdministrativeRegionText(province);
    if (['市辖', '县辖', '省直辖'].includes(normalizedCity)) {
        return normalizedProvince;
    }
    return normalizedCity || normalizedProvince;
}

module.exports = {
    normalizeAdministrativeRegionText,
    normalizeCityText
};
