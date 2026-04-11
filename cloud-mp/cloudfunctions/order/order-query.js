'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
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

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function normalizeImages(images) {
    if (!images) return [];
    if (Array.isArray(images)) return images.filter(Boolean);
    if (typeof images === 'string') {
        try {
            const parsed = JSON.parse(images);
            if (Array.isArray(parsed)) return parsed.filter(Boolean);
            if (parsed) return [parsed];
        } catch (_) {
            return [images].filter(Boolean);
        }
    }
    return [];
}

function firstFilled(...values) {
    for (const value of values) {
        if (hasValue(value)) return value;
    }
    return '';
}

function buildSkuSpecValue(sku = {}) {
    if (!sku || typeof sku !== 'object') return '';
    if (hasValue(sku.spec_value)) return sku.spec_value;
    if (hasValue(sku.spec)) return sku.spec;
    if (Array.isArray(sku.specs)) {
        return sku.specs
            .map((item) => {
                if (!item || typeof item !== 'object') return '';
                return firstFilled(item.value, item.spec_value, item.name);
            })
            .filter(Boolean)
            .join(' / ');
    }
    return '';
}

function parseLogisticsFromRemark(remark) {
    if (!hasValue(remark)) return { company: '', trackingNo: '' };
    const text = String(remark);
    const match = text.match(/物流[:：]\s*([^\s\[\|]+)\s*([A-Za-z0-9-]+)/);
    if (!match) return { company: '', trackingNo: '' };
    return {
        company: match[1] || '',
        trackingNo: match[2] || ''
    };
}

async function findCollectionDocByAnyId(collectionName, rawId, cache) {
    if (!hasValue(rawId)) return null;

    const key = `${collectionName}:${String(rawId)}`;
    if (cache.has(key)) {
        return cache.get(key);
    }

    const loader = (async () => {
        const id = String(rawId);
        const byDocId = await db.collection(collectionName).doc(id).get().catch(() => ({ data: null }));
        if (byDocId.data) return byDocId.data;

        const numericId = Number(id);
        const candidates = [id];
        if (Number.isFinite(numericId)) {
            candidates.push(numericId);
        }

        const res = await db.collection(collectionName)
            .where(_.or([
                { id: _.in(candidates) },
                { _legacy_id: _.in(candidates) }
            ]))
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));

        return res.data && res.data[0] ? res.data[0] : null;
    })();

    cache.set(key, loader);
    return loader;
}

async function formatOrderForClient(order = {}, cache = new Map()) {
    const item = firstOrderItem(order);
    const [productDoc, skuDoc] = await Promise.all([
        findCollectionDocByAnyId('products', order.product_id || item.product_id, cache),
        findCollectionDocByAnyId('skus', item.sku_id || order.sku_id, cache)
    ]);

    const quantity = toNumber(order.quantity || order.qty || item.qty || item.quantity, 1);
    const rawStatus = order.status || '';
    const status = normalizeStatusForClient(rawStatus);
    const unitPrice = item.price != null
        ? item.price
        : (item.unit_price != null ? item.unit_price : (order.price || order.unit_price || order.total_amount || order.pay_amount));
    const totalAmount = order.total_amount != null ? order.total_amount : (order.pay_amount || order.actual_price || 0);
    const payAmount = order.pay_amount != null ? order.pay_amount : totalAmount;
    const productImages = normalizeImages(firstFilled(order.product?.images, productDoc?.images, productDoc?.image, productDoc?.cover));
    const image = firstFilled(
        item.image,
        item.snapshot_image,
        order.product?.image,
        order.product?.cover,
        skuDoc?.image,
        productImages[0]
    );
    const productName = firstFilled(
        item.name,
        item.snapshot_name,
        order.product?.name,
        order.product_name,
        productDoc?.name,
        productDoc?.title,
        '商品'
    );
    const specValue = firstFilled(
        order.sku?.spec_value,
        item.spec,
        item.snapshot_spec,
        buildSkuSpecValue(skuDoc)
    );
    const productId = firstFilled(
        order.product_id,
        item.product_id,
        order.product?.id,
        order.product?._id,
        productDoc?._id,
        productDoc?.id
    );
    const parsedLogistics = parseLogisticsFromRemark(order.remark);
    const logisticsCompany = firstFilled(
        order.logistics_company,
        order.shipping_company,
        parsedLogistics.company
    );
    const trackingNo = firstFilled(
        order.tracking_no,
        parsedLogistics.trackingNo
    );
    const orderProduct = order.product && typeof order.product === 'object' ? order.product : {};
    const orderProductImages = normalizeImages(orderProduct.images);
    const mergedProduct = {
        ...orderProduct,
        id: firstFilled(orderProduct.id, orderProduct._id, productId),
        _id: firstFilled(orderProduct._id, productDoc?._id),
        name: firstFilled(orderProduct.name, productName),
        images: orderProductImages.length > 0 ? orderProductImages : (productImages.length > 0 ? productImages : (image ? [image] : [])),
        image: firstFilled(orderProduct.image, orderProduct.cover, image)
    };
    const orderSku = order.sku && typeof order.sku === 'object' ? order.sku : null;

    return {
        ...order,
        id: order._id || order.id,
        raw_status: rawStatus,
        status,
        quantity,
        product_id: productId,
        sku: orderSku ? { ...orderSku, spec_value: firstFilled(orderSku.spec_value, specValue) } : (specValue ? { spec_value: specValue } : null),
        address: order.address || order.address_snapshot || null,
        tracking_no: trackingNo,
        logistics_company: logisticsCompany,
        shipping_company: firstFilled(order.shipping_company, logisticsCompany),
        product: mergedProduct,
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
        const cache = new Map();
        return {
            list: await Promise.all(sorted.slice(offset, offset + limit).map((order) => formatOrderForClient(order, cache))),
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
    return order ? formatOrderForClient(order, new Map()) : null;
}

module.exports = {
    queryOrders,
    getOrderDetail,
    getOrderByIdOrNo
};
