'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const { toNumber, getAllRecords } = require('./shared/utils');

/**
 * 获取用户优惠券列表
 */
async function listCoupons(openid, status = 'unused') {
    try {
        const where = { openid };
        if (status) where.status = status;
        const allCoupons = await getAllRecords(db, 'user_coupons', where);
        return allCoupons.sort((a, b) => {
            const ta = a.expire_at ? new Date(a.expire_at).getTime() : 0;
            const tb = b.expire_at ? new Date(b.expire_at).getTime() : 0;
            return ta - tb;
        });
    } catch (err) {
        console.error('[user-coupons] listCoupons 失败:', err.message);
        return [];
    }
}

/**
 * 领取优惠券
 */
async function claimCoupon(openid, couponId) {
    const existing = await db.collection('user_coupons')
        .where({ openid, coupon_id: couponId })
        .limit(1)
        .get();

    if (existing.data && existing.data.length > 0) {
        return { success: false, message: '已领取此优惠券' };
    }

    const coupon = await db.collection('coupons').doc(couponId).get();
    if (!coupon.data) {
        return { success: false, message: '优惠券不存在' };
    }

    const result = await db.collection('user_coupons').add({
        data: {
            openid,
            coupon_id: couponId,
            coupon_name: coupon.data.name,
            status: 'unused',
            created_at: db.serverDate(),
            expire_at: db.serverDate({ offset: (coupon.data.valid_days || 30) * 24 * 60 * 60 })
        }
    });

    return { success: true, id: result._id };
}

/**
 * 自动领取新人优惠券
 */
async function claimWelcomeCoupons(openid) {
    try {
        // 查找所有新人/注册类优惠券模板
        const tplRes = await db.collection('coupons').where({
            name: db.RegExp({ regexp: '注册|见面礼|开运|新人', options: 'i' })
        }).get();

        const templates = tplRes.data.filter(t => t.is_active !== false);
        if (!templates.length) return 0;

        let claimedCount = 0;
        for (const tpl of templates) {
            const cid = String(tpl.id) || tpl._id;
            // 检查是否已领
            const existing = await db.collection('user_coupons')
                .where({ openid, coupon_id: cid })
                .count().catch(() => ({ total: 0 }));
            if (existing.total > 0) continue;

            // 检查库存
            if (tpl.stock > 0) {
                const totalClaimed = await db.collection('user_coupons')
                    .where({ coupon_id: cid })
                    .count().catch(() => ({ total: 0 }));
                if (totalClaimed.total >= tpl.stock) continue;
            }

            const validDays = toNumber(tpl.valid_days, 30);
            await db.collection('user_coupons').add({
                data: {
                    openid,
                    coupon_id: cid,
                    coupon_name: tpl.name,
                    coupon_type: tpl.type === 'percent' ? 'percent' : 'fixed',
                    coupon_value: toNumber(tpl.value, 0),
                    min_purchase: toNumber(tpl.min_purchase, 0),
                    status: 'unused',
                    created_at: db.serverDate(),
                    expire_at: db.serverDate({ offset: validDays * 24 * 60 * 60 })
                }
            });
            claimedCount += 1;
        }

        // 标记已发放
        await db.collection('users').where({ openid }).update({
            data: { register_coupons_issued: true, updated_at: db.serverDate() }
        }).catch(() => {});

        return claimedCount;
    } catch (err) {
        console.error('[claimWelcomeCoupons] Error:', err);
        return 0;
    }
}

module.exports = {
    listCoupons,
    claimCoupon,
    claimWelcomeCoupons
};
