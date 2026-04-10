'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber } = require('./shared/utils');

/**
 * 根据 product_id 查找商品（兼容数字 id 和文档 _id）
 */
async function findProduct(productId) {
    if (!productId) return null;
    const num = toNumber(productId, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('products').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('products').doc(String(productId)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

/**
 * 根据 sku_id 查找 SKU
 */
async function findSku(skuId) {
    if (!skuId) return null;
    const num = toNumber(skuId, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('skus').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('skus').doc(String(skuId)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

/**
 * 根据活动 ID 查找拼团活动（兼容数字 id 和文档 _id）
 */
async function findGroupActivity(activityId) {
    if (!activityId) return null;
    const num = toNumber(activityId, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('group_activities').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('group_activities').doc(String(activityId)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

function isActivityOpen(activity) {
    return activity && (
        activity.status === true
        || activity.status === 'active'
        || activity.is_active === true
        || activity.active === true
    );
}

function sameProduct(activity = {}, product = {}) {
    const expected = [activity.product_id, activity.productId].filter((value) => value !== undefined && value !== null);
    const actual = [product._id, product.id, product._legacy_id].filter((value) => value !== undefined && value !== null);
    return expected.length === 0 || expected.some((left) => actual.some((right) => String(left) === String(right)));
}

/**
 * 创建订单（含金额计算、库存校验、优惠券核销）
 */
async function createOrder(openid, orderData) {
    const {
        items,
        address_id,
        coupon_id,
        memo,
        delivery_type,
        pickup_station_id,
        points_to_use,
        type,
        group_activity_id,
        group_no
    } = orderData;

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('缺少商品信息');
    }

    const groupActivity = group_activity_id ? await findGroupActivity(group_activity_id) : null;
    if (group_activity_id) {
        if (!groupActivity) throw new Error('拼团活动不存在');
        if (!isActivityOpen(groupActivity)) throw new Error('拼团活动已结束');
        const endAt = groupActivity.end_time || groupActivity.end_at;
        if (endAt && new Date(endAt) < new Date()) throw new Error('拼团活动已过期');
    }

    // 1. 查商品和 SKU，计算金额
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
        const product = await findProduct(item.product_id);
        if (!product) {
            throw new Error(`商品不存在: ${item.product_id}`);
        }
        if (groupActivity && !sameProduct(groupActivity, product)) {
            throw new Error('拼团商品与活动不匹配');
        }

        let sku = null;
        if (item.sku_id) {
            sku = await findSku(item.sku_id);
        }

        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        const activityPrice = groupActivity ? toNumber(groupActivity.group_price || groupActivity.price, 0) : null;
        const unitPrice = groupActivity
            ? activityPrice
            : toNumber(sku ? sku.price : product.retail_price || product.min_price, 0);
        const lineTotal = Math.round(unitPrice * qty * 100) / 100;

        totalAmount += lineTotal;

        orderItems.push({
            product_id: product._id || product.id,
            sku_id: item.sku_id || '',
            name: product.name || '',
            spec: sku ? (sku.spec || sku.specs || '') : '',
            image: sku ? (sku.image || '') : (Array.isArray(product.images) ? product.images[0] : ''),
            price: unitPrice,
            qty,
            subtotal: lineTotal,
            activity_type: groupActivity ? 'group' : '',
            group_activity_id: groupActivity ? (groupActivity._id || String(group_activity_id)) : ''
        });
    }

    totalAmount = Math.round(totalAmount * 100) / 100;

    // 2. 优惠券抵扣
    let couponDiscount = 0;
    if (coupon_id) {
        try {
            const couponDoc = await db.collection('user_coupons')
                .where({ openid, coupon_id, status: 'unused' })
                .limit(1).get();
            if (couponDoc.data && couponDoc.data.length > 0) {
                const uc = couponDoc.data[0];
                if (uc.coupon_type === 'percent') {
                    couponDiscount = Math.round(totalAmount * (1 - toNumber(uc.coupon_value, 100) / 100) * 100) / 100;
                } else {
                    couponDiscount = toNumber(uc.coupon_value, 0);
                }
                // 核销优惠券
                await db.collection('user_coupons').doc(uc._id).update({
                    data: { status: 'used', used_at: db.serverDate() }
                });
            }
        } catch (err) {
            console.error('[OrderCreate] 优惠券处理失败:', err);
        }
    }

    // 3. 积分抵扣
    let pointsDiscount = 0;
    const usePoints = toNumber(points_to_use, 0);
    if (usePoints > 0) {
        try {
            const userRes = await db.collection('users').where({ openid }).limit(1).get();
            if (userRes.data && userRes.data.length > 0) {
                const userPoints = toNumber(userRes.data[0].points, 0);
                const actualPoints = Math.min(usePoints, userPoints);
                pointsDiscount = actualPoints * 0.01; // 1积分=0.01元
                // 扣减积分
                await db.collection('users').where({ openid }).update({
                    data: { points: _.inc(-actualPoints), growth_value: _.inc(-actualPoints), updated_at: db.serverDate() }
                });
            }
        } catch (err) {
            console.error('[OrderCreate] 积分抵扣失败:', err);
        }
    }

    // 4. 计算最终支付金额
    let payAmount = totalAmount - couponDiscount - pointsDiscount;
    payAmount = Math.max(0, Math.round(payAmount * 100) / 100);

    // 5. 查收货地址
    let addressInfo = null;
    if (address_id) {
        try {
            const addrRes = await db.collection('addresses').doc(address_id).get();
            if (addrRes.data) {
                addressInfo = addrRes.data;
            }
        } catch (_) {}
    }

    // 6. 生成订单号
    const orderNo = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);

    // 7. 构建订单
    const order = {
        order_no: orderNo,
        openid,
        status: 'pending_payment',
        items: orderItems,
        total_amount: totalAmount,
        coupon_discount: couponDiscount,
        points_discount: pointsDiscount,
        points_used: toNumber(points_to_use, 0),
        pay_amount: payAmount,
        address_id: address_id || '',
        address: addressInfo,
        delivery_type: delivery_type || 'express',
        pickup_station_id: pickup_station_id || '',
        coupon_id: coupon_id || '',
        memo: memo || '',
        type: groupActivity ? 'group' : (type || 'normal'),
        group_activity_id: groupActivity ? (groupActivity._id || String(group_activity_id)) : '',
        legacy_group_activity_id: groupActivity ? (groupActivity.id || groupActivity._legacy_id || group_activity_id) : '',
        group_no: group_no || '',
        group_joined_at: null,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
    };

    const result = await db.collection('orders').add({ data: order });

    // 8. 清除购物车中已下单的商品
    try {
        const productIds = orderItems.map(i => String(i.product_id));
        // 逐个查询清除，避免 _.in() 类型不匹配问题（product_id 可能是字符串或数字）
        for (const pid of productIds) {
            try {
                const rows = await db.collection('cart_items').where({ openid, product_id: pid }).get().catch(() => ({ data: [] }));
                await Promise.all(rows.data.map(row => db.collection('cart_items').doc(row._id).remove()));
                // 同时尝试数字 ID
                const numPid = toNumber(pid, NaN);
                if (Number.isFinite(numPid) && String(numPid) !== pid) {
                    const numRows = await db.collection('cart_items').where({ openid, product_id: numPid }).get().catch(() => ({ data: [] }));
                    await Promise.all(numRows.data.map(row => db.collection('cart_items').doc(row._id).remove()));
                }
            } catch (_) {}
        }
    } catch (_) {}

    return { _id: result._id, id: result._id, order_no: orderNo, total_amount: totalAmount, pay_amount: payAmount };
}

module.exports = {
    createOrder
};
