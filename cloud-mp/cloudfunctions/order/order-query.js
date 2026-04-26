'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { getAllRecords } = require('./shared/utils');
const {
    normalizeOrderStatusGroup,
    normalizeOrderStatusForClient,
    getOrderStatusText,
    getOrderStatusDesc,
    getRefundStatusText,
    getRefundStatusDesc,
    getPaymentMethodText,
    getRefundTargetText,
    resolveOrderPaymentMethod,
    resolveOrderPayAmount,
    resolveOrderTotalAmount,
    resolveRefundAmount,
    resolveRefundChannel
} = require('./order-contract');
const {
    collectReviewLookupTokens,
    isOrderReviewed,
    isPendingReviewOrder
} = require('./order-review-state');

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeStatusForQuery(status) {
    if (status === 'pending') return 'pending_payment';
    return status || null;
}

function displayAmount(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0.00';
    return num.toFixed(2);
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).replace(/\s+/g, ' ').trim();
    return text || fallback;
}

function normalizeSpecDisplayText(rawSpec = '') {
    const text = pickString(rawSpec);
    if (!text) return '';
    if (/[·/、,，;；|]/.test(text)) {
        const seen = new Set();
        const parts = text
            .split(/\s*[·/、,，;；|]+\s*/)
            .map((item) => pickString(item))
            .filter((item) => {
                if (!item || seen.has(item)) return false;
                seen.add(item);
                return true;
            });
        if (parts.length > 0) return parts.join(' / ');
    }
    const tokens = text.split(/\s+/).filter(Boolean);
    for (let size = 1; size <= Math.floor(tokens.length / 2); size += 1) {
        if (tokens.length % size !== 0) continue;
        const pattern = tokens.slice(0, size).join(' ');
        let matched = true;
        for (let index = size; index < tokens.length; index += size) {
            if (tokens.slice(index, index + size).join(' ') !== pattern) {
                matched = false;
                break;
            }
        }
        if (matched) return pattern;
    }
    return text;
}

function getOrderTotalQuantity(order = {}) {
    const explicit = Math.max(0, toNumber(order.quantity, 0));
    if (explicit > 0) return explicit;
    return (Array.isArray(order.items) ? order.items : []).reduce((sum, item) => {
        return sum + Math.max(1, toNumber(item.qty || item.quantity, 1));
    }, 0);
}

function allocateProportionalAmounts(items = [], totalAmount = 0, field = 'item_amount') {
    const total = roundMoney(totalAmount);
    if (total <= 0 || !Array.isArray(items) || items.length === 0) return items.map(() => 0);
    const baseValues = items.map((item) => Math.max(0, roundMoney(item && item[field])));
    const baseTotal = roundMoney(baseValues.reduce((sum, value) => sum + value, 0));
    if (baseTotal <= 0) return items.map((_, index) => index === items.length - 1 ? total : 0);

    let allocatedSum = 0;
    return items.map((item, index) => {
        if (index === items.length - 1) return roundMoney(total - allocatedSum);
        const allocated = roundMoney(total * (baseValues[index] / baseTotal));
        allocatedSum = roundMoney(allocatedSum + allocated);
        return allocated;
    });
}

