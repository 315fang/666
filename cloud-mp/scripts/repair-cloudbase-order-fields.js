'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const seedRoot = path.join(projectRoot, 'cloudbase-seed');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';
const shouldApply = process.argv.includes('--apply');
const useCloudSource = process.argv.includes('--cloud');
const pageLimit = 500;

function assertFileExists(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} 不存在: ${filePath}`);
    }
}

function isMissing(value) {
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function firstFilled(...values) {
    for (const value of values) {
        if (!isMissing(value)) return value;
    }
    return '';
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

function normalizeSpec(rawSpec) {
    if (Array.isArray(rawSpec)) {
        return rawSpec
            .map((item) => {
                if (!item || typeof item !== 'object') return '';
                return firstFilled(item.value, item.spec_value, item.name);
            })
            .filter(Boolean)
            .join(' / ');
    }
    return rawSpec ? String(rawSpec) : '';
}

function parseLogisticsFromRemark(remark) {
    if (isMissing(remark)) return { logistics_company: '', tracking_no: '' };
    const text = String(remark);
    const match = text.match(/物流[:：]\s*([^\s\[\|]+)\s*([A-Za-z0-9-]+)/);
    if (!match) return { logistics_company: '', tracking_no: '' };
    return {
        logistics_company: match[1] || '',
        tracking_no: match[2] || ''
    };
}

function toIsoString(value) {
    if (isMissing(value)) return '';
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

function addDays(value, days) {
    const iso = toIsoString(value);
    if (!iso) return '';
    const date = new Date(iso);
    date.setDate(date.getDate() + days);
    return date.toISOString();
}

function pickAddressSnapshot(address) {
    if (!address || typeof address !== 'object') return null;
    return {
        receiver_name: firstFilled(address.receiver_name, address.name),
        phone: firstFilled(address.phone),
        province: firstFilled(address.province),
        city: firstFilled(address.city),
        district: firstFilled(address.district),
        detail: firstFilled(address.detail, address.address)
    };
}

function deepEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function readJson(relativePath) {
    const filePath = path.join(projectRoot, relativePath);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(relativePath, data) {
    const filePath = path.join(projectRoot, relativePath);
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function callMcporter(selector, payload) {
    const result = spawnSync(process.execPath, [
        mcporterCliPath,
        '--config',
        mcporterConfigPath,
        'call',
        selector,
        '--args',
        JSON.stringify(payload),
        '--output',
        'json'
    ], {
        cwd: workspaceRoot,
        encoding: 'utf8'
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `${selector} 执行失败`);
    }

    const stdout = (result.stdout || '').trim();
    return stdout ? JSON.parse(stdout) : null;
}

function readCloudCollection(collectionName) {
    const rows = [];
    let offset = 0;

    while (true) {
        const response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
            collectionName,
            limit: pageLimit,
            offset
        });
        const batch = response && Array.isArray(response.data) ? response.data : [];
        rows.push(...batch);
        if (batch.length < pageLimit) break;
        offset += batch.length;
    }

    return rows;
}

function updateCloudDocument(collectionName, docId, patch) {
    return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
        action: 'update',
        collectionName,
        query: { _id: docId },
        update: { $set: patch },
        isMulti: false,
        upsert: false
    });
}

function buildLookup(products, skus, users = [], refunds = [], commissions = [], stations = []) {
    const productById = new Map();
    products.forEach((product) => {
        if (!product) return;
        const keys = [product._id, product.id, product._legacy_id].filter((value) => !isMissing(value));
        keys.forEach((key) => productById.set(String(key), product));
    });

    const skuById = new Map();
    const firstSkuByProduct = new Map();
    skus.forEach((sku) => {
        if (!sku) return;
        const keys = [sku._id, sku.id, sku._legacy_id].filter((value) => !isMissing(value));
        keys.forEach((key) => skuById.set(String(key), sku));
        const productKey = !isMissing(sku.product_id) ? String(sku.product_id) : '';
        if (productKey && !firstSkuByProduct.has(productKey)) {
            firstSkuByProduct.set(productKey, sku);
        }
    });

    const userByAnyId = new Map();
    users.forEach((user) => {
        if (!user) return;
        [user._id, user.id, user._legacy_id, user.openid].filter((value) => !isMissing(value)).forEach((key) => {
            userByAnyId.set(String(key), user);
        });
    });

    const refundsByOrder = new Map();
    refunds.forEach((refund) => {
        if (!refund) return;
        [refund.order_id, refund.order_no].filter((value) => !isMissing(value)).forEach((key) => {
            const list = refundsByOrder.get(String(key)) || [];
            list.push(refund);
            refundsByOrder.set(String(key), list);
        });
    });

    const commissionsByOrder = new Map();
    commissions.forEach((commission) => {
        if (!commission) return;
        [commission.order_id, commission.order_no].filter((value) => !isMissing(value)).forEach((key) => {
            const list = commissionsByOrder.get(String(key)) || [];
            list.push(commission);
            commissionsByOrder.set(String(key), list);
        });
    });

    const stationById = new Map();
    stations.forEach((station) => {
        if (!station) return;
        [station._id, station.id, station._legacy_id].filter((value) => !isMissing(value)).forEach((key) => {
            stationById.set(String(key), station);
        });
    });

    return { productById, skuById, firstSkuByProduct, userByAnyId, refundsByOrder, commissionsByOrder, stationById };
}

function buildUserSummary(user) {
    if (!user) return null;
    return {
        id: firstFilled(user._id, user.id, user._legacy_id),
        openid: firstFilled(user.openid),
        nick_name: firstFilled(user.nickName, user.nickname),
        nickname: firstFilled(user.nickName, user.nickname),
        avatar: firstFilled(user.avatarUrl, user.avatar),
        role_level: Number(firstFilled(user.role_level, user.distributor_level, 0)) || 0
    };
}

function buildStationSummary(station) {
    if (!station) return null;
    return {
        id: firstFilled(station._id, station.id, station._legacy_id),
        name: firstFilled(station.name),
        city: firstFilled(station.city),
        address: firstFilled(station.address, station.detail),
        contact_phone: firstFilled(station.contact_phone, station.phone),
        business_time_start: firstFilled(station.business_time_start),
        business_time_end: firstFilled(station.business_time_end),
        pickup_contact: firstFilled(station.pickup_contact, station.contact_name)
    };
}

function deriveOrderPatch(order, lookup) {
    const originalItems = Array.isArray(order.items) ? order.items : [];
    const patchedItems = originalItems.map((item) => {
        const productKey = !isMissing(item.product_id) ? String(item.product_id) : '';
        const skuKey = !isMissing(item.sku_id) ? String(item.sku_id) : '';
        const product = productKey ? lookup.productById.get(productKey) : null;
        const fallbackSku = productKey ? lookup.firstSkuByProduct.get(productKey) : null;
        const sku = skuKey ? (lookup.skuById.get(skuKey) || fallbackSku) : fallbackSku;
        const productImages = normalizeImages(product?.images);
        const specValue = firstFilled(
            item.snapshot_spec,
            item.spec,
            normalizeSpec(sku?.spec || sku?.specs || sku?.spec_value || '')
        );
        const image = firstFilled(
            item.snapshot_image,
            item.image,
            sku?.image,
            productImages[0]
        );
        const name = firstFilled(
            item.snapshot_name,
            item.name,
            product?.name,
            sku?.name
        );
        const qty = Number(firstFilled(item.qty, item.quantity, 1)) || 1;
        const unitPrice = Number(firstFilled(item.unit_price, item.price, 0)) || 0;
        const itemAmount = Number(firstFilled(item.item_amount, item.subtotal, unitPrice * qty)) || 0;

        return {
            ...item,
            snapshot_name: name,
            snapshot_image: image,
            snapshot_spec: specValue,
            name: firstFilled(item.name, name),
            image: firstFilled(item.image, image),
            spec: firstFilled(item.spec, specValue),
            unit_price: firstFilled(item.unit_price, unitPrice),
            price: firstFilled(item.price, unitPrice),
            qty,
            quantity: firstFilled(item.quantity, qty),
            item_amount: firstFilled(item.item_amount, itemAmount),
            subtotal: firstFilled(item.subtotal, itemAmount)
        };
    });

    const logisticsFromRemark = parseLogisticsFromRemark(order.remark);
    const primaryItem = patchedItems[0] || {};
    const quantity = patchedItems.reduce((sum, item) => sum + (Number(item.qty || item.quantity || 0) || 0), 0);
    const addressSnapshot = order.address_snapshot || pickAddressSnapshot(order.address);
    const orderKeys = [order._id, order.id, order._legacy_id, order.order_no].filter((value) => !isMissing(value)).map((value) => String(value));
    const relatedRefunds = orderKeys.flatMap((key) => lookup.refundsByOrder.get(key) || []);
    const relatedCommissions = orderKeys.flatMap((key) => lookup.commissionsByOrder.get(key) || []);
    const buyer = lookup.userByAnyId.get(String(order.openid)) || null;
    const distributorUser = buyer && buyer.referrer_openid ? lookup.userByAnyId.get(String(buyer.referrer_openid)) : null;
    const station = order.pickup_station_id ? lookup.stationById.get(String(order.pickup_station_id)) : null;
    const paidAt = firstFilled(
        toIsoString(order.paid_at),
        !['pending_payment', 'cancelled'].includes(order.status) ? toIsoString(order.created_at) : ''
    );
    const cancelledAt = firstFilled(
        toIsoString(order.cancelled_at),
        order.status === 'cancelled' ? toIsoString(order.updated_at) : ''
    );
    const refundCompletedAt = relatedRefunds
        .filter((item) => item.status === 'completed')
        .map((item) => toIsoString(item.updated_at))
        .filter(Boolean)
        .sort()[0] || '';
    const completedAt = firstFilled(
        toIsoString(order.completed_at),
        toIsoString(order.confirmed_at),
        order.status === 'completed' ? toIsoString(order.updated_at) : ''
    );
    const confirmedAt = firstFilled(
        toIsoString(order.confirmed_at),
        completedAt
    );
    const shippedAt = firstFilled(
        toIsoString(order.shipped_at),
        (['shipped', 'completed', 'refunding', 'refunded'].includes(order.status) && firstFilled(order.tracking_no, logisticsFromRemark.tracking_no))
            ? firstFilled(toIsoString(order.updated_at), paidAt, toIsoString(order.created_at))
            : ''
    );
    const agentConfirmedAt = firstFilled(
        toIsoString(order.agent_confirmed_at),
        ['agent_confirmed', 'shipping_requested'].includes(order.status) ? firstFilled(toIsoString(order.updated_at), paidAt) : ''
    );
    const expireAt = firstFilled(
        toIsoString(order.expire_at),
        order.status === 'pending_payment' || (order.status === 'cancelled' && !paidAt) ? addMinutes(order.created_at, 30) : ''
    );
    const reviewed = order.reviewed === true || String(order.remark || '').includes('[已评价]');
    const reviewedAt = firstFilled(
        toIsoString(order.reviewed_at),
        reviewed ? firstFilled(completedAt, toIsoString(order.updated_at)) : ''
    );
    const settledCommission = relatedCommissions.find((item) => item.status === 'settled');
    const settlementAt = firstFilled(
        toIsoString(order.settlement_at),
        settledCommission ? toIsoString(settledCommission.updated_at || settledCommission.created_at) : '',
        completedAt ? addDays(completedAt, 15) : ''
    );
    const estimatedDelivery = firstFilled(
        toIsoString(order.estimated_delivery),
        shippedAt ? addDays(shippedAt, 3) : ''
    );
    const shippingTraces = Array.isArray(order.shipping_traces) && order.shipping_traces.length > 0
        ? order.shipping_traces
        : [
            toIsoString(order.created_at) ? { time: toIsoString(order.created_at), desc: '订单已创建', status: 'created' } : null,
            paidAt ? { time: paidAt, desc: '支付成功', status: 'paid' } : null,
            shippedAt ? { time: shippedAt, desc: '商家已发货', status: 'shipped' } : null,
            completedAt ? { time: completedAt, desc: '已签收', status: 'completed' } : null,
            cancelledAt ? { time: cancelledAt, desc: '订单已取消', status: 'cancelled' } : null,
            refundCompletedAt ? { time: refundCompletedAt, desc: '退款已完成', status: 'refunded' } : null
        ].filter(Boolean);
    const patch = {
        items: patchedItems,
        quantity: firstFilled(order.quantity, quantity),
        product_id: firstFilled(order.product_id, primaryItem.product_id),
        product_name: firstFilled(order.product_name, primaryItem.snapshot_name, primaryItem.name),
        product: order.product || {
            id: firstFilled(order.product_id, primaryItem.product_id),
            name: firstFilled(order.product_name, primaryItem.snapshot_name, primaryItem.name),
            images: firstFilled(primaryItem.snapshot_image, primaryItem.image) ? [firstFilled(primaryItem.snapshot_image, primaryItem.image)] : [],
            image: firstFilled(primaryItem.snapshot_image, primaryItem.image)
        },
        sku: order.sku || (firstFilled(primaryItem.snapshot_spec, primaryItem.spec) ? { spec_value: firstFilled(primaryItem.snapshot_spec, primaryItem.spec) } : null),
        address: order.address || addressSnapshot || null,
        address_snapshot: addressSnapshot || null,
        actual_price: firstFilled(order.actual_price, order.pay_amount, order.total_amount, 0),
        original_amount: firstFilled(order.original_amount, order.total_amount, order.pay_amount, 0),
        coupon_discount: firstFilled(order.coupon_discount, 0),
        points_discount: firstFilled(order.points_discount, 0),
        points_used: firstFilled(order.points_used, 0),
        paid_at: paidAt || null,
        shipped_at: shippedAt || null,
        agent_confirmed_at: agentConfirmedAt || null,
        completed_at: completedAt || null,
        confirmed_at: confirmedAt || null,
        cancelled_at: cancelledAt || null,
        expire_at: expireAt || null,
        reviewed,
        reviewed_at: reviewedAt || null,
        tracking_no: firstFilled(order.tracking_no, logisticsFromRemark.tracking_no),
        logistics_company: firstFilled(order.logistics_company, order.shipping_company, logisticsFromRemark.logistics_company),
        shipping_company: firstFilled(order.shipping_company, order.logistics_company, logisticsFromRemark.logistics_company),
        fulfillment_type: firstFilled(order.fulfillment_type, ['agent_confirmed', 'shipping_requested'].includes(order.status) ? 'Agent_Pending' : 'Platform'),
        pickupStation: buildStationSummary(station),
        pickup_station_id: firstFilled(order.pickup_station_id, station ? station._id : ''),
        pickup_code: firstFilled(order.pickup_code),
        pickup_qr_code: firstFilled(order.pickup_qr_code),
        distributor: buildUserSummary(distributorUser),
        agent: buildUserSummary(distributorUser),
        agent_info: buildUserSummary(distributorUser),
        settlement_at: settlementAt || null,
        commission_settled: order.commission_settled === true || !!settledCommission,
        estimated_delivery: estimatedDelivery || null,
        shipping_traces: shippingTraces
    };

    const changed = {};
    Object.keys(patch).forEach((key) => {
        if (!deepEqual(order[key], patch[key])) {
            changed[key] = patch[key];
        }
    });
    return changed;
}

function printReport(mode, scannedOrders, plans) {
    const fieldCounter = {};
    plans.forEach((plan) => {
        Object.keys(plan.patch).forEach((key) => {
            fieldCounter[key] = (fieldCounter[key] || 0) + 1;
        });
    });

    console.log(JSON.stringify({
        mode,
        apply: shouldApply,
        scannedOrders,
        plannedOrders: plans.length,
        fieldTouches: fieldCounter,
        samples: plans.slice(0, 10).map((plan) => ({
            order_id: plan.id,
            order_no: plan.order_no,
            fields: Object.keys(plan.patch)
        }))
    }, null, 2));
}

function runSeedMode() {
    const orders = readJson('cloudbase-seed/orders.json');
    const products = readJson('cloudbase-seed/products.json');
    const skus = readJson('cloudbase-seed/skus.json');
    const users = readJson('cloudbase-seed/users.json');
    const refunds = readJson('cloudbase-seed/refunds.json');
    const commissions = readJson('cloudbase-seed/commissions.json');
    const stations = readJson('cloudbase-seed/stations.json');
    const lookup = buildLookup(products, skus, users, refunds, commissions, stations);

    const plans = [];
    const nextOrders = orders.map((order) => {
        const patch = deriveOrderPatch(order, lookup);
        if (Object.keys(patch).length === 0) return order;
        plans.push({
            id: String(order._id),
            order_no: order.order_no,
            patch
        });
        return { ...order, ...patch };
    });

    printReport('seed', orders.length, plans);

    if (shouldApply) {
        writeJson('cloudbase-seed/orders.json', nextOrders);
    }
}

function runCloudMode() {
    assertFileExists(mcporterConfigPath, 'mcporter 配置');
    assertFileExists(mcporterCliPath, 'mcporter CLI');

    const orders = readCloudCollection('orders');
    const products = readCloudCollection('products');
    const skus = readCloudCollection('skus');
    const users = readCloudCollection('users');
    const refunds = readCloudCollection('refunds');
    const commissions = readCloudCollection('commissions');
    const stations = readCloudCollection('stations');
    const lookup = buildLookup(products, skus, users, refunds, commissions, stations);

    const plans = orders
        .map((order) => ({
            id: String(order._id),
            order_no: order.order_no,
            patch: deriveOrderPatch(order, lookup)
        }))
        .filter((plan) => Object.keys(plan.patch).length > 0);

    printReport('cloud', orders.length, plans);

    if (!shouldApply) return;

    const results = plans.map((plan) => {
        const response = updateCloudDocument('orders', plan.id, plan.patch);
        return {
            id: plan.id,
            order_no: plan.order_no,
            ok: !!(response && response.success)
        };
    });

    console.log(JSON.stringify({
        mode: 'cloud',
        apply: true,
        updatedCount: results.filter((item) => item.ok).length,
        failedCount: results.filter((item) => !item.ok).length,
        results
    }, null, 2));
}

if (useCloudSource) {
    runCloudMode();
} else {
    runSeedMode();
}
