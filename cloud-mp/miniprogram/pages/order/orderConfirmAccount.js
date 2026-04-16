const { get } = require('../../utils/request');

async function loadPointBalance(page) {
    page.setData({
        pointsLoadStatus: 'loading',
        pointsLoadError: ''
    });
    try {
        const res = await get('/points/account', {}, { showError: false });
        if (res && res.code === 0 && res.data) {
            // 后端 pointsAccount 返回 points / growth_value，无 balance_points 字段
            const balance = res.data.points ?? res.data.growth_value ?? res.data.balance_points ?? 0;
            page.setData({
                pointBalance: Number(balance) || 0,
                pointsLoadStatus: 'success',
                pointsLoadError: ''
            });
            if (typeof page._recalcFinal === 'function') {
                page._recalcFinal();
            }
            return {
                ok: true,
                status: 'success',
                data: Number(balance) || 0,
                errorType: ''
            };
        }
        throw new Error('积分账户返回异常');
    } catch (_e) {
        page.setData({
            pointBalance: 0,
            usePoints: false,
            pointsToUse: 0,
            pointsDeduction: '0.00',
            pointsLoadStatus: 'error',
            pointsLoadError: '积分暂不可用'
        });
        if (typeof page._recalcFinal === 'function') {
            page._recalcFinal();
        }
        return {
            ok: false,
            status: 'error',
            data: null,
            errorType: _e && _e.errorType ? _e.errorType : 'unknown'
        };
    }
}

function togglePoints(page, enabled) {
    page.setData({ usePoints: enabled });
    if (typeof page._recalcFinal === 'function') {
        page._recalcFinal();
    }
}

async function loadWalletBalance(page) {
    if (!page.data.isAgent) {
        page.setData({
            walletLoadStatus: 'idle',
            walletLoadError: '',
            walletBalance: 0,
            useWallet: false
        });
        return {
            ok: true,
            status: 'skipped',
            data: null,
            errorType: ''
        };
    }
    page.setData({
        walletLoadStatus: 'loading',
        walletLoadError: ''
    });
    try {
        const res = await get('/agent/goods-fund', {}, { showError: false });
        if (res && res.code === 0 && res.data) {
            const balance = parseFloat(res.data.balance || 0);
            page.setData({
                walletBalance: balance,
                walletLoadStatus: 'success',
                walletLoadError: ''
            });
            return {
                ok: true,
                status: 'success',
                data: balance,
                errorType: ''
            };
        }
        throw new Error('货款余额返回异常');
    } catch (error) {
        page.setData({
            walletBalance: 0,
            useWallet: false,
            walletLoadStatus: 'error',
            walletLoadError: '余额暂不可用'
        });
        return {
            ok: false,
            status: 'error',
            data: null,
            errorType: error && error.errorType ? error.errorType : 'unknown'
        };
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
