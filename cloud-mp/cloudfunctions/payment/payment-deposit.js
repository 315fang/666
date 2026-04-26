'use strict';

const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const { jsapiOrder, buildMiniPayParams, loadPrivateKey } = require('./wechat-pay-v3');

const DEPOSIT_AMOUNT = 50;
const DEPOSIT_AMOUNT_FEN = 5000;
const DEPOSIT_PREFIX = 'DEP';
const DEPOSIT_REFUND_PREFIX = 'DEPRF';
const DEFAULT_DEPOSIT_REWARD_CONFIG = {
    coupon_product_value: 100,
    title: '押金兑换券',
    description: '支付押金后可领取并分享的兑换券',
    allowed_product_ids: [],
    allowed_sku_ids: []
};

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null || value === '') return [];
    return [value];
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function parseTimestamp(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const ts = new Date(value).getTime();
        return Number.isFinite(ts) ? ts : 0;
    }
    if (typeof value === 'object') {
        if (typeof value._seconds === 'number') return value._seconds * 1000;
        if (typeof value.seconds === 'number') return value.seconds * 1000;
        if (typeof value.toDate === 'function') {
            const date = value.toDate();
            return date instanceof Date ? date.getTime() : 0;
        }
        if (value.$date !== undefined) return parseTimestamp(value.$date);
    }
    return 0;
}

function parseConfigValue(row, fallback) {
    if (!row) return fallback;
    const value = row.config_value !== undefined ? row.config_value : row.value;
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (_) {
            return fallback;
        }
    }
    return value;
}

async function getConfigByKeys(keys = []) {
    for (const key of keys) {
        const current = pickString(key);
        if (!current) continue;
        const res = await db.collection('configs')
            .where(_.or([{ config_key: current }, { key: current }]))
            .limit(20)
            .get()
            .catch(() => ({ data: [] }));
        if (res.data && res.data[0]) return res.data[0];
        const legacyRes = await db.collection('app_configs')
            .where(_.or([{ config_key: current }, { key: current }]))
            .limit(20)
            .get()
            .catch(() => ({ data: [] }));
        if (legacyRes.data && legacyRes.data[0]) return legacyRes.data[0];
    }
    return null;
}

async function loadDepositRewardConfig() {
    const row = await getConfigByKeys(['deposit_reward_config']);
    const raw = parseConfigValue(row, DEFAULT_DEPOSIT_REWARD_CONFIG) || {};
    return {
        coupon_product_value: Math.max(0, toNumber(raw.coupon_product_value, DEFAULT_DEPOSIT_REWARD_CONFIG.coupon_product_value)),
        title: pickString(raw.title || DEFAULT_DEPOSIT_REWARD_CONFIG.title),
        description: pickString(raw.description || DEFAULT_DEPOSIT_REWARD_CONFIG.description),
        allowed_product_ids: toArray(raw.allowed_product_ids).map((item) => pickString(item)).filter(Boolean),
        allowed_sku_ids: toArray(raw.allowed_sku_ids).map((item) => pickString(item)).filter(Boolean)
    };
}

function buildDepositExchangeMeta(config = {}) {
    const allowedProductIds = toArray(config.allowed_product_ids).map((item) => pickString(item)).filter(Boolean);
    const allowedSkuIds = toArray(config.allowed_sku_ids).map((item) => pickString(item)).filter(Boolean);
    return {
        bonus_level: 0,
        allowed_product_ids: allowedProductIds,
        allowed_sku_ids: allowedSkuIds,
        coupon_product_value: Math.max(0, toNumber(config.coupon_product_value, DEFAULT_DEPOSIT_REWARD_CONFIG.coupon_product_value)),
        unlock_reward: 0,
        title: pickString(config.title || DEFAULT_DEPOSIT_REWARD_CONFIG.title),
        bind_status: allowedProductIds.length || allowedSkuIds.length ? 'ready' : 'pending_bind'
    };
}

function buildDepositCouponSnapshot(config = {}) {
    return {
        id: '',
        name: pickString(config.title || DEFAULT_DEPOSIT_REWARD_CONFIG.title),
        type: 'exchange',
        value: Math.max(0, toNumber(config.coupon_product_value, DEFAULT_DEPOSIT_REWARD_CONFIG.coupon_product_value)),
        min_purchase: 0,
        valid_days: 0,
        description: pickString(config.description || DEFAULT_DEPOSIT_REWARD_CONFIG.description),
        stock: 1,
        is_active: 1,
        scope: 'exchange',
        scope_ids: []
    };
}

