'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const { toNumber } = require('./shared/utils');

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function isEnabled(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return fallback;
    if (['false', 'no', 'off', 'disabled', 'inactive'].includes(normalized)) return false;
    return true;
}

function isSellableRecord(row = {}) {
    const raw = row.status ?? row.is_active ?? row.enabled;
    if (raw === undefined || raw === null || raw === '') return true;
    if (raw === true || raw === 1 || raw === '1') return true;
    if (raw === false || raw === 0 || raw === '0') return false;
    const normalized = String(raw).trim().toLowerCase();
    if (!normalized) return true;
    if (['true', 'yes', 'y', 'on', 'enabled', 'enable', 'active', 'show', 'visible', 'on_sale', 'published'].includes(normalized)) return true;
    if (['false', 'no', 'n', 'off', 'disabled', 'disable', 'inactive', 'hidden', 'off_sale', 'archived', 'draft'].includes(normalized)) return false;
    return true;
}

function primaryId(row = {}) {
    return row && (row._id || row.id || row._legacy_id) ? String(row._id || row.id || row._legacy_id) : '';
}

function lookupId(row = {}) {
    return row && (row.id || row._legacy_id || row._id) ? String(row.id || row._legacy_id || row._id) : '';
}

function normalizeImages(images) {
    if (!images) return [];
    if (Array.isArray(images)) return images.filter(Boolean);
    if (typeof images === 'string') {
        try {
            const parsed = JSON.parse(images);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [parsed].filter(Boolean);
        } catch (_) {
            return [images].filter(Boolean);
        }
    }
    return [];
}

function resolveProductPrice(product = {}) {
    if (hasValue(product.retail_price)) return toNumber(product.retail_price, 0);
    if (hasValue(product.price)) return toNumber(product.price, 0);
    if (hasValue(product.min_price)) return toNumber(product.min_price, 0) / 100;
    return 0;
}

function resolveSkuPrice(sku = {}, fallback = 0) {
    if (hasValue(sku.retail_price)) return toNumber(sku.retail_price, fallback);
    if (hasValue(sku.price)) return toNumber(sku.price, fallback) / 100;
    return fallback;
}

function buildSkuSpecText(sku = {}) {
    if (pickString(sku.spec_value)) return pickString(sku.spec_value);
    if (pickString(sku.spec)) return pickString(sku.spec);
    if (Array.isArray(sku.specs)) {
        return sku.specs
            .map((item) => pickString(item?.value || item?.spec_value || item?.name || ''))
            .filter(Boolean)
            .join(' / ');
    }
    return '';
}

async function findProductById(rawId) {
    const id = pickString(rawId);
    if (!id) return null;
    const num = toNumber(id, NaN);
    const [legacy, legacyText, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('products').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('products').where({ id }).limit(1).get().catch(() => ({ data: [] })),
        db.collection('products').doc(id).get().catch(() => ({ data: null }))
    ]);
    return legacy.data?.[0] || legacyText.data?.[0] || doc.data || null;
}

async function findBundleById(rawId) {
    const id = pickString(rawId);
    if (!id) return null;
    const num = toNumber(id, NaN);
    const [doc, legacy, legacyText] = await Promise.all([
        db.collection('product_bundles').doc(id).get().catch(() => ({ data: null })),
        Number.isFinite(num) ? db.collection('product_bundles').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('product_bundles').where({ id }).limit(1).get().catch(() => ({ data: [] }))
    ]);
    return doc.data || legacy.data?.[0] || legacyText.data?.[0] || null;
}

