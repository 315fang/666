const constants = require('../config/constants');

const STOCK_RESERVED_MARKER = constants.ORDER?.STOCK_RESERVE_MARKER || '[库存已预扣]';

function getRemarkText(orderOrRemark) {
    if (!orderOrRemark) return '';
    if (typeof orderOrRemark === 'string') return orderOrRemark;
    return String(orderOrRemark.remark || '');
}

function hasReservedStockMarker(orderOrRemark) {
    return getRemarkText(orderOrRemark).includes(STOCK_RESERVED_MARKER);
}

function appendReservedStockMarker(remark = '') {
    const currentRemark = String(remark || '').trim();
    if (hasReservedStockMarker(currentRemark)) {
        return currentRemark;
    }
    return currentRemark ? `${currentRemark} | ${STOCK_RESERVED_MARKER}` : STOCK_RESERVED_MARKER;
}

function removeReservedStockMarker(remark = '') {
    const currentRemark = String(remark || '');
    if (!currentRemark) return '';

    const escapedMarker = STOCK_RESERVED_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let cleanedRemark = currentRemark.replace(
        new RegExp(`\\s*\\|?\\s*${escapedMarker}\\s*\\|?\\s*`, 'g'),
        ' | '
    );

    cleanedRemark = cleanedRemark
        .replace(/\s*\|\s*\|\s*/g, ' | ')
        .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
        .trim();

    return cleanedRemark;
}

module.exports = {
    STOCK_RESERVED_MARKER,
    hasReservedStockMarker,
    appendReservedStockMarker,
    removeReservedStockMarker
};
