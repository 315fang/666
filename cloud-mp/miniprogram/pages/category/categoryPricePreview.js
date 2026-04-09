const { get } = require('../../utils/request');

async function loadPricePreviewData(page, forceRefresh = false, ttl) {
    if (!forceRefresh && page._pricePreviewPromise) {
        return page._pricePreviewPromise;
    }

    if (!forceRefresh && page._lastPricePreviewLoadedAt && (Date.now() - page._lastPricePreviewLoadedAt) < ttl) {
        return;
    }

    page._pricePreviewPromise = (async () => {
        const [toggleRes, pointRes, couponRes] = await Promise.all([
            get('/configs').catch(() => null),
            get('/points/account').catch(() => null),
            get('/coupons/available?amount=0').catch(() => null)
        ]);
        let enabled = false;
        let couponEnabled = true;
        if (toggleRes && toggleRes.code === 0 && toggleRes.data) {
            const toggles = toggleRes.data.feature_toggles || toggleRes.data;
            if (Array.isArray(toggles)) {
                const pricePreview = toggles.find((item) => item.key === 'price_preview');
                enabled = pricePreview ? pricePreview.enabled : false;
                const coupon = toggles.find((item) => item.key === 'coupon');
                couponEnabled = coupon ? coupon.enabled : true;
            } else if (typeof toggles === 'object') {
                enabled = !!toggles.price_preview;
                couponEnabled = toggles.coupon !== undefined ? !!toggles.coupon : true;
            }
        }

        const pointBalance = (pointRes && pointRes.code === 0 && pointRes.data)
            ? (pointRes.data.balance_points || 0)
            : 0;
        let bestCoupon = 0;
        if (couponEnabled && couponRes && couponRes.code === 0 && couponRes.data) {
            const coupons = couponRes.data || [];
            coupons.forEach((coupon) => {
                if (coupon.coupon_type === 'fixed' || coupon.coupon_type === 'no_threshold') {
                    bestCoupon = Math.max(bestCoupon, parseFloat(coupon.coupon_value || 0));
                }
            });
        }

        const shouldRefreshTips = enabled !== page.data.pricePreviewEnabled
            || pointBalance !== page.data.userPointBalance
            || bestCoupon !== page.data.userBestCoupon;

        await new Promise((resolve) => page.setData({
            pricePreviewEnabled: enabled,
            userPointBalance: pointBalance,
            userBestCoupon: bestCoupon
        }, resolve));

        if (shouldRefreshTips) {
            page._refreshPricePreviewHints();
        }

        page._lastPricePreviewLoadedAt = Date.now();
    })().catch(() => {
        /* 静默失败 */
    }).finally(() => {
        page._pricePreviewPromise = null;
    });

    return page._pricePreviewPromise;
}

module.exports = {
    loadPricePreviewData
};
