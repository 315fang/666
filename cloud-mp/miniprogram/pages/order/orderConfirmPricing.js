const { get } = require('../../utils/request');
const { getMiniProgramConfig } = require('../../utils/miniProgramConfig');

function getPointDeductionRule() {
    const config = getMiniProgramConfig();
    const rule = config.point_rule_config || {};
    const deduction = rule.deduction || rule.redeem || {};
    const yuanPerPoint = Number(
        deduction.yuan_per_point
        ?? deduction.value_per_point
        ?? rule.yuan_per_point
        ?? rule.point_value
        ?? 0.1
    );
    const maxRatio = Number(
        deduction.max_order_ratio
        ?? deduction.max_deduction_ratio
        ?? rule.max_order_ratio
        ?? rule.max_deduction_ratio
        ?? 0.7
    );
    return {
        yuanPerPoint: Number.isFinite(yuanPerPoint) && yuanPerPoint > 0 ? yuanPerPoint : 0.1,
        maxRatio: Number.isFinite(maxRatio) && maxRatio > 0 ? Math.max(0.7, Math.min(1, maxRatio)) : 0.7
    };
}

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

function getCouponId(coupon) {
    if (!coupon) return null;
    return coupon._id != null ? coupon._id : (coupon.id != null ? coupon.id : null);
}

function buildCouponQuery(params) {
    const query = Object.keys(params)
        .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
    return query ? `?${query}` : '';
}

function recalcFinal(page) {
    const totalFen = Math.round(parseFloat(page.data.totalAmount) * 100);
    const shippingFen = Math.round(parseFloat(page.data.shippingFee || 0) * 100);
    const couponFen = Math.round(parseFloat(page.data.couponDiscount) * 100);
    const afterCouponFen = Math.max(0, totalFen + shippingFen - couponFen);

    let pointsDeductionFen = 0;
    let pointsToUse = 0;
    if (page.data.usePoints && page.data.pointBalance > 0 && page.data.allowPoints !== false) {
        const { yuanPerPoint, maxRatio } = getPointDeductionRule();
        const pointValueFen = Math.max(1, Math.round(yuanPerPoint * 100));
        const cappedDeductFen = Math.floor(afterCouponFen * maxRatio);
        const maxPoints = Math.floor(cappedDeductFen / pointValueFen);
        pointsToUse = Math.min(page.data.pointBalance, maxPoints);
        pointsDeductionFen = pointsToUse * pointValueFen;
    }

    const finalFen = Math.max(0, afterCouponFen - pointsDeductionFen);
    page.setData({
        finalAmount: (finalFen / 100).toFixed(2),
        pointsToUse,
        pointsDeduction: (pointsDeductionFen / 100).toFixed(2)
    });
}

async function loadAvailableCoupons(page) {
    try {
        if (page.data.exchangeMode) {
            page.setData({
                availableCoupons: [],
                unusedCouponCount: 0,
                selectedCoupon: null,
                couponDiscount: '0.00',
                allowCoupon: false,
                couponLoadStatus: 'success',
                couponLoadError: ''
            });
            recalcFinal(page);
            return {
                ok: true,
                status: 'success',
                data: [],
                errorType: ''
            };
        }
        page.setData({
            couponLoadStatus: 'loading',
            couponLoadError: ''
        });
        const hasExplosive = (page.data.orderItems || []).some(item => item.is_explosive === 1 || item.is_explosive === true);
        if (hasExplosive) {
            page.setData({
                availableCoupons: [],
                unusedCouponCount: 0,
                selectedCoupon: null,
                couponDiscount: '0.00',
                allowCoupon: false,
                couponLoadStatus: 'success',
                couponLoadError: ''
            });
            recalcFinal(page);
            return {
                ok: true,
                status: 'success',
                data: [],
                errorType: ''
            };
        }
        const amount = page.data.totalAmount;
        const productIds = [...new Set((page.data.orderItems || []).map((item) => item.product_id).filter(Boolean))];
        const categoryIds = [...new Set((page.data.orderItems || []).map((item) => item.category_id).filter(Boolean))];
        const query = buildCouponQuery({
            amount: String(amount),
            product_ids: productIds.length > 0 ? productIds.join(',') : '',
            category_ids: categoryIds.length > 0 ? categoryIds.join(',') : ''
        });
        const [availableRes, mineRes] = await Promise.all([
            get(`/coupons/available${query}`, {}, { showError: false }).catch(() => null),
            get('/coupons/mine', { status: 'unused' }, { showError: false }).catch(() => null)
        ]);
        const source = availableRes && availableRes.code === 0
            ? (Array.isArray(availableRes.data)
                ? availableRes.data
                : (availableRes.data && Array.isArray(availableRes.data.list) ? availableRes.data.list : []))
            : [];
        const coupons = source.map((coupon) => ({
            ...coupon,
            id: getCouponId(coupon),
            expire_at_formatted: formatExpireDate(coupon.expire_at)
        }));
        const unusedCoupons = mineRes && mineRes.code === 0
            ? (Array.isArray(mineRes.data)
                ? mineRes.data
                : (mineRes.data && Array.isArray(mineRes.data.list) ? mineRes.data.list : []))
            : [];
        const selectedCoupon = page.data.selectedCoupon;
        const stillAvailable = selectedCoupon
            ? coupons.some((item) => String(getCouponId(item)) === String(getCouponId(selectedCoupon)))
            : true;
        page.setData({
            availableCoupons: coupons,
            unusedCouponCount: unusedCoupons.length,
            selectedCoupon: stillAvailable ? selectedCoupon : null,
            couponDiscount: stillAvailable ? page.data.couponDiscount : '0.00',
            allowCoupon: true,
            couponLoadStatus: 'success',
            couponLoadError: ''
        });
        if (!stillAvailable) {
            recalcFinal(page);
        }
        return {
            ok: true,
            status: 'success',
            data: coupons,
            errorType: ''
        };
    } catch (error) {
        page.setData({
            availableCoupons: [],
            unusedCouponCount: 0,
            selectedCoupon: null,
            couponDiscount: '0.00',
            couponLoadStatus: 'error',
            couponLoadError: '优惠券暂不可用'
        });
        recalcFinal(page);
        return {
            ok: false,
            status: 'error',
            data: null,
            errorType: error && error.errorType ? error.errorType : 'unknown'
        };
    }
}

function selectCoupon(page, coupon) {
    if (page.data.selectedCoupon && String(getCouponId(page.data.selectedCoupon)) === String(getCouponId(coupon))) {
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
    clearCoupon,
    getPointDeductionRule
};
