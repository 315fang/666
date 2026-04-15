'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber, toBoolean } = require('./shared/utils');
const { findUserCouponDoc } = require('./order-coupon');

/**
 * 各角色等级默认折扣率（可通过 configs.member_level_config 覆盖）
 * C 级别不打折（改为购买后按等级赠送积分），B 级别 6 折拿货价
 */
const DEFAULT_ROLE_DISCOUNT_RATES = {
    0: 1.0,
    1: 1.0,
    2: 1.0,
    3: 0.60,
    4: 0.60,
    5: 0.60
};

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
        const ts = new Date(value).getTime();
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
        || activity.status === 'active'
        || activity.is_active === true
        || activity.active === true
    );
}

function sameProduct(activity = {}, product = {}) {
    const expected = [activity.product_id, activity.productId].filter((value) => value !== undefined && value !== null);
    const actual = [product._id, product.id, product._legacy_id].filter((value) => value !== undefined && value !== null);
    return expected.length === 0 || expected.some((left) => actual.some((right) => String(left) === String(right)));
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
        return rawSpec
            .map((item) => {
                if (!item || typeof item !== 'object') return '';
                return item.value || item.spec_value || item.name || '';
            })
            .filter(Boolean)
            .join(' / ');
    }
    return rawSpec ? String(rawSpec) : '';
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
    const account = existingAccount || await ensureWalletAccountForUser(user, getUserGoodsFundBalance(user) + amount);
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
    const account = existingAccount || await ensureWalletAccountForUser(user, getUserGoodsFundBalance(user) - amount);
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
        use_goods_fund   // 货款支付标志（仅代理商可用）
    } = orderData;

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('缺少商品信息');
    }
    const isExchangeOrder = !!exchange_coupon_id;
    if (isExchangeOrder && items.length !== 1) {
        throw new Error('兑换券订单仅支持单个商品');
    }

    const groupActivity = group_activity_id ? await findGroupActivity(group_activity_id) : null;
    if (group_activity_id) {
        if (!groupActivity) throw new Error('拼团活动不存在');
        if (!isActivityOpen(groupActivity)) throw new Error('拼团活动已结束');
        const endAt = groupActivity.end_time || groupActivity.end_at;
        if (endAt && new Date(endAt) < new Date()) throw new Error('拼团活动已过期');
    }
    const slashRecord = slash_no ? await findSlashRecord(slash_no) : null;
    if (slash_no) {
        if (!slashRecord) throw new Error('砍价记录不存在');
        if (slashRecord.openid !== openid) throw new Error('砍价记录归属异常');
        if (slashRecord.status === 'purchased') throw new Error('该砍价已完成购买');
        if (slashRecord.status === 'expired') throw new Error('砍价已过期');
    }
    if (groupActivity && slashRecord) {
        throw new Error('活动订单类型冲突');
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

    // 0. 提前获取买家信息（折扣率计算需要）和订单超时配置
    const [earlyBuyerInfo, autoCancelMinutes] = await Promise.all([
        findUserByOpenid(openid),
        getOrderAutoCancelMinutes()
    ]);
    const referralChain = earlyBuyerInfo ? await buildReferralChain(earlyBuyerInfo) : [];
    const directReferrer = referralChain[0] || null;
    const indirectReferrer = referralChain[1] || null;
    const nearestAgentCandidate = (delivery_type || 'express') === 'express'
        ? (referralChain.find((user) => isAgentRoleLevel(getUserRoleLevel(user))) || null)
        : null;
    const nearestAgentRoleLevel = nearestAgentCandidate ? normalizeAgentRoleLevel(getUserRoleLevel(nearestAgentCandidate)) : 0;
    const buyerRoleLevel = toNumber(
        earlyBuyerInfo?.role_level ?? earlyBuyerInfo?.distributor_level ?? earlyBuyerInfo?.level,
        0
    );
    // C级(0/1/2)不打折，仅B级(3+)使用存储的折扣率或默认表
    const buyerDiscountRate = (() => {
        if (buyerRoleLevel <= 2) return 1;
        const stored = toNumber(earlyBuyerInfo?.discount_rate, NaN);
        if (Number.isFinite(stored) && stored > 0 && stored <= 1) return stored;
        return DEFAULT_ROLE_DISCOUNT_RATES[buyerRoleLevel] ?? 1;
    })();

    // 1. 查商品和 SKU，计算金额
    let totalAmount = 0;
    let originalTotalAmount = 0; // 折扣前原价合计，用于优惠券门槛校验
    const orderItems = [];
    const stockDeductions = [];  // 记录已扣减的库存，供回滚用
    const lockedAgentCostCandidates = [];

    for (const item of items) {
        const product = await findProduct(item.product_id);
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
            sku = await findSku(item.sku_id);
        }

        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        if (isExchangeOrder && qty !== 1) {
            throw new Error('兑换券订单每次只能兑换 1 件商品');
        }

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
                await Promise.all(stockDeductions.map(({ collection, docId, qty: q }) =>
                    db.collection(collection).doc(docId).update({ data: { stock: _.inc(q) } }).catch(() => {})
                ));
                throw new Error(`商品库存不足: ${product.name || item.product_id}（请刷新后重试）`);
            }
            stockDeductions.push({ collection: stockCollection, docId: stockDocId, qty });
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
        } else if (groupActivity) {
            unitPrice = activityPrice;
            originalUnitPrice = activityPrice;
        } else if (slashRecord) {
            unitPrice = slashPrice;
            originalUnitPrice = slashPrice;
        } else {
            const basePrice = resolveSkuUnitPrice(sku, product);
            originalUnitPrice = basePrice;
            const isExplosive = product.is_explosive === true || product.is_explosive === 1;
            const skipDiscount = isExplosive || product.skip_member_discount === true || product.skip_role_discount === true;

            // 爆单品不参与会员价，直接用零售价
            const agentLevelPrice = (!isExplosive && buyerRoleLevel >= 3)
                ? toNumber(sku?.price_agent ?? product?.price_agent ?? sku?.price_leader ?? product?.price_leader, NaN)
                : NaN;
            const memberLevelPrice = (!isExplosive && buyerRoleLevel >= 1 && buyerRoleLevel <= 2)
                ? toNumber(sku?.price_member ?? product?.price_member, NaN)
                : NaN;

            if (Number.isFinite(agentLevelPrice) && agentLevelPrice > 0) {
                unitPrice = agentLevelPrice;
            } else if (Number.isFinite(memberLevelPrice) && memberLevelPrice > 0) {
                unitPrice = memberLevelPrice;
            } else if (skipDiscount || buyerDiscountRate >= 1) {
                unitPrice = basePrice;
            } else {
                unitPrice = Math.round(basePrice * buyerDiscountRate * 100) / 100;
            }
        }

        const lineTotal = Math.round(unitPrice * qty * 100) / 100;

        totalAmount += lineTotal;
        originalTotalAmount += Math.round(originalUnitPrice * qty * 100) / 100;

        const productId = String(product._id || product.id || item.product_id || '');
        const productImages = normalizeImages(product.images);
        const specValue = normalizeSpecValue(sku ? (sku.spec || sku.specs || sku.spec_value || '') : '');
        const image = sku ? (sku.image || productImages[0] || '') : (productImages[0] || '');
        const productName = product.name || sku?.name || '';
        const lockedAgentUnitCost = nearestAgentRoleLevel
            ? resolveSupplyPriceByRole(product, sku, nearestAgentRoleLevel)
            : null;

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
            is_explosive: (product.is_explosive === true || product.is_explosive === 1) ? 1 : 0,
            allow_points: isExchangeOrder ? 0 : ((product.is_explosive === true || product.is_explosive === 1) ? 0
                : (product.allow_points == null ? 1 : (product.allow_points ? 1 : 0))),
            exchange_coupon_id: isExchangeOrder ? String(exchange_coupon_id) : '',
            activity_type: groupActivity ? 'group' : (slashRecord ? 'slash' : ''),
            group_activity_id: groupActivity ? (groupActivity._id || String(group_activity_id)) : '',
            slash_no: slashRecord ? (slashRecord.slash_no || slash_no) : ''
        });
        lockedAgentCostCandidates.push(lockedAgentUnitCost);
    }

    totalAmount = Math.round(totalAmount * 100) / 100;
    originalTotalAmount = Math.round(originalTotalAmount * 100) / 100;

    // 爆单品订单自动禁用优惠券
    const hasExplosiveItem = orderItems.some(it => it.is_explosive === 1);

    // 2. 优惠券抵扣（先计算折扣金额，暂不核销；核销放在订单创建成功之后，防止无回滚丢券）
    let couponDiscount = 0;
    const selectedCouponId = (hasExplosiveItem || isExchangeOrder) ? '' : (user_coupon_id || coupon_id);
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
    if (!isExchangeOrder && usePoints > 0 && pointsAllowedByProducts) {
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

    // 4. 计算最终支付金额
    let payAmount = totalAmount - couponDiscount - pointsDiscount;
    payAmount = Math.max(0, Math.round(payAmount * 100) / 100);

    const couponAllocations = allocateProportionalAmounts(orderItems, couponDiscount, 'item_amount');
    const pointsAllocations = allocateProportionalAmounts(orderItems, pointsDiscount, 'item_amount');
    orderItems.forEach((item, index) => {
        const couponAllocatedAmount = roundMoney(couponAllocations[index]);
        const pointsAllocatedAmount = roundMoney(pointsAllocations[index]);
        item.coupon_allocated_amount = couponAllocatedAmount;
        item.points_allocated_amount = pointsAllocatedAmount;
        item.cash_paid_allocated_amount = roundMoney(item.item_amount - couponAllocatedAmount - pointsAllocatedAmount);
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

    if ((delivery_type || 'express') === 'express') {
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
    const normalizedOrderItems = orderItems.map((item) => {
        if (!canAgentFulfill) {
            return {
                ...item,
                locked_agent_cost_candidate: undefined,
                locked_agent_cost: null,
                locked_agent_cost_total: null
            };
        }
        const lockedAgentCost = roundMoney(item.locked_agent_cost_candidate);
        return {
            ...item,
            locked_agent_cost_candidate: undefined,
            locked_agent_cost: lockedAgentCost,
            locked_agent_cost_total: roundMoney(lockedAgentCost * Math.max(1, toNumber(item.qty || item.quantity, 1)))
        };
    });
    const lockedAgentCostTotal = canAgentFulfill
        ? roundMoney(normalizedOrderItems.reduce((sum, item) => sum + toNumber(item.locked_agent_cost_total, 0), 0))
        : 0;

    // 7. 构建订单
    const order = {
        order_no: orderNo,
        openid,
        status: 'pending_payment',
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
        coupon_discount: couponDiscount,
        points_discount: pointsDiscount,
        points_used: actualPoints,
        role_discount_rate: buyerDiscountRate,
        buyer_role_level: buyerRoleLevel,
        pay_amount: payAmount,
        actual_price: payAmount,
        refunded_cash_total: 0,
        refunded_quantity_total: 0,
        reward_points_clawback_total: 0,
        growth_clawback_total: 0,
        has_partial_refund: false,
        payment_method: '',
        pay_channel: '',
        address_id: address_id || '',
        address: addressSnapshot,
        address_snapshot: addressSnapshot,
        delivery_type: delivery_type || 'express',
        pickup_station_id: pickup_station_id || '',
        pickupStation: pickupStationSummary,
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
        memo: memo || '',
        referrer_openid: directReferrer?.openid || '',
        type: isExchangeOrder ? 'exchange' : (groupActivity ? 'group' : (slashRecord ? 'slash' : (type || 'normal'))),
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
        stock_deducted_at: stockDeductions.length > 0 ? db.serverDate() : null,
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
                await db.collection('users').where({ openid }).update({
                    data: { points: _.inc(actualPoints), growth_value: _.inc(actualPoints), updated_at: db.serverDate() }
                }).catch(() => {});
            }
            await Promise.all(stockDeductions.map(({ collection, docId, qty }) =>
                db.collection(collection).doc(docId).update({ data: { stock: _.inc(qty) } }).catch(() => {})
            ));
            throw new Error(`货款余额不足，当前余额 ¥${freshBalance.toFixed(2)}，订单金额 ¥${payAmount.toFixed(2)}`);
        }
    }

    let result;
    try {
        result = await db.collection('orders').add({ data: order });
    } catch (addErr) {
        // 创单失败：回滚已扣积分和库存
        if (actualPoints > 0) {
            await db.collection('users').where({ openid }).update({
                data: { points: _.inc(actualPoints), growth_value: _.inc(actualPoints), updated_at: db.serverDate() }
            }).catch(() => {});
        }
        await Promise.all(stockDeductions.map(({ collection, docId, qty }) =>
            db.collection(collection).doc(docId).update({ data: { stock: _.inc(qty) } }).catch(() => {})
        ));
        throw new Error('创建订单失败，已回滚积分与库存: ' + addErr.message);
    }

    // 7.5 订单创建成功后，执行优惠券核销（先创单后核销，失败不影响订单，但不应再用此券）
    if (isExchangeOrder && exchangeCouponDoc?._id) {
        await db.collection('user_coupons').doc(String(exchangeCouponDoc._id)).update({
            data: { status: 'used', used_at: db.serverDate(), order_id: result._id, used_order_id: result._id, updated_at: db.serverDate() }
        }).catch((err) => {
            console.error('[OrderCreate] 兑换券核销失败:', err.message, '订单已创建:', result._id);
        });
    } else if (pendingCouponDoc) {
        await db.collection('user_coupons').doc(pendingCouponDoc._id).update({
            data: { status: 'used', used_at: db.serverDate(), order_id: result._id }
        }).catch((err) => {
            console.error('[OrderCreate] 优惠券核销失败:', err.message, '订单已创建:', result._id);
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
                });
                if (actualPoints > 0) {
                    await db.collection('users').where({ openid }).update({
                        data: { points: _.inc(actualPoints), growth_value: _.inc(actualPoints), updated_at: db.serverDate() }
                    }).catch(() => {});
                }
                await Promise.all(stockDeductions.map(({ collection, docId, qty }) =>
                    db.collection(collection).doc(docId).update({ data: { stock: _.inc(qty) } }).catch(() => {})
                ));
                throw new Error('货款余额不足，请刷新后重试');
            }
            goodsFundDeducted = true;
            await decreaseGoodsFundLedger(openid, payAmount, orderNo, '货款支付订单');
            // 拼团订单货款支付后进入 pending_group（待成团），普通订单直接 paid
            const isGroupOrder = !!(groupActivity || group_no || group_activity_id);
            const postPayStatus = isGroupOrder ? 'pending_group' : 'paid';
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
                data: { action: '_postProcessPaid', order_id: orderId }
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
                }).catch(() => {});
                await rollbackGoodsFundLedger(openid, payAmount, orderNo, '货款支付回滚').catch((rollbackErr) => {
                    console.error('[OrderCreate] 货款账本回滚失败:', rollbackErr.message);
                });
                await db.collection('orders').doc(orderId).update({
                    data: { status: 'cancelled', cancel_reason: '货款支付处理失败', updated_at: db.serverDate() }
                }).catch(() => {});
                if (actualPoints > 0) {
                    await db.collection('users').where({ openid }).update({
                        data: { points: _.inc(actualPoints), growth_value: _.inc(actualPoints), updated_at: db.serverDate() }
                    }).catch(() => {});
                }
                await Promise.all(stockDeductions.map(({ collection, docId, qty }) =>
                    db.collection(collection).doc(docId).update({ data: { stock: _.inc(qty) } }).catch(() => {})
                ));
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
        goods_fund_paid: goodsFundPaid  // 货款已完成支付，前端可跳过微信支付步骤
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
    createExchangeOrder
};
