'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeOrderAutoCancelMinutes(value, fallback = 30) {
    const minutes = Math.floor(toNumber(value, fallback));
    return Math.max(1, Math.min(1440, minutes));
}

function parseSingletonValue(row, fallback = {}) {
    if (!row) return fallback;
    const value = row.value !== undefined ? row.value : row.config_value;
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (_) {
            return fallback;
        }
    }
    return value && typeof value === 'object' ? value : fallback;
}

async function getDefaultOrderAutoCancelMinutes() {
    const singleton = await db.collection('admin_singletons')
        .doc('settings')
        .get()
        .catch(() => ({ data: null }));
    const settings = parseSingletonValue(singleton.data, {});
    const orderSettings = settings.ORDER && typeof settings.ORDER === 'object' ? settings.ORDER : {};
    return normalizeOrderAutoCancelMinutes(orderSettings.AUTO_CANCEL_MINUTES, 30);
}

function resolveOrderExpireAt(order, defaultMinutes) {
    const explicit = order && order.expire_at ? new Date(order.expire_at) : null;
    const createdAt = order && order.created_at ? new Date(order.created_at) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) {
        return explicit && !Number.isNaN(explicit.getTime()) ? explicit : null;
    }
    const minutes = normalizeOrderAutoCancelMinutes(order.payment_timeout_minutes || order.timeout_minutes, defaultMinutes);
    const fallback = new Date(createdAt.getTime() + minutes * 60 * 1000);
    if (!explicit || Number.isNaN(explicit.getTime())) return fallback;
    return explicit.getTime() >= fallback.getTime() ? explicit : fallback;
}

async function restoreUsedCoupon(order) {
    if (order.user_coupon_id) {
        const restored = await db.collection('user_coupons')
            .doc(String(order.user_coupon_id))
            .update({ data: { status: 'unused', used_at: _.remove() } })
            .then(() => true)
            .catch(() => false);
        if (restored) return;
    }
    if (order.coupon_id) {
        await db.collection('user_coupons')
            .where({ openid: order.openid, coupon_id: order.coupon_id, status: 'used' })
            .update({ data: { status: 'unused', used_at: _.remove() } })
            .catch(() => {});
    }
}

/**
 * 订单超时自动取消定时触发器
 * 每5分钟执行，取消超时未支付的订单
 */
exports.main = async (event, context) => {
    const TIMEOUT_MINUTES = await getDefaultOrderAutoCancelMinutes();
    const now = new Date();

    console.log(`[OrderTimeoutCancel] 开始扫描，默认超时分钟: ${TIMEOUT_MINUTES}`);

    try {
        // 查询待支付订单，具体是否超时由 expire_at / payment_timeout_minutes 判定
        const res = await db.collection('orders')
            .where({
                status: 'pending_payment'
            })
            .orderBy('created_at', 'asc')
            .limit(100)
            .get();

        if (!res.data || res.data.length === 0) {
            console.log('[OrderTimeoutCancel] 没有超时订单');
            return { cancelled: 0 };
        }

        let cancelledCount = 0;
        const errors = [];

        for (const order of res.data) {
            try {
                const expireAt = resolveOrderExpireAt(order, TIMEOUT_MINUTES);
                if (!expireAt || expireAt.getTime() > now.getTime()) {
                    continue;
                }

                // 先原子更新状态，防止与支付回调竞态
                const updateRes = await db.collection('orders')
                    .where({ _id: order._id, status: 'pending_payment' })
                    .update({
                        data: {
                            status: 'cancelled',
                            cancel_reason: '超时未支付，系统自动取消',
                            cancelled_at: db.serverDate(),
                            updated_at: db.serverDate(),
                        },
                    });

                if (!updateRes.stats || updateRes.stats.updated === 0) {
                    console.log(`[OrderTimeoutCancel] 订单 ${order._id} 状态已变更，跳过取消`);
                    continue;
                }

                // 状态已锁定为 cancelled，安全地恢复资产
                if (toNumber(order.points_used, 0) > 0 && order.openid) {
                    await db.collection('users').where({ openid: order.openid }).update({
                        data: {
                            points: _.inc(toNumber(order.points_used, 0)),
                            growth_value: _.inc(toNumber(order.points_used, 0)),
                            updated_at: db.serverDate(),
                        },
                    }).catch((e) => console.error('[OrderTimeoutCancel] 退积分失败:', order._id, e.message));
                }

                await restoreUsedCoupon(order).catch(() => {});

                // 恢复库存（创单时已扣 stock）
                if (order.stock_deducted_at && Array.isArray(order.items)) {
                    for (const item of order.items) {
                        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
                        if (item.product_id) {
                            await db.collection('products').doc(String(item.product_id)).update({
                                data: { stock: _.inc(qty), updated_at: db.serverDate() }
                            }).catch(() => {});
                        }
                        if (item.sku_id) {
                            await db.collection('skus').doc(String(item.sku_id)).update({
                                data: { stock: _.inc(qty), updated_at: db.serverDate() }
                            }).catch(() => {});
                        }
                    }
                }

                cancelledCount += 1;
            } catch (err) {
                errors.push({ order_id: order._id, error: err.message });
            }
        }

        console.log(`[OrderTimeoutCancel] 完成，取消 ${cancelledCount} 个订单`);
        if (errors.length > 0) {
            console.error('[OrderTimeoutCancel] 部分失败:', JSON.stringify(errors));
        }

        return { cancelled: cancelledCount, errors: errors.length };
    } catch (err) {
        console.error('[OrderTimeoutCancel] 扫描异常:', err);
        return { error: err.message };
    }
};