function generateDepositNo() {
    return `${DEPOSIT_PREFIX}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function generateDepositRefundNo(depositNo) {
    return `${DEPOSIT_REFUND_PREFIX}-${pickString(depositNo).replace(/[^A-Za-z0-9_-]/g, '')}-${Date.now()}`;
}

function generateTicketId() {
    return crypto.randomBytes(10).toString('hex');
}

async function findUserByOpenid(openid) {
    const res = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function getLatestPendingDepositOrder(openid) {
    const res = await db.collection('deposit_orders')
        .where({ openid, status: 'pending_payment' })
        .limit(20)
        .get()
        .catch(() => ({ data: [] }));
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.sort((a, b) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at))[0] || null;
}

async function createDepositOrder(openid, user) {
    const depositNo = generateDepositNo();
    const rewardConfig = await loadDepositRewardConfig();
    const result = await db.collection('deposit_orders').add({
        data: {
            deposit_no: depositNo,
            openid,
            user_id: user?.id || user?._legacy_id || user?._id || openid,
            amount_paid: DEPOSIT_AMOUNT,
            refunded_total: 0,
            refundable_balance: DEPOSIT_AMOUNT,
            refund_count: 0,
            status: 'pending_payment',
            wx_out_trade_no: depositNo,
            wx_transaction_id: '',
            active_ticket_id: '',
            coupon_claim_state: 'unused',
            reward_config_snapshot: rewardConfig,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });
    return {
        _id: result._id,
        deposit_no: depositNo,
        openid,
        user_id: user?.id || user?._legacy_id || user?._id || openid,
        amount_paid: DEPOSIT_AMOUNT,
        refunded_total: 0,
        refundable_balance: DEPOSIT_AMOUNT,
        refund_count: 0,
        status: 'pending_payment',
        wx_out_trade_no: depositNo,
        wx_transaction_id: '',
        active_ticket_id: '',
        coupon_claim_state: 'unused',
        reward_config_snapshot: rewardConfig
    };
}

async function ensureDepositClaimTicket(order = {}) {
    const existingTicketId = pickString(order.active_ticket_id);
    if (existingTicketId) {
        const current = await db.collection('coupon_claim_tickets')
            .doc(existingTicketId)
            .get()
            .then((res) => res.data || null)
            .catch(() => null);
        if (current) return current;
    }

    const rewardConfig = order.reward_config_snapshot && typeof order.reward_config_snapshot === 'object'
        ? order.reward_config_snapshot
        : await loadDepositRewardConfig();
    const ticketId = generateTicketId();
    const exchangeMeta = buildDepositExchangeMeta(rewardConfig);
    const couponSnapshot = buildDepositCouponSnapshot(rewardConfig);

    await db.collection('coupon_claim_tickets').doc(ticketId).set({
        data: {
            ticket_id: ticketId,
            benefit_kind: 'exchange_coupon',
            coupon_template_id: null,
            coupon_snapshot: couponSnapshot,
            exchange_meta: exchangeMeta,
            source_type: 'deposit_order',
            source_id: pickString(order._id || order.id || ''),
            status: 'unused',
            claimed_by_openid: '',
            claimed_user_id: null,
            claimed_user_coupon_id: '',
            claimed_at: '',
            invalidated_reason: '',
            invalidated_at: '',
            created_by_admin_id: '',
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });

    try {
        await db.collection('deposit_orders').doc(String(order._id || order.id)).update({
            data: {
                active_ticket_id: ticketId,
                coupon_claim_state: 'unused',
                reward_config_snapshot: rewardConfig,
                updated_at: db.serverDate()
            }
        });
    } catch (err) {
        console.error('[payment-deposit] failed to update active_ticket_id on deposit order', String(order._id || order.id), err);
    }

    return {
        _id: ticketId,
        ticket_id: ticketId,
        benefit_kind: 'exchange_coupon',
        coupon_snapshot: couponSnapshot,
        exchange_meta: exchangeMeta,
        source_type: 'deposit_order',
        source_id: pickString(order._id || order.id || ''),
        status: 'unused'
    };
}

function normalizeDepositOrderStatusAfterRefund(order = {}, nextRefundedTotal = 0) {
    const nextRefunded = roundMoney(nextRefundedTotal);
    if (nextRefunded >= roundMoney(toNumber(order.amount_paid, DEPOSIT_AMOUNT))) return 'refunded';
    if (nextRefunded > 0) return 'partially_refunded';
    return order.coupon_claim_state === 'invalidated_by_refund' ? 'refund_locked' : 'paid';
}

async function prepareDepositPay(openid, params = {}) {
    const user = await findUserByOpenid(openid);
    let order = null;
    const requestedId = pickString(params.deposit_order_id || params.id);
    if (requestedId) {
        const requestedOrder = await db.collection('deposit_orders')
            .doc(requestedId)
            .get()
            .then((res) => res.data || null)
            .catch(() => null);
        if (requestedOrder && requestedOrder.openid === openid && pickString(requestedOrder.status) === 'pending_payment') {
            order = requestedOrder;
        }
    }
    if (!order) {
        order = await getLatestPendingDepositOrder(openid);
    }
    if (!order) {
        order = await createDepositOrder(openid, user);
    }

    const privateKey = await loadPrivateKey(cloud);
    const wxResult = await jsapiOrder(openid, order.deposit_no, DEPOSIT_AMOUNT_FEN, '押金支付', privateKey);
    if (!wxResult.prepay_id) {
        throw new Error('微信支付下单失败: 未返回 prepay_id');
    }

    const payParams = buildMiniPayParams(wxResult.prepay_id, privateKey);
    try {
        await db.collection('deposit_orders').doc(String(order._id)).update({
            data: {
                prepay_id: wxResult.prepay_id,
                pay_params: payParams,
                updated_at: db.serverDate()
            }
        });
    } catch (err) {
        console.error('[payment-deposit] failed to update prepay_id on deposit order', String(order._id), err);
    }

    return {
        deposit_order_id: order._id,
        deposit_no: order.deposit_no,
        pay_amount: DEPOSIT_AMOUNT,
        ...payParams
    };
}

async function handleDepositPaidCallback(transaction = {}) {
    const outTradeNo = pickString(transaction.out_trade_no);
    if (!outTradeNo || !outTradeNo.startsWith(`${DEPOSIT_PREFIX}-`)) {
        return { handled: false };
    }

    const orderRes = await db.collection('deposit_orders')
        .where({ deposit_no: outTradeNo })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const order = orderRes.data && orderRes.data[0] ? orderRes.data[0] : null;
    if (!order) {
        return { handled: true, code: 'SUCCESS', message: 'Deposit order not found' };
    }

    const paidFen = toNumber(transaction.amount?.payer_total ?? transaction.amount?.total, NaN);
    if (!Number.isFinite(paidFen) || paidFen !== DEPOSIT_AMOUNT_FEN) {
        return { handled: true, code: 'FAIL', message: 'Deposit amount mismatch' };
    }

    const paidStatuses = ['paid', 'refund_locked', 'partially_refunded', 'refunded'];
    if (paidStatuses.includes(pickString(order.status))) {
        await ensureDepositClaimTicket(order).catch(() => null);
        return { handled: true, code: 'SUCCESS', message: 'Deposit already processed' };
    }

    if (pickString(order.status) !== 'pending_payment') {
        return { handled: true, code: 'FAIL', message: 'Invalid deposit order status' };
    }

    const ticket = await ensureDepositClaimTicket(order);
    const updateRes = await db.collection('deposit_orders')
        .where({ _id: order._id, status: 'pending_payment' })
        .update({
            data: {
                status: 'paid',
                wx_out_trade_no: outTradeNo,
                wx_transaction_id: pickString(transaction.transaction_id),
                paid_at: db.serverDate(),
                pay_time: transaction.success_time ? new Date(transaction.success_time) : db.serverDate(),
                active_ticket_id: pickString(ticket.ticket_id || ticket._id),
                coupon_claim_state: 'unused',
                updated_at: db.serverDate()
            }
        })
        .catch(() => ({ stats: { updated: 0 } }));

    if (updateRes.stats && updateRes.stats.updated === 0) {
        return { handled: true, code: 'SUCCESS', message: 'Deposit already processed' };
    }

    return { handled: true, code: 'SUCCESS', message: 'Deposit processed' };
}

async function handleDepositRefundCallback(refundData = {}, eventType = '') {
    const refundNo = pickString(refundData.out_refund_no);
    if (!refundNo || !refundNo.startsWith(`${DEPOSIT_REFUND_PREFIX}-`)) {
        return { handled: false };
    }

    const refundStatus = pickString(refundData.refund_status).toUpperCase();
    const refundRes = await db.collection('deposit_refunds')
        .where({ refund_no: refundNo })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const refund = refundRes.data && refundRes.data[0] ? refundRes.data[0] : null;
    if (!refund) {
        return { handled: true, code: 'SUCCESS', message: 'Deposit refund record not found' };
    }

    if (['completed', 'failed'].includes(pickString(refund.status))) {
        return { handled: true, code: 'SUCCESS', message: 'Deposit refund already settled' };
    }

    const orderRes = await db.collection('deposit_orders')
        .doc(String(refund.deposit_order_id))
        .get()
        .catch(() => ({ data: null }));
    const order = orderRes.data || null;

    if (refundStatus === 'SUCCESS' && order) {
        const nextRefundedTotal = roundMoney(toNumber(order.refunded_total, 0) + toNumber(refund.refund_amount, 0));
        const nextRefundableBalance = roundMoney(Math.max(0, toNumber(order.amount_paid, DEPOSIT_AMOUNT) - nextRefundedTotal));
        try {
            const completedUpdate = await db.collection('deposit_refunds')
                .where({ _id: String(refund._id), status: _.in(['processing', 'pending']) })
                .update({
                    data: {
                        status: 'completed',
                        wx_refund_id: pickString(refundData.refund_id || refund.wx_refund_id),
                        wx_refund_status: refundStatus,
                        completed_at: db.serverDate(),
                        updated_at: db.serverDate(),
                        failed_reason: _.remove()
                    }
                });
            if (!completedUpdate || !completedUpdate.stats || completedUpdate.stats.updated === 0) {
                console.warn('[payment-deposit] deposit refund not in processable state, skipping depositId=%s', refund._id);
                return { handled: true, code: 'SUCCESS', message: 'Deposit refund already processed' };
            }
        } catch (err) {
            console.error('[payment-deposit] ⚠️ failed to mark refund completed', String(refund._id), refundNo, err);
            try { await db.collection('rollback_error_logs').add({ data: { collection: 'deposit_refunds', doc_id: String(refund._id), operation: 'update_status_completed', error: err?.message || String(err), refund_no: refundNo, created_at: db.serverDate() } }); } catch (_) {}
        }
        try {
            await db.collection('deposit_orders').doc(String(order._id)).update({
                data: {
                    refunded_total: nextRefundedTotal,
                    refundable_balance: nextRefundableBalance,
                    refund_count: _.inc(1),
                    status: normalizeDepositOrderStatusAfterRefund(order, nextRefundedTotal),
                    coupon_claim_state: order.coupon_claim_state || 'invalidated_by_refund',
                    updated_at: db.serverDate()
                }
            });
        } catch (err) {
            console.error('[payment-deposit] ⚠️ failed to update deposit order balance after refund', String(order._id), err);
            try { await db.collection('rollback_error_logs').add({ data: { collection: 'deposit_orders', doc_id: String(order._id), operation: 'update_balance_after_refund', error: err?.message || String(err), deposit_no: order.deposit_no, created_at: db.serverDate() } }); } catch (_) {}
        }
        return { handled: true, code: 'SUCCESS', message: `Deposit refund settled: ${eventType || refundStatus}` };
    }

    if (['ABNORMAL', 'CLOSED'].includes(refundStatus)) {
        try {
            await db.collection('deposit_refunds')
                .where({ _id: String(refund._id), status: _.in(['processing', 'pending']) })
                .update({
                    data: {
                        status: 'failed',
                        wx_refund_id: pickString(refundData.refund_id || refund.wx_refund_id),
                        wx_refund_status: refundStatus,
                        failed_reason: pickString(refundData.user_received_account || refundData.reason || refundStatus),
                        updated_at: db.serverDate()
                    }
                });
        } catch (err) {
            console.error('[payment-deposit] ⚠️ failed to mark refund failed', String(refund._id), refundNo, err);
        }
        if (order) {
            try {
                await db.collection('deposit_orders').doc(String(order._id)).update({
                    data: {
                        status: normalizeDepositOrderStatusAfterRefund(order, toNumber(order.refunded_total, 0)),
                        updated_at: db.serverDate()
                    }
                });
            } catch (err) {
                console.error('[payment-deposit] ⚠️ failed to update deposit order status after refund failure', String(order._id), err);
            }
        }
        return { handled: true, code: 'SUCCESS', message: `Deposit refund marked failed: ${eventType || refundStatus}` };
    }

    try {
        await db.collection('deposit_refunds').doc(String(refund._id)).update({
            data: {
                status: 'processing',
                wx_refund_id: pickString(refundData.refund_id || refund.wx_refund_id),
                wx_refund_status: refundStatus || pickString(refund.wx_refund_status || 'PROCESSING'),
                updated_at: db.serverDate()
            }
        });
    } catch (err) {
        console.error('[payment-deposit] ⚠️ failed to update refund processing status', String(refund._id), refundNo, err);
    }

    return { handled: true, code: 'SUCCESS', message: 'Deposit refund still processing' };
}

module.exports = {
    DEPOSIT_AMOUNT,
    DEPOSIT_AMOUNT_FEN,
    DEFAULT_DEPOSIT_REWARD_CONFIG,
    buildDepositCouponSnapshot,
    buildDepositExchangeMeta,
    ensureDepositClaimTicket,
    generateDepositRefundNo,
    handleDepositPaidCallback,
    handleDepositRefundCallback,
    loadDepositRewardConfig,
    prepareDepositPay
};