function buildOrderSettlementItems(order = {}) {
    const rawItems = Array.isArray(order.items) ? order.items : [];
    const hasSnapshot = rawItems.some((item) => item && item.refund_basis_version === 'snapshot_v1');
    const bundleAllocations = hasSnapshot
        ? rawItems.map((item) => roundMoney(item.bundle_discount_allocated_amount))
        : allocateProportionalAmounts(rawItems, toNumber(order.bundle_discount, 0), 'item_amount');
    const couponAllocations = hasSnapshot
        ? rawItems.map((item) => roundMoney(item.coupon_allocated_amount))
        : allocateProportionalAmounts(rawItems, toNumber(order.coupon_discount, 0), 'item_amount');
    const pointsAllocations = hasSnapshot
        ? rawItems.map((item) => roundMoney(item.points_allocated_amount))
        : allocateProportionalAmounts(rawItems, toNumber(order.points_discount, 0), 'item_amount');

    return rawItems.map((item, index) => {
        const quantity = Math.max(1, toNumber(item.qty || item.quantity, 1));
        const itemAmount = roundMoney(item.item_amount != null ? item.item_amount : item.subtotal);
        const originalLineAmount = roundMoney(item.original_line_amount != null ? item.original_line_amount : itemAmount);
        const bundleDiscountAllocatedAmount = roundMoney(bundleAllocations[index]);
        const couponAllocatedAmount = roundMoney(couponAllocations[index]);
        const pointsAllocatedAmount = roundMoney(pointsAllocations[index]);
        const cashPaidAllocatedAmount = roundMoney(
            item.cash_paid_allocated_amount != null
                ? item.cash_paid_allocated_amount
                : (itemAmount - bundleDiscountAllocatedAmount - couponAllocatedAmount - pointsAllocatedAmount)
        );
        const refundedQuantity = Math.max(0, Math.min(quantity, toNumber(item.refunded_quantity, 0)));
        const refundedCashAmount = roundMoney(Math.max(0, Math.min(cashPaidAllocatedAmount, toNumber(item.refunded_cash_amount, 0))));
        const refundableQuantity = Math.max(0, quantity - refundedQuantity);
        const refundableCashAmount = roundMoney(Math.max(0, cashPaidAllocatedAmount - refundedCashAmount));
        return {
            ...item,
            refund_item_key: item.refund_item_key || `${item.product_id || 'product'}::${item.sku_id || 'nosku'}::${index}`,
            quantity,
            qty: quantity,
            item_amount: itemAmount,
            original_line_amount: originalLineAmount,
            bundle_discount_allocated_amount: bundleDiscountAllocatedAmount,
            coupon_allocated_amount: couponAllocatedAmount,
            points_allocated_amount: pointsAllocatedAmount,
            cash_paid_allocated_amount: cashPaidAllocatedAmount,
            refunded_quantity: refundedQuantity,
            refunded_cash_amount: refundedCashAmount,
            refundable_quantity: refundableQuantity,
            refundable_cash_amount: refundableCashAmount,
            refund_basis_version: item.refund_basis_version || (hasSnapshot ? 'snapshot_v1' : 'legacy_estimated')
        };
    });
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

async function loadUserReviewLookup(openid, cache = new Map()) {
    const cacheKey = `user-review-lookup:${String(openid || '')}`;
    if (cache && cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const loader = (async () => {
        if (!hasValue(openid)) return new Set();
        const reviews = await getAllRecords(db, 'reviews', { openid }).catch(() => []);
        const reviewLookup = new Set();
        (reviews || []).forEach((review) => {
            collectReviewLookupTokens(review).forEach((token) => reviewLookup.add(token));
        });
        return reviewLookup;
    })();

    if (cache) cache.set(cacheKey, loader);
    return loader;
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

function appendImageCandidates(target, value) {
    if (!hasValue(value)) return;
    if (Array.isArray(value)) {
        value.forEach((item) => appendImageCandidates(target, item));
        return;
    }
    if (typeof value === 'string') {
        const text = value.trim();
        if (!text) return;
        if (text.startsWith('[')) {
            try {
                appendImageCandidates(target, JSON.parse(text));
                return;
            } catch (_) {}
        }
        target.push(text);
        return;
    }
    if (typeof value !== 'object') return;
    [
        value.display_image,
        value.displayImage,
        value.product_image,
        value.productImage,
        value.image_url,
        value.imageUrl,
        value.url,
        value.temp_url,
        value.image,
        value.snapshot_image,
        value.snapshotImage,
        value.cover_image,
        value.coverImage,
        value.cover,
        value.cover_url,
        value.coverUrl,
        value.file_id,
        value.fileId,
        value.image_ref,
        value.imageRef,
        value.thumb,
        value.thumbnail,
        value.images,
        value.preview_images,
        value.previewImages,
        value.image_candidates,
        value.imageCandidates,
        value.product,
        value.sku
    ].forEach((item) => appendImageCandidates(target, item));
}

function normalizeImageCandidates(...values) {
    const candidates = [];
    values.forEach((value) => appendImageCandidates(candidates, value));
    const seen = new Set();
    return candidates.filter((candidate) => {
        if (!candidate || seen.has(candidate)) return false;
        seen.add(candidate);
        return true;
    });
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

function getUserRoleLevel(user = {}) {
    return toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
}

function buildUserRelationSummary(user = {}) {
    if (!user || typeof user !== 'object') return null;
    return {
        id: user._id || user.id || '',
        openid: user.openid || '',
        nickname: user.nickName || user.nickname || '',
        avatar: user.avatarUrl || user.avatar || '',
        role_level: getUserRoleLevel(user)
    };
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

function toIsoString(value) {
    if (!hasValue(value)) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function addMinutes(value, minutes) {
    const iso = toIsoString(value);
    if (!iso) return '';
    const date = new Date(iso);
    date.setMinutes(date.getMinutes() + minutes);
    return date.toISOString();
}

function pickNormalizedExpireAt(explicitExpireAt, createdAt, timeoutMinutes, shouldFallback) {
    const fallbackExpireAt = shouldFallback ? addMinutes(createdAt, timeoutMinutes) : '';
    if (!explicitExpireAt) return fallbackExpireAt;
    if (!fallbackExpireAt) return explicitExpireAt;
    const explicitTs = new Date(explicitExpireAt).getTime();
    const fallbackTs = new Date(fallbackExpireAt).getTime();
    if (!Number.isFinite(explicitTs)) return fallbackExpireAt;
    if (!Number.isFinite(fallbackTs)) return explicitExpireAt;
    return explicitTs >= fallbackTs ? explicitExpireAt : fallbackExpireAt;
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

async function getDefaultOrderAutoCancelMinutes(cache) {
    const key = 'singleton:settings:auto_cancel_minutes';
    if (cache && cache.has(key)) return cache.get(key);
    const loader = (async () => {
        const singleton = await db.collection('admin_singletons')
            .doc('settings')
            .get()
            .catch(() => ({ data: null }));
        const settings = parseSingletonValue(singleton.data, {});
        const orderSettings = settings.ORDER && typeof settings.ORDER === 'object' ? settings.ORDER : {};
        return normalizeOrderAutoCancelMinutes(orderSettings.AUTO_CANCEL_MINUTES, 30);
    })();
    if (cache) cache.set(key, loader);
    return loader;
}

function addDays(value, days) {
    const iso = toIsoString(value);
    if (!iso) return '';
    const date = new Date(iso);
    date.setDate(date.getDate() + days);
    return date.toISOString();
}

async function findUserByAnyId(rawId, cache) {
    if (!hasValue(rawId)) return null;

    const key = `users:${String(rawId)}`;
    if (cache.has(key)) {
        return cache.get(key);
    }

    const loader = (async () => {
        const id = String(rawId);
        const byDocId = await db.collection('users').doc(id).get().catch(() => ({ data: null }));
        if (byDocId.data) return byDocId.data;

        const numericId = Number(id);
        const conditions = [{ openid: id }];
        if (Number.isFinite(numericId)) {
            conditions.push({ _legacy_id: numericId });
            conditions.push({ id: numericId });
        }

        const res = await db.collection('users')
            .where(_.or(conditions))
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));

        return res.data && res.data[0] ? res.data[0] : null;
    })();

    cache.set(key, loader);
    return loader;
}

async function findCommissionByOrder(order = {}, cache) {
    const orderKeys = [order._id, order.id, order.order_no].filter(hasValue);
    if (!orderKeys.length) return null;

    const key = `commissions:${orderKeys.join('|')}`;
    if (cache.has(key)) {
        return cache.get(key);
    }

    const loader = (async () => {
        const stringKeys = orderKeys.map((value) => String(value));
        const numericKeys = stringKeys.map((value) => Number(value)).filter((value) => Number.isFinite(value));
        const conditions = [
            { order_id: _.in(stringKeys) },
            { order_no: _.in(stringKeys) }
        ];
        if (numericKeys.length) {
            conditions.push({ order_id: _.in(numericKeys) });
            conditions.push({ order_no: _.in(numericKeys) });
        }

        const res = await db.collection('commissions')
            .where(_.or(conditions))
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));

        return res.data && res.data[0] ? res.data[0] : null;
    })();

    cache.set(key, loader);
    return loader;
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

async function formatOrderForClient(order = {}, cache = new Map(), defaultAutoCancelMinutes = 30) {
    const item = firstOrderItem(order);
    const [productDoc, skuDoc, buyerDoc, commissionDoc, pickupStation, directReferrerDoc, indirectReferrerDoc, nearestAgentDoc, fulfillmentPartnerDoc] = await Promise.all([
        findCollectionDocByAnyId('products', order.product_id || item.product_id, cache),
        findCollectionDocByAnyId('skus', item.sku_id || order.sku_id, cache),
        findUserByAnyId(order.openid, cache),
        findCommissionByOrder(order, cache),
        findCollectionDocByAnyId('stations', order.pickup_station_id, cache),
        findUserByAnyId(order.direct_referrer_openid || order.referrer_openid || '', cache),
        findUserByAnyId(order.indirect_referrer_openid || '', cache),
        findUserByAnyId(order.nearest_agent_openid || '', cache),
        findUserByAnyId(order.fulfillment_partner_openid || order.nearest_agent_openid || '', cache)
    ]);

    const quantity = toNumber(order.quantity || order.qty || item.qty || item.quantity, 1);
    const rawStatus = order.status || '';
    const status = normalizeOrderStatusForClient(rawStatus);
    const statusGroup = normalizeOrderStatusGroup(rawStatus);
    const refundFailed = rawStatus === 'refunding' && (
        hasValue(order.auto_refund_error)
        || hasValue(order.auto_refund_failed_at)
    );
    const statusText = refundFailed ? '退款失败' : getOrderStatusText(rawStatus);
    const statusDesc = refundFailed ? '系统退款未成功，请联系客服处理' : getOrderStatusDesc(rawStatus);
    const paymentMethod = resolveOrderPaymentMethod(order);
    const unitPrice = item.price != null
        ? item.price
        : (item.unit_price != null ? item.unit_price : (order.price || order.unit_price || order.total_amount || order.pay_amount));
    const totalAmount = resolveOrderTotalAmount(order, 0);
    const payAmount = resolveOrderPayAmount(order, totalAmount);
    const productImages = normalizeImageCandidates(
        order.product?.image_candidates,
        order.product?.images,
        order.product?.image,
        order.product?.cover,
        item.image_candidates,
        item.snapshot_image,
        item.image,
        skuDoc?.image,
        productDoc?.images,
        productDoc?.image,
        productDoc?.cover_image,
        productDoc?.cover
    );
    const image = firstFilled(
        item.image,
        item.snapshot_image,
        item.image_candidates && normalizeImageCandidates(item.image_candidates)[0],
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
    const specValue = normalizeSpecDisplayText(firstFilled(
        order.sku?.spec_value,
        item.spec,
        item.snapshot_spec,
        buildSkuSpecValue(skuDoc)
    ));
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
    const orderProductImages = normalizeImageCandidates(
        orderProduct.image_candidates,
        orderProduct.images,
        orderProduct.image,
        orderProduct.cover,
        productImages
    );
    const paidAt = firstFilled(
        toIsoString(order.paid_at),
        rawStatus !== 'pending_payment' && rawStatus !== 'cancelled' ? toIsoString(order.created_at) : ''
    );
    const cancelledAt = firstFilled(
        toIsoString(order.cancelled_at),
        rawStatus === 'cancelled' ? toIsoString(order.updated_at) : ''
    );
    const confirmedAt = firstFilled(
        toIsoString(order.confirmed_at),
        rawStatus === 'completed' ? toIsoString(order.updated_at) : ''
    );
    const completedAt = firstFilled(
        toIsoString(order.completed_at),
        confirmedAt,
        rawStatus === 'completed' ? toIsoString(order.updated_at) : ''
    );
    const shippedAt = firstFilled(
        toIsoString(order.shipped_at),
        (['shipped', 'completed', 'refunding', 'refunded'].includes(rawStatus) && (trackingNo || logisticsCompany))
            ? firstFilled(toIsoString(order.updated_at), paidAt, toIsoString(order.created_at))
            : ''
    );
    const agentConfirmedAt = firstFilled(
        toIsoString(order.agent_confirmed_at),
        ['agent_confirmed', 'shipping_requested'].includes(rawStatus) ? firstFilled(toIsoString(order.updated_at), paidAt) : ''
    );
    const orderTimeoutMinutes = normalizeOrderAutoCancelMinutes(
        order.payment_timeout_minutes || order.timeout_minutes,
        defaultAutoCancelMinutes
    );
    const explicitExpireAt = toIsoString(order.expire_at);
    const expireAt = firstFilled(
        pickNormalizedExpireAt(
            explicitExpireAt,
            order.created_at,
            orderTimeoutMinutes,
            rawStatus === 'pending_payment' || (rawStatus === 'cancelled' && !paidAt)
        ),
        explicitExpireAt
    );
    const reviewLookup = await loadUserReviewLookup(order.openid || '', cache);
    const reviewed = isOrderReviewed(order, reviewLookup);
    const reviewedAt = firstFilled(
        toIsoString(order.reviewed_at),
        reviewed ? firstFilled(completedAt, toIsoString(order.updated_at)) : ''
    );
    const estimatedDelivery = firstFilled(
        toIsoString(order.estimated_delivery),
        shippedAt ? addDays(shippedAt, 3) : ''
    );
    const settlementAt = firstFilled(
        toIsoString(order.settlement_at),
        completedAt ? addDays(completedAt, 15) : ''
    );
    const fulfillmentType = firstFilled(
        order.fulfillment_type,
        ['agent_confirmed', 'shipping_requested'].includes(rawStatus) ? 'Agent_Pending' : 'Platform'
    );
    const shippingTraces = Array.isArray(order.shipping_traces) && order.shipping_traces.length > 0
        ? order.shipping_traces
        : [
            toIsoString(order.created_at) ? { time: toIsoString(order.created_at), desc: '订单已创建', status: 'created' } : null,
            paidAt ? { time: paidAt, desc: '支付成功', status: 'paid' } : null,
            shippedAt ? { time: shippedAt, desc: '商家已发货', status: 'shipped' } : null,
            completedAt ? { time: completedAt, desc: '已签收', status: 'completed' } : null,
            cancelledAt ? { time: cancelledAt, desc: '订单已取消', status: 'cancelled' } : null
        ].filter(Boolean);
    const normalizedDistributor = directReferrerDoc ? {
        id: directReferrerDoc._id || directReferrerDoc.id || '',
        openid: directReferrerDoc.openid || '',
        nick_name: directReferrerDoc.nickName || directReferrerDoc.nickname || '',
        nickname: directReferrerDoc.nickName || directReferrerDoc.nickname || '',
        avatar: directReferrerDoc.avatarUrl || '',
        role_level: getUserRoleLevel(directReferrerDoc)
    } : null;
    const normalizedBuyer = buyerDoc ? {
        id: buyerDoc._id || buyerDoc.id || '',
        openid: buyerDoc.openid || '',
        nick_name: buyerDoc.nickName || buyerDoc.nickname || '',
        nickname: buyerDoc.nickName || buyerDoc.nickname || '',
        avatar: buyerDoc.avatarUrl || buyerDoc.avatar || '',
        phone: buyerDoc.phone || '',
        role_level: toNumber(buyerDoc.role_level || buyerDoc.distributor_level, 0),
        member_no: buyerDoc.member_no || buyerDoc.my_invite_code || buyerDoc.invite_code || ''
    } : null;
    const normalizedAgent = fulfillmentPartnerDoc ? {
        id: fulfillmentPartnerDoc._id || fulfillmentPartnerDoc.id || '',
        openid: fulfillmentPartnerDoc.openid || '',
        nickname: fulfillmentPartnerDoc.nickName || fulfillmentPartnerDoc.nickname || '',
        avatar: fulfillmentPartnerDoc.avatarUrl || fulfillmentPartnerDoc.avatar || '',
        role_level: getUserRoleLevel(fulfillmentPartnerDoc)
    } : null;
    const normalizedIndirectReferrer = buildUserRelationSummary(indirectReferrerDoc);
    const normalizedNearestAgent = buildUserRelationSummary(nearestAgentDoc);
    const settlementItemContexts = await Promise.all(buildOrderSettlementItems(order).map(async (line) => ({
        line,
        product: await findCollectionDocByAnyId('products', line.product_id, cache),
        sku: await findCollectionDocByAnyId('skus', line.sku_id, cache)
    })));
    const settlementItems = settlementItemContexts.map(({ line, product, sku }) => {
        const lineQty = Math.max(1, toNumber(line.qty || line.quantity, 1));
        const lineUnitPrice = line.price != null
            ? line.price
            : (line.unit_price != null
                ? line.unit_price
                : (line.item_amount != null ? roundMoney(toNumber(line.item_amount, 0) / lineQty) : 0));
        const lineImages = normalizeImageCandidates(
            line.image_candidates,
            line.snapshot_image,
            line.image,
            sku?.image,
            product?.images,
            product?.image,
            product?.cover_image,
            product?.cover
        );
        const lineImage = firstFilled(line.snapshot_image, line.image, lineImages[0]);
        const lineSpec = firstFilled(line.snapshot_spec, line.spec, buildSkuSpecValue(sku));
        return {
            ...line,
            image_candidates: lineImages,
            product: {
                id: firstFilled(line.product_id, product?._id, product?.id),
                name: firstFilled(line.snapshot_name, line.name, product?.name, product?.title, '商品'),
                images: lineImages,
                image: lineImage,
                image_candidates: lineImages
            },
            sku: lineSpec ? { spec_value: normalizeSpecDisplayText(lineSpec) } : null,
            display_original_line_amount: displayAmount(line.original_line_amount),
            display_unit_price: displayAmount(lineUnitPrice),
            display_line_amount: displayAmount(line.item_amount),
            display_bundle_discount_allocated_amount: displayAmount(line.bundle_discount_allocated_amount),
            display_coupon_allocated_amount: displayAmount(line.coupon_allocated_amount),
            display_points_allocated_amount: displayAmount(line.points_allocated_amount),
            display_cash_paid_allocated_amount: displayAmount(line.cash_paid_allocated_amount),
            display_refunded_cash_amount: displayAmount(line.refunded_cash_amount),
            display_refundable_cash_amount: displayAmount(line.refundable_cash_amount)
        };
    });
    const mergedProduct = {
        ...orderProduct,
        id: firstFilled(orderProduct.id, orderProduct._id, productId),
        _id: firstFilled(orderProduct._id, productDoc?._id),
        name: firstFilled(orderProduct.name, productName),
        images: orderProductImages.length > 0 ? orderProductImages : (productImages.length > 0 ? productImages : (image ? [image] : [])),
        image: firstFilled(orderProduct.image, orderProduct.cover, image),
        image_candidates: orderProductImages.length > 0 ? orderProductImages : productImages
    };
    const orderSku = order.sku && typeof order.sku === 'object' ? order.sku : null;
    const normalizedUnitPrice = roundMoney(unitPrice);
    const normalizedTotalAmount = roundMoney(totalAmount);
    const normalizedPayAmount = roundMoney(payAmount);
    const normalizedOriginalAmount = roundMoney(toNumber(order.original_amount != null ? order.original_amount : totalAmount, totalAmount));
    const refundedCashTotal = roundMoney(toNumber(order.refunded_cash_total, 0));
    const refundedQuantityTotal = Math.max(0, toNumber(order.refunded_quantity_total, 0));
    const remainingRefundableCash = roundMoney(Math.max(0, normalizedPayAmount - refundedCashTotal));
    const hasPartialRefund = refundedCashTotal > 0 && remainingRefundableCash > 0;

    return {
        ...order,
        id: order._id || order.id,
        openid: order.openid || '',
        raw_status: rawStatus,
        status,
        status_group: statusGroup,
        status_text: statusText,
        status_desc: statusDesc,
        quantity,
        paid_at: paidAt || null,
        shipped_at: shippedAt || null,
        agent_confirmed_at: agentConfirmedAt || null,
        completed_at: completedAt || null,
        confirmed_at: confirmedAt || null,
        cancelled_at: cancelledAt || null,
        expire_at: expireAt || null,
        payment_timeout_minutes: orderTimeoutMinutes,
        reviewed,
        reviewed_at: reviewedAt || null,
        fulfillment_type: fulfillmentType,
        pickupStation: pickupStation || null,
        pickup_station: pickupStation || null,
        settlement_at: settlementAt || null,
        commission_settled: order.commission_settled === true || (commissionDoc && commissionDoc.status === 'settled'),
        estimated_delivery: estimatedDelivery || null,
        shipping_traces: shippingTraces,
        direct_referrer_id: order.direct_referrer_id || normalizedDistributor?.id || '',
        direct_referrer_openid: order.direct_referrer_openid || normalizedDistributor?.openid || '',
        direct_referrer_role_level: toNumber(order.direct_referrer_role_level, normalizedDistributor?.role_level || 0),
        indirect_referrer_id: order.indirect_referrer_id || normalizedIndirectReferrer?.id || '',
        indirect_referrer_openid: order.indirect_referrer_openid || normalizedIndirectReferrer?.openid || '',
        indirect_referrer_role_level: toNumber(order.indirect_referrer_role_level, normalizedIndirectReferrer?.role_level || 0),
        nearest_agent_id: order.nearest_agent_id || normalizedNearestAgent?.id || '',
        nearest_agent_openid: order.nearest_agent_openid || normalizedNearestAgent?.openid || '',
        nearest_agent_role_level: toNumber(order.nearest_agent_role_level, normalizedNearestAgent?.role_level || 0),
        fulfillment_partner_id: order.fulfillment_partner_id || normalizedAgent?.id || '',
        fulfillment_partner_openid: order.fulfillment_partner_openid || normalizedAgent?.openid || '',
        fulfillment_partner_role_level: toNumber(order.fulfillment_partner_role_level, normalizedAgent?.role_level || 0),
        buyer: normalizedBuyer,
        distributor: normalizedDistributor,
        direct_referrer: normalizedDistributor,
        indirect_referrer: normalizedIndirectReferrer,
        nearest_agent: normalizedNearestAgent,
        agent: normalizedAgent,
        agent_info: normalizedAgent,
        product_id: productId,
        sku: orderSku ? { ...orderSku, spec_value: firstFilled(orderSku.spec_value, specValue) } : (specValue ? { spec_value: specValue } : null),
        address: order.address || order.address_snapshot || null,
        tracking_no: trackingNo,
        logistics_company: logisticsCompany,
        shipping_company: firstFilled(order.shipping_company, logisticsCompany),
        locked_agent_cost: toNumber(order.locked_agent_cost_total ?? order.locked_agent_cost, 0),
        middle_commission_total: toNumber(order.middle_commission_total, 0),
        product: mergedProduct,
        payment_method: paymentMethod,
        payment_method_text: getPaymentMethodText(paymentMethod),
        refund_target_text: getRefundTargetText(paymentMethod),
        items: settlementItems,
        bundle_discount: roundMoney(toNumber(order.bundle_discount, 0)),
        refunded_cash_total: refundedCashTotal,
        refunded_quantity_total: refundedQuantityTotal,
        remaining_refundable_cash: remainingRefundableCash,
        has_partial_refund: hasPartialRefund,
        display_refunded_cash_total: displayAmount(refundedCashTotal),
        display_remaining_refundable_cash: displayAmount(remainingRefundableCash),
        price: normalizedUnitPrice,
        total_amount: normalizedTotalAmount,
        original_amount: normalizedOriginalAmount,
        pay_amount: normalizedPayAmount,
        actual_price: normalizedPayAmount,
        display_price: displayAmount(normalizedUnitPrice),
        display_total_amount: displayAmount(normalizedTotalAmount),
        display_original_amount: displayAmount(normalizedOriginalAmount),
        display_pay_amount: displayAmount(normalizedPayAmount),
        display_actual_price: displayAmount(normalizedPayAmount)
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
        const offset = (page - 1) * limit;
        const cache = new Map();
        const defaultAutoCancelMinutes = await getDefaultOrderAutoCancelMinutes(cache);
        const reviewLookup = await loadUserReviewLookup(openid, cache);

        if (status === 'pending_review') {
            const completedOrders = await getAllRecords(db, 'orders', { openid, status: 'completed' }).catch(() => []);
            const filteredOrders = completedOrders
                .filter((order) => isPendingReviewOrder(order, reviewLookup))
                .sort((a, b) => {
                    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                    return tb - ta;
                });

            const pagedOrders = filteredOrders.slice(offset, offset + limit);
            return {
                list: await Promise.all(pagedOrders.map((order) => formatOrderForClient(order, cache, defaultAutoCancelMinutes))),
                pagination: {
                    total: filteredOrders.length,
                    page,
                    limit,
                    has_more: offset + pagedOrders.length < filteredOrders.length
                }
            };
        }

        const where = { openid };
        if (status) where.status = status;

        try {
            const [countRes, pageRes] = await Promise.all([
                db.collection('orders').where(where).count().catch(() => ({ total: 0 })),
                db.collection('orders')
                    .where(where)
                    .orderBy('created_at', 'desc')
                    .skip(offset)
                    .limit(limit)
                    .get()
                    .catch((error) => {
                        throw error;
                    })
            ]);

            const rows = Array.isArray(pageRes.data) ? pageRes.data : [];
            const total = Math.max(0, toNumber(countRes.total, 0));
            return {
                list: await Promise.all(rows.map((order) => formatOrderForClient(order, cache, defaultAutoCancelMinutes))),
                pagination: {
                    total,
                    page,
                    limit,
                    has_more: offset + rows.length < total
                }
            };
        } catch (pageErr) {
            // Fallback: 兼容未建索引或历史环境差异，保证结果正确性
            console.warn('[order-query] queryOrders 分页查询失败，回退全量查询:', pageErr.message);
        }

        const allOrders = await getAllRecords(db, 'orders', where);
        const sorted = allOrders.sort((a, b) => {
            const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
            return tb - ta;
        });
        return {
            list: await Promise.all(sorted.slice(offset, offset + limit).map((order) => formatOrderForClient(order, cache, defaultAutoCancelMinutes))),
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

async function getOrderCounts(openid) {
    const cache = new Map();
    const statuses = ['pending_payment', 'pending_group', 'paid', 'shipped'];
    const counts = {};

    await Promise.all(statuses.map(async (status) => {
        const res = await db.collection('orders').where({ openid, status }).count().catch(() => ({ total: 0 }));
        counts[status] = res.total || 0;
    }));

    const [completedOrders, refundRes, reviewLookup] = await Promise.all([
        getAllRecords(db, 'orders', { openid, status: 'completed' }).catch(() => []),
        db.collection('refunds')
            .where({ openid, status: _.in(['pending', 'approved', 'processing']) })
            .count()
            .catch(() => ({ total: 0 })),
        loadUserReviewLookup(openid, cache)
    ]);

    counts.pending = counts.pending_payment || 0;
    counts.pending_review = (completedOrders || []).filter((order) => isPendingReviewOrder(order, reviewLookup)).length;
    counts.refund = refundRes.total || 0;
    return counts;
}

/**
 * 获取订单详情
 */
async function getOrderDetail(openid, orderId) {
    const order = await getOrderByIdOrNo(openid, orderId);
    if (!order) return null;
    const cache = new Map();
    const defaultAutoCancelMinutes = await getDefaultOrderAutoCancelMinutes(cache);
    return formatOrderForClient(order, cache, defaultAutoCancelMinutes);
}

async function formatRefundForClient(refund = {}, cache = new Map(), defaultAutoCancelMinutes = 30) {
    const canonicalOrder = await getOrderByIdOrNo(refund.openid, refund.order_id || refund.order_no);
    const formattedOrder = canonicalOrder
        ? await formatOrderForClient(canonicalOrder, cache, defaultAutoCancelMinutes)
        : null;
    const paymentMethod = resolveOrderPaymentMethod({
        payment_method: refund.payment_method || refund.refund_channel || formattedOrder?.payment_method || canonicalOrder?.payment_method || '',
        pay_channel: refund.pay_channel || formattedOrder?.pay_channel || canonicalOrder?.pay_channel || '',
        pay_type: refund.pay_type || canonicalOrder?.pay_type || '',
        payment_channel: refund.payment_channel || canonicalOrder?.payment_channel || ''
    });
    const status = refund.status || 'pending';
    return {
        ...refund,
        id: refund._id || refund.id,
        order_id: formattedOrder?.id || refund.order_id || '',
        order_no: formattedOrder?.order_no || refund.order_no || '',
        openid: refund.openid || formattedOrder?.openid || '',
        amount: displayAmount(resolveRefundAmount(refund, 0)),
        status,
        status_text: getRefundStatusText(status),
        status_desc: getRefundStatusDesc(status),
        payment_method: paymentMethod,
        payment_method_text: getPaymentMethodText(paymentMethod),
        refund_channel: resolveRefundChannel(paymentMethod, refund.refund_channel || ''),
        refund_target_text: getRefundTargetText(paymentMethod, refund.refund_target_text || refund.refund_target || refund.refund_to),
        created_at: toIsoString(refund.created_at) || refund.created_at || null,
        processing_at: toIsoString(refund.processing_at) || refund.processing_at || null,
        completed_at: toIsoString(refund.completed_at) || refund.completed_at || null,
        return_company: refund.return_company || refund.return_shipping?.company || '',
        return_tracking_no: refund.return_tracking_no || refund.return_shipping?.tracking_no || '',
        order: formattedOrder,
        items: formattedOrder?.items || [],
        order_item: Array.isArray(formattedOrder?.items) ? (formattedOrder.items[0] || null) : null,
        wx_status: refund.wx_status || refund.wx_refund_status || ''
    };
}

async function listRefunds(openid, params = {}) {
    let query = db.collection('refunds').where({ openid });

    if (params.status) {
        query = query.where({ status: params.status });
    }

    const res = await query.orderBy('created_at', 'desc').limit(50).get().catch(() => ({ data: [] }));
    let rows = res.data || [];
    if (params.order_id) {
        const order = await getOrderByIdOrNo(openid, params.order_id);
        const orderTokens = [params.order_id, order && order._id, order && order.id, order && order.order_no]
            .filter((value) => value !== undefined && value !== null && value !== '')
            .map((value) => String(value));
        rows = rows.filter((refund) => orderTokens.includes(String(refund.order_id)) || orderTokens.includes(String(refund.order_no)));
    }
    const cache = new Map();
    const defaultAutoCancelMinutes = await getDefaultOrderAutoCancelMinutes(cache);
    return Promise.all(rows.map((refund) => formatRefundForClient(refund, cache, defaultAutoCancelMinutes)));
}

async function getRefundDetail(openid, refundId) {
    const refundRes = await db.collection('refunds').doc(refundId).get().catch(() => ({ data: null }));
    if (!refundRes.data || refundRes.data.openid !== openid) {
        throw new Error('退款记录不存在');
    }
    const cache = new Map();
    const defaultAutoCancelMinutes = await getDefaultOrderAutoCancelMinutes(cache);
    return formatRefundForClient(refundRes.data, cache, defaultAutoCancelMinutes);
}

module.exports = {
    queryOrders,
    getOrderCounts,
    getOrderDetail,
    getOrderByIdOrNo,
    listRefunds,
    getRefundDetail
};
