'use strict';
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toObject(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch (_) {
            return fallback;
        }
    }
    return fallback;
}

function isoDate(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object' && value.$date) return new Date(value.$date).toISOString();
    try {
        const d = new Date(value);
        return isNaN(d.getTime()) ? '' : d.toISOString();
    } catch (_) {
        return '';
    }
}

async function getCurrentUserDoc(openid) {
    if (!openid) return null;
    const result = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }));
    return result.data[0] || null;
}

function buildIdentitySet(openid, userDoc) {
    const identities = new Set();
    [openid, userDoc?.openid, userDoc?.id, userDoc?._id, userDoc?._legacy_id].forEach((value) => {
        if (value != null && value !== '') {
            identities.add(String(value));
        }
    });
    return identities;
}

function rowMatchesIdentity(row, identities, fields = ['openid', 'buyer_id', 'user_id']) {
    if (!row || !identities || identities.size === 0) return false;
    return fields.some((field) => row[field] != null && identities.has(String(row[field])));
}

function buildOwnerCandidates(openid, userDoc) {
    const candidates = [];
    const seen = new Set();

    function pushCandidate(field, value) {
        if (value == null || value === '') return;
        const key = `${field}:${String(value)}`;
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push({ field, value });
    }

    pushCandidate('openid', openid);
    pushCandidate('buyer_id', openid);
    pushCandidate('user_id', openid);

    if (userDoc) {
        pushCandidate('openid', userDoc.openid);
        pushCandidate('buyer_id', userDoc.id);
        pushCandidate('buyer_id', String(userDoc.id));
        pushCandidate('user_id', userDoc.id);
        pushCandidate('user_id', String(userDoc.id));
        pushCandidate('buyer_id', userDoc._id);
        pushCandidate('user_id', userDoc._id);
    }

    return candidates;
}

async function queryRowsByCandidates(collectionName, candidates) {
    const tasks = candidates.map(({ field, value }) =>
        db.collection(collectionName).where({ [field]: value }).get().catch(() => ({ data: [] }))
    );
    const groups = await Promise.all(tasks);
    let rows = [...groups[0].data, ...groups[1].data];
    for (let index = 2; index < groups.length; index += 1) {
        rows.push(...groups[index].data);
    }
    const map = new Map();
    rows.forEach((item) => map.set(item._id, item));
    return Array.from(map.values());
}

