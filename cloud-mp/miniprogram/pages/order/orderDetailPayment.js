const { get, post } = require('../../utils/request');

function shouldUseWalletForOrder(page, app, orderId) {
    const roleLevel = app.globalData.userInfo && app.globalData.userInfo.role_level || 0;
    if (roleLevel < 3) return false;
    const preferredOrderIds = wx.getStorageSync('walletPayOrderIds') || [];
    if (Array.isArray(preferredOrderIds) && preferredOrderIds.includes(orderId)) {
        return true;
    }
    return !!wx.getStorageSync('useWalletPay');
}

function clearWalletPreference(orderId) {
    const preferredOrderIds = wx.getStorageSync('walletPayOrderIds') || [];
    if (Array.isArray(preferredOrderIds) && preferredOrderIds.length) {
        const nextIds = preferredOrderIds.filter((id) => id !== orderId);
        if (nextIds.length > 0) wx.setStorageSync('walletPayOrderIds', nextIds);
        else wx.removeStorageSync('walletPayOrderIds');
    }
    wx.removeStorageSync('useWalletPay');
}

async function onPayOrder(page, app) {
    const { order } = page.data;
    if (!(order && order.id)) return;

    // 防止重复点击
    if (page._paying) return;
    page._paying = true;

    let loadingVisible = false;
    const safeHideLoading = () => {
        if (loadingVisible) {
            wx.hideLoading();
            loadingVisible = false;
        }
    };
    const done = () => { page._paying = false; };

    wx.showLoading({ title: '支付中...' });
    loadingVisible = true;
    try {
        const useWallet = shouldUseWalletForOrder(page, app, order.id);

        const prepayRes = await post(`/orders/${order.id}/prepay`, {
            use_wallet_balance: useWallet
        });
        if (prepayRes.code !== 0) {
            safeHideLoading();
            done();
            wx.showToast({ title: prepayRes.message || '预下单失败', icon: 'none' });
            return;
        }

        const payParams = prepayRes.data;
        const requestParams = payParams && payParams.wx_payment ? payParams.wx_payment : payParams;

        if (payParams.wallet_balance_insufficient) {
            wx.showToast({
                title: `货款余额不足，已切换微信支付（余额¥${Number(payParams.wallet_balance || 0).toFixed(2)}）`,
                icon: 'none'
            });
        }

        if (payParams.paid_by_wallet) {
            safeHideLoading();
            done();
            clearWalletPreference(order.id);
            wx.showToast({ title: '货款余额支付成功！', icon: 'success' });
            page.startPayStatusPolling(order.id);
            return;
        }

        if (payParams.paid_by_free) {
            safeHideLoading();
            done();
            clearWalletPreference(order.id);
            wx.showToast({
                title: payParams.message || '订单已自动完成支付',
                icon: 'success'
            });
            page.startPayStatusPolling(order.id);
            return;
        }

        if (!requestParams || !requestParams.timeStamp || !requestParams.nonceStr || !requestParams.package || !requestParams.paySign) {
            safeHideLoading();
            done();
            wx.showToast({ title: '支付参数缺失，请稍后重试', icon: 'none' });
            console.error('支付参数异常:', payParams);
            return;
        }

        wx.requestPayment({
            timeStamp: requestParams.timeStamp,
            nonceStr: requestParams.nonceStr,
            package: requestParams.package,
            signType: requestParams.signType || 'RSA',
            paySign: requestParams.paySign,
            success: () => {
                wx.showToast({ title: '支付成功！', icon: 'success' });
                page.startPayStatusPolling(order.id);
            },
            fail: (err) => {
                if (err.errMsg && err.errMsg.includes('cancel')) {
                    wx.showToast({ title: '已取消支付', icon: 'none' });
                } else {
                    wx.showToast({ title: '支付失败，请重试', icon: 'none' });
                    console.error('wx.requestPayment fail:', err);
                }
            },
            complete: () => {
                safeHideLoading();
                done();
            }
        });
    } catch (err) {
        safeHideLoading();
        done();
        wx.showToast({ title: err.message || '支付失败', icon: 'none' });
        console.error('支付流程异常:', err);
    }
}

function startPayStatusPolling(page, orderId) {
    if (page._payPollTimer) clearTimeout(page._payPollTimer);

    let attempts = 0;
    const maxAttempts = 10;
    const intervalMs = 2000;

    const poll = async () => {
        attempts += 1;
        try {
            await post(`/orders/${orderId}/sync-wechat-pay`, {}, { showError: false, maxRetries: 0, timeout: 12000 }).catch(() => {});
            const res = await get(`/orders/${orderId}`, {}, { showError: false, maxRetries: 0, timeout: 8000 });
            const latestOrder = res && res.data;
            if (latestOrder && latestOrder.status && latestOrder.status !== 'pending') {
                clearWalletPreference(orderId);
                const groupNo = latestOrder.group_no;
                const isGroup = latestOrder.type === 'group' || !!latestOrder.group_activity_id || !!groupNo;
                if (isGroup && groupNo) {
                    wx.redirectTo({ url: `/pages/group/detail?group_no=${groupNo}` });
                    return;
                }
                page.loadOrder(orderId);
                return;
            }
        } catch (_) {
            /* 兜底轮询不打断用户流程 */
        }

        if (attempts < maxAttempts) {
            page._payPollTimer = setTimeout(poll, intervalMs);
        } else {
            page.loadOrder(orderId);
            wx.showToast({ title: '支付结果同步稍慢，请稍后刷新查看', icon: 'none' });
        }
    };

    page._payPollTimer = setTimeout(poll, 1200);
}

module.exports = {
    shouldUseWalletForOrder,
    clearWalletPreference,
    onPayOrder,
    startPayStatusPolling
};
