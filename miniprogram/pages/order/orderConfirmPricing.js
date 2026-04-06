const { get } = require('../../utils/request');

function formatExpireDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    } catch (_e) {
        return dateStr;
    }
}

function recalcFinal(page) {
    const totalFen = Math.round(parseFloat(page.data.totalAmount) * 100);
    const shippingFen = Math.round(parseFloat(page.data.shippingFee || 0) * 100);
    const couponFen = Math.round(parseFloat(page.data.couponDiscount) * 100);
    const afterCouponFen = Math.max(0, totalFen + shippingFen - couponFen);

    let pointsDeductionFen = 0;
    let pointsToUse = 0;
    if (page.data.usePoints && page.data.pointBalance > 0) {
        const maxDeductFen = Math.floor(afterCouponFen * 0.5);
        const maxPoints = Math.floor(maxDeductFen);
        pointsToUse = Math.min(page.data.pointBalance, maxPoints);
        pointsDeductionFen = pointsToUse;
    }

    const finalFen = Math.max(0, afterCouponFen - pointsDeductionFen);
    page.setData({
        finalAmount: (finalFen / 100).toFixed(2),
        pointsToUse,
        pointsDeduction: (pointsDeductionFen / 100).toFixed(2)
    });
}

async function loadAvailableCoupons(page, isLoggedIn) {
    if (!isLoggedIn) return;
    try {
        const amount = page.data.totalAmount;
        const productIds = [...new Set((page.data.orderItems || []).map((item) => item.product_id).filter(Boolean))];
        const categoryIds = [...new Set((page.data.orderItems || []).map((item) => item.category_id).filter(Boolean))];
        const params = new URLSearchParams({ amount: String(amount) });
        if (productIds.length > 0) params.set('product_ids', productIds.join(','));
        if (categoryIds.length > 0) params.set('category_ids', categoryIds.join(','));
        const res = await get(`/coupons/available?${params.toString()}`);
        if (res.code === 0) {
            const coupons = (res.data || []).map((coupon) => ({
                ...coupon,
                expire_at_formatted: formatExpireDate(coupon.expire_at)
            }));
            page.setData({ availableCoupons: coupons });
        }
    } catch (_err) {
        // 静默失败
    }
}

function selectCoupon(page, coupon) {
    if (page.data.selectedCoupon && page.data.selectedCoupon.id === coupon.id) {
        clearCoupon(page);
        return;
    }
    const total = parseFloat(page.data.totalAmount);
    let discount = 0;
    if (coupon.coupon_type === 'fixed' || coupon.coupon_type === 'no_threshold') {
        discount = Math.min(parseFloat(coupon.coupon_value), total);
    } else if (coupon.coupon_type === 'percent') {
        let pct = parseFloat(coupon.coupon_value);
        if (pct < 0) pct = 0;
        if (pct > 1) pct = 1;
        discount = Math.min(parseFloat((total * (1 - pct)).toFixed(2)), total);
    }
    page.setData({
        selectedCoupon: coupon,
        couponDiscount: discount.toFixed(2),
        showCouponPicker: false
    });
    recalcFinal(page);
}

function clearCoupon(page) {
    page.setData({
        selectedCoupon: null,
        couponDiscount: '0.00',
        showCouponPicker: false
    });
    recalcFinal(page);
}

module.exports = {
    recalcFinal,
    loadAvailableCoupons,
    selectCoupon,
    clearCoupon
};
