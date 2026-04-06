const { USER_ROLES } = require('../config/constants');

const N_MEMBER_ROLE = 6;
const N_LEADER_ROLE = 7;

function normalizeRoleLevel(roleLevel) {
    return Number(roleLevel) || 0;
}

function canUseWalletPay(roleLevel) {
    const level = normalizeRoleLevel(roleLevel);
    return level >= USER_ROLES.AGENT || level === N_MEMBER_ROLE || level === N_LEADER_ROLE;
}

function getWalletPayGlobalPreference() {
    return !!wx.getStorageSync('useWalletPay');
}

function shouldUseWalletPayForOrder(roleLevel, orderId) {
    if (!canUseWalletPay(roleLevel)) return false;

    const preferredOrderIds = wx.getStorageSync('walletPayOrderIds') || [];
    if (orderId != null && Array.isArray(preferredOrderIds) && preferredOrderIds.includes(orderId)) {
        return true;
    }

    return getWalletPayGlobalPreference();
}

function rememberWalletPayPreference(orderIds = []) {
    wx.setStorageSync('useWalletPay', true);

    const nextOrderIds = Array.isArray(orderIds) ? orderIds.filter(Boolean) : [];
    if (nextOrderIds.length > 0) {
        const currentIds = wx.getStorageSync('walletPayOrderIds') || [];
        const mergedIds = Array.from(new Set([...(Array.isArray(currentIds) ? currentIds : []), ...nextOrderIds]));
        wx.setStorageSync('walletPayOrderIds', mergedIds);
    } else {
        wx.removeStorageSync('walletPayOrderIds');
    }
}

function clearWalletPayPreference(orderId) {
    const preferredOrderIds = wx.getStorageSync('walletPayOrderIds') || [];
    if (orderId != null && Array.isArray(preferredOrderIds) && preferredOrderIds.length) {
        const nextIds = preferredOrderIds.filter((id) => id !== orderId);
        if (nextIds.length > 0) wx.setStorageSync('walletPayOrderIds', nextIds);
        else wx.removeStorageSync('walletPayOrderIds');
    } else if (orderId == null) {
        wx.removeStorageSync('walletPayOrderIds');
    }

    wx.removeStorageSync('useWalletPay');
}

module.exports = {
    canUseWalletPay,
    clearWalletPayPreference,
    getWalletPayGlobalPreference,
    rememberWalletPayPreference,
    shouldUseWalletPayForOrder
};
