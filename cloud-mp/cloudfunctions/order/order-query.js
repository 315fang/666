'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const { getAllRecords } = require('./shared/utils');

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeStatusForQuery(status) {
    if (status === 'pending') return 'pending_payment';
    return status || null;
}

function normalizeStatusForClient(status) {
    if (status === 'pending_payment') return 'pending';
    return status || '';
}

function displayAmount(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0.00';
    const normalized = Number.isInteger(num) && Math.abs(num) >= 1000 ? num / 100 : num;
    return normalized.toFixed(2);
}

async function getOrderByIdOrNo(openid, orderId) {
    if (orderId === null || orderId === undefined || orderId === '') return null;
    const id = String(orderId);
    const num = Number(id);
    const docRes = await db.collection('orders').doc(id).get().catch(() => ({ data: null }));
    if (docRes.data && docRes.data.openid === openid) return docRes.data;

    const orConditions = [{ order_no: id }];
    if (Number.isFinite(num)) {
        orConditions.push({ id: num });
        orConditions.push({ _legacy_id: num });
    }
    const where = db.command.or(orConditions);
    const res = await db.collection('orders')
        .where(where)
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const order = res.data && res.data[0];
    return order && order.openid === openid ? order : null;
}

function firstOrderItem(order = {}) {
    const items = Array.isArray(order.items) ? order.items : [];
    return items[0] || {};
}

function formatOrderForClient(order = {}) {
    const item = firstOrderItem(order);
    const quantity = toNumber(order.quantity || order.qty || item.qty || item.quantity, 1);
    const rawStatus = order.status || '';
    const status = normalizeStatusForClient(rawStatus);
    const unitPrice = item.price != null
        ? item.price
        : (item.unit_price != null ? item.unit_price : (order.price || order.unit_price || order.total_amount || order.pay_amount));
    const totalAmount = order.total_amount != null ? order.total_amount : (order.pay_amount || order.actual_price || 0);
    const payAmount = order.pay_amount != null ? order.pay_amount : totalAmount;
    const image = item.image || item.snapshot_image || order.product?.image || order.product?.cover || '';
    const productName = item.name || item.snapshot_name || order.product?.name || order.product_name || '商品';

    return {
        ...order,
        id: order._id || order.id,
        raw_status: rawStatus,
        status,
        quantity,
        product_id: order.product_id || item.product_id || order.product?.id || order.product?._id || '',
        sku: order.sku || (item.spec || item.snapshot_spec ? { spec_value: item.spec || item.snapshot_spec } : null),
        product: order.product || {
            id: item.product_id || '',
            name: productName,
            images: image ? [image] : [],
            image
        },
        price: displayAmount(unitPrice),
        total_amount: displayAmount(totalAmount),
        pay_amount: displayAmount(payAmount),
        actual_price: displayAmount(order.actual_price != null ? order.actual_price : payAmount)
    };
}

/**
 * 查询用户订单（分页获取，突破 100 条限制）
 */
async function queryOrders(openid, params = {}) {
    try {
        const status = normalizeStatusForQuery(params.status);
        const page = Math.max(1, toNumber(params.page, 1));
        const limit = Math.max(1, Math.min(100, toNumber(params.limit || params.pageSize || params.size, 20)));
        const where = { openid };
        if (status) where.status = status;
        const allOrders = await getAllRecords(db, 'orders', where);
        const sorted = allOrders.sort((a, b) => {
            const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
            return tb - ta;
        });
        const offset = (page - 1) * limit;
        return {
            list: sorted.slice(offset, offset + limit).map(formatOrderForClient),
            pagination: {
                total: sorted.length,
                page,
                limit,
                has_more: offset + limit < sorted.length
            }
        };
    } catch (err) {
        console.error('[order-query] queryOrders 失败:', err.message);
        return { list: [], pagination: { total: 0, page: 1, limit: 20, has_more: false } };
    }
}

/**
 * 获取订单详情
 */
async function getOrderDetail(openid, orderId) {
    const order = await getOrderByIdOrNo(openid, orderId);
    return order ? formatOrderForClient(order) : null;
}

module.exports = {
    queryOrders,
    getOrderDetail,
    getOrderByIdOrNo
};
