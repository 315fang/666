'use strict';

const cloud = require('wx-server-sdk');
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

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

const FLEX_BUNDLE_COMMISSION_ROLE_LEVELS = [0, 1, 2, 3, 4, 5, 6];
const FIXED_BUNDLE_COMMISSION_MODE = 'fixed';
const FIXED_BUNDLE_COMMISSION_SOURCE = 'bundle_option_fixed';

function normalizeFixedCommissionMap(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return FLEX_BUNDLE_COMMISSION_ROLE_LEVELS.reduce((result, level) => {
        const rawValue = source[level] ?? source[String(level)] ?? 0;
        result[String(level)] = roundMoney(Math.max(0, toNumber(rawValue, 0)));
        return result;
    }, {});
}

function maxFixedCommissionAmount(roleMap = {}) {
    const source = normalizeFixedCommissionMap(roleMap);
    return FLEX_BUNDLE_COMMISSION_ROLE_LEVELS.reduce((max, level) => Math.max(max, toNumber(source[String(level)], 0)), 0);
}

function normalizeCommissionPoolAmount(option = {}, maps = {}) {
    const explicit = option.commission_pool_amount ?? option.commissionPoolAmount ?? option.commission_pool ?? option.total_commission_pool;
    const explicitAmount = roundMoney(Math.max(0, toNumber(explicit, 0)));
    if (explicitAmount > 0) return explicitAmount;
    return roundMoney(Math.max(
        maxFixedCommissionAmount(maps.solo),
        maxFixedCommissionAmount(maps.direct) + maxFixedCommissionAmount(maps.indirect)
    ));
}

function primaryId(row = {}) {
    return row && (row._id || row.id || row._legacy_id) ? String(row._id || row.id || row._legacy_id) : '';
}

