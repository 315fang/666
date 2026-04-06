/**
 * 从优惠券模板发放到 user_coupons（快照 + 过期时间），供抽奖/自动发券/人工发券共用
 */
const { Coupon, UserCoupon } = require('../models');

function computeExpireAt(coupon) {
    const days = parseInt(coupon.valid_days, 10);
    const d = new Date();
    d.setDate(d.getDate() + (Number.isFinite(days) && days > 0 ? days : 30));
    return d;
}

function snapshotFromCoupon(coupon) {
    return {
        coupon_name: coupon.name,
        coupon_type: coupon.type,
        coupon_value: coupon.value,
        min_purchase: coupon.min_purchase != null ? coupon.min_purchase : 0,
        scope: coupon.scope || 'all',
        scope_ids: coupon.scope_ids != null ? coupon.scope_ids : null
    };
}

/**
 * 单用户发放一条（事务内）
 * @throws {Error} 模板不存在、已停用、或 DB 错误
 */
async function issueUserCouponFromTemplate({ userId, couponId, transaction }) {
    const coupon = await Coupon.findByPk(couponId, { transaction });
    if (!coupon) {
        throw new Error('优惠券模板不存在');
    }
    if (Number(coupon.is_active) !== 1) {
        throw new Error('优惠券已停用');
    }
    const expire_at = computeExpireAt(coupon);
    return UserCoupon.create(
        {
            user_id: userId,
            coupon_id: coupon.id,
            ...snapshotFromCoupon(coupon),
            status: 'unused',
            expire_at
        },
        { transaction }
    );
}

/**
 * 批量构建与 bulkCreate 兼容的记录（与人工发券、自动发券一致）
 */
function buildRecordsForUsers(coupon, userIds) {
    const expire_at = computeExpireAt(coupon);
    return userIds.map((user_id) => ({
        user_id,
        coupon_id: coupon.id,
        ...snapshotFromCoupon(coupon),
        status: 'unused',
        expire_at
    }));
}

module.exports = {
    computeExpireAt,
    snapshotFromCoupon,
    issueUserCouponFromTemplate,
    buildRecordsForUsers
};
