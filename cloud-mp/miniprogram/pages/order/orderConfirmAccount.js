const { get } = require('../../utils/request');

async function loadPointBalance(page) {
    try {
        const res = await get('/points/account');
        if (res && res.code === 0 && res.data) {
            page.setData({ pointBalance: res.data.balance_points || 0 });
        }
    } catch (_e) {
        // 静默
    }
}

function togglePoints(page, enabled) {
    page.setData({ usePoints: enabled });
    if (typeof page._recalcFinal === 'function') {
        page._recalcFinal();
    }
}

async function loadWalletBalance(page, app) {
    const roleLevel = app.globalData.userInfo?.role_level || 0;
    if (roleLevel < 3) return;
    page.setData({ isAgent: true });
    try {
        const res = await get('/agent/wallet');
        if (res && res.code === 0 && res.data) {
            page.setData({ walletBalance: parseFloat(res.data.balance || 0) });
        }
    } catch (_e) {
        // 静默
    }
}

function toggleWallet(page, enabled) {
    page.setData({ useWallet: enabled });
}

module.exports = {
    loadPointBalance,
    togglePoints,
    loadWalletBalance,
    toggleWallet
};
