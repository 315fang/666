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

/**
 * 加载代理商货款余额（goods_fund_balance）
 * 仅 role_level >= 3 的代理商调用
 */
async function loadGoodsFundBalance(page, app) {
    const roleLevel = app.globalData.userInfo?.role_level || 0;
    if (roleLevel < 3) return;
    try {
        const res = await get('/agent/goods-fund');
        if (res && res.code === 0 && res.data) {
            page.setData({ goodsFundBalance: parseFloat(res.data.balance || 0) });
        }
    } catch (_e) {
        // 静默，货款余额不可用时不阻断流程
    }
}

/**
 * 切换货款支付开关
 * 开启条件：isAgent && goodsFundBalance >= finalAmount
 */
function toggleGoodsFund(page, enabled) {
    page.setData({ useGoodsFund: enabled });
}

module.exports = {
    loadPointBalance,
    togglePoints,
    loadWalletBalance,
    toggleWallet,
    loadGoodsFundBalance,
    toggleGoodsFund
};
