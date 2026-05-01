'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber, toBoolean } = require('./shared/utils');
const { findUserCouponDoc, restoreUsedCoupon } = require('./order-coupon');
const { reservePickupStationInventory, releasePickupStationInventoryForOrder } = require('./pickup-station-stock');
const { resolveBundleContext } = require('./product-bundle');
const { assertPortalPassword } = require('./shared/portal-password');
const {
    normalizeSlashRecordStatus,
    resolveSlashExpiryState
} = require('./shared/slash-expiry');

const FIXED_BUNDLE_COMMISSION_MODE = 'fixed';
const FIXED_BUNDLE_COMMISSION_SOURCE = 'bundle_option_fixed';
const FIXED_BUNDLE_COMMISSION_VERSION = 'fixed_bundle_v1';

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).replace(/\s+/g, ' ').trim();
    return text || fallback;
}

function primaryId(row = {}) {
    return row && (row._id || row.id || row._legacy_id) ? String(row._id || row.id || row._legacy_id) : '';
}

function resolvePostPayStatus(order = {}) {
    const isGroupOrder = order.type === 'group'
        || order.order_type === 'group'
        || !!(order.group_activity_id || order.group_no || order.group_id);
    if (isGroupOrder) return 'pending_group';
    if (pickString(order.delivery_type).toLowerCase() === 'pickup') return 'pickup_pending';
    return 'paid';
}

function dedupeSpecParts(parts = []) {
    const seen = new Set();
    const result = [];
    (Array.isArray(parts) ? parts : []).forEach((part) => {
        const normalized = pickString(part);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        result.push(normalized);
    });
    return result;
}

function collapseRepeatedTokenSequence(text = '') {
    const tokens = pickString(text).split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) return pickString(text);
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
    return pickString(text);
}

function normalizeSpecDisplayText(rawSpec = '') {
    const text = pickString(rawSpec);
    if (!text) return '';
    if (/[·/、,，;；|]/.test(text)) {
        const parts = dedupeSpecParts(text.split(/\s*[·/、,，;；|]+\s*/));
        if (parts.length > 0) return parts.join(' / ');
    }
    return collapseRepeatedTokenSequence(text);
}

/**
 * 根据 product_id 查找商品（兼容数字 id 和文档 _id）
 */
