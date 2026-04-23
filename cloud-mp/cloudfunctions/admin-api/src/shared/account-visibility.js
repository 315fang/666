'use strict';

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return fallback;
    if (['false', '0', 'no', 'off', 'disabled', 'inactive'].includes(normalized)) return false;
    return true;
}

function normalizeAccountVisibility(user = {}) {
    return pickString(user.account_visibility).toLowerCase() === 'hidden' ? 'hidden' : 'visible';
}

function isHiddenAccount(user = {}) {
    return normalizeAccountVisibility(user) === 'hidden';
}

function isVisibleAccount(user = {}) {
    return !isHiddenAccount(user);
}

function normalizeAccountOrigin(user = {}) {
    return pickString(user.account_origin).toLowerCase() === 'auto_login' ? 'auto_login' : 'normal';
}

function isTestOrder(order = {}) {
    return toBoolean(order.is_test_order, false);
}

function isBusinessOrder(order = {}) {
    return !isTestOrder(order);
}

module.exports = {
    isBusinessOrder,
    isHiddenAccount,
    isTestOrder,
    isVisibleAccount,
    normalizeAccountOrigin,
    normalizeAccountVisibility
};