async function findSkusForProduct(product = {}) {
    const productIds = [product._id, product.id, product._legacy_id]
        .filter((value) => value !== undefined && value !== null && value !== '')
        .map(String);
    if (!productIds.length) return [];
    const numberIds = productIds.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    const queries = [];
    if (productIds.length) {
        queries.push(db.collection('skus').where({ product_id: _.in(productIds) }).limit(100).get().catch(() => ({ data: [] })));
    }
    if (numberIds.length) {
        queries.push(db.collection('skus').where({ product_id: _.in(numberIds) }).limit(100).get().catch(() => ({ data: [] })));
    }
    const results = await Promise.all(queries);
    const seen = new Set();
    return results.flatMap((result) => result.data || []).filter((sku) => {
        const key = primaryId(sku) || `${sku.product_id}:${sku.name || ''}:${sku.spec_value || sku.spec || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function pickDefaultSku(product = {}, skus = [], explicitSkuId = '') {
    const explicit = pickString(explicitSkuId);
    if (explicit) {
        return skus.find((item) => [item._id, item.id, item._legacy_id].filter(Boolean).map(String).includes(explicit)) || null;
    }
    const defaultCandidates = [product.default_sku_id, product.defaultSkuId].filter(Boolean).map(String);
    if (defaultCandidates.length) {
        const matched = skus.find((item) => [item._id, item.id, item._legacy_id].filter(Boolean).map(String).some((value) => defaultCandidates.includes(value)));
        if (matched) return matched;
    }
    return skus[0] || null;
}

function buildProductSnapshot(product = {}, sku = null) {
    const images = normalizeImages(product.images);
    const image = pickString((sku && (sku.image || sku.image_url)) || images[0] || product.image || product.image_url || product.cover_image || '');
    const basePrice = resolveProductPrice(product);
    const price = sku ? resolveSkuPrice(sku, basePrice) : basePrice;
    return {
        id: lookupId(product),
        name: pickString(product.name || product.title || '商品'),
        image,
        images: image ? [image] : images,
        retail_price: price,
        stock: toNumber((sku && sku.stock) ?? product.stock, 0),
        supports_pickup: product.supports_pickup ? 1 : 0,
        category_id: product.category_id != null ? product.category_id : null
    };
}

async function buildBundleOption(option = {}) {
    const product = await findProductById(option.product_id);
    if (!product || !isSellableRecord(product)) return null;
    const skus = (await findSkusForProduct(product)).filter(isSellableRecord);
    const resolvedSku = pickDefaultSku(product, skus, option.sku_id);
    if (pickString(option.sku_id) && !resolvedSku) return null;
    const productSnapshot = buildProductSnapshot(product, resolvedSku);
    return {
        option_key: pickString(option.option_key),
        product_id: lookupId(product),
        sku_id: resolvedSku ? lookupId(resolvedSku) : '',
        default_qty: Math.max(1, Math.floor(toNumber(option.default_qty, 1))),
        sort_order: toNumber(option.sort_order, 0),
        enabled: isEnabled(option.enabled ?? option.status, true),
        product: productSnapshot,
        sku: resolvedSku ? {
            id: lookupId(resolvedSku),
            name: pickString(resolvedSku.name || ''),
            spec_value: buildSkuSpecText(resolvedSku),
            retail_price: resolveSkuPrice(resolvedSku, productSnapshot.retail_price),
            stock: toNumber(resolvedSku.stock, 0)
        } : null
    };
}

async function normalizeBundleForClient(bundle = {}) {
    const groups = await Promise.all((Array.isArray(bundle.groups) ? bundle.groups : []).map(async (group) => {
        const options = (await Promise.all((Array.isArray(group.options) ? group.options : [])
            .filter((option) => isEnabled(option.enabled ?? option.status, true))
            .sort((left, right) => toNumber(left.sort_order, 0) - toNumber(right.sort_order, 0))
            .map((option) => buildBundleOption(option)))).filter(Boolean);
        return {
            group_key: pickString(group.group_key),
            group_title: pickString(group.group_title || group.title || ''),
            min_select: Math.max(0, Math.floor(toNumber(group.min_select, 1))),
            max_select: Math.max(1, Math.floor(toNumber(group.max_select, 1))),
            sort_order: toNumber(group.sort_order, 0),
            options
        };
    }));
    const validGroups = groups.filter((group) => group.options.length > 0);
    const optionCount = validGroups.reduce((sum, group) => sum + group.options.length, 0);
    return {
        id: primaryId(bundle),
        title: pickString(bundle.title),
        subtitle: pickString(bundle.subtitle),
        scene_type: pickString(bundle.scene_type || 'explosive_bundle', 'explosive_bundle'),
        hero_title: pickString(bundle.hero_title || bundle.title),
        hero_subtitle: pickString(bundle.hero_subtitle || bundle.subtitle),
        channel_tags: Array.isArray(bundle.channel_tags) ? bundle.channel_tags.map((item) => pickString(item)).filter(Boolean) : [],
        cover_image: pickString(bundle.cover_file_id || bundle.cover_image),
        cover_file_id: pickString(bundle.cover_file_id),
        bundle_price: Math.round(toNumber(bundle.bundle_price, 0) * 100) / 100,
        stack_policy: pickString(bundle.stack_policy, 'exclusive'),
        display_mode: pickString(bundle.display_mode, 'bundle_with_children'),
        status: isEnabled(bundle.status, true) ? 1 : 0,
        sort_order: toNumber(bundle.sort_order, 0),
        sort_weight: toNumber(bundle.sort_weight, bundle.sort_order || 0),
        publish_status: pickString(bundle.publish_status || 'published', 'published'),
        group_count: validGroups.length,
        option_count: optionCount,
        groups: validGroups
    };
}

async function listActiveBundles(params = {}) {
    const page = Math.max(1, toNumber(params.page, 1));
    const limit = Math.max(1, Math.min(50, toNumber(params.limit || params.size, 20)));
    const keyword = pickString(params.keyword).toLowerCase();
    const sceneType = pickString(params.scene_type).toLowerCase();
    const allRows = await db.collection('product_bundles').limit(200).get().catch(() => ({ data: [] }));
    let rows = (allRows.data || [])
        .filter((item) => isEnabled(item.status, true) && pickString(item.publish_status || 'published', 'published').toLowerCase() === 'published')
        .sort((left, right) => {
            const sortDiff = toNumber(right.sort_weight, right.sort_order || 0) - toNumber(left.sort_weight, left.sort_order || 0);
            if (sortDiff !== 0) return sortDiff;
            return String(left.title || '').localeCompare(String(right.title || ''), 'zh-CN');
        });
    if (keyword) {
        rows = rows.filter((item) => `${item.title || ''} ${item.subtitle || ''}`.toLowerCase().includes(keyword));
    }
    if (sceneType) {
        rows = rows.filter((item) => pickString(item.scene_type || 'explosive_bundle', 'explosive_bundle').toLowerCase() === sceneType);
    }
    const total = rows.length;
    const slice = rows.slice((page - 1) * limit, page * limit);
    const list = await Promise.all(slice.map((item) => normalizeBundleForClient(item)));
    return {
        list,
        page,
        size: limit,
        total
    };
}

async function getActiveBundleDetail(bundleId) {
    const bundle = await findBundleById(bundleId);
    if (!bundle || !isEnabled(bundle.status, true) || pickString(bundle.publish_status || 'published', 'published').toLowerCase() !== 'published') return null;
    return normalizeBundleForClient(bundle);
}

module.exports = {
    listActiveBundles,
    getActiveBundleDetail
};