async function findProduct(productId) {
    if (!productId) return null;
    const num = toNumber(productId, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('products').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('products').doc(String(productId)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

/**
 * 根据 sku_id 查找 SKU
 */
async function findSku(skuId) {
    if (!skuId) return null;
    const num = toNumber(skuId, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('skus').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('skus').doc(String(skuId)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

/**
 * 根据活动 ID 查找拼团活动（兼容数字 id 和文档 _id）
 */
async function findGroupActivity(activityId) {
    if (!activityId) return null;
    const num = toNumber(activityId, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('group_activities').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('group_activities').doc(String(activityId)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

async function findGroupOrder(groupNo) {
    if (!groupNo) return null;
    const res = await db.collection('group_orders')
        .where({ group_no: String(groupNo) })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function findSlashRecord(slashNo) {
    if (!slashNo) return null;
    const key = String(slashNo);
    const res = await db.collection('slash_records')
        .where(_.or([
            { slash_no: key },
            { _id: key }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function findSlashActivity(activityId) {
    if (!activityId) return null;
    const num = toNumber(activityId, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('slash_activities').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('slash_activities').doc(String(activityId)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

async function markSlashRecordExpired(record = {}) {
    if (!record || !record._id || record.status === 'expired' || record.status === 'purchased') return;
    try {
        await db.collection('slash_records').doc(String(record._id)).update({
            data: {
                status: 'expired',
                expired_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
    } catch (e) {
        console.error('[OrderCreate] ⚠️ 砍价记录失效标记失败 recordId=%s error=%s', record._id, e.message);
    }
}

async function findUserByOpenid(openid) {
    if (!openid) return null;
    const res = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function findUserByAnyId(value) {
    if (!value) return null;
    const normalized = String(value);
    const numeric = toNumber(value, NaN);
    const [byOpenid, byLegacy, byDoc] = await Promise.all([
        db.collection('users').where({ openid: normalized }).limit(1).get().catch(() => ({ data: [] })),
        Number.isFinite(numeric)
            ? db.collection('users').where(_.or([{ id: numeric }, { _legacy_id: numeric }])).limit(1).get().catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        db.collection('users').doc(normalized).get().catch(() => ({ data: null }))
    ]);
    return byOpenid.data?.[0] || byLegacy.data?.[0] || byDoc.data || null;
}

function getUserRoleLevel(user = {}) {
    return toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
}

function isAgentRoleLevel(roleLevel) {
    return toNumber(roleLevel, 0) >= 3;
}

function normalizeAgentRoleLevel(roleLevel) {
    const normalized = toNumber(roleLevel, 0);
    if (normalized >= 5) return 5;
    if (normalized === 4) return 4;
    if (normalized === 3) return 3;
    return 0;
}

function resolveFixedCommissionAmountByRole(roleMap = {}, roleLevel = 0) {
    if (!roleMap || typeof roleMap !== 'object') return 0;
    const rawValue = roleMap[roleLevel] ?? roleMap[String(roleLevel)] ?? 0;
    return roundMoney(Math.max(0, toNumber(rawValue, 0)));
}

function capCommissionAmount(amount, poolAmount = 0, alreadyAllocated = 0) {
    const normalized = roundMoney(Math.max(0, toNumber(amount, 0)));
    const pool = roundMoney(Math.max(0, toNumber(poolAmount, 0)));
    if (pool <= 0) return normalized;
    const remaining = Math.max(0, roundMoney(pool - Math.max(0, toNumber(alreadyAllocated, 0))));
    return roundMoney(Math.min(normalized, remaining));
}

function resolveBundleFixedCommissionAmounts(item = {}, directRoleLevel = 0, indirectRoleLevel = 0, hasIndirectReferrer = false) {
    const poolAmount = roundMoney(Math.max(0, toNumber(item.commission_pool_amount ?? item.commission_pool, 0)));
    if (!hasIndirectReferrer) {
        const soloAmount = resolveFixedCommissionAmountByRole(item.solo_commission_fixed_by_role, directRoleLevel);
        const directFallbackAmount = resolveFixedCommissionAmountByRole(item.direct_commission_fixed_by_role, directRoleLevel);
        return {
            direct: capCommissionAmount(soloAmount > 0 ? soloAmount : directFallbackAmount, poolAmount),
            indirect: 0
        };
    }

    const direct = capCommissionAmount(
        resolveFixedCommissionAmountByRole(item.direct_commission_fixed_by_role, directRoleLevel),
        poolAmount
    );
    const indirect = capCommissionAmount(
        resolveFixedCommissionAmountByRole(item.indirect_commission_fixed_by_role, indirectRoleLevel),
        poolAmount,
        direct
    );
    return { direct, indirect };
}

function buildBundleCommissionSnapshot(orderItems = [], isFlexBundleOrder = false) {
    if (!isFlexBundleOrder) return null;
    const items = (Array.isArray(orderItems) ? orderItems : []).map((item, index) => ({
        item_key: item.refund_item_key || `${item.product_id || 'product'}::${item.sku_id || 'nosku'}::${index}`,
        product_id: pickString(item.product_id),
        sku_id: pickString(item.sku_id),
        group_key: pickString(item.bundle_group_key),
        group_title: pickString(item.bundle_group_title),
        pool_amount: roundMoney(item.bundle_commission_pool_amount),
        direct_fixed_amount: roundMoney(item.direct_commission_fixed_amount),
        indirect_fixed_amount: roundMoney(item.indirect_commission_fixed_amount)
    }));
    return {
        mode: FIXED_BUNDLE_COMMISSION_MODE,
        source: FIXED_BUNDLE_COMMISSION_SOURCE,
        version: FIXED_BUNDLE_COMMISSION_VERSION,
        total_pool_amount: roundMoney(items.reduce((sum, item) => sum + toNumber(item.pool_amount, 0), 0)),
        direct_fixed_amount: roundMoney(items.reduce((sum, item) => sum + toNumber(item.direct_fixed_amount, 0), 0)),
        indirect_fixed_amount: roundMoney(items.reduce((sum, item) => sum + toNumber(item.indirect_fixed_amount, 0), 0)),
        items
    };
}

function resolveUserReferrer(user = {}) {
    return user.referrer_openid
        || user.parent_openid
        || user.parent_id
        || user.referrer_id
        || user.inviter_openid
        || user.inviter_id
        || null;
}

async function buildReferralChain(user, maxDepth = 8) {
    const chain = [];
    const seen = new Set();
    let currentRef = resolveUserReferrer(user);
    while (currentRef && chain.length < maxDepth) {
        const nextUser = await findUserByAnyId(currentRef);
        if (!nextUser) break;
        const key = String(nextUser.openid || nextUser._id || nextUser.id || nextUser._legacy_id || '');
        if (!key || seen.has(key)) break;
        seen.add(key);
        chain.push(nextUser);
        currentRef = resolveUserReferrer(nextUser);
    }
    return chain;
}

function buildRelationSummary(user) {
    if (!user || typeof user !== 'object') return null;
    return {
        id: user._id || user.id || user._legacy_id || '',
        openid: user.openid || '',
        nickname: user.nickName || user.nickname || '',
        role_level: getUserRoleLevel(user)
    };
}

function resolveSupplyPriceByRole(product = {}, sku = {}, roleLevel = 0) {
    const normalizedRole = normalizeAgentRoleLevel(roleLevel);
    if (!normalizedRole) return null;
    const fieldName = `supply_price_b${normalizedRole === 5 ? 3 : normalizedRole}`;
    const explicit = sku?.[fieldName] ?? product?.[fieldName];
    const amount = toNumber(explicit, NaN);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

async function findStation(stationId) {
    if (!stationId) return null;
    const num = toNumber(stationId, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('stations').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('stations').doc(String(stationId)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
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

function parseTimestamp(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const raw = String(value).trim();
        if (!raw) return 0;
        const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
            ? `${raw}T00:00:00+08:00`
            : (/(?:z|[+-]\d{2}:\d{2})$/i.test(raw) ? raw : `${raw}+08:00`);
        const ts = new Date(normalized).getTime();
        return Number.isFinite(ts) ? ts : 0;
    }
    if (typeof value === 'object') {
        if (typeof value._seconds === 'number') return value._seconds * 1000;
        if (typeof value.seconds === 'number') return value.seconds * 1000;
        if (value.$date !== undefined) return parseTimestamp(value.$date);
        if (typeof value.toDate === 'function') {
            const date = value.toDate();
            return date instanceof Date ? date.getTime() : 0;
        }
    }
    return 0;
}

function isEnabledFlag(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return fallback;
    if (['true', 'yes', 'y', 'on', 'enabled', 'enable', 'active', 'show', 'visible'].includes(normalized)) return true;
    if (['false', 'no', 'n', 'off', 'disabled', 'disable', 'inactive', 'hidden'].includes(normalized)) return false;
    return fallback;
}

function isConfigRowEnabled(row = {}) {
    if (row.active !== undefined && row.active !== null && row.active !== '') {
        return isEnabledFlag(row.active, true);
    }
    if (row.status !== undefined && row.status !== null && row.status !== '') {
        return isEnabledFlag(row.status, true);
    }
    return true;
}

function pickPreferredConfigRow(rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const enabledRows = rows.filter(isConfigRowEnabled);
    const source = enabledRows.length ? enabledRows : rows.slice();
    return source.sort((a, b) => {
        const timeDiff = parseTimestamp(b.updated_at || b.created_at) - parseTimestamp(a.updated_at || a.created_at);
        if (timeDiff !== 0) return timeDiff;
        return String(b._id || b.id || '').localeCompare(String(a._id || a.id || ''));
    })[0] || null;
}

async function getConfigByKey(key) {
    const res = await db.collection('configs')
        .where(_.or([{ config_key: key }, { key }]))
        .limit(20)
        .get()
        .catch(() => ({ data: [] }));
    const row = pickPreferredConfigRow(res.data || []);
    if (row) return row;
    const legacyRes = await db.collection('app_configs')
        .where(_.or([{ config_key: key }, { key }]))
        .limit(20)
        .get()
        .catch(() => ({ data: [] }));
    return pickPreferredConfigRow(legacyRes.data || []);
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

async function getOrderAutoCancelMinutes() {
    const singleton = await db.collection('admin_singletons')
        .doc('settings')
        .get()
        .catch(() => ({ data: null }));
    const settings = parseSingletonValue(singleton.data, {});
    const orderSettings = settings.ORDER && typeof settings.ORDER === 'object' ? settings.ORDER : {};
    return normalizeOrderAutoCancelMinutes(orderSettings.AUTO_CANCEL_MINUTES, 30);
}

async function getPointDeductionRule() {
    const row = await getConfigByKey('point_rule_config');
    const rule = parseConfigValue(row, {}) || {};
    const deduction = rule.deduction || rule.redeem || {};
    const yuanPerPoint = toNumber(
        deduction.yuan_per_point
        ?? deduction.value_per_point
        ?? rule.yuan_per_point
        ?? rule.point_value,
        0.1
    );
    const maxRatio = toNumber(
        deduction.max_order_ratio
        ?? deduction.max_deduction_ratio
        ?? rule.max_order_ratio
        ?? rule.max_deduction_ratio,
        0.7
    );
    return {
        yuanPerPoint: yuanPerPoint > 0 ? yuanPerPoint : 0.1,
        maxRatio: maxRatio > 0 ? Math.max(0.7, Math.min(1, maxRatio)) : 0.7
    };
}

function isActivityOpen(activity) {
    return activity && (
        activity.status === true
        || activity.status === 1
        || activity.status === '1'
        || activity.status === 'active'
        || activity.is_active === 1
        || activity.is_active === '1'
        || activity.is_active === true
        || activity.active === 1
        || activity.active === '1'
        || activity.active === true
    );
}

function sameProduct(activity = {}, product = {}) {
    const expected = [activity.product_id, activity.productId].filter((value) => value !== undefined && value !== null);
    const actual = [product._id, product.id, product._legacy_id].filter((value) => value !== undefined && value !== null);
    return expected.length === 0 || expected.some((left) => actual.some((right) => String(left) === String(right)));
}

function valuesOverlap(leftValues = [], rightValues = []) {
    const left = leftValues.filter(hasValue).map((value) => String(value));
    const right = new Set(rightValues.filter(hasValue).map((value) => String(value)));
    if (!left.length || !right.size) return true;
    return left.some((value) => right.has(value));
}

function assertGroupOrderInputMatches(groupOrder = {}, groupActivity = {}, inputItems = []) {
    const item = Array.isArray(inputItems) && inputItems[0] ? inputItems[0] : {};
    const activityMatches = valuesOverlap(
        [groupOrder.activity_id, groupOrder.legacy_activity_id],
        [groupActivity._id, groupActivity.id, groupActivity._legacy_id]
    );
    if (!activityMatches) throw new Error('拼团活动与订单不一致');

    const productMatches = valuesOverlap(
        [groupOrder.product_id, groupOrder.productId],
        [item.product_id, groupActivity.product_id]
    );
    if (!productMatches) throw new Error('拼团商品与订单不一致');

    const skuMatches = valuesOverlap(
        [groupOrder.sku_id, groupOrder.skuId],
        [item.sku_id]
    );
    if (!skuMatches) throw new Error('拼团规格与订单不一致');
}

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function normalizeScopeIds(value) {
    if (Array.isArray(value)) {
        return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
    }
    if (!hasValue(value)) return [];
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return Array.from(new Set(parsed.map((item) => String(item).trim()).filter(Boolean)));
                }
            } catch (_) {}
        }
        return Array.from(new Set(trimmed.split(',').map((item) => item.trim()).filter(Boolean)));
    }
    return [String(value).trim()].filter(Boolean);
}

function couponMatchesOrderItems(coupon = {}, items = []) {
    const scope = String(coupon.scope || 'all').toLowerCase();
    const scopeIds = normalizeScopeIds(coupon.scope_ids);
    if (!scope || scope === 'all' || scopeIds.length === 0) return true;

    const productIds = Array.from(new Set(
        items.flatMap((item) => [item.product_id, item.product_legacy_id])
            .filter(hasValue)
            .map((value) => String(value))
    ));
    const categoryIds = Array.from(new Set(
        items.map((item) => item.category_id)
            .filter(hasValue)
            .map((value) => String(value))
    ));

    if (scope === 'product') {
        return productIds.some((id) => scopeIds.includes(id));
    }
    if (scope === 'category') {
        return categoryIds.some((id) => scopeIds.includes(id));
    }
    return true;
}

function isHotProductTag(value) {
    return String(value || '').trim().toLowerCase() === 'hot';
}

function isRestrictedPromotionContext({ isExchangeOrder = false, groupActivity = null, slashRecord = null, limitedSpotContext = null, bundleContext = null } = {}) {
    return !!(isExchangeOrder || groupActivity || slashRecord || limitedSpotContext || bundleContext);
}

function normalizeIdList(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function parseExchangeMeta(rawMeta = {}) {
    const meta = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
    return {
        bonus_level: Math.max(0, toNumber(meta.bonus_level, 0)),
        allowed_product_ids: normalizeIdList(meta.allowed_product_ids),
        allowed_sku_ids: normalizeIdList(meta.allowed_sku_ids),
        coupon_product_value: Math.max(0, toNumber(meta.coupon_product_value, 0)),
        unlock_reward: Math.max(0, toNumber(meta.unlock_reward, 0)),
        title: String(meta.title || '').trim(),
        bind_status: String(meta.bind_status || '').trim().toLowerCase()
    };
}

function parseMaybeJsonValue(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (trimmed[0] !== '{' && trimmed[0] !== '[') return value;
    try {
        return JSON.parse(trimmed);
    } catch (_) {
        return value;
    }
}

async function findConfigDocByKeys(keys = []) {
    const normalizedKeys = normalizeIdList(keys);
    if (!normalizedKeys.length) return null;

    const configRes = await db.collection('configs')
        .where(_.or([
            { config_key: _.in(normalizedKeys) },
            { key: _.in(normalizedKeys) }
        ]))
        .limit(20)
        .get()
        .catch(() => ({ data: [] }));
    const configRow = configRes.data && configRes.data.find((item) => normalizedKeys.includes(String(item.config_key || item.key || item._id || '').trim()));
    if (configRow) {
        return {
            collection: 'configs',
            doc: configRow,
            value: parseMaybeJsonValue(configRow.config_value !== undefined ? configRow.config_value : configRow.value)
        };
    }

    const appConfigRes = await db.collection('app_configs')
        .where({ config_key: _.in(normalizedKeys), status: true })
        .limit(20)
        .get()
        .catch(() => ({ data: [] }));
    const appConfigRow = appConfigRes.data && appConfigRes.data.find((item) => normalizedKeys.includes(String(item.config_key || item.key || item._id || '').trim()));
    if (!appConfigRow) return null;
    return {
        collection: 'app_configs',
        doc: appConfigRow,
        value: parseMaybeJsonValue(appConfigRow.config_value !== undefined ? appConfigRow.config_value : appConfigRow.value)
    };
}

function normalizeLimitedSpotMode(mode, offer = {}) {
    const raw = String(mode || '').trim().toLowerCase();
    const enablePoints = isEnabledFlag(offer.enable_points, true);
    const enableMoney = isEnabledFlag(offer.enable_money, true);
    if (['points', 'point', 'redeem', 'exchange', 'limited_points'].includes(raw)) {
        return !enablePoints ? 'money' : 'points';
    }
    if (['money', 'cash', 'buy', 'sale', 'limited_money'].includes(raw)) {
        return !enableMoney ? 'points' : 'money';
    }
    if (enableMoney) return 'money';
    if (enablePoints) return 'points';
    return 'money';
}

function isExpiredTime(value) {
    if (!hasValue(value)) return false;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts <= Date.now() : false;
}

function isEnabledFlag(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return fallback;
    if (['false', 'inactive', 'disabled', 'off', 'hidden'].includes(normalized)) return false;
    if (['true', 'active', 'enabled', 'on', 'show', 'visible'].includes(normalized)) return true;
    return fallback;
}

async function countLimitedSpotReservedOrders(cardId, offerId) {
    if (!hasValue(cardId) || !hasValue(offerId)) return 0;
    const res = await db.collection('orders')
        .where({
            limited_spot_card_id: String(cardId),
            limited_spot_offer_id: String(offerId),
            status: _.neq('cancelled')
        })
        .count()
        .catch(() => ({ total: 0 }));
    return Number(res.total || 0);
}

async function countLimitedSaleReservedOrders(slotId, itemId) {
    if (!hasValue(slotId) || !hasValue(itemId)) return 0;
    const res = await db.collection('orders')
        .where({
            limited_sale_slot_id: String(slotId),
            limited_sale_item_id: String(itemId),
            status: _.neq('cancelled')
        })
        .count()
        .catch(() => ({ total: 0 }));
    return Number(res.total || 0);
}

function normalizeLimitedSalePayload(rawLimitedSale = null) {
    if (!rawLimitedSale || typeof rawLimitedSale !== 'object') return null;
    const slotId = String(rawLimitedSale.slot_id || rawLimitedSale.card_id || rawLimitedSale.id || '').trim();
    const itemId = String(rawLimitedSale.item_id || rawLimitedSale.offer_id || '').trim();
    if (!slotId || !itemId) return null;
    return {
        ...rawLimitedSale,
        slot_id: slotId,
        item_id: itemId
    };
}

function normalizeLimitedSpotPayload(rawLimitedSpot = null) {
    if (!rawLimitedSpot || typeof rawLimitedSpot !== 'object') return null;
    const cardId = String(rawLimitedSpot.card_id || rawLimitedSpot.slot_id || rawLimitedSpot.id || '').trim();
    const offerId = String(rawLimitedSpot.offer_id || rawLimitedSpot.item_id || '').trim();
    if (!cardId || !offerId) return null;
    return {
        ...rawLimitedSpot,
        card_id: cardId,
        offer_id: offerId
    };
}

function isLimitedSaleCompatFallbackError(error) {
    const message = String(error?.message || '').trim();
    return [
        '限时商品档期参数缺失',
        '限时商品档期不存在',
        '限时商品不存在或已下架'
    ].includes(message);
}

async function resolveLimitedSaleContext(rawLimitedSale = {}) {
    const normalizedLimitedSale = normalizeLimitedSalePayload(rawLimitedSale);
    if (!normalizedLimitedSale) return null;
    const slotId = String(normalizedLimitedSale.slot_id).trim();
    const itemId = String(normalizedLimitedSale.item_id).trim();
    const slotCandidates = [slotId];
    const itemCandidates = [itemId];
    const numericSlotId = Number(slotId);
    const numericItemId = Number(itemId);
    if (Number.isFinite(numericSlotId)) slotCandidates.push(numericSlotId);
    if (Number.isFinite(numericItemId)) itemCandidates.push(numericItemId);

    const [slotRes, itemRes] = await Promise.all([
        db.collection('limited_sale_slots')
            .where(_.or([{ _id: _.in(slotCandidates) }, { id: _.in(slotCandidates) }, { _legacy_id: _.in(slotCandidates) }]))
            .limit(1)
            .get()
            .catch(() => ({ data: [] })),
        db.collection('limited_sale_items')
            .where(_.or([{ _id: _.in(itemCandidates) }, { id: _.in(itemCandidates) }, { _legacy_id: _.in(itemCandidates) }]))
            .limit(1)
            .get()
            .catch(() => ({ data: [] }))
    ]);

    const slot = slotRes.data && slotRes.data[0] ? slotRes.data[0] : null;
    const item = itemRes.data && itemRes.data[0] ? itemRes.data[0] : null;
    if (!slot) throw new Error('限时商品档期不存在');
    if (!item || String(item.slot_id || '') !== slotId) throw new Error('限时商品不存在或已下架');
    if (!isEnabledFlag(slot.status ?? slot.is_active ?? slot.enabled, true)) throw new Error('限时商品档期未启用');
    if (!isEnabledFlag(item.status ?? item.is_active ?? item.enabled, true)) throw new Error('限时商品未启用');
    const startTs = parseTimestamp(slot.start_time);
    const endTs = parseTimestamp(slot.end_time);
    const nowTs = Date.now();
    if (!startTs || !endTs || startTs >= endTs) throw new Error('限时商品档期配置异常');
    if (nowTs < startTs || nowTs >= endTs) throw new Error('当前不在限时商品售卖时间内');

    const mode = normalizeLimitedSpotMode(normalizedLimitedSale.mode || (normalizedLimitedSale.redeem_points ? 'points' : ''), item);
    if (mode === 'points' && !isEnabledFlag(item.enable_points, true)) {
        throw new Error('当前限时商品不支持积分兑换');
    }
    if (mode === 'money' && !isEnabledFlag(item.enable_money, true)) {
        throw new Error('当前限时商品不支持现金购买');
    }

    const soldCount = Math.max(
        toNumber(item.sold_count, 0),
        await countLimitedSaleReservedOrders(slotId, itemId)
    );
    const stockLimit = Math.max(0, toNumber(item.stock_limit, 0));
    if (stockLimit > 0 && soldCount >= stockLimit) {
        throw new Error('当前限时商品已抢完');
    }

    return {
        source: 'limited_sale',
        cardId: slotId,
        offerId: itemId,
        cardTitle: String(slot.title || '').trim(),
        mode,
        productId: String(item.product_id || '').trim(),
        skuId: String(item.sku_id || '').trim(),
        pointsPrice: Math.max(0, toNumber(item.points_price, 0)),
        moneyPrice: Math.max(0, roundMoney(item.money_price)),
        stockLimit,
        soldCount
    };
}

async function resolveLimitedSpotContext(rawLimitedSpot = {}) {
    const normalizedLimitedSpot = normalizeLimitedSpotPayload(rawLimitedSpot);
    if (!normalizedLimitedSpot) return null;
    const cardId = String(normalizedLimitedSpot.card_id).trim();
    const offerId = String(normalizedLimitedSpot.offer_id).trim();
    if (!cardId || !offerId) {
        throw new Error('限时专享活动参数缺失');
    }

    const configDoc = await findConfigDocByKeys(['activity_links', 'activity_links_config']);
    const configValue = configDoc && configDoc.value && typeof configDoc.value === 'object' ? configDoc.value : {};
    const limitedCards = Array.isArray(configValue.limited) ? configValue.limited : [];
    const card = limitedCards.find((item) => String(item.id || item._id || '') === cardId) || null;
    if (!card) {
        throw new Error('限时专享活动不存在');
    }
    if (isExpiredTime(card.end_time || card.end_at)) {
        throw new Error('限时专享活动已结束');
    }
    if (!isEnabledFlag(card.enabled ?? card.status ?? card.is_active ?? card.active, true)) {
        throw new Error('限时专享活动未启用');
    }

    const spotProducts = Array.isArray(card.spot_products) ? card.spot_products : [];
    const offer = spotProducts.find((item) => String(item.id || item.offer_id || '') === offerId) || null;
    if (!offer) {
        throw new Error('专享商品不存在或已下架');
    }

    const mode = normalizeLimitedSpotMode(normalizedLimitedSpot.mode || (normalizedLimitedSpot.redeem_points ? 'points' : ''), offer);
    if (mode === 'points' && !isEnabledFlag(offer.enable_points, true)) {
        throw new Error('当前专享商品不支持积分兑换');
    }
    if (mode === 'money' && !isEnabledFlag(offer.enable_money, true)) {
        throw new Error('当前专享商品不支持现金购买');
    }

    const soldCount = Math.max(
        toNumber(offer.sold_count, 0),
        await countLimitedSpotReservedOrders(cardId, offerId)
    );
    const stockLimit = Math.max(0, toNumber(offer.stock_limit, 0));
    if (stockLimit > 0 && soldCount >= stockLimit) {
        throw new Error('当前专享商品已抢完');
    }

    return {
        source: 'limited_spot',
        cardId,
        offerId,
        cardTitle: String(card.title || '').trim(),
        mode,
        productId: String(offer.product_id || '').trim(),
        skuId: String(offer.sku_id || '').trim(),
        pointsPrice: Math.max(0, toNumber(offer.points_price, 0)),
        moneyPrice: Math.max(0, roundMoney(offer.money_price)),
        stockLimit,
        soldCount
    };
}

async function resolveOrderLimitedSpotContext({ limited_sale, limited_spot } = {}) {
    const normalizedLimitedSale = normalizeLimitedSalePayload(limited_sale);
    const normalizedLimitedSpot = normalizeLimitedSpotPayload(limited_spot);

    if (!normalizedLimitedSale && !normalizedLimitedSpot) return null;

    if (normalizedLimitedSale) {
        try {
            return await resolveLimitedSaleContext(normalizedLimitedSale);
        } catch (limitedSaleError) {
            if (!normalizedLimitedSpot || !isLimitedSaleCompatFallbackError(limitedSaleError)) {
                throw limitedSaleError;
            }
            try {
                console.warn('[order.create] limited_sale payload fallback to legacy limited_spot:', {
                    limitedSaleError: limitedSaleError.message,
                    slot_id: normalizedLimitedSale.slot_id,
                    item_id: normalizedLimitedSale.item_id
                });
                return await resolveLimitedSpotContext(normalizedLimitedSpot);
            } catch (_) {
                throw limitedSaleError;
            }
        }
    }

    return resolveLimitedSpotContext(normalizedLimitedSpot);
}

function centsToYuan(value, fallback = 0) {
    if (!hasValue(value)) return fallback;
    const num = toNumber(value, NaN);
    return Number.isFinite(num) ? num / 100 : fallback;
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function allocateProportionalAmounts(items = [], totalAmount = 0, field = 'item_amount') {
    const total = roundMoney(totalAmount);
    if (total <= 0 || !Array.isArray(items) || items.length === 0) {
        return items.map(() => 0);
    }

    const baseValues = items.map((item) => Math.max(0, roundMoney(item && item[field])));
    const baseTotal = roundMoney(baseValues.reduce((sum, value) => sum + value, 0));
    if (baseTotal <= 0) {
        return items.map((_, index) => index === items.length - 1 ? total : 0);
    }

    let allocatedSum = 0;
    return items.map((item, index) => {
        if (index === items.length - 1) {
            return roundMoney(total - allocatedSum);
        }
        const allocated = roundMoney(total * (baseValues[index] / baseTotal));
        allocatedSum = roundMoney(allocatedSum + allocated);
        return allocated;
    });
}

function resolveProductUnitPrice(product = {}) {
    if (hasValue(product.retail_price)) return toNumber(product.retail_price, 0);
    if (hasValue(product.price)) return toNumber(product.price, 0);
    return centsToYuan(product.min_price, 0);
}

function resolveSkuUnitPrice(sku = {}, product = {}) {
    if (!sku) return resolveProductUnitPrice(product);
    if (hasValue(sku.retail_price)) return toNumber(sku.retail_price, 0);
    if (hasValue(sku.price)) return centsToYuan(sku.price, resolveProductUnitPrice(product));
    return resolveProductUnitPrice(product);
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

function normalizeSpecValue(rawSpec) {
    if (Array.isArray(rawSpec)) {
        return normalizeSpecDisplayText(rawSpec
            .map((item) => {
                if (!item || typeof item !== 'object') return '';
                return item.value || item.spec_value || item.name || '';
            })
            .filter(Boolean)
            .join(' / '));
    }
    return normalizeSpecDisplayText(rawSpec);
}

function resolveAddressReceiverName(addressInfo = {}) {
    return addressInfo.receiver_name || addressInfo.recipient || addressInfo.contact_name || addressInfo.name || '';
}

function resolveAddressPhone(addressInfo = {}) {
    return addressInfo.phone || addressInfo.contact_phone || '';
}

function resolveAddressDetail(addressInfo = {}) {
    return addressInfo.detail || addressInfo.detail_address || addressInfo.address || '';
}

function buildAddressSnapshot(addressInfo) {
    if (!addressInfo || typeof addressInfo !== 'object') return null;
    const receiverName = resolveAddressReceiverName(addressInfo);
    const phone = resolveAddressPhone(addressInfo);
    const detail = resolveAddressDetail(addressInfo);
    return {
        receiver_name: receiverName,
        name: receiverName,
        phone,
        province: addressInfo.province || '',
        city: addressInfo.city || '',
        district: addressInfo.district || '',
        detail,
        detail_address: detail
    };
}

async function markUserCouponUsedForOrder(couponDoc, orderId) {
    if (!couponDoc || !couponDoc._id || !orderId) {
        return { ok: false, reason: 'missing_coupon_identity' };
    }
    const where = {
        _id: String(couponDoc._id),
        status: 'unused'
    };
    if (couponDoc.openid) {
        where.openid = couponDoc.openid;
    }
    const result = await db.collection('user_coupons').where(where).update({
        data: {
            status: 'used',
            used_at: db.serverDate(),
            order_id: orderId,
            used_order_id: orderId,
            updated_at: db.serverDate()
        }
    }).catch((err) => {
        console.error('[OrderCreate] 优惠券条件核销失败:', err.message);
        return { stats: { updated: 0 }, error: err };
    });
    const updated = result && result.stats && result.stats.updated > 0;
    return {
        ok: updated,
        reason: updated ? '' : 'coupon_not_unused'
    };
}

function buildUserSummary(user) {
    if (!user || typeof user !== 'object') return null;
    return {
        id: user._id || user.id || user._legacy_id || '',
        openid: user.openid || '',
        nick_name: user.nickName || user.nickname || '',
        nickname: user.nickName || user.nickname || '',
        avatar: user.avatarUrl || user.avatar || '',
        role_level: toNumber(user.role_level || user.distributor_level, 0)
    };
}

function buildStationSummary(station) {
    if (!station || typeof station !== 'object') return null;
    return {
        id: station._id || station.id || station._legacy_id || '',
        name: station.name || '',
        city: station.city || '',
        address: station.address || station.detail || '',
        contact_phone: station.contact_phone || station.phone || '',
        business_time_start: station.business_time_start || '',
        business_time_end: station.business_time_end || '',
        pickup_contact: station.pickup_contact || station.contact_name || ''
    };
}

async function getWalletAccountByOpenid(openid) {
    const userRes = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }));
    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
    if (!user) return { user: null, account: null };
    const candidates = [user.id, user._id, user._legacy_id].filter((value) => value !== null && value !== undefined && value !== '');
    for (const candidate of candidates) {
        const accountRes = await db.collection('wallet_accounts')
            .where({ user_id: candidate })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (accountRes.data && accountRes.data[0]) {
            return { user, account: accountRes.data[0] };
        }
    }
    return { user, account: null };
}

function getUserGoodsFundBalance(user = {}) {
    return toNumber(user.agent_wallet_balance != null ? user.agent_wallet_balance : user.wallet_balance, 0);
}

function sanitizeWalletAccountDocId(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function ensureWalletAccountForUser(user, seedBalance) {
    if (!user) return null;
    const candidates = [user.id, user._id, user._legacy_id].filter((value) => value !== null && value !== undefined && value !== '');
    if (!candidates.length) return null;
    const userId = candidates[0];
    const docId = `wallet-${sanitizeWalletAccountDocId(userId)}`;
    const balance = Math.max(0, Math.round(toNumber(seedBalance, 0) * 100) / 100);
    const now = db.serverDate();
    await db.collection('wallet_accounts').doc(docId).set({
        data: {
            user_id: userId,
            openid: user.openid || '',
            balance,
            account_type: 'goods_fund',
            status: 'active',
            created_at: now,
            updated_at: now
        }
    });
    return {
        _id: docId,
        id: docId,
        user_id: userId,
        openid: user.openid || '',
        balance
    };
}

async function decreaseGoodsFundLedger(openid, amount, refId, remark) {
    const { user, account: existingAccount } = await getWalletAccountByOpenid(openid);
    if (!user) throw new Error('货款账本同步失败：用户不存在');
    const account = existingAccount || await ensureWalletAccountForUser(user, getUserGoodsFundBalance(user));
    if (!account) throw new Error('货款账本同步失败：无法创建钱包账户');
    const before = toNumber(account.balance, 0);
    const after = before - amount;
    if (after < -0.0001) throw new Error('货款账本同步失败：钱包账户余额不足');

    await db.collection('wallet_accounts').doc(String(account._id)).update({
        data: {
            balance: _.inc(-amount),
            updated_at: db.serverDate()
        }
    });

    await db.collection('wallet_logs').add({
        data: {
            user_id: user.id || user._legacy_id || user._id || '',
            account_id: account.id || account._id || '',
            change_type: 'deduct',
            amount,
            balance_before: before,
            balance_after: after,
            ref_type: 'order_payment',
            ref_id: refId,
            remark,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });

    return true;
}

async function rollbackGoodsFundLedger(openid, amount, refId, remark) {
    const { user, account: existingAccount } = await getWalletAccountByOpenid(openid);
    if (!user) throw new Error('货款账本回滚失败：用户不存在');
    const account = existingAccount || await ensureWalletAccountForUser(user, getUserGoodsFundBalance(user));
    if (!account) throw new Error('货款账本回滚失败：无法创建钱包账户');
    const before = toNumber(account.balance, 0);
    const after = before + amount;

    await db.collection('wallet_accounts').doc(String(account._id)).update({
        data: {
            balance: _.inc(amount),
            updated_at: db.serverDate()
        }
    });

    await db.collection('wallet_logs').add({
        data: {
            user_id: user.id || user._legacy_id || user._id || '',
            account_id: account.id || account._id || '',
            change_type: 'refund',
            amount,
            balance_before: before,
            balance_after: after,
            ref_type: 'order_payment_rollback',
            ref_id: refId,
            remark,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });

    return true;
}

/**
 * 创建订单（含金额计算、库存校验、优惠券核销）
 */
async function createOrder(openid, orderData) {
    const {
        items,
        address_id,
        coupon_id,
        user_coupon_id,
        exchange_coupon_id,
        memo,
        delivery_type,
        pickup_station_id,
        points_to_use,
        type,
        group_activity_id,
        group_no,
        slash_no,
        use_goods_fund,   // 货款支付标志（仅代理商可用）
        limited_spot,
        limited_sale,
        bundle_context,
        portal_password
    } = orderData;
    const deliveryType = delivery_type === 'pickup' ? 'pickup' : 'express';

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('缺少商品信息');
    }
    const isExchangeOrder = !!exchange_coupon_id;
    const limitedSpotContext = await resolveOrderLimitedSpotContext({ limited_sale, limited_spot });
    if (isExchangeOrder && items.length !== 1) {
        throw new Error('兑换券订单仅支持单个商品');
    }
    if (limitedSpotContext && items.length !== 1) {
        throw new Error('限时专享订单仅支持单个商品');
    }
    const bundleContext = bundle_context ? await resolveBundleContext(bundle_context, items) : null;
    const normalizedInputItems = bundleContext ? bundleContext.normalized_items : items;

    const groupActivity = group_activity_id ? await findGroupActivity(group_activity_id) : null;
    if (group_activity_id) {
        if (!groupActivity) throw new Error('拼团活动不存在');
        if (!isActivityOpen(groupActivity)) throw new Error('拼团活动已结束');
        const endAt = groupActivity.end_time || groupActivity.end_at;
        if (endAt && new Date(endAt) < new Date()) throw new Error('拼团活动已过期');
    }
    const groupOrder = group_no ? await findGroupOrder(group_no) : null;
    if (group_no) {
        if (!groupOrder) throw new Error('拼团不存在或已结束');
        if (!['pending', 'open'].includes(String(groupOrder.status || '').trim())) {
            throw new Error('拼团已结束');
        }
        assertGroupOrderInputMatches(groupOrder, groupActivity || {}, normalizedInputItems);
    }
    const slashRecord = slash_no ? await findSlashRecord(slash_no) : null;
    let slashActivity = null;
    if (slash_no) {
        if (!slashRecord) throw new Error('砍价记录不存在');
        if (slashRecord.openid !== openid) throw new Error('砍价记录归属异常');
        if (slashRecord.status === 'purchased') throw new Error('该砍价已完成购买');
        if (slashRecord.status === 'expired') throw new Error('砍价已过期');
        slashActivity = await findSlashActivity(slashRecord.activity_id || slashRecord.legacy_activity_id);
        const slashStatus = normalizeSlashRecordStatus(slashRecord, slashActivity);
        if (slashStatus === 'expired' || resolveSlashExpiryState(slashRecord, slashActivity).expired) {
            await markSlashRecordExpired(slashRecord);
            throw new Error('砍价已过期');
        }
    }
    if (groupActivity && slashRecord) {
        throw new Error('活动订单类型冲突');
    }
    if (bundleContext && (groupActivity || slashRecord || isExchangeOrder || limitedSpotContext)) {
        throw new Error('组合订单不能与其他活动叠加');
    }
    if (limitedSpotContext && (groupActivity || slashRecord || isExchangeOrder)) {
        throw new Error('限时专享订单不能与其他活动叠加');
    }
    let exchangeCouponDoc = null;
    let exchangeMeta = null;
    if (isExchangeOrder) {
        if (groupActivity || slashRecord) throw new Error('兑换券订单不能参与活动价');
        if (coupon_id || user_coupon_id) throw new Error('兑换券订单不能叠加普通优惠券');
        if (toNumber(points_to_use, 0) > 0) throw new Error('兑换券订单不能使用积分抵扣');
        exchangeCouponDoc = await findUserCouponDoc(openid, exchange_coupon_id);
        if (!exchangeCouponDoc) throw new Error('兑换券不存在或不可用');
        if (String(exchangeCouponDoc.coupon_type || '').toLowerCase() !== 'exchange') {
            throw new Error('当前优惠券不是兑换券');
        }
        if (String(exchangeCouponDoc.status || '').toLowerCase() !== 'unused') {
            throw new Error('兑换券已使用或不可用');
        }
        exchangeMeta = parseExchangeMeta(exchangeCouponDoc.exchange_meta);
        if (!exchangeMeta.allowed_product_ids.length) {
            throw new Error('兑换券尚未绑定商品，请联系管理员');
        }
    }
    if (limitedSpotContext) {
        if (coupon_id || user_coupon_id) throw new Error('限时专享订单不能叠加普通优惠券');
        if (toNumber(points_to_use, 0) > 0) throw new Error('限时专享订单不能再使用普通积分抵扣');
        if (use_goods_fund) throw new Error('限时专享订单不支持货款余额支付');
    }
    if (bundleContext) {
        if (coupon_id || user_coupon_id) throw new Error('组合订单不能叠加普通优惠券');
        if (toNumber(points_to_use, 0) > 0) throw new Error('组合订单不能使用积分抵扣');
        if (use_goods_fund) throw new Error('组合订单不支持货款余额支付');
    }
    if (use_goods_fund) {
        await assertPortalPassword(db, openid, portal_password);
    }

    // 0. 提前获取买家信息（关系链/角色信息）和订单超时配置
    const [earlyBuyerInfo, autoCancelMinutes] = await Promise.all([
        findUserByOpenid(openid),
        getOrderAutoCancelMinutes()
    ]);
    const referralChain = earlyBuyerInfo ? await buildReferralChain(earlyBuyerInfo) : [];
    const directReferrer = referralChain[0] || null;
    const indirectReferrer = referralChain[1] || null;
    const directReferrerRoleLevel = directReferrer ? getUserRoleLevel(directReferrer) : 0;
    const indirectReferrerRoleLevel = indirectReferrer ? getUserRoleLevel(indirectReferrer) : 0;
    const nearestAgentCandidate = deliveryType === 'express'
        ? (referralChain.find((user) => isAgentRoleLevel(getUserRoleLevel(user))) || null)
        : null;
    const nearestAgentRoleLevel = nearestAgentCandidate ? normalizeAgentRoleLevel(getUserRoleLevel(nearestAgentCandidate)) : 0;
    const buyerRoleLevel = toNumber(
        earlyBuyerInfo?.role_level ?? earlyBuyerInfo?.distributor_level ?? earlyBuyerInfo?.level,
        0
    );
    const productCache = new Map();
    const skuCache = new Map();
    const findProductCached = async (productId) => {
        const key = String(productId || '').trim();
        if (!key) return null;
        if (productCache.has(key)) return productCache.get(key);
        const product = await findProduct(productId);
        productCache.set(key, product);
        return product;
    };
    const findSkuCached = async (skuId) => {
        const key = String(skuId || '').trim();
        if (!key) return null;
        if (skuCache.has(key)) return skuCache.get(key);
        const sku = await findSku(skuId);
        skuCache.set(key, sku);
        return sku;
    };
    // 1. 查商品和 SKU，计算金额
    let totalAmount = 0;
    let originalTotalAmount = 0; // 折扣前原价合计，用于优惠券门槛校验
    const orderItems = [];
    const stockDeductions = [];  // 记录已扣减的库存，供回滚用
    const lockedAgentCostCandidates = [];
    const hasRestrictedPromotionOrder = isRestrictedPromotionContext({
        isExchangeOrder,
        groupActivity,
        slashRecord,
        limitedSpotContext,
        bundleContext
    });
    const isFlexBundleOrder = !!(bundleContext && pickString(bundleContext.bundle?.scene_type) === 'flex_bundle');

    for (const item of normalizedInputItems) {
        const product = await findProductCached(item.product_id);
        if (!product) {
            throw new Error(`商品不存在: ${item.product_id}`);
        }
        if (groupActivity && !sameProduct(groupActivity, product)) {
            throw new Error('拼团商品与活动不匹配');
        }
        if (slashRecord && !sameProduct(slashRecord, product)) {
            throw new Error('砍价商品与记录不匹配');
        }

        let sku = null;
        if (item.sku_id) {
            sku = await findSkuCached(item.sku_id);
            if (!sku) {
                throw new Error(`规格不存在: ${item.sku_id}`);
            }
        }

        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        if (isExchangeOrder && qty !== 1) {
            throw new Error('兑换券订单每次只能兑换 1 件商品');
        }
        if (limitedSpotContext && qty !== 1) {
            throw new Error('限时专享订单每次只能购买 1 件商品');
        }
        if (limitedSpotContext) {
            const productIdCandidates = [product._id, product.id, item.product_id]
                .filter((value) => value !== null && value !== undefined && value !== '')
                .map((value) => String(value));
            if (!productIdCandidates.includes(limitedSpotContext.productId)) {
                throw new Error('当前商品不在专享活动范围内');
            }
            if (limitedSpotContext.skuId) {
                const skuIdCandidates = [sku && sku._id, sku && sku.id, item.sku_id]
                    .filter((value) => value !== null && value !== undefined && value !== '')
                    .map((value) => String(value));
                if (!skuIdCandidates.includes(limitedSpotContext.skuId)) {
                    throw new Error('当前规格不在专享活动范围内');
                }
            }
        }
        if (deliveryType === 'pickup' && !toBoolean(product.supports_pickup, false)) {
            throw new Error(`当前商品不支持到店自提: ${product.name || item.product_id}`);
        }

        if (deliveryType === 'express') {
            // 库存校验（乐观锁：条件扣减，防超卖）
            // 对于 SKU 优先校验 SKU 库存，否则校验商品库存
            const stockTarget = sku || product;
            const stockValue = toNumber(stockTarget.stock, -1);
            if (stockValue !== -1) {  // -1 表示不限库存
                if (stockValue < qty) {
                    throw new Error(`商品库存不足: ${product.name || item.product_id}（剩余 ${stockValue}，需要 ${qty}）`);
                }
                // 条件扣减：where stock >= qty，若 updated === 0 则说明被并发抢占
                const stockCollection = sku ? 'skus' : 'products';
                const stockDocId = String((sku || product)._id);
                const stockUpdateRes = await db.collection(stockCollection)
                    .where({ _id: stockDocId, stock: _.gte(qty) })
                    .update({ data: { stock: _.inc(-qty), updated_at: db.serverDate() } })
                    .catch(() => ({ stats: { updated: 0 } }));
                if (!stockUpdateRes.stats || stockUpdateRes.stats.updated === 0) {
                    // 并发失败，回滚已扣减库存
                    for (const { collection: c, docId: d, qty: q } of stockDeductions) {
                        try {
                            await db.collection(c).doc(d).update({ data: { stock: _.inc(q) } });
                        } catch (rollbackErr) {
                            console.error('[OrderCreate] ⚠️ 库存回滚失败(并发) collection=%s docId=%s qty=%s error=%s', c, d, q, rollbackErr.message);
                        }
                    }
                    throw new Error(`商品库存不足: ${product.name || item.product_id}（请刷新后重试）`);
                }
                stockDeductions.push({ collection: stockCollection, docId: stockDocId, qty });
            }
        }

        const activityPrice = groupActivity ? toNumber(groupActivity.group_price || groupActivity.price, 0) : null;
        const slashPrice = slashRecord ? toNumber(slashRecord.current_price || slashRecord.price, 0) : null;

        let unitPrice;
        let originalUnitPrice; // 折扣前原价，用于优惠券门槛校验
        if (isExchangeOrder) {
            const productIdCandidates = [
                product._id,
                product.id,
                item.product_id
            ].filter((value) => value !== null && value !== undefined && value !== '').map((value) => String(value));
            const skuIdCandidates = [
                sku && sku._id,
                sku && sku.id,
                item.sku_id
            ].filter((value) => value !== null && value !== undefined && value !== '').map((value) => String(value));
            if (!productIdCandidates.some((candidate) => exchangeMeta.allowed_product_ids.includes(candidate))) {
                throw new Error('该商品不在兑换券可兑换范围内');
            }
            if (exchangeMeta.allowed_sku_ids.length > 0 && !skuIdCandidates.some((candidate) => exchangeMeta.allowed_sku_ids.includes(candidate))) {
                throw new Error('该规格不在兑换券可兑换范围内');
            }
            const basePrice = resolveSkuUnitPrice(sku, product);
            unitPrice = 0;
            originalUnitPrice = basePrice;
        } else if (limitedSpotContext) {
            const basePrice = resolveSkuUnitPrice(sku, product);
            originalUnitPrice = basePrice;
            unitPrice = limitedSpotContext.mode === 'points'
                ? 0
                : limitedSpotContext.moneyPrice;
        } else if (groupActivity) {
            unitPrice = activityPrice;
            originalUnitPrice = activityPrice;
        } else if (slashRecord) {
            unitPrice = slashPrice;
            originalUnitPrice = slashPrice;
        } else {
            const basePrice = resolveSkuUnitPrice(sku, product);
            originalUnitPrice = basePrice;
            unitPrice = basePrice;
        }

        const lineTotal = Math.round(unitPrice * qty * 100) / 100;

        totalAmount += lineTotal;
        originalTotalAmount += Math.round(originalUnitPrice * qty * 100) / 100;

        const productId = String(product._id || product.id || item.product_id || '');
        const productImages = normalizeImages(product.images);
        const specValue = normalizeSpecValue(sku ? (sku.spec || sku.specs || sku.spec_value || '') : '');
        const image = sku ? (sku.image || productImages[0] || '') : (productImages[0] || '');
        const imageCandidates = [
            sku?.image,
            image,
            ...productImages,
            product.image,
            product.image_url,
            product.cover_image,
            product.cover
        ].filter(Boolean);
        const productName = product.name || sku?.name || '';
        const isExplosive = (product.is_explosive === true || product.is_explosive === 1);
        const isHotProduct = isHotProductTag(product.product_tag);
        const allowCoupon = (!hasRestrictedPromotionOrder && !isExplosive && !isHotProduct)
            ? (product.enable_coupon == null ? 1 : (product.enable_coupon ? 1 : 0))
            : 0;
        const allowPoints = (!hasRestrictedPromotionOrder && !isExplosive && !isHotProduct)
            ? (product.allow_points == null ? 1 : (product.allow_points ? 1 : 0))
            : 0;
        const lockedAgentUnitCost = nearestAgentRoleLevel
            ? resolveSupplyPriceByRole(product, sku, nearestAgentRoleLevel)
            : null;
        const bundleFixedCommission = isFlexBundleOrder
            ? resolveBundleFixedCommissionAmounts(item, directReferrerRoleLevel, indirectReferrerRoleLevel, !!indirectReferrer)
            : { direct: 0, indirect: 0 };

        orderItems.push({
            product_id: productId,
            product_legacy_id: product.id != null ? String(product.id) : '',
            category_id: product.category_id != null ? String(product.category_id) : '',
            sku_id: item.sku_id || '',
            name: productName,
            snapshot_name: productName,
            spec: specValue,
            snapshot_spec: specValue,
            image,
            snapshot_image: image,
            image_candidates: [...new Set(imageCandidates)],
            price: unitPrice,
            unit_price: unitPrice,
            original_unit_price: roundMoney(originalUnitPrice),
            qty,
            quantity: qty,
            subtotal: lineTotal,
            item_amount: lineTotal,
            original_line_amount: roundMoney(originalUnitPrice * qty),
            locked_agent_cost_candidate: lockedAgentUnitCost,
            locked_agent_cost: null,
            locked_agent_cost_total: null,
            pickup_station_stock_id: '',
            pickup_stock_reserved_qty: 0,
            pickup_locked_supply_cost: null,
            pickup_locked_supply_cost_total: null,
            is_explosive: isExplosive ? 1 : 0,
            product_tag: pickString(product.product_tag || 'normal'),
            allow_coupon: allowCoupon,
            allow_points: allowPoints,
            limited_sale_slot_id: limitedSpotContext && limitedSpotContext.source === 'limited_sale' ? limitedSpotContext.cardId : '',
            limited_sale_item_id: limitedSpotContext && limitedSpotContext.source === 'limited_sale' ? limitedSpotContext.offerId : '',
            exchange_coupon_id: isExchangeOrder ? String(exchange_coupon_id) : '',
            limited_spot_card_id: limitedSpotContext ? limitedSpotContext.cardId : '',
            limited_spot_offer_id: limitedSpotContext ? limitedSpotContext.offerId : '',
            limited_spot_mode: limitedSpotContext ? limitedSpotContext.mode : '',
            activity_type: limitedSpotContext ? (limitedSpotContext.source === 'limited_sale' ? 'limited_sale' : 'limited_spot') : (groupActivity ? 'group' : (slashRecord ? 'slash' : '')),
            group_activity_id: groupActivity ? (groupActivity._id || String(group_activity_id)) : '',
            slash_no: slashRecord ? (slashRecord.slash_no || slash_no) : '',
            bundle_scene_type: bundleContext ? pickString(bundleContext.bundle?.scene_type) : '',
            bundle_group_key: bundleContext ? pickString(item.bundle_group_key) : '',
            bundle_group_title: bundleContext ? pickString(item.bundle_group_title) : '',
            bundle_parent_title: bundleContext ? pickString(item.bundle_parent_title || bundleContext.bundle.title) : '',
            bundle_commission_mode: isFlexBundleOrder ? FIXED_BUNDLE_COMMISSION_MODE : '',
            bundle_commission_source: isFlexBundleOrder ? FIXED_BUNDLE_COMMISSION_SOURCE : '',
            bundle_commission_version: isFlexBundleOrder ? FIXED_BUNDLE_COMMISSION_VERSION : '',
            bundle_commission_pool_amount: isFlexBundleOrder ? roundMoney(item.commission_pool_amount) : 0,
            direct_commission_fixed_amount: isFlexBundleOrder && directReferrer ? bundleFixedCommission.direct : 0,
            indirect_commission_fixed_amount: isFlexBundleOrder && indirectReferrer ? bundleFixedCommission.indirect : 0
        });
        lockedAgentCostCandidates.push(lockedAgentUnitCost);
    }

    totalAmount = Math.round(totalAmount * 100) / 100;
    originalTotalAmount = Math.round(originalTotalAmount * 100) / 100;
    if (bundleContext && roundMoney(bundleContext.bundle_price) > totalAmount) {
        throw new Error('组合价不能高于所选商品原价合计，请联系管理员调整配置');
    }

    const couponAllowedByProducts = orderItems.every(it => it.allow_coupon !== 0);

    // 2. 优惠券抵扣（先计算折扣金额，暂不核销；核销放在订单创建成功之后，防止无回滚丢券）
    let couponDiscount = 0;
    const selectedCouponId = couponAllowedByProducts ? (user_coupon_id || coupon_id) : '';
    let usedCouponDocId = '';
    let usedCouponTemplateId = '';
    let pendingCouponDoc = null;  // 延迟核销的优惠券文档
    if (selectedCouponId) {
        try {
            const uc = await findUserCouponDoc(openid, selectedCouponId);
            if (uc) {
                if (uc.openid && uc.openid !== openid) throw new Error('优惠券不属于当前用户');
                if (uc.status !== 'unused') throw new Error('优惠券不可用');
                if (!couponMatchesOrderItems(uc, orderItems)) throw new Error('优惠券不适用于当前商品');
                // 门槛用折扣前原价校验，与前端展示的商品标价一致
                if (toNumber(uc.min_purchase, 0) > originalTotalAmount) throw new Error('订单金额未达到优惠券门槛');
                if (uc.coupon_type === 'percent') {
                    couponDiscount = Math.round(totalAmount * (1 - toNumber(uc.coupon_value, 100) / 100) * 100) / 100;
                } else {
                    couponDiscount = toNumber(uc.coupon_value, 0);
                }
                couponDiscount = Math.min(couponDiscount, totalAmount);
                usedCouponDocId = uc._id;
                usedCouponTemplateId = uc.coupon_id || '';
                pendingCouponDoc = uc;  // 记录待核销优惠券，等订单创建成功再核销
            } else {
                throw new Error('优惠券不存在或不可用');
            }
        } catch (err) {
            throw new Error(err.message || '优惠券处理失败');
        }
    }

    // 3. 积分抵扣（需要所有商品都允许积分抵扣）
    let pointsDiscount = 0;
    let actualPoints = 0;
    const usePoints = toNumber(points_to_use, 0);
    const pointsAllowedByProducts = orderItems.every(it => it.allow_points !== 0);
    if (limitedSpotContext && limitedSpotContext.mode === 'points') {
        actualPoints = Math.max(0, Math.floor(limitedSpotContext.pointsPrice));
        if (actualPoints < 1) {
            throw new Error('当前专享商品积分价异常，请稍后再试');
        }
        const pointDeductRes = await db.collection('users')
            .where({ openid, points: _.gte(actualPoints) })
            .update({
                data: { points: _.inc(-actualPoints), growth_value: _.inc(-actualPoints), updated_at: db.serverDate() }
            })
            .catch(() => ({ stats: { updated: 0 } }));
        if (!pointDeductRes.stats || pointDeductRes.stats.updated === 0) {
            throw new Error(`积分不足，当前兑换需要 ${actualPoints} 积分`);
        }
        pointsDiscount = 0;
    } else if (!isExchangeOrder && usePoints > 0 && pointsAllowedByProducts) {
        try {
            const userRes = await db.collection('users').where({ openid }).limit(1).get();
            if (userRes.data && userRes.data.length > 0) {
                const userPoints = toNumber(userRes.data[0].points, 0);
                const { yuanPerPoint, maxRatio } = await getPointDeductionRule();
                const maxPointsByRatio = Math.floor((Math.max(0, totalAmount - couponDiscount) * maxRatio) / yuanPerPoint);
                actualPoints = Math.max(0, Math.min(Math.floor(usePoints), userPoints, maxPointsByRatio));
                pointsDiscount = Math.round(actualPoints * yuanPerPoint * 100) / 100;
                // 扣减积分（条件写入：points >= actualPoints，防并发扣成负数）
                if (actualPoints > 0) {
                    const pointDeductRes = await db.collection('users')
                        .where({ openid, points: _.gte(actualPoints) })
                        .update({
                            data: { points: _.inc(-actualPoints), growth_value: _.inc(-actualPoints), updated_at: db.serverDate() }
                        });
                    if (!pointDeductRes.stats || pointDeductRes.stats.updated === 0) {
                        // 积分不足（被并发抢占），回退为不使用积分
                        console.warn('[OrderCreate] 积分余额不足（并发），回退为不使用积分');
                        actualPoints = 0;
                        pointsDiscount = 0;
                    }
                }
            }
        } catch (err) {
            // 积分扣减失败时，清零已计算值，保证 payAmount 正确，不给用户虚假折扣
            console.error('[OrderCreate] 积分抵扣失败，已回退为不使用积分:', err);
            actualPoints = 0;
            pointsDiscount = 0;
        }
    }

    const bundleDiscount = bundleContext
        ? Math.max(0, roundMoney(totalAmount - roundMoney(bundleContext.bundle_price)))
        : 0;

    // 4. 计算最终支付金额
    let payAmount = totalAmount - bundleDiscount - couponDiscount - pointsDiscount;
    payAmount = Math.max(0, Math.round(payAmount * 100) / 100);

    const bundleAllocations = allocateProportionalAmounts(orderItems, bundleDiscount, 'item_amount');
    const couponAllocations = allocateProportionalAmounts(orderItems, couponDiscount, 'item_amount');
    const pointsAllocations = allocateProportionalAmounts(orderItems, pointsDiscount, 'item_amount');
    orderItems.forEach((item, index) => {
        const bundleAllocatedAmount = roundMoney(bundleAllocations[index]);
        const couponAllocatedAmount = roundMoney(couponAllocations[index]);
        const pointsAllocatedAmount = roundMoney(pointsAllocations[index]);
        item.bundle_discount_allocated_amount = bundleAllocatedAmount;
        item.coupon_allocated_amount = couponAllocatedAmount;
        item.points_allocated_amount = pointsAllocatedAmount;
        item.cash_paid_allocated_amount = roundMoney(item.item_amount - bundleAllocatedAmount - couponAllocatedAmount - pointsAllocatedAmount);
        item.refunded_cash_amount = 0;
        item.refunded_quantity = 0;
        item.refund_basis_version = 'snapshot_v1';
        item.refund_item_key = `${item.product_id || 'product'}::${item.sku_id || 'nosku'}::${index}`;
    });

    // 5. 查收货地址
    let addressInfo = null;
    // earlyBuyerInfo 已在步骤 0 获取，复用即可
    const buyerInfo = earlyBuyerInfo;
    const pickupStationInfo = pickup_station_id ? await findStation(pickup_station_id) : null;
    const distributorInfo = buyerInfo && buyerInfo.referrer_openid ? await findUserByOpenid(buyerInfo.referrer_openid) : null;

    if (address_id) {
        try {
            const addrRes = await db.collection('addresses').doc(address_id).get();
            if (addrRes.data) {
                // 校验地址归属，防止使用他人地址
                if (addrRes.data.openid && addrRes.data.openid !== openid) {
                    throw new Error('地址不属于当前用户');
                }
                addressInfo = addrRes.data;
            }
        } catch (err) {
            if (err.message === '地址不属于当前用户') throw err;
            // 地址读取失败时允许继续（地址信息非强制）
        }
    }

    if (deliveryType === 'express') {
        if (!addressInfo) {
            throw new Error('收货地址不存在或不可用');
        }
        if (!resolveAddressReceiverName(addressInfo).trim()) {
            throw new Error('收货地址缺少收货人姓名，请重新填写后再下单');
        }
    } else {
        if (!pickupStationInfo) {
            throw new Error('自提门店不存在');
        }
        const stationStatus = String(pickupStationInfo.status || 'active').toLowerCase();
        const isPickupPoint = pickupStationInfo.is_pickup_point ?? pickupStationInfo.pickup_enabled ?? 1;
        if (stationStatus !== 'active') {
            throw new Error('自提门店未启用');
        }
        if (!toBoolean(isPickupPoint)) {
            throw new Error('当前门店不支持自提');
        }
    }

    // 6. 生成订单号
    const orderNo = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);
    let pickupReservation = null;
    if (deliveryType === 'pickup') {
        pickupReservation = await reservePickupStationInventory(db, {
            stationId: pickup_station_id,
            orderNo,
            items: orderItems
        });
    }
    const totalQuantity = orderItems.reduce((sum, item) => sum + Math.max(1, toNumber(item.qty || item.quantity, 1)), 0);
    const primaryItem = orderItems[0] || {};
    const addressSnapshot = buildAddressSnapshot(addressInfo);
    const pickupStationSummary = buildStationSummary(pickupStationInfo);
    const distributorSummary = buildUserSummary(directReferrer || distributorInfo);
    const indirectReferrerSummary = buildRelationSummary(indirectReferrer);
    const nearestAgentSummary = buildRelationSummary(nearestAgentCandidate);
    const canAgentFulfill = !isExchangeOrder
        && !!nearestAgentCandidate
        && nearestAgentRoleLevel > 0
        && lockedAgentCostCandidates.length > 0
        && lockedAgentCostCandidates.every((value) => Number.isFinite(value) && value > 0);
    const fulfillmentPartnerSummary = canAgentFulfill ? buildUserSummary(nearestAgentCandidate) : null;
    const pickupReservationMap = new Map((pickupReservation?.reservations || []).map((entry) => [entry.itemKey, entry]));
    const normalizedOrderItems = orderItems.map((item) => {
        const pickupReservationLine = pickupReservationMap.get(item.refund_item_key);
        if (!canAgentFulfill) {
            return {
                ...item,
                locked_agent_cost_candidate: undefined,
                locked_agent_cost: null,
                locked_agent_cost_total: null,
                pickup_station_stock_id: pickupReservationLine?.stock_id || '',
                pickup_stock_reserved_qty: pickupReservationLine?.quantity || 0,
                pickup_locked_supply_cost: pickupReservationLine ? roundMoney(pickupReservationLine.unit_cost) : null,
                pickup_locked_supply_cost_total: pickupReservationLine ? roundMoney(pickupReservationLine.total_cost) : null
            };
        }
        const lockedAgentCost = roundMoney(item.locked_agent_cost_candidate);
        return {
            ...item,
            locked_agent_cost_candidate: undefined,
            locked_agent_cost: lockedAgentCost,
            locked_agent_cost_total: roundMoney(lockedAgentCost * Math.max(1, toNumber(item.qty || item.quantity, 1))),
            pickup_station_stock_id: pickupReservationLine?.stock_id || '',
            pickup_stock_reserved_qty: pickupReservationLine?.quantity || 0,
            pickup_locked_supply_cost: pickupReservationLine ? roundMoney(pickupReservationLine.unit_cost) : null,
            pickup_locked_supply_cost_total: pickupReservationLine ? roundMoney(pickupReservationLine.total_cost) : null
        };
    });
    const bundleMeta = bundleContext ? {
        id: bundleContext.bundle_id,
        title: pickString(bundleContext.bundle.title),
        subtitle: pickString(bundleContext.bundle.subtitle),
        scene_type: pickString(bundleContext.bundle.scene_type),
        cover_image: pickString(bundleContext.bundle.cover_file_id || bundleContext.bundle.cover_image || ''),
        cover_file_id: pickString(bundleContext.bundle.cover_file_id || ''),
        bundle_price: roundMoney(bundleContext.bundle_price),
        original_amount: roundMoney(totalAmount),
        discount_amount: roundMoney(bundleDiscount),
        commission_mode: isFlexBundleOrder ? FIXED_BUNDLE_COMMISSION_MODE : '',
        commission_source: isFlexBundleOrder ? FIXED_BUNDLE_COMMISSION_SOURCE : '',
        display_mode: 'bundle_with_children',
        stack_policy: 'exclusive',
        groups: bundleContext.selections.map((selection) => ({
            group_key: selection.group_key,
            group_title: selection.group_title,
            product_id: primaryId(selection.product),
            sku_id: selection.sku ? primaryId(selection.sku) : '',
            quantity: selection.quantity,
            name: selection.product_name,
            image: selection.product_image,
            spec: selection.spec_text,
            unit_price: selection.product_price
        }))
    } : null;
    const bundleCommissionSnapshot = buildBundleCommissionSnapshot(normalizedOrderItems, isFlexBundleOrder);
    const lockedAgentCostTotal = canAgentFulfill
        ? roundMoney(normalizedOrderItems.reduce((sum, item) => sum + toNumber(item.locked_agent_cost_total, 0), 0))
        : 0;

    const shouldAutoPayFreeOrder = !use_goods_fund
        && payAmount <= 0
        && limitedSpotContext
        && limitedSpotContext.mode === 'points';
    const initialOrderStatus = shouldAutoPayFreeOrder
        ? resolvePostPayStatus({
            type: limitedSpotContext.source === 'limited_sale' ? 'limited_sale' : 'limited_spot',
            delivery_type: deliveryType,
            group_activity_id,
            group_no
        })
        : 'pending_payment';

    // 7. 构建订单
    const order = {
        order_no: orderNo,
        openid,
        status: initialOrderStatus,
        items: normalizedOrderItems,
        product_id: primaryItem.product_id || '',
        product_name: primaryItem.snapshot_name || primaryItem.name || '',
        product: {
            id: primaryItem.product_id || '',
            name: primaryItem.snapshot_name || primaryItem.name || '',
            images: primaryItem.snapshot_image ? [primaryItem.snapshot_image] : [],
            image: primaryItem.snapshot_image || ''
        },
        quantity: totalQuantity,
        sku: primaryItem.snapshot_spec || primaryItem.spec ? { spec_value: primaryItem.snapshot_spec || primaryItem.spec } : null,
        total_amount: totalAmount,
        original_amount: totalAmount,
        bundle_discount: bundleDiscount,
        coupon_discount: couponDiscount,
        points_discount: pointsDiscount,
        points_used: actualPoints,
        role_discount_rate: 1,
        buyer_role_level: buyerRoleLevel,
        pay_amount: payAmount,
        actual_price: payAmount,
        payment_method: shouldAutoPayFreeOrder ? '' : '',
        pay_channel: shouldAutoPayFreeOrder ? 'free' : '',
        paid_at: shouldAutoPayFreeOrder ? db.serverDate() : null,
        pay_time: shouldAutoPayFreeOrder ? db.serverDate() : null,
        bundle_id: bundleContext ? bundleContext.bundle_id : '',
        bundle_meta: bundleMeta,
        bundle_commission_snapshot: bundleCommissionSnapshot,
        refunded_cash_total: 0,
        refunded_quantity_total: 0,
        reward_points_clawback_total: 0,
        growth_clawback_total: 0,
        has_partial_refund: false,
        payment_method: '',
        pay_channel: shouldAutoPayFreeOrder ? 'free' : '',
        address_id: address_id || '',
        address: addressSnapshot,
        address_snapshot: addressSnapshot,
        delivery_type: deliveryType,
        pickup_station_id: pickup_station_id || '',
        pickupStation: pickupStationSummary,
        pickup_station_claimant_id: pickupStationInfo?.pickup_claimant_id || pickupStationInfo?.claimant_id || null,
        pickup_station_claimant_openid: String(pickupStationInfo?.pickup_claimant_openid || pickupStationInfo?.claimant_openid || ''),
        direct_referrer_id: directReferrer?._id || directReferrer?.id || directReferrer?._legacy_id || '',
        direct_referrer_openid: directReferrer?.openid || '',
        direct_referrer_role_level: directReferrer ? getUserRoleLevel(directReferrer) : 0,
        indirect_referrer_id: indirectReferrer?._id || indirectReferrer?.id || indirectReferrer?._legacy_id || '',
        indirect_referrer_openid: indirectReferrer?.openid || '',
        indirect_referrer_role_level: indirectReferrer ? getUserRoleLevel(indirectReferrer) : 0,
        nearest_agent_id: nearestAgentCandidate?._id || nearestAgentCandidate?.id || nearestAgentCandidate?._legacy_id || '',
        nearest_agent_openid: nearestAgentCandidate?.openid || '',
        nearest_agent_role_level: nearestAgentRoleLevel || 0,
        fulfillment_partner_id: fulfillmentPartnerSummary?.id || '',
        fulfillment_partner_openid: fulfillmentPartnerSummary?.openid || '',
        fulfillment_partner_role_level: fulfillmentPartnerSummary?.role_level || 0,
        distributor: distributorSummary,
        agent: fulfillmentPartnerSummary,
        agent_info: fulfillmentPartnerSummary,
        tracking_no: '',
        logistics_company: '',
        shipping_company: '',
        shipping_traces: [],
        reviewed: false,
        fulfillment_type: canAgentFulfill ? 'agent' : 'platform',
        locked_agent_cost: canAgentFulfill ? lockedAgentCostTotal : null,
        locked_agent_cost_total: canAgentFulfill ? lockedAgentCostTotal : null,
        middle_commission_total: 0,
        coupon_id: isExchangeOrder ? (exchangeCouponDoc?.coupon_id || '') : (usedCouponTemplateId || coupon_id || ''),
        user_coupon_id: isExchangeOrder ? (exchangeCouponDoc?._id || '') : (usedCouponDocId || user_coupon_id || ''),
        exchange_coupon_id: isExchangeOrder ? String(exchange_coupon_id) : '',
        exchange_meta: isExchangeOrder ? exchangeMeta : null,
        limited_sale_slot_id: limitedSpotContext && limitedSpotContext.source === 'limited_sale' ? limitedSpotContext.cardId : '',
        limited_sale_item_id: limitedSpotContext && limitedSpotContext.source === 'limited_sale' ? limitedSpotContext.offerId : '',
        limited_spot_card_id: limitedSpotContext ? limitedSpotContext.cardId : '',
        limited_spot_offer_id: limitedSpotContext ? limitedSpotContext.offerId : '',
        limited_spot_mode: limitedSpotContext ? limitedSpotContext.mode : '',
        limited_spot_title: limitedSpotContext ? limitedSpotContext.cardTitle : '',
        limited_spot_points_price: limitedSpotContext ? limitedSpotContext.pointsPrice : 0,
        limited_spot_money_price: limitedSpotContext ? limitedSpotContext.moneyPrice : 0,
        limited_spot: limitedSpotContext ? {
            card_id: limitedSpotContext.cardId,
            offer_id: limitedSpotContext.offerId,
            mode: limitedSpotContext.mode,
            title: limitedSpotContext.cardTitle,
            points_price: limitedSpotContext.pointsPrice,
            money_price: limitedSpotContext.moneyPrice
        } : null,
        limited_sale: limitedSpotContext && limitedSpotContext.source === 'limited_sale' ? {
            slot_id: limitedSpotContext.cardId,
            item_id: limitedSpotContext.offerId,
            mode: limitedSpotContext.mode,
            title: limitedSpotContext.cardTitle,
            points_price: limitedSpotContext.pointsPrice,
            money_price: limitedSpotContext.moneyPrice
        } : null,
        memo: memo || '',
        referrer_openid: directReferrer?.openid || '',
        type: bundleContext
            ? 'bundle'
            : (isExchangeOrder ? 'exchange' : (limitedSpotContext ? (limitedSpotContext.source === 'limited_sale' ? 'limited_sale' : 'limited_spot') : (groupActivity ? 'group' : (slashRecord ? 'slash' : (type || 'normal'))))),
        group_activity_id: groupActivity ? (groupActivity._id || String(group_activity_id)) : '',
        legacy_group_activity_id: groupActivity ? (groupActivity.id || groupActivity._legacy_id || group_activity_id) : '',
        group_no: group_no || '',
        group_joined_at: null,
        slash_no: slashRecord ? (slashRecord.slash_no || slash_no) : '',
        slash_record_id: slashRecord ? slashRecord._id : '',
        slash_activity_id: slashRecord ? slashRecord.activity_id || slashRecord.legacy_activity_id || '' : '',
        payment_timeout_minutes: autoCancelMinutes,
        expire_at: db.serverDate({ offset: autoCancelMinutes * 60 * 1000 }),
        // 标记库存已在创单时扣减，防止 payment-callback 的 ensureStockDeducted 重复扣
        stock_deducted_at: deliveryType === 'express' && stockDeductions.length > 0 ? db.serverDate() : null,
        pickup_stock_reservation_mode: deliveryType === 'pickup' ? 'station' : '',
        pickup_stock_reservation_status: deliveryType === 'pickup' ? 'reserved' : '',
        pickup_stock_reserved_at: deliveryType === 'pickup' ? db.serverDate() : null,
        pickup_locked_supply_cost_total: pickupReservation ? roundMoney(pickupReservation.locked_supply_total) : 0,
        pickup_stock_settlement_status: deliveryType === 'pickup' ? 'pending' : '',
        pickup_stock_settled_at: null,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
    };

    // 7.1 货款支付前置校验（在写库前验证，避免创建无效订单）
    if (use_goods_fund) {
        const freshUser = await db.collection('users').where({ openid }).limit(1).get();
        const u = freshUser.data[0] || {};
const freshBalance = toNumber(u.agent_wallet_balance, 0);
            if (freshBalance < payAmount) {
                if (actualPoints > 0) {
                    try {
                        await db.collection('users').where({ openid }).update({
                            data: { points: _.inc(actualPoints), growth_value: _.inc(actualPoints), updated_at: db.serverDate() }
                        });
                    } catch (ptsErr) {
                        console.error('[OrderCreate] ⚠️ 积分回滚失败(货款余额不足) openid=%s points=%s error=%s', openid, actualPoints, ptsErr.message);
                    }
                }
                for (const { collection, docId, qty } of stockDeductions) {
                    try {
                        await db.collection(collection).doc(docId).update({ data: { stock: _.inc(qty) } });
                    } catch (stockErr) {
                        console.error('[OrderCreate] ⚠️ 库存回滚失败(货款余额不足) collection=%s docId=%s qty=%s error=%s', collection, docId, qty, stockErr.message);
                    }
                }
                if (pickupReservation) {
                    await releasePickupStationInventoryForOrder(db, {
                        _id: `precheck-${orderNo}`,
                        id: `precheck-${orderNo}`,
                        order_no: orderNo,
                        pickup_station_id: pickup_station_id,
                        items: normalizedOrderItems,
                        pickup_stock_reservation_status: 'reserved'
                    }, '货款余额不足，释放自提门店预占库存').catch((pickupErr) => {
                        console.error('[OrderCreate] ⚠️ 自提库存回滚失败(货款余额不足):', pickupErr.message);
                    });
                }
                try {
                    await db.collection('rollback_error_logs').add({
                        data: {
                            context: 'goods_fund_insufficient',
                            openid,
                            order_no: orderNo,
                            rollback_errors: [{ step: 'goods_fund_insufficient_rollback', error: 'Balance too low' }],
                            original_error: `货款余额不足: 当前余额 ¥${freshBalance.toFixed(2)}, 订单金额 ¥${payAmount.toFixed(2)}`,
                            created_at: db.serverDate()
                        }
                    });
                } catch (_) { }
            throw new Error(`货款余额不足，当前余额 ¥${freshBalance.toFixed(2)}，订单金额 ¥${payAmount.toFixed(2)}`);
        }
    }

    // 创单失败或订单被业务保护取消时，回滚已扣积分和库存（必须记录回滚结果，防止静默丢失）
    async function rollbackCreateFailure(context, actualPts, stockDeductionsList, pickupRes, orderNumber, createErr) {
        const rollbackErrors = [];
        if (actualPts > 0) {
            try {
                await db.collection('users').where({ openid }).update({
                    data: { points: _.inc(actualPts), growth_value: _.inc(actualPts), updated_at: db.serverDate() }
                });
            } catch (ptsErr) {
                rollbackErrors.push({ step: 'points_rollback', error: ptsErr.message || String(ptsErr) });
                console.error('[OrderCreate] ⚠️ 积分回滚失败! openid=%s, points=%s, error=%s', openid, actualPts, ptsErr.message);
            }
        }
        for (const { collection, docId, qty } of stockDeductionsList) {
            try {
                await db.collection(collection).doc(docId).update({ data: { stock: _.inc(qty) } });
            } catch (stockErr) {
                rollbackErrors.push({ step: 'stock_rollback', collection, docId, qty, error: stockErr.message || String(stockErr) });
                console.error('[OrderCreate] ⚠️ 库存回滚失败! collection=%s, docId=%s, qty=%s, error=%s', collection, docId, qty, stockErr.message);
            }
        }
        if (pickupRes) {
            try {
                await releasePickupStationInventoryForOrder(db, {
                    _id: `failed-create-${orderNumber}`,
                    id: `failed-create-${orderNumber}`,
                    order_no: orderNumber,
                    pickup_station_id: pickup_station_id,
                    items: normalizedOrderItems,
                    pickup_stock_reservation_status: 'reserved'
                }, '订单创建失败，释放自提门店预占库存');
            } catch (pickupErr) {
                rollbackErrors.push({ step: 'pickup_rollback', error: pickupErr.message || String(pickupErr) });
                console.error('[OrderCreate] ⚠️ 自提库存回滚失败! error=%s', pickupErr.message);
            }
        }
        if (rollbackErrors.length > 0) {
            try {
                await db.collection('rollback_error_logs').add({
                    data: {
                        context,
                        openid,
                        order_no: orderNumber,
                        rollback_errors: rollbackErrors,
                        original_error: createErr.message || String(createErr),
                        created_at: db.serverDate()
                    }
                });
            } catch (_) { /* 日志写入失败不影响主流程 */ }
        }
    }

    let result;
    try {
        result = await db.collection('orders').add({ data: order });
    } catch (addErr) {
        await rollbackCreateFailure('order_add_failed', actualPoints, stockDeductions, pickupReservation, orderNo, addErr);
        throw new Error('创建订单失败，已回滚积分与库存: ' + addErr.message);
    }

    // 7.5 订单创建成功后，执行优惠券条件核销。核销失败必须取消订单并回滚折扣相关副作用。
    const couponDocToUse = isExchangeOrder ? exchangeCouponDoc : pendingCouponDoc;
    if (couponDocToUse?._id) {
        const couponMark = await markUserCouponUsedForOrder(couponDocToUse, result._id);
        if (!couponMark.ok) {
            const reason = '优惠券已被使用或不可用，请重新下单';
            await db.collection('orders').doc(result._id).update({
                data: {
                    status: 'cancelled',
                    cancel_reason: reason,
                    cancelled_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            }).catch((cancelErr) => {
                console.error('[OrderCreate] ⚠️ 优惠券核销失败后的订单取消失败 orderId=%s error=%s', result._id, cancelErr.message);
            });
            await rollbackCreateFailure('coupon_mark_failed', actualPoints, stockDeductions, pickupReservation, orderNo, new Error(reason));
            throw new Error(reason);
        }
    }

    async function restoreCouponForCancelledOrder(reason) {
        if (!couponDocToUse?._id) return;
        await restoreUsedCoupon({
            openid,
            user_coupon_id: order.user_coupon_id,
            coupon_id: order.coupon_id
        }).catch((couponErr) => {
            console.error('[OrderCreate] ⚠️ 订单取消后优惠券恢复失败 orderId=%s reason=%s error=%s', result._id, reason, couponErr.message);
        });
    }
    // 积分已在步骤3扣减，写流水便于用户查询和对账
    if (actualPoints > 0) {
        await db.collection('point_logs').add({
            data: {
                openid,
                type: 'deduct',
                amount: -actualPoints,
                source: 'order_pay',
                order_id: result._id,
                order_no: orderNo,
                description: `购买商品抵扣 ${actualPoints} 积分`,
                created_at: db.serverDate()
            }
        }).catch((err) => {
            console.error('[OrderCreate] 积分流水写入失败（不影响下单）:', err.message);
        });
    }

    if (shouldAutoPayFreeOrder) {
        cloud.callFunction({
            name: 'payment',
            data: { action: '_postProcessPaid', order_id: result._id, internal_source: 'order-create' }
        }).catch((err) => {
            console.error('[OrderCreate] 零元积分订单支付后处理调用失败（不影响下单）:', err.message);
        });
    }

    // 7.8 货款支付：原子扣减余额并将订单直接标为已付款
    let goodsFundPaid = false;
    if (use_goods_fund) {
        const orderId = result._id;
        let goodsFundDeducted = false;
        try {
            // 原子扣减：where agent_wallet_balance >= payAmount，防并发超扣
            const deductRes = await db.collection('users')
                .where({ openid, agent_wallet_balance: _.gte(payAmount) })
                .update({
                    data: {
                        agent_wallet_balance: _.inc(-payAmount),
                        goods_fund_total_spent: _.inc(payAmount),
                        updated_at: db.serverDate()
                    }
                });
            if (!deductRes.stats || deductRes.stats.updated === 0) {
                await db.collection('orders').doc(orderId).update({
                    data: { status: 'cancelled', cancel_reason: '货款余额不足（并发）', updated_at: db.serverDate() }
                }).catch((cancelErr) => {
                    console.error('[OrderCreate] ⚠️ 订单取消写入失败(货款并发不足) orderId=%s error=%s', orderId, cancelErr.message);
                });
                await restoreCouponForCancelledOrder('货款余额不足（并发）');
                if (actualPoints > 0) {
                    await db.collection('users').where({ openid }).update({
                        data: { points: _.inc(actualPoints), growth_value: _.inc(actualPoints), updated_at: db.serverDate() }
                    }).catch((ptsErr) => {
                        console.error('[OrderCreate] ⚠️ 积分回滚失败(货款不足) openid=%s points=%s error=%s', openid, actualPoints, ptsErr.message);
                    });
                }
                for (const { collection, docId, qty } of stockDeductions) {
                    try {
                        await db.collection(collection).doc(docId).update({ data: { stock: _.inc(qty) } });
                    } catch (stockErr) {
                        console.error('[OrderCreate] ⚠️ 库存回滚失败(货款不足) collection=%s docId=%s qty=%s error=%s', collection, docId, qty, stockErr.message);
                    }
                }
                if (deliveryType === 'pickup') {
                    await releasePickupStationInventoryForOrder(db, {
                        _id: orderId,
                        id: orderId,
                        order_no: orderNo,
                        pickup_station_id: pickup_station_id,
                        items: normalizedOrderItems,
                        pickup_stock_reservation_status: 'reserved'
                    }, '货款支付并发失败，释放自提门店预占库存').catch((pickupErr) => {
                        console.error('[OrderCreate] ⚠️ 自提库存回滚失败(货款并发不足):', pickupErr.message);
                    });
                }
                throw new Error('货款余额不足，请刷新后重试');
            }
            goodsFundDeducted = true;
            await decreaseGoodsFundLedger(openid, payAmount, orderNo, '货款支付订单');
            // 拼团订单货款支付后进入 pending_group（待成团），自提单进入 pickup_pending。
            const isGroupOrder = !!(groupActivity || group_no || group_activity_id);
            const postPayStatus = isGroupOrder
                ? 'pending_group'
                : (deliveryType === 'pickup' ? 'pickup_pending' : 'paid');
            await db.collection('orders').doc(orderId).update({
                data: {
                    status: postPayStatus,
                    payment_method: 'goods_fund',
                    pay_channel: 'goods_fund',
                    paid_at: db.serverDate(),
                    pay_amount: payAmount,
                    actual_price: payAmount,
                    updated_at: db.serverDate()
                }
            });
            goodsFundPaid = true;
            // 写一条货款流水记录
            await db.collection('goods_fund_logs').add({
                data: {
                    openid,
                    type: 'spend',
                    amount: -payAmount,
                    order_id: orderId,
                    order_no: orderNo,
                    remark: '货款支付订单',
                    created_at: db.serverDate()
                }
            });
            // 触发支付后处理（佣金创建、积分奖励、代理升级、拼团/砍价等）
            cloud.callFunction({
                name: 'payment',
                data: { action: '_postProcessPaid', order_id: orderId, internal_source: 'order-create' }
            }).catch((err) => {
                console.error('[OrderCreate] 货款支付后处理调用失败（不影响下单）:', err.message);
            });
        } catch (err) {
            if (goodsFundDeducted && !goodsFundPaid) {
                await db.collection('users').where({ openid }).update({
                    data: {
                        agent_wallet_balance: _.inc(payAmount),
                        goods_fund_total_spent: _.inc(-payAmount),
                        updated_at: db.serverDate()
                    }
                }).catch((walletErr) => {
                    console.error('[OrderCreate] ⚠️ 货款余额回滚失败 openid=%s amount=%s error=%s', openid, payAmount, walletErr.message);
                });
                await rollbackGoodsFundLedger(openid, payAmount, orderNo, '货款支付回滚').catch((rollbackErr) => {
                    console.error('[OrderCreate] 货款账本回滚失败:', rollbackErr.message);
                });
                await db.collection('orders').doc(orderId).update({
                    data: { status: 'cancelled', cancel_reason: '货款支付处理失败', updated_at: db.serverDate() }
                }).catch((orderCancelErr) => {
                    console.error('[OrderCreate] ⚠️ 订单取消写入失败:', orderCancelErr.message);
                });
                await restoreCouponForCancelledOrder('货款支付处理失败');
                if (actualPoints > 0) {
                    await db.collection('users').where({ openid }).update({
                        data: { points: _.inc(actualPoints), growth_value: _.inc(actualPoints), updated_at: db.serverDate() }
                    }).catch((ptsErr) => {
                        console.error('[OrderCreate] ⚠️ 积分回滚失败(货款支付) openid=%s points=%s error=%s', openid, actualPoints, ptsErr.message);
                    });
                }
                for (const { collection, docId, qty } of stockDeductions) {
                    try {
                        await db.collection(collection).doc(docId).update({ data: { stock: _.inc(qty) } });
                    } catch (stockErr) {
                        console.error('[OrderCreate] ⚠️ 库存回滚失败(货款支付) collection=%s docId=%s qty=%s error=%s', collection, docId, qty, stockErr.message);
                    }
                }
                if (deliveryType === 'pickup') {
                    await releasePickupStationInventoryForOrder(db, {
                        _id: orderId,
                        id: orderId,
                        order_no: orderNo,
                        pickup_station_id: pickup_station_id,
                        items: normalizedOrderItems,
                        pickup_stock_reservation_status: 'reserved'
                    }, '货款支付失败，释放自提门店预占库存').catch((pickupErr) => {
                        console.error('[OrderCreate] ⚠️ 自提库存回滚失败(货款支付):', pickupErr.message);
                    });
                }
                try {
                    await db.collection('rollback_error_logs').add({
                        data: {
                            context: 'goods_fund_payment_failed',
                            openid,
                            order_no: orderNo,
                            rollback_type: 'goods_fund_payment_rollback',
                            original_error: err.message || String(err),
                            created_at: db.serverDate()
                        }
                    });
                } catch (_) { /* 日志写入失败不影响主流程 */ }
            }
            if (err.message.includes('货款')) throw err;
            console.error('[OrderCreate] 货款支付处理异常:', err.message);
            throw new Error('货款支付处理失败，请联系客服');
        }
    }

    // 8. 清除购物车中已下单的商品
    try {
        const productIds = orderItems.map(i => String(i.product_id));
        // 逐个查询清除，避免 _.in() 类型不匹配问题（product_id 可能是字符串或数字）
        for (const pid of productIds) {
            try {
                const rows = await db.collection('cart_items').where({ openid, product_id: pid }).get().catch(() => ({ data: [] }));
                await Promise.all(rows.data.map(row => db.collection('cart_items').doc(row._id).remove()));
                // 同时尝试数字 ID
                const numPid = toNumber(pid, NaN);
                if (Number.isFinite(numPid) && String(numPid) !== pid) {
                    const numRows = await db.collection('cart_items').where({ openid, product_id: numPid }).get().catch(() => ({ data: [] }));
                    await Promise.all(numRows.data.map(row => db.collection('cart_items').doc(row._id).remove()));
                }
            } catch (_) {}
        }
    } catch (_) {}

    return {
        _id: result._id,
        id: result._id,
        order_no: orderNo,
        total_amount: totalAmount,
        pay_amount: payAmount,
        group_no: group_no || '',
        slash_no: slashRecord ? (slashRecord.slash_no || slash_no || '') : '',
        goods_fund_paid: goodsFundPaid,  // 货款已完成支付，前端可跳过微信支付步骤
        paid_by_free: shouldAutoPayFreeOrder,
        payment_completed: goodsFundPaid || shouldAutoPayFreeOrder
    };
}

async function createExchangeOrder(openid, orderData = {}) {
    const items = Array.isArray(orderData.items) ? orderData.items : [];
    if (items.length !== 1) {
        throw new Error('兑换券订单仅支持单个商品');
    }
    const normalizedItems = items.map((item) => ({
        product_id: item.product_id,
        sku_id: item.sku_id || null,
        quantity: 1
    }));
    return createOrder(openid, {
        ...orderData,
        items: normalizedItems,
        coupon_id: '',
        user_coupon_id: '',
        points_to_use: 0,
        exchange_coupon_id: orderData.exchange_coupon_id,
        type: 'exchange',
        use_goods_fund: false
    });
}

module.exports = {
    createOrder,
    createExchangeOrder,
    findUserByOpenid,
    getUserRoleLevel,
    isAgentRoleLevel,
    normalizeAgentRoleLevel,
    resolveBundleFixedCommissionAmounts,
    buildBundleCommissionSnapshot,
    getPointDeductionRule,
    getUserGoodsFundBalance,
    ensureWalletAccountForUser,
    buildAddressSnapshot,
    _test: {
        markUserCouponUsedForOrder
    }
};
