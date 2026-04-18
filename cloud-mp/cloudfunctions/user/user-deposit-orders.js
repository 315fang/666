'use strict';

const db = require('wx-server-sdk').database();
const { getAllRecords } = require('./shared/utils');

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
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

function buildClaimPath(ticketId) {
    return `/pages/coupon/claim?ticket=${encodeURIComponent(pickString(ticketId))}`;
}

async function loadTicketMap(ticketIds = []) {
    const ids = [...new Set(ticketIds.map((item) => pickString(item)).filter(Boolean))];
    const pairs = await Promise.all(ids.map(async (ticketId) => {
        const row = await db.collection('coupon_claim_tickets')
            .doc(ticketId)
            .get()
            .then((res) => res.data || null)
            .catch(() => null);
        return [ticketId, row];
    }));
    return new Map(pairs);
}

function buildDepositOrderView(order = {}, ticket = null) {
    const ticketStatus = pickString(ticket?.status || order.coupon_claim_state || 'unused');
    return {
        ...order,
        id: order._id || order.id || order.deposit_no,
        amount_paid: toNumber(order.amount_paid, 0),
        refunded_total: toNumber(order.refunded_total, 0),
        refundable_balance: toNumber(order.refundable_balance, 0),
        refund_count: Math.max(0, toNumber(order.refund_count, 0)),
        active_ticket: ticket ? {
            ticket_id: pickString(ticket.ticket_id || ticket._id),
            status: ticketStatus,
            claim_path: buildClaimPath(ticket.ticket_id || ticket._id)
        } : null,
        coupon_claim_state: pickString(order.coupon_claim_state || ticketStatus),
        can_pay: pickString(order.status) === 'pending_payment',
        can_share_ticket: !!ticket && ticketStatus === 'unused'
    };
}

async function listDepositOrders(openid) {
    const rows = await getAllRecords(db, 'deposit_orders', { openid }).catch(() => []);
    const ordered = rows.slice().sort((a, b) => parseTimestamp(b.updated_at || b.created_at || b.paid_at) - parseTimestamp(a.updated_at || a.created_at || a.paid_at));
    const ticketMap = await loadTicketMap(ordered.map((row) => row.active_ticket_id));
    return ordered.map((row) => buildDepositOrderView(row, ticketMap.get(pickString(row.active_ticket_id)) || null));
}

module.exports = {
    listDepositOrders
};
