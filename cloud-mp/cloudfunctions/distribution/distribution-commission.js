'use strict';

const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber, getAllRecords } = require('./shared/utils');

const DEFAULT_ROLE_NAMES = {
    0: 'VIP会员',
    1: '初级会员 C1',
    2: '高级会员 C2',
    3: '推广合伙人 B1',
    4: '运营合伙人 B2',
    5: '区域合伙人 B3'
};

const DEFAULT_COMMISSION_MATRIX = {
    1: { 0: 20 },
    2: { 0: 30, 1: 5 },
    3: { 1: 20, 2: 10 },
    4: { 1: 30, 2: 20, 3: 10 },
    5: { 1: 35, 2: 25, 3: 15, 4: 5 }
};

const DEFAULT_AGENT_COMMISSION_CONFIG = {
    direct_pct_by_role: { 1: 20, 2: 30, 3: 40, 4: 40, 5: 40 },
    indirect_pct_by_role: { 2: 0, 3: 0, 4: 10, 5: 10 },
    commission_matrix: DEFAULT_COMMISSION_MATRIX
};

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function uniqueValues(values = []) {
    const seen = {};
    const list = [];
    values.forEach((value) => {
        if (!hasValue(value)) return;
        const key = `${typeof value}:${String(value)}`;
        if (seen[key]) return;
        seen[key] = true;
        list.push(value);
    });
    return list;
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
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

async function getConfigByKeys(keys = []) {
    for (const key of keys) {
        const current = String(key || '').trim();
        if (!current) continue;
        const res = await db.collection('configs')
            .where(_.or([{ config_key: current }, { key: current }]))
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (res.data && res.data[0]) return res.data[0];
        const legacyRes = await db.collection('app_configs')
            .where({ config_key: current, status: _.in([true, 1, '1']) })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (legacyRes.data && legacyRes.data[0]) return legacyRes.data[0];
    }
    return null;
}

function normalizePctMap(rawMap = {}, fallback = {}) {
    const merged = {};
    Object.keys(fallback || {}).forEach((key) => {
        const value = toNumber(fallback[key], NaN);
        if (!Number.isFinite(value)) return;
        merged[key] = value > 1 ? value / 100 : value;
    });
    Object.keys(rawMap || {}).forEach((key) => {
        const rawValue = toNumber(rawMap[key], NaN);
        if (!Number.isFinite(rawValue)) return;
        merged[key] = rawValue > 1 ? rawValue / 100 : rawValue;
    });
    return merged;
}

function normalizeCommissionMatrix(dbMatrix, fallback) {
    const result = {};
    const allKeys = new Set([...Object.keys(fallback || {}), ...Object.keys(dbMatrix || {})]);
    for (const parentRole of allKeys) {
        const base = fallback[parentRole] || {};
        const override = (dbMatrix || {})[parentRole] || {};
        const merged = {};
        for (const buyerRole of new Set([...Object.keys(base), ...Object.keys(override)])) {
            const val = toNumber(override[buyerRole] ?? base[buyerRole], NaN);
            if (Number.isFinite(val)) merged[buyerRole] = val;
        }
        if (Object.keys(merged).length) result[parentRole] = merged;
    }
    return result;
}

async function loadAgentCommissionConfig() {
    const [configRow, matrixRow] = await Promise.all([
        getConfigByKeys(['agent_system_commission-config', 'agent_system_commission_config']),
        getConfigByKeys(['agent_system_commission-matrix', 'agent_system_commission_matrix'])
    ]);
    const config = parseConfigValue(configRow, {});
    const dbMatrix = parseConfigValue(matrixRow, null);
    return {
        direct_pct_by_role: normalizePctMap(config?.direct_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.direct_pct_by_role),
        indirect_pct_by_role: normalizePctMap(config?.indirect_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.indirect_pct_by_role),
        commission_matrix: normalizeCommissionMatrix(
            dbMatrix || config?.commission_matrix,
            DEFAULT_COMMISSION_MATRIX
        )
    };
}

function toList(value) {
    if (Array.isArray(value)) return value;
    if (!hasValue(value)) return [];
    return [value];
}

function firstNumber(values) {
    for (const value of values) {
        if (!hasValue(value)) continue;
        const num = toNumber(value, NaN);
        if (Number.isFinite(num)) return num;
    }
    return null;
}

function centsToYuan(value, fallback = 0) {
    if (!hasValue(value)) return fallback;
    const num = toNumber(value, NaN);
    return Number.isFinite(num) ? num / 100 : fallback;
}

async function getDocByIdOrLegacy(collectionName, id) {
    if (!hasValue(id)) return null;
    const num = toNumber(id, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num)
            ? db.collection(collectionName).where({ id: num }).limit(1).get().catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        db.collection(collectionName).doc(String(id)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

async function findUserByAny(value) {
    if (!hasValue(value)) return null;
    const num = toNumber(value, NaN);
    const [byOpenid, byLegacyId, byDoc] = await Promise.all([
        db.collection('users').where({ openid: String(value) }).limit(1).get().catch(() => ({ data: [] })),
        Number.isFinite(num)
            ? db.collection('users').where({ id: num }).limit(1).get().catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        db.collection('users').doc(String(value)).get().then((res) => ({ data: res.data ? [res.data] : [] })).catch(() => ({ data: [] }))
    ]);
    return byOpenid.data[0] || byLegacyId.data[0] || byDoc.data[0] || null;
}

async function getCommissionIdentity(openid) {
    const user = await findUserByAny(openid);
    const userIds = [];
    if (user) {
        if (hasValue(user.id)) userIds.push(user.id, String(user.id));
        if (hasValue(user._id)) userIds.push(user._id);
        if (hasValue(user._legacy_id)) userIds.push(user._legacy_id, String(user._legacy_id));
    }
    return {
        user,
        openid,
        userIds: uniqueValues(userIds)
    };
}

function commissionRecordKey(row = {}) {
    return String(row._id || `${row.openid || ''}:${row.user_id || ''}:${row.order_id || ''}:${row.type || ''}:${row.created_at || ''}`);
}

async function listCommissionRows(identity = {}, params = {}) {
    const tasks = [];
    if (identity.openid) {
        tasks.push(getAllRecords(db, 'commissions', { openid: identity.openid }).catch(() => []));
    }
    if (identity.userIds && identity.userIds.length) {
        tasks.push(getAllRecords(db, 'commissions', { user_id: _.in(identity.userIds) }).catch(() => []));
    }
    if (!tasks.length) return [];

    let rows = (await Promise.all(tasks)).flat();
    const merged = {};
    rows.forEach((row) => {
        merged[commissionRecordKey(row)] = row;
    });
    rows = Object.values(merged);

    if (params.status) {
        rows = rows.filter((row) => String(row.status || '') === String(params.status));
    }

    rows.sort((a, b) => {
        const ta = new Date(a.created_at || 0).getTime();
        const tb = new Date(b.created_at || 0).getTime();
        return tb - ta;
    });
    return rows;
}

function getUserReferrer(user = {}) {
    return user.referrer_openid
        || user.parent_openid
        || user.parent_id
        || user.referrer_id
        || user.inviter_openid
        || user.inviter_id
        || '';
}

function resolveProductPrice(product = {}) {
    const legacyPrice = firstNumber([product.retail_price, product.price]);
    if (legacyPrice !== null) return legacyPrice;
    return centsToYuan(product.min_price, 0);
}

function resolveUnitCost(product = {}, item = {}, order = {}) {
    const explicit = firstNumber([
        item.locked_agent_cost,
        order.locked_agent_cost,
        product.cost_price,
        product.price_agent,
        product.price_leader,
        product.price_member
    ]);
    return explicit !== null ? explicit : resolveProductPrice(product);
}

function configuredCommission(product = {}, level, baseAmount) {
    const fixed = firstNumber([product[`commission_amount_${level}`], product[`commission${level}_amount`]]);
    if (fixed !== null) return roundMoney(fixed);

    const rate = firstNumber([product[`commission_rate_${level}`], product[`rate_${level}`]]);
    if (rate !== null) return roundMoney(baseAmount * rate);

    return 0;
}

function roleCommission(user = {}, level, baseAmount, commissionConfig = DEFAULT_AGENT_COMMISSION_CONFIG) {
    const role = toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
    const directRates = normalizePctMap(commissionConfig.direct_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.direct_pct_by_role);
    const indirectRates = normalizePctMap(commissionConfig.indirect_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.indirect_pct_by_role);
    const rate = (level === 1 ? directRates : indirectRates)[role] || 0;
    return roundMoney(baseAmount * rate);
}

async function calculateOrderCommissions(order, explicitReferrerOpenid) {
    const buyer = await findUserByAny(order.openid || order.buyer_id || order.user_id);
    const parent = await findUserByAny(explicitReferrerOpenid || getUserReferrer(buyer || {}));
    const grandparent = parent ? await findUserByAny(getUserReferrer(parent)) : null;
    const beneficiaries = [
        { level: 1, type: 'direct', user: parent },
        { level: 2, type: 'indirect', user: grandparent }
    ].filter((item) => item.user && item.user.openid && item.user.openid !== order.openid);

    const commissionConfig = await loadAgentCommissionConfig();
    const totals = new Map();
    const orderAmount = roundMoney(order.pay_amount ?? order.actual_price ?? order.total_amount);
    const items = toList(order.items);
    const normalizedItems = items.length ? items : [{ item_amount: orderAmount, qty: 1, product_id: order.product_id }];
    const itemBaseTotal = normalizedItems.reduce((sum, item) => {
        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        return sum + roundMoney(item.subtotal ?? item.item_amount ?? (toNumber(item.price || item.unit_price, 0) * qty));
    }, 0) || orderAmount;

    for (const item of normalizedItems) {
        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        const product = await getDocByIdOrLegacy('products', item.product_id) || {};
        const rawBase = roundMoney(item.subtotal ?? item.item_amount ?? (toNumber(item.price || item.unit_price || orderAmount, 0) * qty));
        const allocatedBase = itemBaseTotal > 0 ? roundMoney(orderAmount * rawBase / itemBaseTotal) : rawBase;
        const cost = roundMoney(resolveUnitCost(product, item, order) * qty);
        let remainingProfit = Math.max(0, roundMoney(allocatedBase - cost));

        for (const beneficiary of beneficiaries) {
            if (remainingProfit <= 0) break;
            const amount = Math.min(
                remainingProfit,
                configuredCommission(product, beneficiary.level, allocatedBase) || roleCommission(beneficiary.user, beneficiary.level, allocatedBase, commissionConfig)
            );
            if (amount <= 0) continue;
            const key = `${beneficiary.user.openid}:${beneficiary.level}:${beneficiary.type}`;
            totals.set(key, {
                openid: beneficiary.user.openid,
                user_id: beneficiary.user.id || beneficiary.user._legacy_id || beneficiary.user._id || beneficiary.user.openid,
                from_openid: order.openid,
                order_id: order._id,
                order_no: order.order_no,
                amount: roundMoney((totals.get(key)?.amount || 0) + amount),
                level: beneficiary.level,
                type: beneficiary.type,
                role_name: beneficiary.user.role_name || DEFAULT_ROLE_NAMES[toNumber(beneficiary.user.role_level, 0)] || '代理'
            });
            remainingProfit = roundMoney(remainingProfit - amount);
        }
    }

    const rows = [...totals.values()].filter((item) => item.amount > 0);
    return {
        rows,
        total_amount: roundMoney(rows.reduce((sum, item) => sum + item.amount, 0))
    };
}

async function calculateCommission(orderId) {
    try {
        const order = await getDocByIdOrLegacy('orders', orderId);
        if (!order) return 0;
        const result = await calculateOrderCommissions(order);
        return result.total_amount;
    } catch (err) {
        console.error('[distribution-commission] calculateCommission failed:', err.message);
        return 0;
    }
}

async function settleCommission(openid, amount) {
    await db.collection('users').where({ openid }).update({
        data: {
            commission_balance: _.inc(amount),
            balance: _.inc(amount),
            total_earned: _.inc(amount),
            updated_at: db.serverDate()
        }
    });
    return { success: true };
}

async function getCommissions(openid, params = {}) {
    const identity = await getCommissionIdentity(openid);
    const rows = await listCommissionRows(identity, params);
    return rows.slice(0, 100);
}

async function getStats(openid) {
    try {
        const identity = await getCommissionIdentity(openid);
        const commRes = await listCommissionRows(identity);
        const stats = {
            total_commission: 0,
            pending_commission: 0,
            frozen_commission: 0,
            pending_approval_commission: 0,
            settled_commission: 0,
            cancelled_commission: 0,
            count: (commRes || []).length
        };

        (commRes || []).forEach((item) => {
            const amount = toNumber(item.amount, 0);
            stats.total_commission += amount;
            if (item.status === 'pending') stats.pending_commission += amount;
            else if (item.status === 'frozen') stats.frozen_commission += amount;
            else if (item.status === 'pending_approval') stats.pending_approval_commission += amount;
            else if (item.status === 'settled') stats.settled_commission += amount;
            else if (item.status === 'cancelled') stats.cancelled_commission += amount;
        });

        Object.keys(stats).forEach((key) => {
            if (key !== 'count') stats[key] = roundMoney(stats[key]);
        });
        return stats;
    } catch (err) {
        console.error('[distribution-commission] getStats failed:', err.message);
        return {
            total_commission: 0,
            pending_commission: 0,
            frozen_commission: 0,
            pending_approval_commission: 0,
            settled_commission: 0,
            cancelled_commission: 0,
            count: 0
        };
    }
}

async function createCommissions(referrerOpenid, fromOpenid, orderId, orderNo, payAmount, rate = 0.10) {
    if (!referrerOpenid) return { created: false, reason: 'no referrer' };
    const orderDoc = await getDocByIdOrLegacy('orders', orderId);
    const order = orderDoc || {
        _id: orderId,
        openid: fromOpenid,
        order_no: orderNo,
        pay_amount: payAmount,
        total_amount: payAmount,
        items: []
    };

    const calculated = await calculateOrderCommissions(order, referrerOpenid);
    const rows = calculated.rows.length
        ? calculated.rows
        : [{
            openid: referrerOpenid,
            from_openid: fromOpenid,
            order_id: orderId,
            order_no: orderNo,
            amount: roundMoney(toNumber(payAmount, 0) * toNumber(rate, 0.10)),
            level: 1,
            type: 'direct'
        }].filter((item) => item.amount > 0);

    let created = 0;
    let totalAmount = 0;
    for (const row of rows) {
        const existingRes = await db.collection('commissions')
            .where({ order_id: orderId, openid: row.openid, level: row.level, type: row.type })
            .limit(1).get().catch(() => ({ data: [] }));
        if (existingRes.data && existingRes.data.length > 0) continue;

        await db.collection('commissions').add({
            data: {
                openid: row.openid,
                user_id: row.user_id,
                from_openid: fromOpenid,
                order_id: orderId,
                order_no: orderNo,
                amount: row.amount,
                level: row.level,
                type: row.type,
                status: 'pending',
                created_at: db.serverDate(),
                updated_at: db.serverDate(),
            },
        });
        created += 1;
        totalAmount += row.amount;
    }

    return { created: created > 0, count: created, amount: roundMoney(totalAmount) };
}

async function unfreezeCommissions(orderId) {
    if (!orderId) return { settled: 0 };
    // frozen: 确认收货后冻结的佣金；pending_approval: 旧流程/手动审批的佣金
    const res = await db.collection('commissions')
        .where({ order_id: orderId, status: _.in(['frozen', 'pending_approval']) })
        .get().catch(() => ({ data: [] }));

    let totalSettled = 0;
    for (const comm of (res.data || [])) {
        await db.collection('commissions').doc(comm._id).update({
            data: { status: 'settled', settled_at: db.serverDate(), updated_at: db.serverDate() },
        });
        const amount = toNumber(comm.amount, 0);
        if (amount > 0) {
            await settleCommission(comm.openid, amount);
            totalSettled += amount;
        }
    }
    return { settled: (res.data || []).length, total_amount: roundMoney(totalSettled) };
}

async function cancelCommissions(orderId) {
    if (!orderId) return { cancelled: 0 };
    const res = await db.collection('commissions')
        .where({ order_id: orderId, status: _.in(['pending', 'frozen', 'pending_approval']) })
        .get().catch(() => ({ data: [] }));

    let totalCancelled = 0;
    for (const comm of (res.data || [])) {
        await db.collection('commissions').doc(comm._id).update({
            data: { status: 'cancelled', cancelled_at: db.serverDate(), updated_at: db.serverDate() },
        });
        totalCancelled += toNumber(comm.amount, 0);
    }

    return { cancelled: (res.data || []).length, total_amount: roundMoney(totalCancelled) };
}

module.exports = {
    calculateCommission,
    settleCommission,
    getCommissions,
    getStats,
    createCommissions,
    unfreezeCommissions,
    cancelCommissions,
    calculateOrderCommissions
};
