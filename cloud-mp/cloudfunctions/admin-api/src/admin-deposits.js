'use strict';

const {
    generateClaimTicketWxacode,
    normalizeClaimTicket
} = require('./claim-ticket-wxacode');

const DEFAULT_DEPOSIT_REWARD_CONFIG = {
    coupon_product_value: 100,
    title: '押金兑换券',
    description: '支付押金后可领取并分享的兑换券',
    allowed_product_ids: [],
    allowed_sku_ids: []
};

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

function sortByRecent(rows = []) {
    return rows.slice().sort((a, b) => {
        const timeDiff = parseTimestamp(b.updated_at || b.created_at || b.paid_at) - parseTimestamp(a.updated_at || a.created_at || a.paid_at);
        if (timeDiff !== 0) return timeDiff;
        return String(b._id || b.deposit_no || '').localeCompare(String(a._id || a.deposit_no || ''));
    });
}

function pickConfigRow(rows = [], key = '') {
    const normalized = String(key || '').trim();
    if (!normalized) return null;
    const source = Array.isArray(rows) ? rows : [];
    return sortByRecent(source.filter((row) => {
        return String(row?.config_key || row?.key || row?._id || '').trim() === normalized;
    }))[0] || null;
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

function loadDepositRewardConfig(getCollection, pickString, toNumber, toArray) {
    const rows = []
        .concat(getCollection('configs') || [])
        .concat(getCollection('app_configs') || []);
    const row = pickConfigRow(rows, 'deposit_reward_config');
    const raw = parseConfigValue(row, DEFAULT_DEPOSIT_REWARD_CONFIG) || {};
    return {
        coupon_product_value: Math.max(0, toNumber(raw.coupon_product_value, DEFAULT_DEPOSIT_REWARD_CONFIG.coupon_product_value)),
        title: pickString(raw.title || DEFAULT_DEPOSIT_REWARD_CONFIG.title),
        description: pickString(raw.description || DEFAULT_DEPOSIT_REWARD_CONFIG.description),
        allowed_product_ids: toArray(raw.allowed_product_ids).map((item) => pickString(item)).filter(Boolean),
        allowed_sku_ids: toArray(raw.allowed_sku_ids).map((item) => pickString(item)).filter(Boolean)
    };
}

function buildDepositOrderView(order = {}, tickets = [], refunds = []) {
    const activeTicket = tickets.find((ticket) => String(ticket.ticket_id || ticket._id || '') === String(order.active_ticket_id || '')) || null;
    const orderRefunds = refunds
        .filter((refund) => String(refund.deposit_order_id || '') === String(order._id || order.id || ''))
        .sort((a, b) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at));

    return {
        ...order,
        id: order._id || order.id || order.deposit_no,
        amount_paid: Number(order.amount_paid || 0),
        refunded_total: Number(order.refunded_total || 0),
        refundable_balance: Number(order.refundable_balance || 0),
        refund_count: Number(order.refund_count || 0),
        active_ticket: activeTicket ? normalizeClaimTicket(activeTicket) : null,
        refunds: orderRefunds.map((refund) => ({
            ...refund,
            id: refund._id || refund.id || refund.refund_no,
            refund_amount: Number(refund.refund_amount || 0)
        }))
    };
}

function resolvePostFailureStatus(order = {}) {
    const refundedTotal = Number(order.refunded_total || 0);
    if (refundedTotal > 0) return 'partially_refunded';
    return order.coupon_claim_state === 'invalidated_by_refund' ? 'refund_locked' : 'paid';
}

function registerDepositRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        ensureFreshCollections = async () => {},
        getCollection,
        saveCollection,
        nextId,
        nowIso,
        toNumber,
        toArray,
        pickString,
        findByLookup,
        paginate,
        createAuditLog,
        ok,
        fail,
        flush = async () => {},
        createWechatRefund
    } = deps;

    app.get('/admin/api/deposit-orders', auth, requirePermission('refunds'), async (req, res) => {
        await ensureFreshCollections(['deposit_orders', 'coupon_claim_tickets', 'deposit_refunds']);
        const keyword = pickString(req.query.keyword).trim().toLowerCase();
        const status = pickString(req.query.status).trim();
        let rows = sortByRecent(getCollection('deposit_orders') || []);
        if (keyword) {
            rows = rows.filter((row) => {
                return [
                    row.deposit_no,
                    row.openid,
                    row.user_id,
                    row.wx_transaction_id
                ].filter(Boolean).join(' ').toLowerCase().includes(keyword);
            });
        }
        if (status) {
            rows = rows.filter((row) => pickString(row.status) === status);
        }
        const tickets = getCollection('coupon_claim_tickets') || [];
        const refunds = getCollection('deposit_refunds') || [];
        ok(res, paginate(rows.map((row) => buildDepositOrderView(row, tickets, refunds)), req));
    });

    app.get('/admin/api/deposit-orders/:id', auth, requirePermission('refunds'), async (req, res) => {
        await ensureFreshCollections(['deposit_orders', 'coupon_claim_tickets', 'deposit_refunds']);
        const rows = getCollection('deposit_orders') || [];
        const order = findByLookup(rows, req.params.id, (row) => [row.deposit_no, row.openid]);
        if (!order) return fail(res, '押金订单不存在', 404);

        const tickets = getCollection('coupon_claim_tickets') || [];
        const refunds = getCollection('deposit_refunds') || [];
        const payload = buildDepositOrderView(order, tickets, refunds);
        const activeTicket = payload.active_ticket;

        if (activeTicket && activeTicket.status === 'unused') {
            const wxacode = await generateClaimTicketWxacode({
                ticketId: activeTicket.ticket_id,
                envVersion: req.query.env || req.query.env_version || 'release'
            });
            payload.ticket_wxacode = wxacode;
        } else {
            payload.ticket_wxacode = null;
        }

        payload.deposit_reward_config = loadDepositRewardConfig(getCollection, pickString, toNumber, toArray);
        ok(res, payload);
    });

    app.post('/admin/api/deposit-orders/:id/refunds', auth, requirePermission('refunds'), async (req, res) => {
        const amount = toNumber(req.body?.amount, NaN);
        if (![10, 20, 30].includes(amount)) {
            return fail(res, '退款金额仅支持 10 / 20 / 30 元', 400);
        }

        await ensureFreshCollections(['deposit_orders', 'deposit_refunds', 'coupon_claim_tickets']);
        const orders = getCollection('deposit_orders') || [];
        const refunds = getCollection('deposit_refunds') || [];
        const tickets = getCollection('coupon_claim_tickets') || [];
        const order = findByLookup(orders, req.params.id, (row) => [row.deposit_no, row.openid]);
        if (!order) return fail(res, '押金订单不存在', 404);
        if (!['paid', 'refund_locked', 'partially_refunded'].includes(pickString(order.status))) {
            return fail(res, `当前状态不允许退款: ${order.status}`, 400);
        }

        const paidAt = parseTimestamp(order.paid_at || order.created_at);
        if (!paidAt || (Date.now() - paidAt) > 365 * 24 * 60 * 60 * 1000) {
            return fail(res, '押金订单已超过 365 天退款时限', 400);
        }

        const refundableBalance = Math.max(0, toNumber(order.refundable_balance, 0));
        if (amount > refundableBalance) {
            return fail(res, `退款金额(${amount})不能超过剩余可退金额(${refundableBalance})`, 400);
        }

        const processingRefund = refunds.find((row) => {
            return String(row.deposit_order_id || '') === String(order._id || order.id || '')
                && pickString(row.status) === 'processing';
        });
        if (processingRefund) {
            return fail(res, '当前存在处理中退款，请等待微信结果后再重试', 400);
        }

        const activeTicketIndex = tickets.findIndex((row) => String(row.ticket_id || row._id || '') === String(order.active_ticket_id || ''));
        const activeTicket = activeTicketIndex >= 0 ? tickets[activeTicketIndex] : null;
        const claimState = pickString(order.coupon_claim_state || '').trim() || pickString(activeTicket?.status || 'unused');
        if (claimState === 'claimed' || pickString(activeTicket?.status) === 'claimed') {
            return fail(res, '权益已领取，不允许退押金', 400);
        }

        const orderIndex = orders.findIndex((row) => String(row._id || row.id || row.deposit_no) === String(order._id || order.id || order.deposit_no));
        const refundNo = `DEPRF-${pickString(order.deposit_no || order._id || req.params.id)}-${Date.now()}`;
        const nextOrder = {
            ...order,
            status: 'refund_locked',
            coupon_claim_state: 'invalidated_by_refund',
            updated_at: nowIso()
        };
        if (activeTicketIndex >= 0 && pickString(activeTicket.status) === 'unused') {
            tickets[activeTicketIndex] = {
                ...activeTicket,
                status: 'invalidated',
                invalidated_reason: 'deposit_refund',
                invalidated_at: nowIso(),
                updated_at: nowIso()
            };
        }
        if (orderIndex >= 0) {
            orders[orderIndex] = nextOrder;
        }

        const refundRow = {
            id: nextId(refunds),
            deposit_order_id: order._id || order.id || order.deposit_no,
            deposit_no: pickString(order.deposit_no),
            refund_no: refundNo,
            refund_amount: amount,
            status: 'processing',
            wx_refund_id: '',
            wx_refund_status: 'PROCESSING',
            requested_by_admin_id: req.admin?.id || '',
            requested_by_admin_name: pickString(req.admin?.username),
            failed_reason: '',
            created_at: nowIso(),
            updated_at: nowIso()
        };
        refunds.push(refundRow);

        saveCollection('coupon_claim_tickets', tickets);
        saveCollection('deposit_orders', orders);
        saveCollection('deposit_refunds', refunds);
        await flush();

        try {
            const wxResult = await createWechatRefund({
                orderNo: pickString(order.deposit_no),
                refundNo,
                totalFee: Math.round(toNumber(order.amount_paid, 0) * 100),
                refundFee: Math.round(amount * 100),
                reason: `押金退款 ${amount} 元`
            });
            const wxStatus = pickString(wxResult.status || 'PROCESSING').toUpperCase();
            const updatedRefunds = getCollection('deposit_refunds') || [];
            const updatedIndex = updatedRefunds.findIndex((row) => pickString(row.refund_no) === refundNo);
            if (updatedIndex >= 0) {
                updatedRefunds[updatedIndex] = {
                    ...updatedRefunds[updatedIndex],
                    wx_refund_id: pickString(wxResult.refund_id),
                    wx_refund_status: wxStatus || 'PROCESSING',
                    updated_at: nowIso()
                };
                saveCollection('deposit_refunds', updatedRefunds);
                await flush();
            }
            createAuditLog(req.admin, 'deposit.refund.create', 'deposit_orders', {
                deposit_order_id: order._id || order.id || '',
                deposit_no: order.deposit_no,
                refund_no: refundNo,
                amount
            });
            ok(res, {
                success: true,
                refund_no: refundNo,
                status: 'processing',
                wechat_status: wxStatus || 'PROCESSING'
            });
        } catch (error) {
            const failedRefunds = getCollection('deposit_refunds') || [];
            const failedRefundIndex = failedRefunds.findIndex((row) => pickString(row.refund_no) === refundNo);
            if (failedRefundIndex >= 0) {
                failedRefunds[failedRefundIndex] = {
                    ...failedRefunds[failedRefundIndex],
                    status: 'failed',
                    failed_reason: error?.message || 'refund_request_failed',
                    updated_at: nowIso()
                };
                saveCollection('deposit_refunds', failedRefunds);
            }
            const failedOrders = getCollection('deposit_orders') || [];
            const failedOrderIndex = failedOrders.findIndex((row) => String(row._id || row.id || row.deposit_no) === String(order._id || order.id || order.deposit_no));
            if (failedOrderIndex >= 0) {
                failedOrders[failedOrderIndex] = {
                    ...failedOrders[failedOrderIndex],
                    status: resolvePostFailureStatus(nextOrder),
                    updated_at: nowIso()
                };
                saveCollection('deposit_orders', failedOrders);
            }
            await flush();
            return fail(res, error?.message || '押金退款发起失败', 500);
        }
    });
}

module.exports = {
    DEFAULT_DEPOSIT_REWARD_CONFIG,
    buildDepositOrderView,
    loadDepositRewardConfig,
    registerDepositRoutes
};