function lookupId(row = {}) {
    return row && (row.id || row._legacy_id || row._id) ? String(row.id || row._legacy_id || row._id) : '';
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

async function findProductById(rawId) {
    const id = pickString(rawId);
    if (!id) return null;
    const num = toNumber(id, NaN);
    const [doc, legacy, legacyText] = await Promise.all([
        db.collection('products').doc(id).get().catch(() => ({ data: null })),
        Number.isFinite(num) ? db.collection('products').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('products').where({ id }).limit(1).get().catch(() => ({ data: [] }))
    ]);
    return doc.data || legacy.data?.[0] || legacyText.data?.[0] || null;
}

async function findSkusForProduct(product = {}) {
    const productIds = [product._id, product.id, product._legacy_id]
        .filter((value) => hasValue(value))
        .map(String);
    if (!productIds.length) return [];
    const numberIds = productIds.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    const queries = [
        db.collection('skus').where({ product_id: _.in(productIds) }).limit(100).get().catch(() => ({ data: [] }))
    ];
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

function isEnabled(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return fallback;
    if (['false', 'off', 'inactive', 'disabled'].includes(normalized)) return false;
    return true;
}

function isPublishedBundle(bundle = {}) {
    return pickString(bundle.publish_status || 'published', 'published').toLowerCase() === 'published';
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

function resolveProductPrice(product = {}) {
    if (hasValue(product.retail_price)) return roundMoney(product.retail_price);
    if (hasValue(product.price)) return roundMoney(product.price);
    if (hasValue(product.min_price)) return roundMoney(toNumber(product.min_price, 0) / 100);
    return 0;
}

function resolveSkuPrice(sku = {}, fallback = 0) {
    const source = sku && typeof sku === 'object' ? sku : {};
    if (hasValue(source.retail_price)) return roundMoney(source.retail_price);
    if (hasValue(source.price)) return roundMoney(toNumber(source.price, fallback) / 100);
    return roundMoney(fallback);
}

function resolveProductImage(product = {}, sku = null) {
    if (sku && pickString(sku.image || sku.image_url)) return pickString(sku.image || sku.image_url);
    const images = Array.isArray(product.images) ? product.images : [];
    return pickString(images[0] || product.image || product.image_url || product.cover_image || '');
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

function pickResolvedSku(product = {}, skus = [], explicitSkuId = '') {
    const expected = pickString(explicitSkuId);
    if (expected) {
        const matched = skus.find((item) => [item._id, item.id, item._legacy_id].filter(Boolean).map(String).includes(expected));
        if (!matched) {
            throw new Error('组合内指定规格不存在或已下架');
        }
        return matched;
    }
    const defaultSkuCandidates = [product.default_sku_id, product.defaultSkuId].filter(Boolean).map(String);
    if (defaultSkuCandidates.length) {
        const matched = skus.find((item) => [item._id, item.id, item._legacy_id].filter(Boolean).map(String).some((value) => defaultSkuCandidates.includes(value)));
        if (matched) return matched;
    }
    return skus[0] || null;
}

function optionMatchesSelection(option = {}, selection = {}, resolvedSku = null) {
    const selectionProductId = pickString(selection.product_id || selection.productId);
    const selectionSkuId = pickString(selection.sku_id || selection.skuId);
    if (pickString(option.product_id) !== selectionProductId) return false;
    const optionSkuId = pickString(option.sku_id);
    const resolvedSkuId = resolvedSku ? primaryId(resolvedSku) : '';
    if (optionSkuId) {
        return optionSkuId === selectionSkuId || optionSkuId === resolvedSkuId;
    }
    if (selectionSkuId) {
        return selectionSkuId === resolvedSkuId;
    }
    return true;
}

async function resolveBundleContext(rawBundleContext = {}, submittedItems = []) {
    const bundleId = pickString(rawBundleContext.bundle_id || rawBundleContext.id);
    if (!bundleId) return null;

    const bundle = await findBundleById(bundleId);
    if (!bundle || !isEnabled(bundle.status, true) || !isPublishedBundle(bundle)) {
        throw new Error('产品组合不存在、未启用或未发布');
    }

    const rawGroups = Array.isArray(bundle.groups) ? bundle.groups : [];
    if (!rawGroups.length) {
        throw new Error('产品组合配置不完整');
    }

    const submittedSelections = Array.isArray(rawBundleContext.selected_items) && rawBundleContext.selected_items.length
        ? rawBundleContext.selected_items
        : submittedItems.map((item) => ({
            group_key: item.bundle_group_key || item.group_key || '',
            product_id: item.product_id,
            sku_id: item.sku_id || '',
            quantity: item.quantity || item.qty || 1
        }));

    if (!submittedSelections.length) {
        throw new Error('组合商品未完成选择');
    }

    const groupSelectionCount = new Map();
    const selectionKeys = new Set();
    const resolvedSelections = [];

    for (const selection of submittedSelections) {
        const groupKey = pickString(selection.group_key || selection.groupKey);
        const group = rawGroups.find((item) => pickString(item.group_key) === groupKey);
        if (!group) {
            throw new Error('组合分组不存在或已变更');
        }
        const options = (Array.isArray(group.options) ? group.options : []).filter((item) => isEnabled(item.enabled ?? item.status, true));
        if (!options.length) {
            throw new Error(`组合分组「${pickString(group.group_title || group.title || groupKey)}」没有可用商品`);
        }

        const product = await findProductById(selection.product_id);
        if (!product || !isSellableRecord(product)) {
            throw new Error('组合中的商品不存在或已下架');
        }
        const skus = (await findSkusForProduct(product)).filter(isSellableRecord);
        const matchingOption = (() => {
            for (const option of options) {
                if (pickString(option.product_id) !== lookupId(product)) continue;
                const resolvedSku = pickResolvedSku(product, skus, option.sku_id);
                if (optionMatchesSelection(option, selection, resolvedSku)) {
                    return { option, resolvedSku };
                }
            }
            return null;
        })();

        if (!matchingOption) {
            throw new Error(`组合分组「${pickString(group.group_title || group.title || groupKey)}」所选商品已失效`);
        }
        if (matchingOption.resolvedSku && !isSellableRecord(matchingOption.resolvedSku)) {
            throw new Error('组合中的规格不存在或已下架');
        }

        const repeatable = isEnabled(matchingOption.option.repeatable ?? matchingOption.option.allow_repeat, false);
        const maxQtyPerOrder = repeatable
            ? Math.max(1, Math.floor(toNumber(matchingOption.option.max_qty_per_order ?? matchingOption.option.max_qty, 1)))
            : 1;
        const defaultQuantity = Math.min(
            maxQtyPerOrder,
            Math.max(1, Math.floor(toNumber(matchingOption.option.default_qty, 1)))
        );
        const submittedQuantity = Math.max(1, Math.floor(toNumber(selection.quantity || selection.qty, defaultQuantity)));
        if (submittedQuantity > maxQtyPerOrder) {
            throw new Error('组合商品数量超过可选上限，请重新选择');
        }
        if (!repeatable && submittedQuantity !== 1) {
            throw new Error('该组合商品每单只能选择 1 件');
        }

        const selectionKey = `${groupKey}:${pickString(matchingOption.option.option_key)}:${lookupId(product)}:${lookupId(matchingOption.resolvedSku)}`;
        if (selectionKeys.has(selectionKey)) {
            throw new Error('组合中存在重复商品选择');
        }
        selectionKeys.add(selectionKey);
        groupSelectionCount.set(groupKey, (groupSelectionCount.get(groupKey) || 0) + submittedQuantity);

        const directCommissionMap = normalizeFixedCommissionMap(matchingOption.option.direct_commission_fixed_by_role);
        const indirectCommissionMap = normalizeFixedCommissionMap(matchingOption.option.indirect_commission_fixed_by_role);
        const soloCommissionMap = normalizeFixedCommissionMap(
            matchingOption.option.solo_commission_fixed_by_role
            || matchingOption.option.solo_commission_by_role
            || matchingOption.option.solo_commission_fixed
            || matchingOption.option.solo_commission
        );
        const commissionPoolAmount = normalizeCommissionPoolAmount(matchingOption.option, {
            solo: soloCommissionMap,
            direct: directCommissionMap,
            indirect: indirectCommissionMap
        });

        resolvedSelections.push({
            group_key: groupKey,
            group_title: pickString(group.group_title || group.title || groupKey),
            product,
            sku: matchingOption.resolvedSku,
            quantity: submittedQuantity,
            product_price: resolveSkuPrice(matchingOption.resolvedSku, resolveProductPrice(product)),
            product_image: resolveProductImage(product, matchingOption.resolvedSku),
            product_name: pickString(product.name || product.title || ''),
            spec_text: matchingOption.resolvedSku ? buildSkuSpecText(matchingOption.resolvedSku) : '',
            commission_mode: pickString(matchingOption.option.commission_mode || FIXED_BUNDLE_COMMISSION_MODE, FIXED_BUNDLE_COMMISSION_MODE),
            commission_source: pickString(matchingOption.option.commission_source || FIXED_BUNDLE_COMMISSION_SOURCE, FIXED_BUNDLE_COMMISSION_SOURCE),
            commission_pool_amount: commissionPoolAmount,
            solo_commission_fixed_by_role: soloCommissionMap,
            direct_commission_fixed_by_role: directCommissionMap,
            indirect_commission_fixed_by_role: indirectCommissionMap
        });
    }

    rawGroups.forEach((group) => {
        const groupKey = pickString(group.group_key);
        const count = groupSelectionCount.get(groupKey) || 0;
        const minSelect = Math.max(0, Math.floor(toNumber(group.min_select, 1)));
        const maxSelect = Math.max(minSelect || 1, Math.floor(toNumber(group.max_select, minSelect || 1)));
        if (count < minSelect || count > maxSelect) {
            throw new Error(`组合分组「${pickString(group.group_title || group.title || groupKey)}」选择数量不符合要求`);
        }
    });

    return {
        bundle_id: primaryId(bundle),
        bundle_price: roundMoney(bundle.bundle_price),
        bundle,
        selections: resolvedSelections,
        normalized_items: resolvedSelections.map((selection) => ({
            product_id: lookupId(selection.product),
            sku_id: selection.sku ? lookupId(selection.sku) : '',
            quantity: selection.quantity,
            bundle_group_key: selection.group_key,
            bundle_group_title: selection.group_title,
            bundle_parent_title: pickString(bundle.title),
            commission_mode: selection.commission_mode,
            commission_source: selection.commission_source,
            commission_pool_amount: selection.commission_pool_amount,
            solo_commission_fixed_by_role: selection.solo_commission_fixed_by_role,
            direct_commission_fixed_by_role: selection.direct_commission_fixed_by_role,
            indirect_commission_fixed_by_role: selection.indirect_commission_fixed_by_role
        }))
    };
}

module.exports = {
    resolveBundleContext
};
