'use strict';

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function normalizeVisibilityValue(value) {
    return pickString(value).toLowerCase() === 'hidden' ? 'hidden' : 'visible';
}

function normalizeOrderVisibility(order = {}) {
    return normalizeVisibilityValue(order.order_visibility || order.admin_visibility || order.visibility);
}

function isHiddenOrder(order = {}) {
    return normalizeOrderVisibility(order) === 'hidden';
}

function isVisibleOrder(order = {}) {
    return !isHiddenOrder(order);
}

module.exports = {
    isHiddenOrder,
    isVisibleOrder,
    normalizeOrderVisibility,
    normalizeVisibilityValue
};
