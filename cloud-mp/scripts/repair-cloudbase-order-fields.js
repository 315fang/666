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

function buildLookup(products, skus) {
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

    return { productById, skuById, firstSkuByProduct };
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
    const patch = {
        items: patchedItems,
        quantity: firstFilled(order.quantity, quantity),
        product_id: firstFilled(order.product_id, primaryItem.product_id),
        product_name: firstFilled(order.product_name, primaryItem.snapshot_name, primaryItem.name),
        sku: order.sku || (firstFilled(primaryItem.snapshot_spec, primaryItem.spec) ? { spec_value: firstFilled(primaryItem.snapshot_spec, primaryItem.spec) } : null),
        address: order.address || addressSnapshot || null,
        address_snapshot: addressSnapshot || null,
        actual_price: firstFilled(order.actual_price, order.pay_amount, order.total_amount, 0),
        original_amount: firstFilled(order.original_amount, order.total_amount, order.pay_amount, 0),
        coupon_discount: firstFilled(order.coupon_discount, 0),
        points_discount: firstFilled(order.points_discount, 0),
        points_used: firstFilled(order.points_used, 0),
        reviewed: typeof order.reviewed === 'boolean' ? order.reviewed : String(order.remark || '').includes('[已评价]'),
        tracking_no: firstFilled(order.tracking_no, logisticsFromRemark.tracking_no),
        logistics_company: firstFilled(order.logistics_company, order.shipping_company, logisticsFromRemark.logistics_company),
        shipping_company: firstFilled(order.shipping_company, order.logistics_company, logisticsFromRemark.logistics_company)
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
    const lookup = buildLookup(products, skus);

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
    const lookup = buildLookup(products, skus);

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
