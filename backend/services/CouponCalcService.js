/**
 * CouponCalcService — 优惠券计算服务（纯函数层）
 *
 * 从 couponController 提取纯计算函数，
 * 解除 Service → Controller 的反向依赖。
 */

/**
 * 将 scope_ids 规范化为数字数组
 */
function normalizeScopeIds(value) {
    if (Array.isArray(value)) return value.map(item => Number(item)).filter(Number.isFinite);
    if (!value) return [];
    return String(value)
        .split(',')
        .map(item => Number(item.trim()))
        .filter(Number.isFinite);
}

/**
 * 校验优惠券 scope / scope_ids，并返回写入库的 scope_ids（数组或 null）
 */
function validateCouponScopePayload(scope, scope_ids) {
    const s = scope && String(scope).trim() ? String(scope).trim() : 'all';
    if (s === 'all') {
        return { ok: true, scope: 'all', scope_ids: null };
    }
    if (s !== 'product' && s !== 'category') {
        return { ok: false, message: '无效的使用范围' };
    }
    const ids = normalizeScopeIds(scope_ids);
    if (ids.length === 0) {
        return { ok: false, message: '选择「指定商品」或「指定分类」时，请至少选择一项' };
    }
    return { ok: true, scope: s, scope_ids: ids };
}

/**
 * 判断某张优惠券是否适用于给定的商品/分类组合
 */
function isCouponApplicable(userCoupon, { productIds = [], categoryIds = [] } = {}) {
    const scope = userCoupon.scope || 'all';
    if (scope === 'all') return true;
    const ids = normalizeScopeIds(userCoupon.scope_ids);
    if (ids.length === 0) return false;
    if (scope === 'product') {
        return productIds.some(id => ids.includes(Number(id)));
    }
    if (scope === 'category') {
        return categoryIds.some(id => ids.includes(Number(id)));
    }
    return false;
}

function getEffectiveMinPurchase(userCoupon) {
    if (!userCoupon) return 0;
    if (userCoupon.coupon_type === 'no_threshold') return 0;
    const value = Number(userCoupon.min_purchase);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 计算优惠券抵扣金额
 * @param {object} userCoupon   UserCoupon instance
 * @param {number} orderAmount  订单金额
 * @returns {number} 抵扣金额
 */
function calcCouponDiscount(userCoupon, orderAmount) {
    if (!userCoupon) return 0;
    if (getEffectiveMinPurchase(userCoupon) > orderAmount) return 0;

    if (userCoupon.coupon_type === 'fixed' || userCoupon.coupon_type === 'no_threshold') {
        return Math.min(parseFloat(userCoupon.coupon_value), orderAmount);
    } else if (userCoupon.coupon_type === 'percent') {
        let pct = parseFloat(userCoupon.coupon_value);
        if (pct < 0) pct = 0;
        if (pct > 1) pct = 1;
        const discount = 1 - pct;
        return Math.min(parseFloat((orderAmount * discount).toFixed(2)), orderAmount);
    }
    return 0;
}

module.exports = {
    calcCouponDiscount,
    isCouponApplicable,
    validateCouponScopePayload,
    getEffectiveMinPurchase
};