async function queryOrderRows(openid, status) {
    const userDoc = await getCurrentUserDoc(openid);
    let rows = await queryRowsByCandidates('orders', buildOwnerCandidates(openid, userDoc));
    if (status && status !== 'all') {
        rows = rows.filter((item) => {
            if (status === 'pending') return ['pending', 'pending_payment'].includes(item.status);
            if (status === 'paid') return ['paid', 'pending_ship'].includes(item.status);
            if (status === 'pending_review') return item.status === 'completed' && !item.reviewed;
            return item.status === status;
        });
    }
    return rows.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

async function getOrderDoc(orderId, openid) {
    const rows = await queryOrderRows(openid);
    return rows.find((item) =>
        String(item._id) === String(orderId) ||
        String(item.id) === String(orderId) ||
        String(item.order_no) === String(orderId)
    ) || null;
}

async function getSkuByCandidate(skuId) {
    if (!skuId) return null;
    const numericId = toNumber(skuId, NaN);
    const [byLegacyId, byDocId] = await Promise.all([
        Number.isFinite(numericId) ? db.collection('skus').where({ id: numericId }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('skus').doc(String(skuId)).get().catch(() => ({ data: null }))
    ]);
    if (byLegacyId.data && byLegacyId.data.length) return byLegacyId.data[0];
    return byDocId.data || null;
}

async function getProductByCandidate(productId) {
    if (productId == null || productId === '') return null;
    const numericId = toNumber(productId, NaN);
    const [byLegacyId, byDocId] = await Promise.all([
        Number.isFinite(numericId) ? db.collection('products').where({ id: numericId }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('products').doc(String(productId)).get().catch(() => ({ data: null }))
    ]);
    if (byLegacyId.data && byLegacyId.data.length) return byLegacyId.data[0];
    return byDocId.data || null;
}

async function getProductSkuList(product) {
    if (!product) return [];
    const candidates = [product._id, product.id]
        .filter((value) => value != null && value !== '')
        .map((value) => String(value));
    const numericCandidates = candidates
        .map((value) => toNumber(value, NaN))
        .filter((value) => Number.isFinite(value))
        .map((value) => String(value));
    const allCandidates = Array.from(new Set([...candidates, ...numericCandidates]));
    if (!allCandidates.length) return [];

    const tasks = allCandidates.map((value) => {
        const numericValue = toNumber(value, NaN);
        if (Number.isFinite(numericValue) && String(numericValue) === value) {
            return db.collection('skus').where({ product_id: numericValue }).get().catch(() => ({ data: [] }));
        }
        return db.collection('skus').where({ product_id: value }).get().catch(() => ({ data: [] }));
    });

    const groups = await Promise.all(tasks);
    const map = new Map();
    groups.forEach((group) => {
        (group.data || []).forEach((sku) => {
            const key = sku._id || sku.id;
            map.set(String(key), sku);
        });
    });
    return Array.from(map.values());
}

async function getAddressDoc(addressId, openid, userDoc = null) {
    const identities = buildIdentitySet(openid, userDoc);
    const byDocId = await db.collection('addresses').doc(String(addressId)).get().catch(() => ({ data: null }));
    if (byDocId.data && rowMatchesIdentity(byDocId.data, identities, ['openid', 'user_id'])) return byDocId.data;
    const numericId = toNumber(addressId, NaN);
    if (!Number.isFinite(numericId)) return null;
    const byLegacyId = await db.collection('addresses').where({ id: numericId }).limit(1).get().catch(() => ({ data: [] }));
    const legacyRow = byLegacyId.data[0] || null;
    if (legacyRow && rowMatchesIdentity(legacyRow, identities, ['openid', 'user_id'])) return legacyRow;
    return null;
}

async function getStationByCandidate(stationId) {
    if (stationId == null || stationId === '') return null;
    const numericId = toNumber(stationId, NaN);
    const [byLegacyId, byDocId] = await Promise.all([
        Number.isFinite(numericId) ? db.collection('stations').where({ id: numericId }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('stations').doc(String(stationId)).get().catch(() => ({ data: null }))
    ]);
    if (byLegacyId.data && byLegacyId.data.length) return byLegacyId.data[0];
    return byDocId.data || null;
}

function normalizeStation(station) {
    if (!station) return null;
    return {
        ...station,
        id: station.id != null ? station.id : station._id
    };
}

function isActiveStation(station) {
    const status = station && station.status;
    return status === undefined || status === null || status === 1 || status === true || String(status) === '1' || String(status) === 'active';
}

function matchesEntityId(candidate, entity) {
    if (candidate == null || candidate === '' || !entity) return false;
    const values = new Set(
        [entity._id, entity.id]
            .filter((value) => value != null && value !== '')
            .map((value) => String(value))
    );
    return values.has(String(candidate));
}

function buildAddressSnapshot(address) {
    return {
        receiver_name: address.receiver_name || address.contact_name || address.name || '',
        phone: address.phone || address.contact_phone || '',
        province: address.province || '',
        city: address.city || '',
        district: address.district || '',
        detail: address.detail || address.detail_address || ''
    };
}

function normalizeScopeIds(value) {
    if (Array.isArray(value)) return value.map((item) => String(item));
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.map((item) => String(item));
        } catch (_) {
            return value.split(',').map((item) => item.trim()).filter(Boolean);
        }
    }
    return [];
}

async function getOwnedUserCoupons(openid) {
    const userDoc = await getCurrentUserDoc(openid);
    return queryRowsByCandidates('user_coupons', buildOwnerCandidates(openid, userDoc));
}

async function getOwnedUserCouponById(openid, couponId) {
    if (couponId == null || couponId === '') return null;
    const rows = await getOwnedUserCoupons(openid);
    return rows.find((item) =>
        String(item._id) === String(couponId) ||
        String(item.id) === String(couponId)
    ) || null;
}

function calcCouponDiscount(coupon, orderAmount) {
    const total = Math.max(0, toNumber(orderAmount, 0));
    if (!coupon || total <= 0) return 0;
    if (coupon.coupon_type === 'fixed' || coupon.coupon_type === 'no_threshold') {
        return Math.min(total, toNumber(coupon.coupon_value, 0));
    }
    if (coupon.coupon_type === 'percent') {
        let pct = toNumber(coupon.coupon_value, 1);
        if (pct < 0) pct = 0;
        if (pct > 1) pct = 1;
        return Math.min(total, Number((total * (1 - pct)).toFixed(2)));
    }
    return 0;
}

function isCouponApplicable(coupon, productIds, categoryIds) {
    const scope = coupon && coupon.scope ? String(coupon.scope) : 'all';
    if (scope === 'all') return true;
    const ids = normalizeScopeIds(coupon && coupon.scope_ids);
    if (!ids.length) return true;
    if (scope === 'product') {
        return productIds.some((id) => ids.includes(String(id)));
    }
    if (scope === 'category') {
        return categoryIds.some((id) => ids.includes(String(id)));
    }
    return true;
}

function buildLegacyProductCompat(order) {
    const items = toArray(order.items);
    const firstItem = items[0] || {};
    const productId = firstItem.product_id || order.product_id || null;
    const skuId = firstItem.sku_id || order.sku_id || null;
    const image = firstItem.snapshot_image || order.image || '';

    return {
        product: {
            id: productId,
            _id: productId,
            name: firstItem.snapshot_name || order.product_name || '商品',
            images: image ? [image] : []
        },
        sku: {
            id: skuId,
            _id: skuId,
            spec_value: firstItem.snapshot_spec || order.spec || order.spec_value || '',
            spec_name: '规格'
        }
    };
}

function formatOrder(order) {
    const addressSnapshot = toObject(order.address_snapshot, null);
    const items = toArray(order.items);
    const compat = buildLegacyProductCompat(order);
    const totalAmount = toNumber(order.total_amount, 0);
    const payAmount = toNumber(order.pay_amount != null ? order.pay_amount : (order.actual_price != null ? order.actual_price : order.total_amount), 0);
    const originalAmount = toNumber(order.original_amount != null ? order.original_amount : totalAmount, totalAmount);
    const couponDiscount = toNumber(order.coupon_discount, 0);
    const pointsUsed = Math.max(0, Math.floor(toNumber(order.points_used, 0)));
    const pointsDiscount = toNumber(order.points_discount, 0);
    const verifiedAt = order.pickup_verified_at || order.verified_at || '';
    const normalizedStatus = (() => {
        if (order.status === 'pending_payment') return 'pending';
        if (order.status === 'pending_ship') return 'paid';
        return order.status;
    })();
    return {
        ...order,
        id: order.id || order._id,
        openid: order.openid || order.buyer_id || '',
        raw_status: order.status,
        status: normalizedStatus,
        pay_amount: payAmount,
        actual_price: toNumber(order.actual_price != null ? order.actual_price : order.pay_amount, totalAmount),
        total_amount: totalAmount,
        original_amount: originalAmount,
        coupon_discount: couponDiscount,
        points_used: pointsUsed,
        points_discount: pointsDiscount,
        delivery_type: order.delivery_type || (order.pickup_station_id != null ? 'pickup' : 'express'),
        pickup_station_id: order.pickup_station_id != null ? order.pickup_station_id : (order.station_id != null ? order.station_id : null),
        pickup_qr_token: order.pickup_qr_token || order.qr_token || '',
        verified_at: verifiedAt,
        pickup_verified_at: verifiedAt,
        transaction_id: order.transaction_id || '',
        paid_at: isoDate(order.paid_at),
        shipped_at: isoDate(order.shipped_at),
        delivered_at: isoDate(order.delivered_at),
        confirmed_at: isoDate(order.confirmed_at),
        closed_at: isoDate(order.closed_at),
        cancel_reason: order.cancel_reason || '',
        created_at: isoDate(order.created_at),
        updated_at: isoDate(order.updated_at),
        items,
        product_id: compat.product.id,
        sku_id: compat.sku.id,
        product: compat.product,
        sku: compat.sku,
        quantity: order.quantity != null ? order.quantity : items.reduce((sum, item) => sum + toNumber(item.qty, 0), 0),
        address: addressSnapshot ? {
            receiver_name: addressSnapshot.receiver_name,
            phone: addressSnapshot.phone,
            detail: addressSnapshot.detail,
            contact_name: addressSnapshot.receiver_name,
            contact_phone: addressSnapshot.phone,
            province: addressSnapshot.province,
            city: addressSnapshot.city,
            district: addressSnapshot.district,
            detail_address: addressSnapshot.detail
        } : null
    };
}

async function enrichOrder(order) {
    const formatted = formatOrder(order);
    const productDoc = formatted.product_id != null && formatted.product_id !== ''
        ? await getProductByCandidate(formatted.product_id)
        : null;
    if (productDoc) {
        const fallbackImages = toArray(productDoc.images);
        const fallbackName = productDoc.name || formatted.product?.name || '商品';
        if (!formatted.product || formatted.product.name === '商品' || !formatted.product.name) {
            formatted.product = {
                ...(formatted.product || {}),
                id: formatted.product_id,
                _id: formatted.product_id,
                name: fallbackName,
                images: fallbackImages
            };
        } else if ((!Array.isArray(formatted.product.images) || formatted.product.images.length === 0) && fallbackImages.length > 0) {
            formatted.product.images = fallbackImages;
        }
    }
    if (formatted.pickup_station_id != null && formatted.pickup_station_id !== '') {
        const station = await getStationByCandidate(formatted.pickup_station_id);
        if (station) {
            formatted.pickupStation = normalizeStation(station);
        }
    }
    return formatted;
}

function createOrderNo() {
    return `WL${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

exports.main = async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const { action, ...params } = event;

    if (action === 'list') {
        const currentPage = Math.max(1, toNumber(params.page, 1));
        const pageSize = Math.max(1, toNumber(params.limit != null ? params.limit : params.size, 10));
        const rows = await queryOrderRows(openid, params.status);
        const start = (currentPage - 1) * pageSize;
        const pagedRows = rows.slice(start, start + pageSize);
        const formattedRows = await Promise.all(pagedRows.map((item) => enrichOrder(item)));
        return {
            code: 0,
            success: true,
            data: {
                list: formattedRows,
                total: rows.length,
                page: currentPage,
                size: pageSize,
                pagination: {
                    page: currentPage,
                    limit: pageSize,
                    total: rows.length
                }
            }
        };
    }

    if (action === 'detail') {
        const order = await getOrderDoc(params.order_id, openid);
        if (!order) return { code: 404, success: false, message: '订单不存在' };
        return { code: 0, success: true, data: await enrichOrder(order) };
    }

    if (action === 'create') {
        const items = toArray(params.items);
        console.log('[order create] items:', JSON.stringify(items.map(i => ({ product_id: i.product_id, sku_id: i.sku_id, qty: i.qty, quantity: i.quantity }))));
        console.log('[order create] raw params keys:', Object.keys(params));
        const addressId = params.address_id;
        const deliveryType = params.delivery_type === 'pickup' ? 'pickup' : 'express';
        const pickupStationId = params.pickup_station_id;
        const userCouponId = params.user_coupon_id || params.coupon_id || null;
        const requestedPoints = Math.max(0, Math.floor(toNumber(params.points_to_use, 0)));
        if (!items.length) return { code: 400, success: false, message: '请选择商品' };
        const userDoc = await getCurrentUserDoc(openid);
        let address = null;
        if (deliveryType === 'express') {
            if (!addressId) return { code: 400, success: false, message: '请选择收货地址' };
            address = await getAddressDoc(addressId, openid, userDoc);
            if (!address) return { code: 400, success: false, message: '地址不存在' };
        } else if (addressId) {
            address = await getAddressDoc(addressId, openid, userDoc);
            if (!address) return { code: 400, success: false, message: '地址不存在' };
        }
        let pickupStation = null;
        if (deliveryType === 'pickup') {
            if (!pickupStationId) return { code: 400, success: false, message: '请选择自提门店' };
            pickupStation = await getStationByCandidate(pickupStationId);
            if (!pickupStation || !isActiveStation(pickupStation)) {
                return { code: 400, success: false, message: '自提门店不存在或不可用' };
            }
        }

        let totalAmount = 0;
        const itemSnapshots = [];
        const orderProductIds = [];
        const orderCategoryIds = [];
        for (const item of items) {
            const skuId = item.sku_id;
            const productId = item.product_id;
            const qty = Math.max(1, toNumber(item.qty != null ? item.qty : item.quantity, 1));

            let unitPrice = 0;
            let snapshotName = '';
            let snapshotSpec = '';
            let snapshotImage = '';
            let stockSource = null;

            if (skuId) {
                // 有 sku_id：走 SKU 路径
                const sku = await getSkuByCandidate(skuId);
                if (!sku) return { code: 400, success: false, message: '规格不存在' };
                if (toNumber(sku.stock, 0) < qty) {
                    return { code: 400, success: false, message: `${sku.name || '商品'}库存不足` };
                }
                unitPrice = toNumber(sku.price != null ? sku.price : sku.retail_price, 0);
                snapshotName = sku.name || '';
                snapshotSpec = sku.spec || sku.specs || '';
                snapshotImage = sku.image || toArray(sku.images)[0] || '';
                stockSource = { collection: 'skus', docId: sku._id, qty };
            } else if (productId) {
                // 无 sku_id：走商品路径（单规格/默认规格商品）
                const product = await getProductByCandidate(productId);
                if (!product) return { code: 400, success: false, message: '商品不存在' };
                const productSkus = await getProductSkuList(product);
                if (productSkus.length > 0) {
                    return { code: 400, success: false, message: '请选择商品规格' };
                }
                if (toNumber(product.stock, 0) < qty) {
                    return { code: 400, success: false, message: `${product.name || '商品'}库存不足` };
                }
                unitPrice = toNumber(product.retail_price != null ? product.retail_price : product.price, 0);
                snapshotName = product.name || '';
                snapshotSpec = '';
                snapshotImage = toArray(product.images)[0] || '';
                stockSource = { collection: 'products', docId: product._id, qty };
                if (product.category_id != null && product.category_id !== '') {
                    orderCategoryIds.push(product.category_id);
                }
            } else {
                return { code: 400, success: false, message: '缺少商品信息（product_id 和 sku_id 均为空）' };
            }

            totalAmount += unitPrice * qty;
            if (productId != null && productId !== '') {
                orderProductIds.push(productId);
            }
            itemSnapshots.push({
                sku_id: skuId || null,
                product_id: productId || null,
                qty,
                unit_price: unitPrice,
                item_amount: unitPrice * qty,
                snapshot_name: snapshotName,
                snapshot_spec: snapshotSpec,
                snapshot_image: snapshotImage
            });

            // 扣减库存
            if (stockSource) {
                await db.collection(stockSource.collection).doc(stockSource.docId).update({
                    data: {
                        stock: _.inc(-stockSource.qty),
                        updated_at: db.serverDate()
                    }
                });
            }
        }

        let couponDiscount = 0;
        let appliedCoupon = null;
        if (userCouponId) {
            const coupon = await getOwnedUserCouponById(openid, userCouponId);
            if (!coupon) return { code: 400, success: false, message: '优惠券不存在' };
            if (String(coupon.status) !== 'unused') return { code: 400, success: false, message: '优惠券已使用或已失效' };
            const expireAt = coupon.expire_at ? new Date(coupon.expire_at) : null;
            if (expireAt && expireAt <= new Date()) return { code: 400, success: false, message: '优惠券已过期' };
            const minPurchase = toNumber(coupon.min_purchase, 0);
            if (minPurchase > totalAmount) return { code: 400, success: false, message: `订单金额未满足优惠券门槛（满${minPurchase}元可用）` };
            if (!isCouponApplicable(coupon, orderProductIds, orderCategoryIds)) {
                return { code: 400, success: false, message: '优惠券不适用于当前商品' };
            }
            couponDiscount = Number(calcCouponDiscount(coupon, totalAmount).toFixed(2));
            appliedCoupon = coupon;
        }

        const amountAfterCoupon = Math.max(0, Number((totalAmount - couponDiscount).toFixed(2)));
        const userPoints = Math.max(0, Math.floor(toNumber(userDoc && (userDoc.points != null ? userDoc.points : userDoc.growth_value), 0)));
        const maxPointsAllowed = Math.floor(amountAfterCoupon * 100 * 0.5);
        const pointsUsed = Math.min(requestedPoints, userPoints, maxPointsAllowed);
        const pointsDiscount = Number((pointsUsed / 100).toFixed(2));
        const payableAmount = Math.max(0, Number((amountAfterCoupon - pointsDiscount).toFixed(2)));

        const orderNo = createOrderNo();
        const orderData = {
            order_no: orderNo,
            openid,
            buyer_id: openid,
            status: 'pending_payment',
            total_amount: payableAmount,
            pay_amount: payableAmount,
            actual_price: payableAmount,
            original_amount: Number(totalAmount.toFixed(2)),
            address_id: addressId != null && addressId !== '' ? String(addressId) : null,
            address_snapshot: address ? buildAddressSnapshot(address) : null,
            remark: params.remark || '',
            coupon_id: appliedCoupon ? (appliedCoupon.coupon_id || appliedCoupon.id || appliedCoupon._id) : null,
            coupon_discount: couponDiscount,
            points_used: pointsUsed,
            points_discount: pointsDiscount,
            items: itemSnapshots,
            delivery_type: deliveryType,
            pickup_station_id: pickupStation ? String(pickupStation.id != null ? pickupStation.id : pickupStation._id) : null,
            reviewed: false,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        };
        const res = await db.collection('orders').add({ data: orderData });

        if (appliedCoupon) {
            await db.collection('user_coupons').doc(appliedCoupon._id).update({
                data: {
                    status: 'used',
                    used_at: db.serverDate(),
                    used_order_id: res._id,
                    updated_at: db.serverDate()
                }
            });
        }

        if (pointsUsed > 0 && userDoc && userDoc._id) {
            const currentPoints = Math.max(0, Math.floor(toNumber(userDoc.points != null ? userDoc.points : userDoc.growth_value, 0)));
            const nextPoints = Math.max(0, currentPoints - pointsUsed);
            const updateData = {
                updated_at: db.serverDate()
            };
            if (userDoc.points != null) updateData.points = nextPoints;
            if (userDoc.points == null && userDoc.growth_value != null) updateData.growth_value = nextPoints;
            await db.collection('users').doc(userDoc._id).update({ data: updateData }).catch(() => null);
            await db.collection('points_logs').add({
                data: {
                    openid,
                    user_id: userDoc.id || userDoc._legacy_id || openid,
                    type: 'order_deduction',
                    title: '下单积分抵扣',
                    points: -pointsUsed,
                    created_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            }).catch(() => null);
        }

        return {
            code: 0,
            success: true,
            data: {
                _id: res._id,
                id: res._id,
                order_no: orderNo,
                total_amount: payableAmount,
                pay_amount: payableAmount,
                coupon_discount: couponDiscount,
                points_used: pointsUsed,
                points_discount: pointsDiscount,
                status: 'pending'
            }
        };
    }

    if (action === 'cancel') {
        const order = await getOrderDoc(params.order_id, openid);
        if (!order) return { code: 404, success: false, message: '订单不存在' };
        if (!['pending', 'pending_payment'].includes(order.status)) {
            return { code: 400, success: false, message: '当前状态不可取消' };
        }

        // 恢复库存
        const orderItems = toArray(order.items);
        for (const item of orderItems) {
            const qty = toNumber(item.qty, 0);
            if (qty <= 0) continue;
            if (item.sku_id) {
                const sku = await getSkuByCandidate(item.sku_id);
                if (sku) {
                    await db.collection('skus').doc(sku._id).update({
                        data: { stock: _.inc(qty), updated_at: db.serverDate() }
                    }).catch(() => null);
                }
            } else if (item.product_id) {
                const product = await getProductByCandidate(item.product_id);
                if (product) {
                    await db.collection('products').doc(product._id).update({
                        data: { stock: _.inc(qty), updated_at: db.serverDate() }
                    }).catch(() => null);
                }
            }
        }

        // 退还积分
        const pointsUsed = Math.max(0, Math.floor(toNumber(order.points_used, 0)));
        if (pointsUsed > 0 && openid) {
            const userDoc = await getCurrentUserDoc(openid);
            if (userDoc) {
                const updateData = { updated_at: db.serverDate() };
                const currentPoints = Math.max(0, Math.floor(toNumber(userDoc.points != null ? userDoc.points : userDoc.growth_value, 0)));
                if (userDoc.points != null) updateData.points = currentPoints + pointsUsed;
                if (userDoc.growth_value != null) updateData.growth_value = currentPoints + pointsUsed;
                await db.collection('users').doc(userDoc._id).update({ data: updateData }).catch(() => null);
                await db.collection('points_logs').add({
                    data: { openid, user_id: userDoc.id || userDoc._legacy_id || openid, type: 'cancel_refund', title: '取消订单退还积分', points: pointsUsed, created_at: db.serverDate(), updated_at: db.serverDate() }
                }).catch(() => null);
            }
        }

        // 释放优惠券
        const couponId = order.coupon_id;
        if (couponId) {
            const couponDoc = await db.collection('user_coupons').doc(String(couponId)).get().catch(() => ({ data: null }));
            if (couponDoc.data && String(couponDoc.data.status) === 'used' && String(couponDoc.data.used_order_id) === String(order._id)) {
                await db.collection('user_coupons').doc(String(couponId)).update({
                    data: { status: 'unused', used_at: _.remove(), used_order_id: _.remove(), updated_at: db.serverDate() }
                }).catch(() => null);
            }
        }

        await db.collection('orders').doc(order._id).update({
            data: {
                status: 'cancelled',
                cancel_reason: params.reason || '用户取消',
                closed_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
        return { code: 0, success: true };
    }

    if (action === 'confirm') {
        const order = await getOrderDoc(params.order_id, openid);
        if (!order) return { code: 404, success: false, message: '订单不存在' };
        if (order.status !== 'shipped') return { code: 400, success: false, message: '当前状态不可确认' };
        await db.collection('orders').doc(order._id).update({
            data: {
                status: 'completed',
                completed_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });

        // ── 确认收货后解冻佣金（frozen → pending_approval） ──
        try {
            const orderNo = order.order_no || '';
            if (orderNo) {
                await cloud.callFunction({
                    name: 'distribution',
                    data: {
                        action: 'unfreezeCommissions',
                        order_no: orderNo
                    }
                }).catch((err) => {
                    console.error('触发佣金解冻失败（不影响确认收货）:', err);
                });
            }
        } catch (commErr) {
            console.error('佣金解冻异常（不影响确认收货）:', commErr);
        }

        return { code: 0, success: true };
    }

    if (action === 'applyRefund') {
        const order = await getOrderDoc(params.order_id, openid);
        if (!order) return { code: 404, success: false, message: '订单不存在' };
        const res = await db.collection('refunds').add({
            data: {
                openid,
                user_id: openid,
                order_id: order._id,
                order_no: order.order_no,
                amount: toNumber(order.actual_price != null ? order.actual_price : order.pay_amount, 0),
                reason: params.reason || '',
                images: toArray(params.images),
                status: 'pending',
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
        await db.collection('orders').doc(order._id).update({
            data: {
                status: 'refund_applying',
                updated_at: db.serverDate()
            }
        });

        // ── 退款时取消佣金 ──
        try {
            const orderNo = order.order_no || '';
            if (orderNo) {
                await cloud.callFunction({
                    name: 'distribution',
                    data: {
                        action: 'cancelCommissions',
                        order_no: orderNo
                    }
                }).catch((err) => {
                    console.error('触发佣金取消失败（不影响退款流程）:', err);
                });
            }
        } catch (commErr) {
            console.error('佣金取消异常（不影响退款流程）:', commErr);
        }

        return { code: 0, success: true, data: { _id: res._id } };
    }

    if (action === 'refundList') {
        const currentPage = Math.max(1, toNumber(params.page, 1));
        const pageSize = Math.max(1, toNumber(params.limit != null ? params.limit : params.size, 10));
        const userDoc = await getCurrentUserDoc(openid);
        const orderRows = await queryOrderRows(openid);
        const orderMap = new Map(orderRows.map((item) => [String(item._id), formatOrder(item)]));
        let list = await queryRowsByCandidates('refunds', buildOwnerCandidates(openid, userDoc));
        if (params.order_id) {
            list = list.filter((item) => String(item.order_id) === String(params.order_id));
        }
        if (params.status) {
            list = list.filter((item) => item.status === params.status);
        }
        list = list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        const start = (currentPage - 1) * pageSize;
        const paged = list.slice(start, start + pageSize).map((item) => ({
            ...item,
            id: item.id || item._id,
            order: orderMap.get(String(item.order_id)) || null
        }));
        return {
            code: 0,
            success: true,
            data: {
                list: paged,
                total: list.length,
                page: currentPage,
                size: pageSize,
                pagination: {
                    page: currentPage,
                    limit: pageSize,
                    total: list.length
                }
            }
        };
    }

    if (action === 'review') {
        const order = await getOrderDoc(params.order_id, openid);
        if (!order) return { code: 404, success: false, message: '订单不存在' };
        const items = toArray(order.items);
        const firstItem = items[0] || {};
        await db.collection('reviews').add({
            data: {
                openid,
                user_id: openid,
                order_id: order._id,
                product_id: firstItem.product_id || order.product_id || null,
                rating: toNumber(params.rating, 5),
                content: params.content || '',
                images: toArray(params.images),
                status: 1,
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
        await db.collection('orders').doc(order._id).update({
            data: {
                reviewed: true,
                updated_at: db.serverDate()
            }
        });
        return { code: 0, success: true };
    }

    if (action === 'refundDetail') {
        const doc = await db.collection('refunds').doc(String(params.refund_id)).get().catch(() => ({ data: null }));
        const refund = doc.data || null;
        let order = null;
        if (refund && refund.order_id) {
            const orderDoc = await getOrderDoc(refund.order_id, openid);
            order = orderDoc ? formatOrder(orderDoc) : null;
        }
        return {
            code: 0,
            success: true,
            data: refund ? {
                ...refund,
                id: refund.id || refund._id,
                order
            } : null
        };
    }

    // ── 物流追踪 ────────────────────────────────
    if (action === 'trackLogistics') {
        const order = await getOrderDoc(params.order_id, openid);
        if (!order) return { code: 404, success: false, message: '订单不存在' };
        const trackingCompany = order.tracking_company || order.logistics_company || '';
        const trackingNo = order.tracking_no || order.logistics_no || '';
        const traces = toArray(order.logistics_traces || order.traces);
        return {
            code: 0,
            success: true,
            data: {
                traces,
                company: trackingCompany || '待接入',
                tracking_no: trackingNo || '',
                status: order.status
            }
        };
    }

    // ── 拼团加入 ────────────────────────────────
    if (action === 'joinGroup') {
        if (!openid) return { code: 401, success: false, message: '请先登录' };
        const activityId = params.group_id || params.activity_id;
        if (!activityId) return { code: 400, success: false, message: '缺少拼团活动ID' };
        // 查找拼团活动
        const actRes = await db.collection('group_activities').where({
            _id: String(activityId)
        }).limit(1).get().catch(() => ({ data: [] }));
        const actAlt = !actRes.data.length
            ? await db.collection('group_activities').where({ id: toNumber(activityId, NaN) }).limit(1).get().catch(() => ({ data: [] }))
            : { data: [] };
        const activity = actRes.data[0] || actAlt.data[0] || null;
        if (!activity) return { code: 404, success: false, message: '拼团活动不存在' };
        // 创建拼团订单
        const orderNo = createOrderNo();
        const groupNo = `GP${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const orderData = {
            order_no: orderNo,
            group_no: groupNo,
            openid,
            buyer_id: openid,
            order_type: 'group',
            group_id: activityId,
            status: 'pending_payment',
            total_amount: toNumber(activity.group_price || activity.price, 0),
            pay_amount: toNumber(activity.group_price || activity.price, 0),
            actual_price: toNumber(activity.group_price || activity.price, 0),
            items: [],
            reviewed: false,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        };
        const res = await db.collection('orders').add({ data: orderData });
        return { code: 0, success: true, data: { _id: res._id, order_no: orderNo, group_no: groupNo, group_id: activityId, status: 'pending' } };
    }

    // ── 砍价助力 ────────────────────────────────
    if (action === 'slashHelp') {
        if (!openid) return { code: 401, success: false, message: '请先登录' };
        const slashId = params.slash_id;
        if (!slashId) return { code: 400, success: false, message: '缺少砍价ID' };
        // 查找砍价记录
        const recordRes = await db.collection('slash_records')
            .where({ _id: String(slashId) }).limit(1).get().catch(() => ({ data: [] }));
        const record = recordRes.data[0] || null;
        if (!record) return { code: 404, success: false, message: '砍价记录不存在' };
        // 计算砍价金额（随机 0.1~5% 的差额）
        const currentPrice = toNumber(record.current_price, 0);
        const targetPrice = toNumber(record.target_price, 0);
        const helpAmount = Math.max(0.01, Math.round((currentPrice - targetPrice) * (0.001 + Math.random() * 0.049) * 100) / 100);
        const newPrice = Math.max(targetPrice, Math.round((currentPrice - helpAmount) * 100) / 100);
        const helpers = toArray(record.helpers);
        helpers.push({ openid, help_amount: helpAmount, helped_at: new Date().toISOString() });
        await db.collection('slash_records').doc(record._id).update({
            data: { current_price: newPrice, helpers, updated_at: db.serverDate() }
        });
        return {
            code: 0,
            success: true,
            data: {
                current_price: newPrice,
                helped: true,
                help_amount: helpAmount,
                help_list: helpers,
                reached_target: newPrice <= targetPrice
            }
        };
    }

    // ── 抽奖 ────────────────────────────────────
    if (action === 'lotteryDraw') {
        if (!openid) return { code: 401, success: false, message: '请先登录' };
        // 读取奖品配置
        const prizesRes = await db.collection('lottery_prizes')
            .where({ is_active: _.in([true, 1, '1']) })
            .orderBy('sort_order', 'asc').limit(20).get().catch(() => ({ data: [] }));
        const prizes = prizesRes.data;
        if (!prizes.length) return { code: 0, success: true, data: { won: false, prize_id: null, prize_name: '', prize_type: 'none', message: '暂无奖品' } };
        // 按概率抽选
        const totalWeight = prizes.reduce((sum, p) => sum + toNumber(p.weight || p.probability, 1), 0);
        let random = Math.random() * totalWeight;
        let selectedPrize = prizes[0];
        for (const prize of prizes) {
            random -= toNumber(prize.weight || prize.probability, 1);
            if (random <= 0) { selectedPrize = prize; break; }
        }
        const won = toNumber(selectedPrize.weight || selectedPrize.probability, 1) > 0;
        // 记录抽奖
        await db.collection('lottery_records').add({
            data: {
                openid,
                prize_id: selectedPrize._id || selectedPrize.id,
                prize_name: selectedPrize.name || '',
                prize_type: selectedPrize.type || 'virtual',
                won,
                created_at: db.serverDate()
            }
        }).catch(() => null);
        return {
            code: 0,
            success: true,
            data: {
                won,
                prize_id: selectedPrize._id || selectedPrize.id,
                prize_name: selectedPrize.name || '',
                prize_type: selectedPrize.type || 'virtual',
                prize_image: selectedPrize.image || ''
            }
        };
    }

    // ── 我的拼团 ────────────────────────────────
    if (action === 'myGroups') {
        const rows = await queryOrderRows(openid);
        const groupOrders = rows.filter((item) => item.order_type === 'group' || item.group_id);
        const formatted = groupOrders.map(formatOrder);
        // 为每条记录补充拼团详情（current_members / min_members / activity）
        const enriched = await Promise.all(formatted.map(async (item) => {
            const activityId = item.group_id;
            if (!activityId) return { ...item, groupOrder: { group_no: item.group_no || item.order_no, current_members: 1, min_members: 2, status: item.status } };
            const [byDocId, byLegacyId] = await Promise.all([
                db.collection('group_activities').doc(String(activityId)).get().catch(() => ({ data: null })),
                db.collection('group_activities').where({ id: toNumber(activityId, NaN) }).limit(1).get().catch(() => ({ data: [] }))
            ]);
            const act = byDocId.data || byLegacyId.data[0] || null;
            // 统计同一 group_id 的所有订单数作为 current_members
            const memberRes = await db.collection('orders').where({ group_id: String(activityId), status: _.nin(['cancelled']) }).count().catch(() => ({ total: 0 }));
            const currentMembers = toNumber(memberRes.total, 1);
            const minMembers = toNumber(act?.min_members || act?.target_count, 2);
            const remainSeconds = act?.end_time ? Math.max(0, Math.floor((new Date(act.end_time).getTime() - Date.now()) / 1000)) : 0;
            return {
                ...item,
                groupOrder: {
                    group_no: item.group_no || item.order_no,
                    current_members: currentMembers,
                    min_members: minMembers,
                    status: item.status,
                    product: item.product,
                    remain_seconds: remainSeconds
                },
                activity: act ? { ...act, id: act._id || act.id } : null
            };
        }));
        return { code: 0, success: true, data: { list: enriched, total: enriched.length } };
    }

    // ── 我的砍价 ────────────────────────────────
    if (action === 'mySlashList') {
        // 从 slash_records 查询用户的砍价记录
        const slashRecords = await db.collection('slash_records')
            .where({ openid })
            .orderBy('created_at', 'desc')
            .limit(50)
            .get()
            .catch(() => ({ data: [] }));
        const enriched = await Promise.all(slashRecords.data.map(async (record) => {
            const activityId = record.activity_id;
            let activity = null;
            let product = null;
            if (activityId) {
                const [byDocId, byLegacyId] = await Promise.all([
                    db.collection('slash_activities').doc(String(activityId)).get().catch(() => ({ data: null })),
                    db.collection('slash_activities').where({ id: toNumber(activityId, NaN) }).limit(1).get().catch(() => ({ data: [] }))
                ]);
                activity = byDocId.data || byLegacyId.data[0] || null;
                if (activity?.product_id) {
                    product = await getProductByCandidate(activity.product_id);
                }
            }
            const helpers = toArray(record.helpers);
            const currentPrice = toNumber(record.current_price, 0);
            const floorPrice = toNumber(activity?.target_price || activity?.floor_price || 0, 0);
            const originalPrice = toNumber(activity?.original_price || activity?.retail_price || record.original_price || 0, 0);
            return {
                ...record,
                id: record._id || record.id,
                slash_no: record.slash_no || record._id,
                status: record.status || 'pending',
                current_price: currentPrice,
                floor_price: floorPrice,
                original_price: originalPrice,
                helper_count: helpers.length,
                helpers,
                remain_seconds: record.expire_at ? Math.max(0, Math.floor((new Date(record.expire_at).getTime() - Date.now()) / 1000)) : 0,
                product: product ? { id: product._id || product.id, name: product.name || '', images: toArray(product.images), retail_price: toNumber(product.retail_price, 0) } : null,
                activity: activity ? { ...activity, id: activity._id || activity.id } : null,
                created_at: isoDate(record.created_at)
            };
        }));
        return { code: 0, success: true, data: { list: enriched, total: enriched.length } };
    }

    // ── 发起砍价 ────────────────────────────────
    if (action === 'slashStart') {
        if (!openid) return { code: 401, success: false, message: '请先登录' };
        const activityId = params.activity_id;
        if (!activityId) return { code: 400, success: false, message: '缺少活动ID' };
        // 查询砍价活动获取价格信息
        const [actByDocId, actByLegacyId] = await Promise.all([
            db.collection('slash_activities').doc(String(activityId)).get().catch(() => ({ data: null })),
            db.collection('slash_activities').where({ id: toNumber(activityId, NaN) }).limit(1).get().catch(() => ({ data: [] }))
        ]);
        const activity = actByDocId.data || actByLegacyId.data[0] || null;
        const originalPrice = activity ? toNumber(activity.original_price || activity.retail_price, 0) : toNumber(params.original_price, 0);
        const targetPrice = activity ? toNumber(activity.target_price || activity.floor_price, 0) : 0;
        const slashNo = `SL${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const res = await db.collection('slash_records').add({
            data: {
                openid,
                activity_id: activityId,
                slash_no: slashNo,
                status: 'pending',
                original_price: originalPrice,
                current_price: originalPrice,
                target_price: targetPrice,
                floor_price: targetPrice,
                helpers: [],
                expire_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
        return { code: 0, success: true, data: { _id: res._id, id: res._id, slash_no: slashNo } };
    }

    // ── 自提待取货订单 ────────────────────────────
    if (action === 'pickupPendingOrders') {
        const userDoc = await getCurrentUserDoc(openid);
        const roleLevel = toNumber(userDoc?.role_level, 0);
        if (roleLevel < 3) return { code: 403, success: false, message: '无核销权限' };
        const stationId = params.station_id;
        const station = stationId ? await getStationByCandidate(stationId) : null;
        if (stationId && !station) return { code: 404, success: false, message: '门店不存在' };
        const res = await db.collection('orders').where({ status: 'pending_pickup' })
            .orderBy('created_at', 'desc')
            .limit(Math.max(50, toNumber(params.limit, 50)))
            .get()
            .catch(() => ({ data: [] }));
        const filtered = station
            ? (res.data || []).filter((item) => matchesEntityId(item.pickup_station_id != null ? item.pickup_station_id : item.station_id, station))
            : (res.data || []);
        return {
            code: 0,
            success: true,
            data: {
                list: filtered.slice(0, toNumber(params.limit, 50)).map(formatOrder),
                total: filtered.length,
                station: station ? normalizeStation(station) : null
            }
        };
    }

    // ── 自提验证码核销 ────────────────────────────
    if (action === 'pickupVerifyCode') {
        const userDoc = await getCurrentUserDoc(openid);
        if (toNumber(userDoc?.role_level, 0) < 3) return { code: 403, success: false, message: '无核销权限' };
        const station = await getStationByCandidate(params.station_id);
        if (!station) return { code: 400, success: false, message: '缺少有效门店' };
        const code = params.pickup_code;
        if (!code) return { code: 400, success: false, message: '缺少取货码' };
        const res = await db.collection('orders').where({ pickup_code: String(code), status: 'pending_pickup' }).limit(1).get().catch(() => ({ data: [] }));
        const order = (res.data || []).find((item) => matchesEntityId(item.pickup_station_id != null ? item.pickup_station_id : item.station_id, station));
        if (!order) return { code: 404, success: false, message: '未找到对应订单' };
        await db.collection('orders').doc(order._id).update({
            data: {
                status: 'completed',
                pickup_verified_at: db.serverDate(),
                verified_at: db.serverDate(),
                pickup_verified_by: openid,
                verified_by_user_id: openid,
                verified_station_id: String(station.id != null ? station.id : station._id),
                updated_at: db.serverDate()
            }
        });
        return { code: 0, success: true, data: { order_no: order.order_no } };
    }

    // ── 自提二维码核销 ────────────────────────────
    if (action === 'pickupVerifyQr') {
        const userDoc = await getCurrentUserDoc(openid);
        if (toNumber(userDoc?.role_level, 0) < 3) return { code: 403, success: false, message: '无核销权限' };
        const station = await getStationByCandidate(params.station_id);
        if (!station) return { code: 400, success: false, message: '缺少有效门店' };
        const token = params.qr_token;
        if (!token) return { code: 400, success: false, message: '缺少二维码令牌' };
        const res = await db.collection('orders').where({ pickup_qr_token: String(token), status: 'pending_pickup' }).limit(1).get().catch(() => ({ data: [] }));
        const order = (res.data || []).find((item) => matchesEntityId(item.pickup_station_id != null ? item.pickup_station_id : item.station_id, station));
        if (!order) return { code: 404, success: false, message: '未找到对应订单' };
        await db.collection('orders').doc(order._id).update({
            data: {
                status: 'completed',
                pickup_verified_at: db.serverDate(),
                verified_at: db.serverDate(),
                pickup_verified_by: openid,
                verified_by_user_id: openid,
                verified_station_id: String(station.id != null ? station.id : station._id),
                updated_at: db.serverDate()
            }
        });
        return { code: 0, success: true, data: { order_no: order.order_no } };
    }

    // ── 自提订单详情(用户侧) ────────────────────────
    if (action === 'pickupMyOrder') {
        const orderId = params.order_id;
        if (!orderId) return { code: 400, success: false, message: '缺少订单ID' };
        const order = await getOrderDoc(orderId, openid);
        if (!order) return { code: 404, success: false, message: '订单不存在' };
        return { code: 0, success: true, data: await enrichOrder(order) };
    }

    // ── 拼团订单详情 ────────────────────────────
    if (action === 'groupOrderDetail') {
        const groupNo = params.group_no;
        if (!groupNo) return { code: 400, success: false, message: '缺少拼团编号' };
        // 不限定 openid，支持分享链接打开
        const orConditions = [
            { group_no: String(groupNo) },
            { order_no: String(groupNo) },
            { group_id: String(groupNo) }
        ];
        const allOrders = await db.collection('orders').where(
            _.or(orConditions)
        ).limit(50).get().catch(() => ({ data: [] }));
        const order = allOrders.data[0] || null;
        if (!order) return { code: 404, success: false, message: '拼团订单不存在' };
        const formatted = await enrichOrder(order);
        // 查询拼团活动详情
        const activityId = order.group_id;
        let activity = null;
        let currentMembers = 1;
        let minMembers = 2;
        let remainSeconds = 0;
        if (activityId) {
            const [byDocId, byLegacyId] = await Promise.all([
                db.collection('group_activities').doc(String(activityId)).get().catch(() => ({ data: null })),
                db.collection('group_activities').where({ id: toNumber(activityId, NaN) }).limit(1).get().catch(() => ({ data: [] }))
            ]);
            activity = byDocId.data || byLegacyId.data[0] || null;
            minMembers = toNumber(activity?.min_members || activity?.target_count, 2);
            // 统计同一 group_id 的非取消订单数
            const memberRes = await db.collection('orders').where({ group_id: String(activityId), status: _.nin(['cancelled']) }).count().catch(() => ({ total: 0 }));
            currentMembers = toNumber(memberRes.total, 1);
            remainSeconds = activity?.end_time ? Math.max(0, Math.floor((new Date(activity.end_time).getTime() - Date.now()) / 1000)) : 0;
        }
        const groupPrice = toNumber(activity?.group_price || activity?.price || formatted.pay_amount, 0);
        return {
            code: 0,
            success: true,
            data: {
                ...formatted,
                group_no: formatted.group_no || formatted.order_no,
                current_members: currentMembers,
                min_members: minMembers,
                group_price: groupPrice,
                remain_seconds: remainSeconds,
                activity: activity ? { ...activity, id: activity._id || activity.id } : null
            }
        };
    }

    // ── 取消退款申请 ────────────────────────────
    if (action === 'cancelRefund') {
        const refundId = params.refund_id;
        if (!refundId) return { code: 400, success: false, message: '缺少退款ID' };
        const doc = await db.collection('refunds').doc(String(refundId)).get().catch(() => ({ data: null }));
        const refund = doc.data;
        if (!refund) return { code: 404, success: false, message: '退款记录不存在' };
        if (refund.openid !== openid && refund.user_id !== openid) {
            return { code: 403, success: false, message: '无权操作' };
        }
        if (!['pending', 'pending_approval'].includes(refund.status)) {
            return { code: 400, success: false, message: '当前状态不可取消' };
        }
        await db.collection('refunds').doc(String(refundId)).update({
            data: { status: 'cancelled', cancelled_at: db.serverDate(), updated_at: db.serverDate() }
        });
        return { code: 0, success: true };
    }

    // ── 填写退货物流 ────────────────────────────
    if (action === 'returnShipping') {
        const refundId = params.refund_id;
        if (!refundId) return { code: 400, success: false, message: '缺少退款ID' };
        const doc = await db.collection('refunds').doc(String(refundId)).get().catch(() => ({ data: null }));
        const refund = doc.data;
        if (!refund) return { code: 404, success: false, message: '退款记录不存在' };
        if (refund.openid !== openid && refund.user_id !== openid) {
            return { code: 403, success: false, message: '无权操作' };
        }
        await db.collection('refunds').doc(String(refundId)).update({
            data: {
                status: 'return_shipping',
                tracking_company: params.tracking_company || '',
                tracking_no: params.tracking_no || '',
                return_shipped_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
        return { code: 0, success: true };
    }

    return { code: 400, success: false, message: `未知 action: ${action}` };
};
