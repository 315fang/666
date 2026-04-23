'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { processExpiredGroups } = require('./shared/group-expiry');
const { recoverGroupExpiredRefunds } = require('./shared/system-refund');

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

async function releasePickupStationInventory(order, reason = '超时未支付，释放自提门店预占库存') {
    if (!order || String(order.pickup_stock_reservation_mode || '') !== 'station') return;
    if (String(order.pickup_stock_reservation_status || '') === 'released') return;
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
        const stockId = String(item && item.pickup_station_stock_id || '').trim();
        const qty = Math.max(0, Number(item && (item.pickup_stock_reserved_qty ?? item.qty ?? item.quantity) || 0));
        if (!stockId || qty <= 0) continue;
        await db.collection('station_sku_stocks').doc(stockId).update({
            data: {
                available_qty: _.inc(qty),
                reserved_qty: _.inc(-qty),
                updated_at: db.serverDate()
            }
        }).catch(() => {});
        await db.collection('station_stock_logs').add({
            data: {
                station_id: order.pickup_station_id || '',
                stock_id: stockId,
                product_id: item.product_id || '',
                sku_id: item.sku_id || '',
                type: 'release',
                quantity: qty,
                order_id: order._id || '',
                order_no: order.order_no || '',
                remark: reason,
                created_at: db.serverDate()
            }
        }).catch(() => {});
    }
    await db.collection('orders').doc(String(order._id)).update({
        data: {
            pickup_stock_reservation_status: 'released',
            pickup_stock_released_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    }).catch(() => {});
}

async function cancelTimedOutPendingOrders(defaultMinutes, now) {
    const res = await db.collection('orders')
        .where({ status: 'pending_payment' })
        .orderBy('created_at', 'asc')
        .limit(100)
        .get();

    if (!res.data || res.data.length === 0) {
        console.log('[OrderTimeoutCancel] 没有超时待支付订单');
        return { cancelled: 0, errors: [] };
    }

    let cancelledCount = 0;
    const errors = [];

    for (const order of res.data) {
        try {
            const expireAt = resolveOrderExpireAt(order, defaultMinutes);
            if (!expireAt || expireAt.getTime() > now.getTime()) {
                continue;
            }

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

            await releasePickupStationInventory(order).catch((e) => {
                console.error('[OrderTimeoutCancel] 释放门店预占库存失败:', order._id, e.message);
            });

            cancelledCount += 1;
        } catch (err) {
            errors.push({ order_id: order._id, error: err.message });
        }
    }

    return { cancelled: cancelledCount, errors };
}

async function recoverPendingGoodsFundRefunds(limit = 20) {
    const internalToken = String(process.env.ORDER_INTERNAL_TOKEN || '').trim();
    if (!internalToken) {
        return { scanned: 0, completed: 0, errors: [{ error: 'missing_ORDER_INTERNAL_TOKEN' }] };
    }

    const result = await cloud.callFunction({
        name: process.env.ORDER_FUNCTION_NAME || 'order',
        data: {
            action: 'recoverGoodsFundRefunds',
            internal_token: internalToken,
            limit
        }
    }).catch((error) => ({
        result: {
            code: 500,
            message: error.message || 'recover_goods_fund_refunds_failed'
        }
    }));

    const payload = result && result.result;
    if (payload && payload.code && payload.code !== 0) {
        return { scanned: 0, completed: 0, errors: [{ error: payload.message || 'recover_goods_fund_refunds_failed' }] };
    }
    return payload && payload.data ? payload.data : (payload || { scanned: 0, completed: 0, errors: [] });
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
        const [pendingResult, groupResult, goodsFundRecoveryResult] = await Promise.all([
            cancelTimedOutPendingOrders(TIMEOUT_MINUTES, now),
            processExpiredGroups(100),
            recoverPendingGoodsFundRefunds(50)
        ]);
        const refundRecoveryResult = await recoverGroupExpiredRefunds(50);

        const errors = [...pendingResult.errors, ...groupResult.errors, ...refundRecoveryResult.errors, ...(goodsFundRecoveryResult.errors || [])];
        console.log(`[OrderTimeoutCancel] 完成，取消 ${pendingResult.cancelled} 个待支付订单，过期 ${groupResult.expiredGroups} 个拼团，触发 ${groupResult.refundedOrders} 笔自动退款，拼团退款补偿扫描 ${refundRecoveryResult.scanned} 笔，已同步 ${refundRecoveryResult.synced} 笔，重试 ${refundRecoveryResult.retried} 笔，货款退款补偿完成 ${goodsFundRecoveryResult.completed || 0} 笔`);
        if (errors.length > 0) {
            console.error('[OrderTimeoutCancel] 部分失败:', JSON.stringify(errors));
        }

        return {
            cancelled: pendingResult.cancelled,
            expired_groups: groupResult.expiredGroups,
            refunded_orders: groupResult.refundedOrders,
            recovered_refunds: refundRecoveryResult.completed,
            synced_refunds: refundRecoveryResult.synced,
            retried_refunds: refundRecoveryResult.retried,
            recovered_goods_fund_refunds: goodsFundRecoveryResult.completed || 0,
            errors: errors.length
        };
    } catch (err) {
        console.error('[OrderTimeoutCancel] 扫描异常:', err);
        return { error: err.message };
    }
};
