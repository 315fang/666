'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { verifySignature, decryptResource, loadPublicKey } = require('./wechat-pay-v3');
const {
    buildPaymentWritePatch,
    getRefundTargetText,
    normalizePaymentMethodCode,
    resolveOrderPayAmount,
    resolveOrderPaymentMethod,
    resolveRefundChannel,
    resolvePostPayStatus
} = require('./shared/order-payment');

const DEFAULT_ROLE_NAMES = {
    0: 'VIP会员',
    1: '初级会员 C1',
    2: '高级会员 C2',
    3: '推广合伙人 B1',
    4: '运营合伙人 B2',
    5: '区域合伙人 B3'
};

const DEFAULT_AGENT_UPGRADE_RULES = {
    enabled: true,
    // C1 晋升：购买满299（文档要求为"爆单产品"，系统暂以总消费额近似）
    c1_min_purchase: 299,
    // C2 晋升：直推 2 名 C1 + 销售额超580（文档要求需有"实物产品消耗"）
    c2_referee_count: 2,
    c2_min_sales: 580,
    // B1 晋升：推荐10名C1 或 充值3000（代理加盟费）
    b1_referee_count: 10,
    b1_recharge: 3000,
    // B2 晋升：推荐10名B1 或 充值30000
    b2_referee_count: 10,
    b2_recharge: 30000,
    // B3 晋升：推荐3名B2 或 30名B1，或充值198000（19.8万）
    b3_referee_b2_count: 3,
    b3_referee_b1_count: 30,
    b3_recharge: 198000,
    effective_order_days: 7
};

// 级差矩阵制：MATRIX[上级等级][买家等级] = 佣金百分比（整数，如 20 表示 20%）
// 直接上级获得 matrix[parent_role][buyer_role]% ；
// 间接上级获得 max(0, matrix[gp_role][buyer_role] - matrix[parent_role][buyer_role])%（级差）
const DEFAULT_COMMISSION_MATRIX = {
    1: { 0: 20 },                              // C1 从 VIP 购买中赚 20%
    2: { 0: 30, 1: 5 },                        // C2 直推 30%，C1 间推固定 5%
    3: { 1: 20, 2: 10 },                       // B1 从 C1 赚 20%，C2 赚 10%
    4: { 1: 30, 2: 20, 3: 10 },                // B2 从 C1 赚 30%，C2 赚 20%，B1 赚 10%
    5: { 1: 35, 2: 25, 3: 15, 4: 5 }           // B3 从 C1 赚 35%，C2 赚 25%，B1 赚 15%，B2 赚 5%
};

// 兼容旧格式（供 distribution-commission.js 等引用）
const DEFAULT_AGENT_COMMISSION_CONFIG = {
    direct_pct_by_role: { 1: 20, 2: 30, 3: 40, 4: 40, 5: 40 },
    indirect_pct_by_role: { 2: 0, 3: 0, 4: 10, 5: 10 },
    commission_matrix: DEFAULT_COMMISSION_MATRIX
};

const DEFAULT_PEER_BONUS_CONFIG = {
    enabled: true,
    default_version: 'team',
    cooldown_days: 90,
    social: {
        level_3: { pct: 10 },
        level_4: { pct: 20 },
        level_5: { pct: 20 },
    },
    team: {
        level_3: { cash: 100, exchange_coupons: 2, coupon_product_value: 399, unlock_reward: 160, allowed_product_ids: [], allowed_sku_ids: [], exchange_title: '' },
        level_4: { cash: 2400, exchange_coupons: 15, coupon_product_value: 399, unlock_reward: 160, allowed_product_ids: [], allowed_sku_ids: [], exchange_title: '' },
        level_5: { cash: 0, exchange_coupons: 0, coupon_product_value: 0, unlock_reward: 0, allowed_product_ids: [], allowed_sku_ids: [], exchange_title: '' },
    },
    refund_dev_fee_pct: 1.5,
    // 兼容旧格式
    level_1: 0, level_2: 0, level_3: 100, level_4: 2000, level_5: 0,
    product_sets_3: 2, product_sets_4: 15, product_sets_5: 0
};

const DEFAULT_POINT_RULES = {
    deduction: {
        yuan_per_point: 0.1,
        max_order_ratio: 0.7
    },
    purchase_multiplier_by_role: {
        0: 50,
        1: 100,
        2: 150,
        3: 300,
        4: 400,
        5: 500
    },
    group_start: {
        points: 0,
        remark: '发起拼团'
    },
    group_success: {
        points: 0,
        remark: '拼团成功奖励'
    }
};

const DEFAULT_GROWTH_RULES = {
    purchase: {
        enabled: true,
        multiplier: 1,
        fixed: 0,
        use_original_amount: false
    }
};

function toNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === '') return [];
    return [value];
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
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

function matrixRate(matrix, parentRole, buyerRole) {
    const row = matrix[parentRole];
    if (!row) return 0;
    const val = toNumber(row[buyerRole], NaN);
    if (Number.isFinite(val)) return val > 1 ? val / 100 : val;
    return 0;
}

function normalizeIdList(values) {
    return toArray(values).map((value) => String(value || '').trim()).filter(Boolean);
}

function buildExchangeMeta(teamConfig = {}, bonusLevel = 0) {
    const allowedProductIds = normalizeIdList(teamConfig.allowed_product_ids);
    const allowedSkuIds = normalizeIdList(teamConfig.allowed_sku_ids);
    const couponProductValue = Math.max(0, toNumber(teamConfig.coupon_product_value, 0));
    const title = String(teamConfig.exchange_title || `平级奖兑换券（${couponProductValue}元产品）`).trim();
    return {
        bonus_level: Math.max(0, toNumber(bonusLevel, 0)),
        allowed_product_ids: allowedProductIds,
        allowed_sku_ids: allowedSkuIds,
        coupon_product_value: couponProductValue,
        unlock_reward: Math.max(0, toNumber(teamConfig.unlock_reward, 0)),
        title,
        bind_status: allowedProductIds.length || allowedSkuIds.length ? 'ready' : 'pending_bind'
    };
}

async function loadAgentRuntimeConfig() {
    const [upgradeRow, commissionRow, matrixRow, memberLevelRow, peerBonusRow, pointRuleRow, growthRuleRow] = await Promise.all([
        getConfigByKeys(['member_upgrade_rule_config', 'agent_system_upgrade-rules', 'agent_system_upgrade_rules']),
        getConfigByKeys(['agent_system_commission-config', 'agent_system_commission_config']),
        getConfigByKeys(['agent_system_commission-matrix', 'agent_system_commission_matrix']),
        getConfigByKeys(['member_level_config']),
        getConfigByKeys(['agent_system_peer-bonus', 'agent_system_peer_bonus']),
        getConfigByKeys(['point_rule_config']),
        getConfigByKeys(['growth_rule_config'])
    ]);
    const upgradeRules = { ...DEFAULT_AGENT_UPGRADE_RULES, ...parseConfigValue(upgradeRow, {}) };
    const commission = parseConfigValue(commissionRow, {});
    const dbMatrix = parseConfigValue(matrixRow, null);
    const memberLevels = Array.isArray(parseConfigValue(memberLevelRow, [])) ? parseConfigValue(memberLevelRow, []) : [];
    const peerBonus = { ...DEFAULT_PEER_BONUS_CONFIG, ...parseConfigValue(peerBonusRow, {}) };
    const pointRuleRaw = parseConfigValue(pointRuleRow, {}) || {};
    const pointRules = {
        ...DEFAULT_POINT_RULES,
        ...pointRuleRaw,
        deduction: {
            ...DEFAULT_POINT_RULES.deduction,
            ...(pointRuleRaw.deduction || {})
        },
        purchase_multiplier_by_role: {
            ...DEFAULT_POINT_RULES.purchase_multiplier_by_role,
            ...(pointRuleRaw.purchase_multiplier_by_role || {})
        },
        group_start: {
            ...DEFAULT_POINT_RULES.group_start,
            ...(pointRuleRaw.group_start || {})
        },
        group_success: {
            ...DEFAULT_POINT_RULES.group_success,
            ...(pointRuleRaw.group_success || {})
        }
    };
    const growthRuleRaw = parseConfigValue(growthRuleRow, {}) || {};
    const growthRules = {
        ...DEFAULT_GROWTH_RULES,
        ...growthRuleRaw,
        purchase: {
            ...DEFAULT_GROWTH_RULES.purchase,
            ...(growthRuleRaw.purchase || {})
        }
    };
    const commissionMatrix = normalizeCommissionMatrix(
        dbMatrix || commission?.commission_matrix,
        DEFAULT_COMMISSION_MATRIX
    );
    return {
        upgradeRules,
        commissionConfig: {
            direct_pct_by_role: normalizePctMap(commission?.direct_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.direct_pct_by_role),
            indirect_pct_by_role: normalizePctMap(commission?.indirect_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.indirect_pct_by_role),
            commission_matrix: commissionMatrix
        },
        commissionMatrix,
        memberLevels,
        peerBonus,
        pointRules,
        growthRules
    };
}

function getRoleMeta(roleLevel, memberLevels = []) {
    const current = (memberLevels || []).find((item) => toNumber(item.level, -1) === roleLevel);
    return {
        roleName: current?.name || DEFAULT_ROLE_NAMES[roleLevel] || '普通用户',
        discountRate: current?.discount_rate != null ? toNumber(current.discount_rate, 1) : null
    };
}

function userRelationIds(user = {}) {
    const ids = [user.id, user._legacy_id, user._id].filter(hasValue);
    const out = [];
    ids.forEach((id) => {
        out.push(id);
        const num = Number(id);
        if (Number.isFinite(num)) out.push(num);
        out.push(String(id));
    });
    return [...new Set(out.map((item) => `${typeof item}:${item}`))].map((key) => {
        const [, value] = key.split(':');
        const numeric = Number(value);
        return key.startsWith('number:') && Number.isFinite(numeric) ? numeric : value;
    });
}

function directRelationWhere(user = {}) {
    const clauses = [];
    if (user.openid) clauses.push({ referrer_openid: user.openid });
    const ids = userRelationIds(user);
    if (ids.length) clauses.push({ parent_id: _.in(ids) });
    if (!clauses.length) return { referrer_openid: '__none__' };
    return clauses.length === 1 ? clauses[0] : _.or(clauses);
}

async function getDirectMembers(user = {}) {
    if (!user || !user.openid) return [];
    return db.collection('users')
        .where(directRelationWhere(user))
        .limit(200)
        .get()
        .then((res) => res.data || [])
        .catch(() => []);
}

async function getRechargeTotal(openid) {
    if (!openid) return 0;
    const rows = await db.collection('wallet_recharge_orders')
        .where({ openid, status: _.in(['paid', 'completed', 'success']) })
        .limit(200)
        .get()
        .then((res) => res.data || [])
        .catch(() => []);
    return roundMoney(rows.reduce((sum, row) => sum + toNumber(row.amount, 0), 0));
}

async function getAllOrdersByOpenid(openid) {
    if (!openid) return [];
    const rows = [];
    const limit = 100;
    let skip = 0;
    while (true) {
        const res = await db.collection('orders')
            .where({ openid })
            .skip(skip)
            .limit(limit)
            .get()
            .catch(() => ({ data: [] }));
        const batch = res.data || [];
        rows.push(...batch);
        if (batch.length < limit) break;
        skip += limit;
    }
    return rows;
}

function isEffectiveUpgradeOrder(order = {}, effectiveDays = DEFAULT_AGENT_UPGRADE_RULES.effective_order_days) {
    const status = String(order.status || '').toLowerCase();
    if (['cancelled', 'canceled', 'refunded', 'pending', 'pending_payment', 'after_sale', 'refunding'].includes(status)) {
        return false;
    }
    if (toNumber(order.refunded_cash_total, 0) > 0 || order.has_partial_refund === true) {
        return false;
    }
    const confirmedAt = parseTimestamp(order.confirmed_at || order.completed_at || order.auto_confirmed_at);
    if (!confirmedAt) return false;
    const cutoff = Date.now() - Math.max(0, effectiveDays) * 24 * 60 * 60 * 1000;
    return confirmedAt <= cutoff;
}

async function getEffectiveOrderSales(openid, effectiveDays = DEFAULT_AGENT_UPGRADE_RULES.effective_order_days) {
    const rows = await getAllOrdersByOpenid(openid);
    return roundMoney(rows.reduce((sum, row) => {
        if (!isEffectiveUpgradeOrder(row, effectiveDays)) return sum;
        return sum + toNumber(row.pay_amount ?? row.actual_price ?? row.total_amount, 0);
    }, 0));
}

function deriveEligibleRoleLevel(currentRoleLevel = 0, effectiveSales = 0, directMembers = [], rechargeTotal = 0, upgradeRules = DEFAULT_AGENT_UPGRADE_RULES) {
    const resolvedCurrentRoleLevel = toNumber(currentRoleLevel, 0);
    let nextRoleLevel = resolvedCurrentRoleLevel;
    const totalSpent = roundMoney(effectiveSales);

    if (totalSpent >= toNumber(upgradeRules.c1_min_purchase, DEFAULT_AGENT_UPGRADE_RULES.c1_min_purchase)) {
        nextRoleLevel = Math.max(nextRoleLevel, 1);
    }

    const c1OrAboveCount = directMembers.filter((member) => toNumber(member.role_level ?? member.distributor_level, 0) >= 1).length;
    if (
        totalSpent >= toNumber(upgradeRules.c2_min_sales, DEFAULT_AGENT_UPGRADE_RULES.c2_min_sales)
        && c1OrAboveCount >= toNumber(upgradeRules.c2_referee_count, DEFAULT_AGENT_UPGRADE_RULES.c2_referee_count)
    ) {
        nextRoleLevel = Math.max(nextRoleLevel, 2);
    }

    // B1 晋级：推荐 10 个 C1（及以上）或充值 3000
    if (
        c1OrAboveCount >= toNumber(upgradeRules.b1_referee_count, DEFAULT_AGENT_UPGRADE_RULES.b1_referee_count)
        || rechargeTotal >= toNumber(upgradeRules.b1_recharge, DEFAULT_AGENT_UPGRADE_RULES.b1_recharge)
    ) {
        nextRoleLevel = Math.max(nextRoleLevel, 3);
    }

    // B2 晋级：推荐 10 个 B1（及以上）或充值 30000
    const b1OrAboveCount = directMembers.filter((member) => toNumber(member.role_level ?? member.distributor_level, 0) >= 3).length;
    if (
        b1OrAboveCount >= toNumber(upgradeRules.b2_referee_count, DEFAULT_AGENT_UPGRADE_RULES.b2_referee_count)
        || rechargeTotal >= toNumber(upgradeRules.b2_recharge, DEFAULT_AGENT_UPGRADE_RULES.b2_recharge)
    ) {
        nextRoleLevel = Math.max(nextRoleLevel, 4);
    }

    // B3 晋级：推荐 3 个 B2 或 30 个 B1 或充值 198000
    const b2OrAboveCount = directMembers.filter((member) => toNumber(member.role_level ?? member.distributor_level, 0) >= 4).length;
    if (
        b2OrAboveCount >= toNumber(upgradeRules.b3_referee_b2_count, 3)
        || b1OrAboveCount >= toNumber(upgradeRules.b3_referee_b1_count, 30)
        || rechargeTotal >= toNumber(upgradeRules.b3_recharge, DEFAULT_AGENT_UPGRADE_RULES.b3_recharge)
    ) {
        nextRoleLevel = Math.max(nextRoleLevel, 5);
    }

    return nextRoleLevel;
}

function isExchangeOrder(order = {}) {
    return String(order.type || order.order_type || '').trim().toLowerCase() === 'exchange';
}

function amountFen(value) {
    return Math.round(toNumber(value, 0) * 100);
}

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
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

function getCallbackPaidFen(transaction = {}) {
    const total = transaction.amount && transaction.amount.total;
    if (total !== undefined && total !== null) return toNumber(total, NaN);
    if (transaction.total_fee !== undefined && transaction.total_fee !== null) return toNumber(transaction.total_fee, NaN);
    if (transaction.payer_total !== undefined && transaction.payer_total !== null) return toNumber(transaction.payer_total, NaN);
    return NaN;
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

async function increaseGoodsFundLedger(openid, amount, refId, remark, refType = 'wx_recharge') {
    const { user, account: existingAccount } = await getWalletAccountByOpenid(openid);
    if (!user) throw new Error('货款账本同步失败：用户不存在');
    const account = existingAccount || await ensureWalletAccountForUser(user, getUserGoodsFundBalance(user) - amount);
    if (!account) throw new Error('货款账本同步失败：无法创建钱包账户');
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
            change_type: 'recharge',
            amount,
            balance_before: before,
            balance_after: after,
            ref_type: refType,
            ref_id: refId,
            remark,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });

    return true;
}

function getOrderPayFen(order = {}) {
    return amountFen(resolveOrderPayAmount(order, 0));
}

function getOrderTotalAmount(order = {}) {
    return resolveOrderPayAmount(order, 0);
}

function buildPaidOrderPatch(paymentMethod, payAmount, extra = {}) {
    return buildPaymentWritePatch(paymentMethod, payAmount, extra);
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
    const candidates = [
        db.collection('users').where({ openid: String(value) }).limit(1).get().catch(() => ({ data: [] })),
        Number.isFinite(num)
            ? db.collection('users').where({ id: num }).limit(1).get().catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        db.collection('users').doc(String(value)).get().then((res) => ({ data: res.data ? [res.data] : [] })).catch(() => ({ data: [] }))
    ];
    const results = await Promise.all(candidates);
    return results.flatMap((item) => item.data || [])[0] || null;
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

function getUserRoleLevel(user = {}) {
    return toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
}

function normalizeAgentRoleLevel(roleLevel) {
    const normalized = toNumber(roleLevel, 0);
    if (normalized >= 5) return 5;
    if (normalized === 4) return 4;
    if (normalized === 3) return 3;
    return 0;
}

function resolveSupplyPriceByRole(product = {}, sku = {}, roleLevel = 0) {
    const normalizedRole = normalizeAgentRoleLevel(roleLevel);
    if (!normalizedRole) return null;
    const fieldName = `supply_price_b${normalizedRole === 5 ? 3 : normalizedRole}`;
    const explicit = sku?.[fieldName] ?? product?.[fieldName];
    const amount = toNumber(explicit, NaN);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function resolveProductPrice(product = {}) {
    const legacyPrice = firstNumber([product.retail_price, product.price]);
    if (legacyPrice !== null) return legacyPrice;
    return centsToYuan(product.min_price, 0);
}

function resolveSkuPrice(sku = {}) {
    const legacyPrice = firstNumber([sku.retail_price, sku.price]);
    if (legacyPrice !== null) return legacyPrice;
    return centsToYuan(sku.min_price, 0);
}

function resolveUnitCost(product = {}, sku = {}, item = {}, order = {}) {
    const fulfillmentRole = normalizeAgentRoleLevel(order.fulfillment_partner_role_level || order.nearest_agent_role_level);
    const explicit = firstNumber([
        item.locked_agent_cost,
        item.locked_agent_unit_cost,
        resolveSupplyPriceByRole(product, sku, fulfillmentRole),
        sku.cost_price,
        product.cost_price,
        sku.price_agent,
        product.price_agent,
        sku.price_leader,
        product.price_leader,
        sku.price_member,
        product.price_member
    ]);
    return explicit !== null ? explicit : resolveSkuPrice(sku) || resolveProductPrice(product);
}

function commissionConfigForLevel(product = {}, level, baseAmount) {
    const fixed = firstNumber([
        product[`commission_amount_${level}`],
        product[`commission${level}_amount`]
    ]);
    if (fixed !== null) return roundMoney(fixed);

    const rate = firstNumber([
        product[`commission_rate_${level}`],
        product[`rate_${level}`]
    ]);
    if (rate !== null) return roundMoney(baseAmount * rate);

    return 0;
}

function roleBasedCommission(user = {}, level, baseAmount, commissionConfig = DEFAULT_AGENT_COMMISSION_CONFIG) {
    const role = toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
    if (commissionConfig.commission_matrix) {
        return 0;
    }
    const directRates = normalizePctMap(commissionConfig.direct_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.direct_pct_by_role);
    const indirectRates = normalizePctMap(commissionConfig.indirect_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.indirect_pct_by_role);
    const rates = level === 1 ? directRates : indirectRates;
    return roundMoney(baseAmount * (rates[role] || 0));
}

async function ensureAgentRoleSynced(orderId, order) {
    if (isExchangeOrder(order)) {
        return { skipped: true, reason: 'exchange_order' };
    }
    if (!order.openid) return { skipped: true };
    const user = await findUserByAny(order.openid);
    if (!user) return { skipped: true };

    const { upgradeRules, memberLevels } = await loadAgentRuntimeConfig();
    if (upgradeRules.enabled === false) return { skipped: true };

    const [directMembers, rechargeTotal, effectiveSales] = await Promise.all([
        getDirectMembers(user),
        getRechargeTotal(order.openid),
        getEffectiveOrderSales(order.openid, toNumber(upgradeRules.effective_order_days, DEFAULT_AGENT_UPGRADE_RULES.effective_order_days))
    ]);

    const currentRoleLevel = toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
    const nextRoleLevel = deriveEligibleRoleLevel(currentRoleLevel, effectiveSales, directMembers, rechargeTotal, upgradeRules);
    if (nextRoleLevel <= currentRoleLevel) {
        return { skipped: true, currentRoleLevel, nextRoleLevel };
    }

    const roleMeta = getRoleMeta(nextRoleLevel, memberLevels);
    const nextDistributorLevel = Math.max(
        toNumber(user.distributor_level != null ? user.distributor_level : user.agent_level, 0),
        nextRoleLevel
    );
    await db.collection('users').where({ openid: order.openid }).update({
        data: {
            role_level: nextRoleLevel,
            role_name: roleMeta.roleName,
            distributor_level: nextDistributorLevel,
            agent_level: nextDistributorLevel,
            participate_distribution: 1,
            discount_rate: roleMeta.discountRate != null ? roleMeta.discountRate : user.discount_rate,
            role_upgraded_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });

    // 记录晋升日志
    await db.collection('promotion_logs').add({
        data: {
            openid: order.openid,
            user_id: user.id || user._legacy_id || user._id || order.openid,
            from_level: currentRoleLevel,
            to_level: nextRoleLevel,
            from_name: DEFAULT_ROLE_NAMES[currentRoleLevel] || '普通用户',
            to_name: roleMeta.roleName,
            trigger_type: rechargeTotal >= toNumber(upgradeRules.b1_recharge, 3000) ? 'recharge' : 'referral',
            trigger_order_id: orderId,
            total_spent: effectiveSales,
            recharge_total: rechargeTotal,
            direct_member_count: directMembers.length,
            promoted_at: db.serverDate(),
            created_at: db.serverDate()
        }
    }).catch((err) => console.error('[RoleSync] 晋升日志写入失败:', err.message));

    return { upgraded: true, previousRoleLevel: currentRoleLevel, nextRoleLevel, roleName: roleMeta.roleName };
}

async function ensurePeerBonusCreated(orderId, order, roleSyncResult) {
    if (isExchangeOrder(order)) return { skipped: true, reason: 'exchange_order' };
    if (!roleSyncResult?.upgraded) return { skipped: true };
    const buyer = await findUserByAny(order.openid || order.buyer_id || order.user_id);
    if (!buyer) return { skipped: true };
    const parent = await findUserByAny(getUserReferrer(buyer));
    if (!parent || !parent.openid) return { skipped: true };

    const { peerBonus } = await loadAgentRuntimeConfig();
    if (peerBonus.enabled === false) return { skipped: true };

    const bonusLevel = toNumber(roleSyncResult.nextRoleLevel, 0);
    const targetParentRole = toNumber(parent.role_level ?? parent.distributor_level ?? parent.level, 0);
    if (bonusLevel <= 0 || targetParentRole !== bonusLevel) {
        return { skipped: true, reason: 'not_same_level' };
    }

    const existing = await db.collection('commissions')
        .where({ order_id: orderId, openid: parent.openid, type: 'same_level', bonus_role_level: bonusLevel })
        .limit(1).get().catch(() => ({ data: [] }));
    if (existing.data && existing.data.length > 0) {
        return { skipped: true, reason: 'already_created' };
    }

    // 确定版本：用户个人设定 > 全局默认
    const version = parent.peer_bonus_version || peerBonus.default_version || 'team';
    const upgradePayment = getOrderTotalAmount(order);
    const cooldownDays = toNumber(peerBonus.cooldown_days, 90);
    const releaseAt = new Date(Date.now() + cooldownDays * 24 * 60 * 60 * 1000);

    let amount = 0;
    let exchangeCoupons = 0;
    let description = '';

    if (version === 'social') {
        const socialConfig = (peerBonus.social || {})[`level_${bonusLevel}`] || {};
        const pct = toNumber(socialConfig.pct, 0);
        amount = roundMoney(upgradePayment * pct / 100);
        description = `平级奖（社会版${pct}%）：下级升级为 ${roleSyncResult.roleName}`;
    } else {
        const teamConfig = (peerBonus.team || {})[`level_${bonusLevel}`] || {};
        amount = roundMoney(toNumber(teamConfig.cash, peerBonus[`level_${bonusLevel}`] || 0));
        exchangeCoupons = toNumber(teamConfig.exchange_coupons, peerBonus[`product_sets_${bonusLevel}`] || 0);
        description = `平级奖（团队版）：下级升级为 ${roleSyncResult.roleName}`;

        // 团队版：为上级创建特殊兑换券
        if (exchangeCoupons > 0) {
            const couponValue = toNumber(teamConfig.coupon_product_value, 399);
            for (let i = 0; i < exchangeCoupons; i++) {
                await db.collection('user_coupons').add({
                    data: {
                        openid: parent.openid,
                        coupon_type: 'exchange',
                        coupon_value: couponValue,
                        min_purchase: 0,
                        status: 'unused',
                        source: 'peer_bonus',
                        source_order_id: orderId,
                        bonus_role_level: bonusLevel,
                        unlock_reward: toNumber(teamConfig.unlock_reward, 160),
                        title: pickString(teamConfig.exchange_title || `平级奖兑换券（${couponValue}元产品）`),
                        description: `升级奖励兑换券，可兑换${couponValue}元指定产品`,
                        exchange_meta: buildExchangeMeta(teamConfig, bonusLevel),
                        created_at: db.serverDate(),
                        expires_at: null,
                    },
                }).catch((err) => console.error('[PeerBonus] 创建兑换券失败:', err.message));
            }
        }
    }

    if (amount <= 0 && exchangeCoupons <= 0) return { skipped: true, reason: 'no_bonus_amount' };

    await db.collection('commissions').add({
        data: {
            openid: parent.openid,
            user_id: parent.id || parent._legacy_id || parent._id || parent.openid,
            from_openid: buyer.openid,
            order_id: orderId,
            order_no: order.order_no,
            amount: Math.max(0, amount),
            level: bonusLevel,
            type: 'same_level',
            status: 'frozen',
            bonus_role_level: bonusLevel,
            peer_bonus_version: version,
            exchange_coupons: exchangeCoupons,
            peer_bonus_release_at: releaseAt,
            refund_deadline: releaseAt,
            description,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });
    return { created: true, amount, bonusLevel, version, exchangeCoupons };
}

async function ensurePointsAwarded(orderId, order) {
    if (isExchangeOrder(order)) {
        await db.collection('orders').doc(orderId).update({
            data: { points_awarded_at: db.serverDate(), points_earned: 0, updated_at: db.serverDate() },
        });
        return { skipped: true, reason: 'exchange_order', awarded: 0, growth: 0, multiplier: 0, buyerRole: 0 };
    }
    if (order.points_awarded_at) return { skipped: true };
    const payAmount = getOrderTotalAmount(order);
    if (payAmount <= 0 || !order.openid) {
        await db.collection('orders').doc(orderId).update({
            data: { points_awarded_at: db.serverDate(), updated_at: db.serverDate() },
        });
        return { awarded: 0 };
    }

    // 查买家等级，按等级倍率赠送积分
    const buyerRes = await db.collection('users').where({ openid: order.openid }).limit(1).get().catch(() => ({ data: [] }));
    const buyerRole = buyerRes.data && buyerRes.data[0]
        ? toNumber(buyerRes.data[0].role_level ?? buyerRes.data[0].distributor_level ?? buyerRes.data[0].level, 0)
        : 0;
    const { pointRules, growthRules } = await loadAgentRuntimeConfig();
    const purchasePointsPerHundred = Math.max(
        0,
        toNumber(pointRules.purchase_multiplier_by_role?.[buyerRole], pointRules.purchase_multiplier_by_role?.[0] || DEFAULT_POINT_RULES.purchase_multiplier_by_role[0])
    );
    const pointsEarned = Math.floor((payAmount * purchasePointsPerHundred) / 100);

    const purchaseGrowthRule = growthRules.purchase || DEFAULT_GROWTH_RULES.purchase;
    const growthBaseAmount = purchaseGrowthRule.use_original_amount
        ? toNumber(order.original_amount ?? order.total_amount ?? payAmount, payAmount)
        : payAmount;
    const growthEarned = purchaseGrowthRule.enabled === false
        ? 0
        : Math.max(0, Math.floor(growthBaseAmount * toNumber(purchaseGrowthRule.multiplier, 1) + toNumber(purchaseGrowthRule.fixed, 0)));

    if (pointsEarned <= 0 && growthEarned <= 0) {
        await db.collection('orders').doc(orderId).update({
            data: { points_awarded_at: db.serverDate(), updated_at: db.serverDate() },
        });
        return { awarded: 0 };
    }

    const updates = { total_spent: _.inc(payAmount), order_count: _.inc(1), updated_at: db.serverDate() };
    if (pointsEarned > 0) updates.points = _.inc(pointsEarned);
    if (growthEarned > 0) updates.growth_value = _.inc(growthEarned);

    await db.collection('users').where({ openid: order.openid }).update({ data: updates });

    const existingLog = await db.collection('point_logs')
        .where({ openid: order.openid, source: 'order_pay', order_id: orderId })
        .limit(1).get().catch(() => ({ data: [] }));
    if (!existingLog.data || existingLog.data.length === 0) {
        await db.collection('point_logs').add({
            data: {
                openid: order.openid,
                type: 'earn',
                amount: pointsEarned,
                source: 'order_pay',
                order_id: orderId,
                buyer_role: buyerRole,
                multiplier: purchasePointsPerHundred,
                description: `订单支付获得${pointsEarned}积分（每100元赠送${purchasePointsPerHundred}积分）`,
                created_at: db.serverDate(),
            },
        });
    }

    await db.collection('orders').doc(orderId).update({
        data: { points_awarded_at: db.serverDate(), points_earned: pointsEarned, updated_at: db.serverDate() },
    });
    return { awarded: pointsEarned, growth: growthEarned, multiplier: purchasePointsPerHundred, buyerRole };
}

async function ensureStockDeducted(orderId, order) {
    if (order.stock_deducted_at) return { skipped: true };
    const items = toArray(order.items);
    for (const item of items) {
        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        if (item.product_id) {
            const product = await getDocByIdOrLegacy('products', item.product_id);
            if (product && product._id) {
                await db.collection('products').doc(String(product._id)).update({
                    data: { stock: _.inc(-qty), sales_count: _.inc(qty), updated_at: db.serverDate() },
                }).catch(() => {});
            }
        }
        if (item.sku_id) {
            const sku = await getDocByIdOrLegacy('skus', item.sku_id);
            if (sku && sku._id) {
                await db.collection('skus').doc(String(sku._id)).update({
                    data: { stock: _.inc(-qty), updated_at: db.serverDate() },
                }).catch(() => {});
            }
        }
    }
    await db.collection('orders').doc(orderId).update({
        data: { stock_deducted_at: db.serverDate(), updated_at: db.serverDate() },
    });
    return { deducted: items.length };
}

async function ensureCommissionsCreated(orderId, order) {
    if (isExchangeOrder(order)) {
        await db.collection('orders').doc(orderId).update({
            data: { commissions_created_at: db.serverDate(), updated_at: db.serverDate() },
        });
        return { skipped: true, reason: 'exchange_order', created: 0 };
    }
    if (order.commissions_created_at) return { skipped: true };
    const buyer = await findUserByAny(order.openid || order.buyer_id || order.user_id);
    if (!buyer) {
        await db.collection('orders').doc(orderId).update({
            data: { commissions_created_at: db.serverDate(), updated_at: db.serverDate() },
        });
        return { created: 0 };
    }

    const parent = await findUserByAny(order.direct_referrer_openid || getUserReferrer(buyer));
    const grandparent = await findUserByAny(order.indirect_referrer_openid || (parent ? getUserReferrer(parent) : ''));
    const fulfillmentPartner = await findUserByAny(order.fulfillment_partner_openid || order.nearest_agent_openid || order.agent_info?.openid || '');
    const fulfillmentPartnerOpenid = fulfillmentPartner?.openid || order.fulfillment_partner_openid || '';
    const beneficiaries = [
        { level: 1, type: 'direct', user: parent },
        { level: 2, type: 'indirect', user: grandparent }
    ].filter((b) => b.user && b.user.openid && b.user.openid !== order.openid);

    if (!beneficiaries.length) {
        await db.collection('orders').doc(orderId).update({
            data: { commissions_created_at: db.serverDate(), updated_at: db.serverDate() },
        });
        return { created: 0 };
    }

    const { commissionConfig, commissionMatrix } = await loadAgentRuntimeConfig();
    const useMatrix = commissionMatrix && Object.keys(commissionMatrix).length > 0;
    const buyerRole = toNumber(buyer.role_level ?? buyer.distributor_level ?? buyer.level, 0);
    const totals = new Map();
    const items = toArray(order.items);

    // 佣金基数 = 实付金额（pay_amount 已扣除积分抵扣和优惠券，无需再减 points_discount）
    const orderPayAmount = getOrderTotalAmount(order);
    const commissionBase = orderPayAmount;
    if (commissionBase <= 0) {
        await db.collection('orders').doc(orderId).update({
            data: { commissions_created_at: db.serverDate(), updated_at: db.serverDate() },
        });
        return { created: 0, reason: 'all_points_payment' };
    }

    const itemBaseTotal = items.reduce((sum, item) => {
        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        return sum + roundMoney(item.subtotal ?? item.item_amount ?? (toNumber(item.price || item.unit_price, 0) * qty));
    }, 0) || commissionBase;

    for (const item of items) {
        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        const product = await getDocByIdOrLegacy('products', item.product_id) || {};
        const sku = item.sku_id ? await getDocByIdOrLegacy('skus', item.sku_id) || {} : {};
        const rawBase = roundMoney(item.subtotal ?? item.item_amount ?? (toNumber(item.price || item.unit_price, 0) * qty));
        const allocatedBase = itemBaseTotal > 0 ? roundMoney(commissionBase * rawBase / itemBaseTotal) : rawBase;
        if (useMatrix) {
            // 级差矩阵制：parent 拿 matrix[parentRole][buyerRole]%，grandparent 拿级差
            // 即便父级被跳过（因为 openid == buyer 等），也要用父级应得比例计算级差
            const parentBeneficiary = beneficiaries.find(b => b.level === 1);
            const parentRole = parentBeneficiary
                ? toNumber(parentBeneficiary.user.role_level ?? parentBeneficiary.user.distributor_level ?? parentBeneficiary.user.level, 0)
                : 0;
            // 无论是否使用商品级配置，都应基于矩阵比例计算级差基准
            const parentMatrixRate = parentBeneficiary ? matrixRate(commissionMatrix, parentRole, buyerRole) : 0;

            for (const beneficiary of beneficiaries) {
                const bRole = toNumber(beneficiary.user.role_level ?? beneficiary.user.distributor_level ?? beneficiary.user.level, 0);

                const configured = commissionConfigForLevel(product, beneficiary.level, allocatedBase);
                let amount;
                if (configured > 0) {
                    amount = Math.min(allocatedBase, configured);
                } else {
                    const myRate = matrixRate(commissionMatrix, bRole, buyerRole);
                    const effectiveRate = beneficiary.level === 1
                        ? myRate
                        : Math.max(0, myRate - parentMatrixRate);
                    amount = roundMoney(allocatedBase * effectiveRate);
                }

                if (amount <= 0) continue;
                if (fulfillmentPartnerOpenid && beneficiary.user.openid === fulfillmentPartnerOpenid) continue;
                const key = `${beneficiary.user.openid}:${beneficiary.level}:${beneficiary.type}`;
                totals.set(key, {
                    openid: beneficiary.user.openid,
                    user_id: beneficiary.user.id || beneficiary.user._legacy_id || beneficiary.user._id || beneficiary.user.openid,
                    amount: roundMoney((totals.get(key)?.amount || 0) + amount),
                    level: beneficiary.level,
                    type: beneficiary.type
                });
            }
        } else {
            // 兼容旧模式
            for (const beneficiary of beneficiaries) {
                const configured = commissionConfigForLevel(product, beneficiary.level, allocatedBase);
                const roleBased = roleBasedCommission(beneficiary.user, beneficiary.level, allocatedBase, commissionConfig);
                const amount = configured > 0
                    ? Math.min(allocatedBase, configured)
                    : roleBased;
                if (amount <= 0) continue;
                if (fulfillmentPartnerOpenid && beneficiary.user.openid === fulfillmentPartnerOpenid) continue;
                const key = `${beneficiary.user.openid}:${beneficiary.level}:${beneficiary.type}`;
                totals.set(key, {
                    openid: beneficiary.user.openid,
                    user_id: beneficiary.user.id || beneficiary.user._legacy_id || beneficiary.user._id || beneficiary.user.openid,
                    amount: roundMoney((totals.get(key)?.amount || 0) + amount),
                    level: beneficiary.level,
                    type: beneficiary.type
                });
            }
        }
    }

    let created = 0;
    for (const commission of totals.values()) {
        if (commission.amount <= 0) continue;
        const existing = await db.collection('commissions')
            .where({ order_id: orderId, openid: commission.openid, level: commission.level, type: commission.type })
            .limit(1).get().catch(() => ({ data: [] }));
        if (existing.data && existing.data.length > 0) continue;
        await db.collection('commissions').add({
            data: {
                openid: commission.openid,
                user_id: commission.user_id,
                from_openid: order.openid,
                buyer_role: buyerRole,
                order_id: orderId,
                order_no: order.order_no,
                amount: commission.amount,
                level: commission.level,
                type: commission.type,
                status: 'pending',
                created_at: db.serverDate(),
                updated_at: db.serverDate(),
            },
        });
        created += 1;
    }

    await db.collection('orders').doc(orderId).update({
        data: { commissions_created_at: db.serverDate(), updated_at: db.serverDate() },
    });
    return { created, commission_base: commissionBase };
}

function isGroupOrder(order = {}) {
    return order.type === 'group' || hasValue(order.group_activity_id) || hasValue(order.group_no);
}

function isActivityOpen(activity) {
    return activity && (
        activity.status === true
        || activity.status === 'active'
        || activity.is_active === true
        || activity.active === true
    );
}

async function findGroupOrder(groupNo) {
    if (!hasValue(groupNo)) return null;
    const res = await db.collection('group_orders')
        .where({ group_no: String(groupNo) })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

/**
 * 成团后将所有参团订单从 pending_group → paid
 */
async function promoteGroupOrdersToPaid(groupOrder) {
    if (!groupOrder) return;
    const groupNo = groupOrder.group_no;
    const activityId = groupOrder.activity_id || groupOrder.legacy_activity_id || '';
    try {
        // 通过 group_no 查找关联订单
        if (groupNo) {
            await db.collection('orders')
                .where({ group_no: groupNo, status: 'pending_group' })
                .update({ data: { status: 'paid', group_completed_at: db.serverDate(), updated_at: db.serverDate() } })
                .catch(() => {});
        }
        // 通过 members 列表精确更新（防止误更新同活动其他团的订单）
        const members = Array.isArray(groupOrder.members) ? groupOrder.members : [];
        for (const m of members) {
            if (m.order_id) {
                await db.collection('orders').doc(String(m.order_id))
                    .update({ data: { status: 'paid', group_no: groupNo, group_completed_at: db.serverDate(), updated_at: db.serverDate() } })
                    .catch(() => {});
            }
        }
        console.log('[GroupJoin] 成团，已将参团订单从 pending_group 更新为 paid, group_no:', groupNo);
    } catch (err) {
        console.error('[GroupJoin] promoteGroupOrdersToPaid 失败:', err.message);
    }
}

async function ensurePaidGroupJoined(orderId, order) {
    if (!isGroupOrder(order)) return { skipped: true };
    if (order.group_joined_at) return { skipped: true };

    const activity = await getDocByIdOrLegacy('group_activities', order.group_activity_id || order.legacy_group_activity_id || order.activity_id);
    if (!activity) {
        console.warn('[GroupJoin] 活动记录未找到，基于订单信息降级创建拼团');
    }
    if (activity && !isActivityOpen(activity)) {
        console.warn('[GroupJoin] 活动已结束，但订单已支付，继续处理拼团');
    }

    const groupSize = Math.max(2, toNumber(activity?.group_size || activity?.min_members || order.group_size, 2));
    let groupNo = order.group_no || '';
    let groupOrder = await findGroupOrder(groupNo);

    if (groupOrder && !['pending', 'open'].includes(groupOrder.status)) {
        throw new Error('拼团已结束');
    }
    if (!groupOrder && groupNo) {
        throw new Error('拼团不存在或已结束');
    }

    const member = {
        openid: order.openid,
        order_id: orderId,
        order_no: order.order_no,
        paid_at: db.serverDate(),
        joined_at: db.serverDate(),
    };

    async function writeGroupNoToOrder(gno) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await db.collection('orders').doc(orderId).update({
                    data: { group_no: gno, group_joined_at: db.serverDate(), updated_at: db.serverDate() },
                });
                return;
            } catch (err) {
                console.warn(`[GroupJoin] 写回 group_no 到订单失败 (尝试 ${attempt + 1}/3):`, err.message);
                if (attempt < 2) await new Promise(r => setTimeout(r, 500));
            }
        }
        console.error('[GroupJoin] 写回 group_no 到订单最终失败，orderId:', orderId, 'groupNo:', gno);
    }

    if (!groupOrder) {
        groupNo = groupNo || ('GRP' + Date.now() + Math.floor(Math.random() * 1000));
        const data = {
            group_no: groupNo,
            activity_id: activity?._id || order.group_activity_id || '',
            legacy_activity_id: activity?.id || activity?._legacy_id || order.legacy_group_activity_id || '',
            leader_openid: order.openid,
            status: groupSize <= 1 ? 'completed' : 'pending',
            members: [member],
            group_size: groupSize,
            created_order_id: orderId,
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
        };
        const createRes = await db.collection('group_orders').add({ data });
        await writeGroupNoToOrder(groupNo);
        if (data.status === 'completed') {
            await promoteGroupOrdersToPaid({ ...data, _id: createRes._id });
        }
        return { created: true, group_id: createRes._id, group_no: groupNo, member_count: 1, completed: data.status === 'completed' };
    }

    const members = Array.isArray(groupOrder.members) ? groupOrder.members : [];
    const exists = members.some((item) => item.openid === order.openid || item.order_id === orderId);
    const nextMembers = exists ? members : [...members, member];
    if (!exists) {
        if (members.length >= groupSize) throw new Error('该团已满员');
        await db.collection('group_orders').doc(groupOrder._id).update({
            data: {
                members: _.push(member),
                updated_at: db.serverDate(),
            },
        });
    }

    const memberCount = nextMembers.length;
    const completed = memberCount >= groupSize;
    await writeGroupNoToOrder(groupOrder.group_no);
    if (completed && groupOrder.status !== 'completed') {
        await db.collection('group_orders').doc(groupOrder._id).update({
            data: { status: 'completed', completed_at: db.serverDate(), updated_at: db.serverDate() },
        });
        await promoteGroupOrdersToPaid({
            ...groupOrder,
            status: 'completed',
            members: nextMembers
        });
    }
    return { joined: !exists, group_no: groupOrder.group_no, member_count: memberCount, completed };
}

async function ensureSlashOrderPurchased(orderId, order) {
    if (!hasValue(order.slash_no)) return { skipped: true };
    if (order.slash_purchased_at) return { skipped: true };

    const slashId = String(order.slash_no);
    const recordRes = await db.collection('slash_records')
        .where(_.or([
            { slash_no: slashId },
            { _id: slashId }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const record = recordRes.data && recordRes.data[0] ? recordRes.data[0] : null;
    if (!record) throw new Error('砍价记录不存在');
    if (record.openid !== order.openid) throw new Error('砍价记录归属异常');

    await db.collection('slash_records').doc(record._id).update({
        data: {
            status: 'purchased',
            order_id: orderId,
            order_no: order.order_no,
            purchased_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });
    await db.collection('orders').doc(orderId).update({
        data: {
            slash_no: record.slash_no || order.slash_no,
            slash_record_id: record._id,
            slash_purchased_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });
    return { updated: true, slash_no: record.slash_no || order.slash_no };
}

/**
 * 代理升级时记录基金池入池（写 fund_pool_logs，原子更新基金池余额）
 * 入池金额由 configs 中 agent_system_fund-pool 的 contribution_by_level 配置决定
 * 默认：B1(role_level=3)→480元，B2(role_level=4)→4600元
 */
async function recordFundPoolEntry(openid, roleLevel, source, orderId) {
    try {
        const DEFAULT_CONTRIBUTIONS = { 3: 480, 4: 4600 };
        const DEFAULT_SUB_PCT = { mirror_ops_pct: 42, travel_pct: 31, parent_pct: 11, personal_pct: 16 };
        const LEVEL_KEY = { 3: 'b1', 4: 'b2', 5: 'b3' };

        const configRes = await db.collection('configs')
            .where(_.or([{ key: 'agent_system_fund-pool' }, { config_key: 'agent_system_fund-pool' }]))
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        const rawConfig = (configRes.data && configRes.data[0]) || {};
        const config = rawConfig.config_value || rawConfig.value || rawConfig;
        const levelKey = LEVEL_KEY[roleLevel] || '';

        // 从后台配置中读取该等级的基金池总额和子账户比例
        const levelConfig = (config && typeof config === 'object' && levelKey) ? config[levelKey] : null;
        const contributions = config.contribution_by_level || DEFAULT_CONTRIBUTIONS;
        let amount = 0;
        let subPct = DEFAULT_SUB_PCT;

        if (levelConfig && toNumber(levelConfig.total, 0) > 0) {
            amount = toNumber(levelConfig.total, 0);
            subPct = {
                mirror_ops_pct: toNumber(levelConfig.mirror_ops_pct, DEFAULT_SUB_PCT.mirror_ops_pct),
                travel_pct: toNumber(levelConfig.travel_pct, DEFAULT_SUB_PCT.travel_pct),
                parent_pct: toNumber(levelConfig.parent_pct, DEFAULT_SUB_PCT.parent_pct),
                personal_pct: toNumber(levelConfig.personal_pct, DEFAULT_SUB_PCT.personal_pct),
            };
        } else {
            amount = toNumber(contributions[roleLevel] || DEFAULT_CONTRIBUTIONS[roleLevel], 0);
        }

        if (amount <= 0) return { skipped: true, reason: 'amount_zero' };

        // 拆分到四维子账户
        const pctTotal = subPct.mirror_ops_pct + subPct.travel_pct + subPct.parent_pct + subPct.personal_pct;
        const normalize = pctTotal > 0 ? 100 / pctTotal : 1;
        const subAmounts = {
            mirror_ops: roundMoney(amount * subPct.mirror_ops_pct * normalize / 100),
            travel: roundMoney(amount * subPct.travel_pct * normalize / 100),
            parent: roundMoney(amount * subPct.parent_pct * normalize / 100),
            personal: roundMoney(amount * subPct.personal_pct * normalize / 100),
        };
        // 修正舍入误差
        const subSum = subAmounts.mirror_ops + subAmounts.travel + subAmounts.parent + subAmounts.personal;
        if (subSum !== amount) {
            subAmounts.personal = roundMoney(subAmounts.personal + (amount - subSum));
        }

        // 写入总流水日志
        await db.collection('fund_pool_logs').add({
            data: {
                openid,
                role_level: roleLevel,
                amount,
                sub_amounts: subAmounts,
                source: source || 'upgrade_payment',
                order_id: orderId || '',
                created_at: db.serverDate(),
            },
        }).catch((err) => {
            console.error('[FundPool] 写入fund_pool_logs失败:', err.message);
        });

        // 原子更新基金池总余额和子账户余额
        if (rawConfig._id) {
            await db.collection('configs').doc(String(rawConfig._id)).update({
                data: {
                    balance: _.inc(amount),
                    total_in: _.inc(amount),
                    sub_mirror_ops: _.inc(subAmounts.mirror_ops),
                    sub_travel: _.inc(subAmounts.travel),
                    sub_parent: _.inc(subAmounts.parent),
                    sub_personal: _.inc(subAmounts.personal),
                    updated_at: db.serverDate(),
                },
            }).catch((err) => {
                console.error('[FundPool] 更新基金池余额失败:', err.message);
            });
        }

        console.log(`[FundPool] 入池成功: openid=${openid}, role=${roleLevel}, total=${amount}, sub=${JSON.stringify(subAmounts)}`);
        return { success: true, amount, roleLevel, subAmounts };
    } catch (err) {
        console.error('[FundPool] recordFundPoolEntry异常:', err.message);
        return { error: err.message };
    }
}

async function processPaidOrder(orderId, order) {
    const latest = await db.collection('orders').doc(orderId).get().then((res) => res.data || order).catch(() => order);
    const needsGroupJoin = isGroupOrder(latest) && !latest.group_joined_at;
    const needsSlashPurchase = hasValue(latest.slash_no) && !latest.slash_purchased_at;
    if (latest.payment_post_processed_at && !needsGroupJoin && !needsSlashPurchase) return { skipped: true };

    const group = needsGroupJoin ? await ensurePaidGroupJoined(orderId, latest).catch(err => {
        console.error('[PostPay] ensurePaidGroupJoined 失败:', err.message);
        return { error: err.message };
    }) : { skipped: true };
    const slash = needsSlashPurchase ? await ensureSlashOrderPurchased(orderId, latest).catch(err => {
        console.error('[PostPay] ensureSlashOrderPurchased 失败:', err.message);
        return { error: err.message };
    }) : { skipped: true };
    if (latest.payment_post_processed_at) return { group, slash };

    const stock = await ensureStockDeducted(orderId, latest);
    const points = await ensurePointsAwarded(orderId, { ...latest, stock_deducted_at: true });
    const roles = await ensureAgentRoleSynced(orderId, { ...latest, stock_deducted_at: true, points_awarded_at: true });

    // 代理升级时记录基金池入池
    if (roles && roles.upgraded && roles.nextRoleLevel >= 3) {
        await recordFundPoolEntry(order.openid, roles.nextRoleLevel, 'upgrade_payment', orderId).catch(() => {});
    }

    const peerBonus = await ensurePeerBonusCreated(orderId, { ...latest, stock_deducted_at: true, points_awarded_at: true }, roles);
    const commissions = await ensureCommissionsCreated(orderId, { ...latest, stock_deducted_at: true, points_awarded_at: true });

    await db.collection('orders').doc(orderId).update({
        data: { payment_post_processed_at: db.serverDate(), updated_at: db.serverDate() },
    });
    return { group, slash, stock, points, roles, peerBonus, commissions };
}

function deriveRefundRevertStatus(order = {}) {
    return order.prev_status
        || (order.confirmed_at || order.auto_confirmed_at ? 'completed'
            : (order.shipped_at ? 'shipped'
                : (order.paid_at ? 'paid' : 'pending_payment')));
}

function getOrderTotalQuantity(order = {}) {
    const explicit = Math.max(0, toNumber(order.quantity, 0));
    if (explicit > 0) return explicit;
    return toArray(order.items).reduce((sum, item) => {
        return sum + Math.max(1, toNumber(item.qty || item.quantity, 1));
    }, 0);
}

function getOrderRefundProgress(order = {}) {
    const totalQuantity = getOrderTotalQuantity(order);
    const payAmount = roundMoney(getOrderTotalAmount(order));
    const refundedQuantity = Math.max(0, toNumber(order.refunded_quantity_total, 0));
    const refundedCash = roundMoney(Math.max(0, toNumber(order.refunded_cash_total, 0)));
    return {
        totalQuantity,
        payAmount,
        refundedQuantity,
        refundedCash
    };
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
    const rawItems = toArray(order.items);
    const hasSnapshot = rawItems.some((item) => item && item.refund_basis_version === 'snapshot_v1');
    const couponAllocations = hasSnapshot
        ? rawItems.map((item) => roundMoney(item.coupon_allocated_amount))
        : allocateProportionalAmounts(rawItems, toNumber(order.coupon_discount, 0), 'item_amount');
    const pointsAllocations = hasSnapshot
        ? rawItems.map((item) => roundMoney(item.points_allocated_amount))
        : allocateProportionalAmounts(rawItems, toNumber(order.points_discount, 0), 'item_amount');

    return rawItems.map((item, index) => {
        const quantity = Math.max(1, toNumber(item.qty || item.quantity, 1));
        const itemAmount = roundMoney(item.item_amount != null ? item.item_amount : item.subtotal);
        const couponAllocatedAmount = roundMoney(couponAllocations[index]);
        const pointsAllocatedAmount = roundMoney(pointsAllocations[index]);
        const cashPaidAllocatedAmount = roundMoney(
            item.cash_paid_allocated_amount != null
                ? item.cash_paid_allocated_amount
                : (itemAmount - couponAllocatedAmount - pointsAllocatedAmount)
        );
        const refundedQuantity = Math.max(0, Math.min(quantity, toNumber(item.refunded_quantity, 0)));
        const refundedCashAmount = roundMoney(Math.max(0, Math.min(cashPaidAllocatedAmount, toNumber(item.refunded_cash_amount, 0))));
        return {
            ...item,
            refund_item_key: item.refund_item_key || `${item.product_id || 'product'}::${item.sku_id || 'nosku'}::${index}`,
            quantity,
            qty: quantity,
            cash_paid_allocated_amount: cashPaidAllocatedAmount,
            refunded_quantity: refundedQuantity,
            refunded_cash_amount: refundedCashAmount,
            refundable_quantity: Math.max(0, quantity - refundedQuantity),
            refundable_cash_amount: roundMoney(Math.max(0, cashPaidAllocatedAmount - refundedCashAmount)),
            refund_basis_version: item.refund_basis_version || (hasSnapshot ? 'snapshot_v1' : 'legacy_estimated')
        };
    });
}

function normalizeRequestedRefundItems(rawItems = []) {
    return toArray(rawItems)
        .map((item) => ({
            refund_item_key: pickString(item.refund_item_key),
            product_id: pickString(item.product_id),
            sku_id: pickString(item.sku_id),
            quantity: Math.max(0, toNumber(item.quantity ?? item.qty, 0))
        }))
        .filter((item) => item.quantity > 0);
}

function inferRefundQuantityEffective(order = {}, refund = {}) {
    const progress = getOrderRefundProgress(order);
    const explicit = Math.max(
        0,
        toNumber(
            refund.refund_quantity_effective != null ? refund.refund_quantity_effective : refund.refund_quantity,
            0
        )
    );
    if (explicit > 0) return explicit;
    return Math.max(1, progress.totalQuantity - progress.refundedQuantity || progress.totalQuantity || 1);
}

function isFullRefundAfterSettlement(order = {}, refund = {}) {
    const progress = getOrderRefundProgress(order);
    const refundQuantity = inferRefundQuantityEffective(order, refund);
    const refundAmount = roundMoney(firstNumber([refund.amount, refund.refund_amount], 0));
    const nextQuantity = Math.min(progress.totalQuantity, progress.refundedQuantity + refundQuantity);
    const nextCash = Math.min(progress.payAmount, roundMoney(progress.refundedCash + refundAmount));
    return nextQuantity >= Math.max(1, progress.totalQuantity) || nextCash >= progress.payAmount;
}

function buildRefundItemAllocations(order = {}, refundQuantity = 0, refund = {}) {
    const refundItems = normalizeRequestedRefundItems(refund.refund_items);
    if (refundItems.length > 0) {
        const settlementItems = buildOrderSettlementItems(order);
        return refundItems.map((selection) => {
            const target = settlementItems.find((item) => {
                if (selection.refund_item_key && item.refund_item_key === selection.refund_item_key) return true;
                return item.product_id === selection.product_id && String(item.sku_id || '') === String(selection.sku_id || '');
            });
            return target ? { item: target, qty: selection.quantity } : null;
        }).filter(Boolean);
    }

    let remaining = Math.max(0, toNumber(refundQuantity, 0));
    const allocations = [];

    for (const item of buildOrderSettlementItems(order)) {
        if (remaining <= 0) break;
        const itemQty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        const restoredQty = Math.min(itemQty, remaining);
        if (restoredQty > 0) {
            allocations.push({ item, qty: restoredQty });
            remaining -= restoredQty;
        }
    }

    return allocations;
}

function hasRefundProgressApplied(order = {}, refund = {}) {
    if (refund.order_progress_applied_at) return true;
    const hasSnapshots = refund.order_refunded_quantity_before != null || refund.order_refunded_cash_before != null;
    if (!hasSnapshots) return false;
    const refundQuantity = inferRefundQuantityEffective(order, refund);
    const expectedQuantity = Math.max(0, toNumber(refund.order_refunded_quantity_before, 0)) + refundQuantity;
    const expectedCash = roundMoney(toNumber(refund.order_refunded_cash_before, 0) + firstNumber([refund.amount, refund.refund_amount], 0));
    return toNumber(order.refunded_quantity_total, 0) >= expectedQuantity
        || roundMoney(toNumber(order.refunded_cash_total, 0)) >= expectedCash;
}

function buildOrderPatchAfterRefund(order = {}, refund = {}) {
    if (hasRefundProgressApplied(order, refund)) {
        return {
            isFullRefund: pickString(order.status) === 'refunded',
            refundQuantity: inferRefundQuantityEffective(order, refund),
            refundAmount: roundMoney(firstNumber([refund.amount, refund.refund_amount], 0)),
            rewardPointsClawback: Math.max(0, toNumber(refund.reward_points_clawback_amount, 0)),
            growthClawback: Math.max(0, toNumber(refund.growth_clawback_amount, 0)),
            patch: {
                items: toArray(order.items),
                refunded_quantity_total: toNumber(order.refunded_quantity_total, 0),
                refunded_cash_total: roundMoney(toNumber(order.refunded_cash_total, 0)),
                last_refunded_at: order.last_refunded_at || db.serverDate(),
                partially_refunded_at: pickString(order.status) === 'refunded' ? _.remove() : (order.partially_refunded_at || db.serverDate()),
                status: pickString(order.status || deriveRefundRevertStatus(order)),
                refunded_at: order.refunded_at || (pickString(order.status) === 'refunded' ? db.serverDate() : _.remove()),
                prev_status: _.remove(),
                updated_at: db.serverDate()
            }
        };
    }

    const progress = getOrderRefundProgress(order);
    const refundQuantity = inferRefundQuantityEffective(order, refund);
    const refundAmount = roundMoney(firstNumber([refund.amount, refund.refund_amount], 0));
    const nextRefundedQuantity = Math.min(progress.totalQuantity, progress.refundedQuantity + refundQuantity);
    const nextRefundedCash = Math.min(progress.payAmount, roundMoney(progress.refundedCash + refundAmount));
    const isFullRefund = isFullRefundAfterSettlement(order, refund);
    const refundItems = toArray(refund.refund_items);
    const keyedRefundItems = new Map(refundItems.map((item) => [pickString(item.refund_item_key), item]));
    const nextOrderItems = buildOrderSettlementItems(order).map((item) => {
        const matched = keyedRefundItems.get(pickString(item.refund_item_key));
        if (!matched) return item;
        return {
            ...item,
            refunded_quantity: Math.min(item.quantity, item.refunded_quantity + Math.max(0, toNumber(matched.quantity, 0))),
            refunded_cash_amount: Math.min(item.cash_paid_allocated_amount, roundMoney(item.refunded_cash_amount + toNumber(matched.cash_refund_amount, 0)))
        };
    });
    const totalPointsEarned = Math.max(0, toNumber(order.points_earned, 0));
    const totalGrowthEarned = Math.max(0, Math.floor(getOrderTotalAmount(order)));
    const rewardPointsClawedBefore = Math.max(0, toNumber(order.reward_points_clawback_total, 0));
    const growthClawedBefore = Math.max(0, toNumber(order.growth_clawback_total, 0));
    const rewardPointsClawback = isFullRefund
        ? Math.max(0, totalPointsEarned - rewardPointsClawedBefore)
        : Math.max(0, Math.min(totalPointsEarned - rewardPointsClawedBefore, Math.round(totalPointsEarned * (refundAmount / Math.max(progress.payAmount, 0.01)))));
    const growthClawback = isFullRefund
        ? Math.max(0, totalGrowthEarned - growthClawedBefore)
        : Math.max(0, Math.min(totalGrowthEarned - growthClawedBefore, Math.round(totalGrowthEarned * (refundAmount / Math.max(progress.payAmount, 0.01)))));
    return {
        isFullRefund,
        refundQuantity,
        refundAmount,
        rewardPointsClawback,
        growthClawback,
        patch: {
            items: nextOrderItems,
            refunded_quantity_total: nextRefundedQuantity,
            refunded_cash_total: nextRefundedCash,
            reward_points_clawback_total: rewardPointsClawedBefore + rewardPointsClawback,
            growth_clawback_total: growthClawedBefore + growthClawback,
            has_partial_refund: !isFullRefund && nextRefundedCash > 0,
            last_refunded_at: db.serverDate(),
            partially_refunded_at: isFullRefund ? _.remove() : db.serverDate(),
            status: isFullRefund ? 'refunded' : deriveRefundRevertStatus(order),
            refunded_at: isFullRefund ? db.serverDate() : _.remove(),
            prev_status: _.remove(),
            updated_at: db.serverDate()
        }
    };
}

async function findOrderForRefund(refund = {}) {
    if (hasValue(refund.order_id)) {
        const byId = await getDocByIdOrLegacy('orders', refund.order_id);
        if (byId && byId._id) return byId;
    }
    if (hasValue(refund.order_no)) {
        const byOrderNo = await db.collection('orders')
            .where({ order_no: String(refund.order_no) })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (byOrderNo.data && byOrderNo.data[0]) return byOrderNo.data[0];
    }
    return null;
}

function buildRefundRuntime(refund = {}, order = null) {
    const paymentMethod = normalizePaymentMethodCode(
        refund.payment_method
        || resolveOrderPaymentMethod(order || {})
        || refund.refund_channel
        || ''
    );
    return {
        amount: firstNumber([refund.amount, refund.refund_amount, getOrderTotalAmount(order || {})], 0),
        paymentMethod,
        refundChannel: resolveRefundChannel(paymentMethod, refund.refund_channel || ''),
        refundTargetText: getRefundTargetText(paymentMethod, refund.refund_target_text || refund.refund_target || refund.refund_to)
    };
}

async function cancelPendingCommissionsForRefund(orderId, reason) {
    await db.collection('commissions')
        .where({ order_id: orderId, status: _.in(['pending', 'frozen', 'pending_approval', 'approved']) })
        .update({
            data: {
                status: 'cancelled',
                cancel_reason: reason,
                cancelled_reason: reason,
                updated_at: db.serverDate()
            }
        })
        .catch(() => {});
}

async function clawBackSettledCommissions(orderId) {
    const settledRes = await db.collection('commissions')
        .where({ order_id: orderId, status: 'settled' })
        .get()
        .catch(() => ({ data: [] }));
    for (const comm of (settledRes.data || [])) {
        const commAmount = toNumber(comm.amount, 0);
        if (commAmount <= 0 || comm.clawed_back_at) continue;
        await db.collection('users').where({ openid: comm.openid }).update({
            data: {
                commission_balance: _.inc(-commAmount),
                balance: _.inc(-commAmount),
                updated_at: db.serverDate()
            }
        }).catch((err) => {
            console.error('[RefundCallback] 追回已结算佣金余额失败:', err.message);
        });
        await db.collection('commissions').doc(String(comm._id)).update({
            data: {
                status: 'cancelled',
                cancel_reason: '退款追回已结算佣金',
                cancelled_reason: '退款追回已结算佣金',
                clawed_back_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        }).catch(() => {});
    }
}

async function restoreRefundOrderInventory(orderId, order = {}, refund = {}) {
    if (!order || !Array.isArray(order.items)) return;
    if (pickString(refund.type) !== 'return_refund') return;
    if (refund.stock_restored_at) return;
    const allocations = buildRefundItemAllocations(order, inferRefundQuantityEffective(order, refund), refund);
    for (const { item, qty } of allocations) {
        if (item.product_id) {
            await db.collection('products').doc(String(item.product_id)).update({
                data: { stock: _.inc(qty), sales_count: _.inc(-qty), updated_at: db.serverDate() }
            }).catch(() => {});
        }
        if (item.sku_id) {
            await db.collection('skus').doc(String(item.sku_id)).update({
                data: { stock: _.inc(qty), updated_at: db.serverDate() }
            }).catch(() => {});
        }
    }
    if (refund && refund._id) {
        await db.collection('refunds').doc(String(refund._id)).update({
            data: { stock_restored_at: db.serverDate(), updated_at: db.serverDate() }
        }).catch(() => {});
    }
}

async function reverseBuyerAssetsForRefund(orderId, order = {}, refund = {}) {
    if (!order || !order.openid) return;
    if (refund.buyer_assets_reversed_at) return;
    const settlement = buildOrderPatchAfterRefund(order, refund);
    const pointsDelta = settlement.rewardPointsClawback > 0 ? -settlement.rewardPointsClawback : 0;
    const growthDelta = settlement.growthClawback > 0 ? -settlement.growthClawback : 0;

    const userUpdates = { updated_at: db.serverDate() };
    if (settlement.refundAmount > 0) userUpdates.total_spent = _.inc(-settlement.refundAmount);
    if (settlement.isFullRefund) userUpdates.order_count = _.inc(-1);
    if (pointsDelta !== 0) userUpdates.points = _.inc(pointsDelta);
    if (growthDelta !== 0) userUpdates.growth_value = _.inc(growthDelta);

    await db.collection('users')
        .where({ openid: order.openid })
        .update({ data: userUpdates })
        .catch((err) => { console.error('[RefundCallback] 用户数据回退失败:', err.message); });

    if (refund && refund._id) {
        await db.collection('refunds').doc(String(refund._id)).update({
            data: {
                reward_points_clawback_amount: settlement.rewardPointsClawback,
                growth_clawback_amount: settlement.growthClawback,
                order_progress_applied_at: db.serverDate(),
                buyer_assets_reversed_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        }).catch(() => {});
    }

    if (settlement.rewardPointsClawback > 0) {
        await db.collection('point_logs').add({
            data: {
                openid: order.openid,
                type: 'deduct',
                amount: -settlement.rewardPointsClawback,
                source: 'order_refund_revoke',
                order_id: orderId,
                description: `退款扣回 ${settlement.rewardPointsClawback} 奖励积分`,
                created_at: db.serverDate()
            }
        }).catch(() => {});
    }
    if (settlement.growthClawback > 0) {
        await db.collection('point_logs').add({
            data: {
                openid: order.openid,
                type: 'deduct',
                amount: -settlement.growthClawback,
                source: 'order_refund_growth_revoke',
                order_id: orderId,
                description: `退款扣回 ${settlement.growthClawback} 成长值`,
                created_at: db.serverDate()
            }
        }).catch(() => {});
    }
}

/**
 * 处理货款充值回调（order_no 以 RCH 开头，来自 wallet_recharge_orders）
 */
async function handleRechargeCallback(outTradeNo, transaction) {
    console.log(`[RechargeCallback] 处理充值回调: ${outTradeNo}`);

    const rechargeRes = await db.collection('wallet_recharge_orders')
        .where({ order_no: outTradeNo })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));

    const recharge = rechargeRes.data && rechargeRes.data[0];
    if (!recharge) {
        console.warn(`[RechargeCallback] 充值订单不存在: ${outTradeNo}`);
        return { code: 'SUCCESS', message: 'Recharge order not found' };
    }

    // 幂等
    if (recharge.status === 'paid') {
        return { code: 'SUCCESS', message: 'Already processed' };
    }

    const amount = toNumber(recharge.amount, 0);
    const openid = recharge.openid;

    // 原子更新充值单状态（防并发）
    const updateRes = await db.collection('wallet_recharge_orders')
        .where({ _id: recharge._id, status: 'pending' })
        .update({
            data: {
                status: 'paid',
                paid_at: db.serverDate(),
                trade_id: transaction.transaction_id || '',
                updated_at: db.serverDate(),
            },
        }).catch(() => ({ stats: { updated: 0 } }));

    if (!updateRes.stats || updateRes.stats.updated === 0) {
        return { code: 'SUCCESS', message: 'Already processed' };
    }

    // 到账：原子增加 agent_wallet_balance
    await db.collection('users')
        .where({ openid })
        .update({
            data: {
                agent_wallet_balance: _.inc(amount),
                goods_fund_total_recharged: _.inc(amount),
                updated_at: db.serverDate(),
            },
        }).catch((err) => {
            console.error('[RechargeCallback] 到账失败:', err.message);
        });
    await increaseGoodsFundLedger(openid, amount, outTradeNo, '货款余额充值', 'wx_recharge').catch(() => false);

    // 写流水日志
    await db.collection('goods_fund_logs').add({
        data: {
            openid,
            type: 'recharge',
            amount,
            recharge_order_id: recharge._id,
            order_no: outTradeNo,
            remark: '货款余额充值',
            created_at: db.serverDate(),
        },
    }).catch(() => {});

    console.log(`[RechargeCallback] 充值成功: ${outTradeNo}, 金额: ${amount}, openid: ${openid}`);
    return { code: 'SUCCESS', message: 'Recharge processed' };
}

/**
 * 处理退款回调通知
 * 微信退款回调格式（V3）解密后的数据结构：
 * { out_trade_no, out_refund_no, refund_id, refund_status: 'SUCCESS'|'ABNORMAL'|'CLOSED', success_time, ... }
 */
async function handleRefundCallback(refundData, eventType) {
    const outRefundNo = refundData.out_refund_no;
    const refundStatus = (refundData.refund_status || '').toUpperCase();
    const wxRefundId = refundData.refund_id || '';

    console.log(`[RefundCallback] event_type=${eventType}, out_refund_no=${outRefundNo}, refund_status=${refundStatus}`);

    if (!outRefundNo) {
        console.error('[RefundCallback] 缺少 out_refund_no');
        return { code: 'SUCCESS', message: 'Missing refund no' };
    }

    // 查找退款记录
    const refundRes = await db.collection('refunds')
        .where({ refund_no: outRefundNo })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));

    const refund = refundRes.data && refundRes.data[0];
    if (!refund) {
        console.warn(`[RefundCallback] 退款记录不存在: ${outRefundNo}`);
        return { code: 'SUCCESS', message: 'Refund record not found' };
    }

    // 已处于终态，幂等
    if (refund.status === 'completed' || refund.status === 'failed') {
        return { code: 'SUCCESS', message: 'Already in terminal state' };
    }

    const order = await findOrderForRefund(refund);
    const canonicalOrderId = order && order._id ? String(order._id) : (hasValue(refund.order_id) ? String(refund.order_id) : '');
    const refundRuntime = buildRefundRuntime(refund, order);

    if (refundStatus === 'SUCCESS') {
        // 先写入规范字段，待下游回滚完成后再标记 completed，避免过早进入终态。
        await db.collection('refunds').doc(refund._id).update({
            data: {
                status: 'processing',
                processing_at: refund.processing_at || db.serverDate(),
                amount: refundRuntime.amount,
                payment_method: refundRuntime.paymentMethod,
                refund_channel: refundRuntime.refundChannel,
                refund_target_text: refundRuntime.refundTargetText,
                wx_refund_id: wxRefundId || refund.wx_refund_id || '',
                wx_refund_status: refundStatus,
                wx_success_time: refundData.success_time || '',
                updated_at: db.serverDate()
            }
        });

        try {
                if (canonicalOrderId) {
                    if (!order?.refund_commissions_resolved_at) {
                        await cancelPendingCommissionsForRefund(canonicalOrderId, '退款完成，佣金作废');
                        await clawBackSettledCommissions(canonicalOrderId);
                        await db.collection('orders').doc(canonicalOrderId).update({
                        data: { refund_commissions_resolved_at: db.serverDate(), updated_at: db.serverDate() }
                    }).catch(() => {});
                    }

                    if (order) {
                        const settlement = buildOrderPatchAfterRefund(order, refund);
                        await restoreRefundOrderInventory(canonicalOrderId, order, refund);
                        await reverseBuyerAssetsForRefund(canonicalOrderId, order, refund);
                        await db.collection('orders').doc(canonicalOrderId).update({ data: settlement.patch }).catch(() => {});
                    }
                }

            await db.collection('refunds').doc(refund._id).update({
                data: {
                    status: 'completed',
                    completed_at: db.serverDate(),
                    callback_error: _.remove(),
                    callback_retry_needed_at: _.remove(),
                    updated_at: db.serverDate()
                }
            });
        } catch (settleErr) {
            await db.collection('refunds').doc(refund._id).update({
                data: {
                    status: 'processing',
                    callback_error: settleErr.message,
                    callback_retry_needed_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            }).catch(() => {});
            throw settleErr;
        }

        console.log(`[RefundCallback] 退款成功处理完毕: ${outRefundNo}`);
    } else if (['ABNORMAL', 'CLOSED'].includes(refundStatus)) {
        // 退款失败/关闭：将订单恢复到之前状态
        await db.collection('refunds').doc(refund._id).update({
            data: {
                status: 'failed',
                amount: refundRuntime.amount,
                payment_method: refundRuntime.paymentMethod,
                refund_channel: refundRuntime.refundChannel,
                refund_target_text: refundRuntime.refundTargetText,
                wx_refund_id: wxRefundId || refund.wx_refund_id || '',
                wx_refund_status: refundStatus,
                updated_at: db.serverDate()
            }
        });

        if (canonicalOrderId && order && order.status === 'refunding') {
            const revertStatus = deriveRefundRevertStatus(order);
            await db.collection('orders').doc(canonicalOrderId).update({
                data: { status: revertStatus, prev_status: _.remove(), updated_at: db.serverDate() }
                }).catch(() => {});
        }

        console.warn(`[RefundCallback] 退款异常/关闭: ${outRefundNo}, status=${refundStatus}`);
    }

    return { code: 'SUCCESS', message: 'Refund callback processed' };
}

/**
 * 处理微信支付 V3 回调通知
 * 
 * 回调数据格式（V3）:
 * {
 *   "id": "...",
 *   "create_time": "...",
 *   "resource_type": "encrypt-resource",
 *   "event_type": "TRANSACTION.SUCCESS",
 *   "resource": {
 *     "algorithm": "AEAD_AES_256_GCM",
 *     "ciphertext": "...",
 *     "nonce": "...",
 *     "associated_data": "transaction"
 *   }
 * }
 */
async function handleCallback(event) {
    try {
        // 1. 提取回调头和请求体
        const headers = event.headers || {};
        const body = typeof event.body === 'string' ? event.body : JSON.stringify(event.body || event);

        // 2. 验证签名
        const wxTimestamp = headers['wechatpay-timestamp'] || headers['Wechatpay-Timestamp'];
        const wxNonce = headers['wechatpay-nonce'] || headers['Wechatpay-Nonce'];
        const wxSignature = headers['wechatpay-signature'] || headers['Wechatpay-Signature'];

        if (wxTimestamp && wxNonce && wxSignature) {
            try {
                const publicKey = await loadPublicKey(cloud);
                const isValid = verifySignature(wxTimestamp, wxNonce, body, wxSignature, publicKey);
                if (!isValid) {
                    console.error('[PaymentCallback] 签名验证失败，拒绝处理');
                    return { code: 'FAIL', message: 'Signature verification failed' };
                }
            } catch (verifyErr) {
                console.error('[PaymentCallback] 签名验证异常，拒绝处理:', verifyErr.message);
                return { code: 'FAIL', message: 'Signature verification error' };
            }
        } else if (wxTimestamp || wxNonce || wxSignature) {
            console.error('[PaymentCallback] 签名头信息不完整，拒绝处理');
            return { code: 'FAIL', message: 'Incomplete signature headers' };
        } else if (event.headers && Object.keys(headers).length > 0) {
            // HTTP 请求有 headers 但缺少全部签名头 → 外部伪造，拒绝
            console.error('[PaymentCallback] HTTP 请求缺少微信签名头，拒绝处理');
            return { code: 'FAIL', message: 'Missing signature headers' };
        }

        // 3. 解析回调数据
        let callbackData;
        try {
            callbackData = typeof event.body === 'object' ? event.body : JSON.parse(body);
        } catch (e) {
            console.error('[PaymentCallback] 回调数据解析失败:', e.message);
            return { code: 'FAIL', message: 'Invalid callback data' };
        }

        // 4. 解密资源数据
        let transaction;
        if (callbackData.resource && callbackData.resource.ciphertext) {
            try {
                transaction = decryptResource(
                    callbackData.resource.ciphertext,
                    callbackData.resource.nonce,
                    callbackData.resource.associated_data || 'transaction'
                );
            } catch (decryptErr) {
                console.error('[PaymentCallback] 解密失败:', decryptErr.message);
                return { code: 'FAIL', message: 'Decryption failed' };
            }
        } else {
            // 兼容非加密格式（测试/旧版）
            transaction = callbackData;
        }

        const eventType = callbackData.event_type || '';
        console.log(`[PaymentCallback] event_type=${eventType}`);

        // 5. 退款回调处理（REFUND.SUCCESS / REFUND.ABNORMAL / REFUND.CLOSED）
        if (eventType.startsWith('REFUND.')) {
            return handleRefundCallback(transaction, eventType);
        }

        const outTradeNo = transaction.out_trade_no;
        const tradeState = transaction.trade_state;

        console.log(`[PaymentCallback] out_trade_no=${outTradeNo}, trade_state=${tradeState}`);

        // 5. 处理支付成功
        if (tradeState === 'SUCCESS' && outTradeNo) {
            const orderRes = await db.collection('orders')
                .where({ order_no: outTradeNo })
                .limit(1)
                .get();

            if (orderRes.data && orderRes.data.length > 0) {
                const order = orderRes.data[0];

                const callbackPaidFen = getCallbackPaidFen(transaction);
                const expectedFen = getOrderPayFen(order);
                if (!Number.isFinite(callbackPaidFen) || callbackPaidFen !== expectedFen) {
                    console.error(`[PaymentCallback] 金额不一致: expected=${expectedFen}, paid=${callbackPaidFen}, order_no=${outTradeNo}`);
                    return { code: 'FAIL', message: 'Amount mismatch' };
                }

                // 幂等：已支付不重复处理
                if (['paid', 'pending_group', 'shipped', 'completed', 'pickup_pending', 'agent_confirmed', 'shipping_requested'].includes(order.status)) {
                    await processPaidOrder(order._id, order).catch((postErr) => {
                        console.error('[PaymentCallback] 已支付订单后处理补偿失败:', postErr.message);
                    });
                    return { code: 'SUCCESS', message: 'Already processed' };
                }

                if (order.status !== 'pending_payment') {
                    console.error(`[PaymentCallback] 订单状态不允许支付回调处理: ${order.status}, order_no=${outTradeNo}`);
                    return { code: 'FAIL', message: 'Invalid order status' };
                }

                // 拼团订单支付后进入 pending_group（待成团），普通订单直接 paid
                const postPayStatus = resolvePostPayStatus(order);
                const canonicalPayAmount = getOrderTotalAmount(order);
                const updateRes = await db.collection('orders')
                    .where({ _id: order._id, status: 'pending_payment' })
                    .update({
                    data: buildPaidOrderPatch('wechat', canonicalPayAmount, {
                        status: postPayStatus,
                        paid_at: db.serverDate(),
                        trade_id: transaction.transaction_id || '',
                        pay_time: transaction.success_time ? new Date(transaction.success_time) : db.serverDate(),
                        updated_at: db.serverDate(),
                    }),
                });
                if (updateRes.stats && updateRes.stats.updated === 0) {
                    return { code: 'SUCCESS', message: 'Already processed' };
                }

                // 6. 支付成功后续处理
                try {
                    await processPaidOrder(order._id, order);

                    // 6.4 核销优惠券（二次确认，防止创建订单时未核销）
                    let couponConfirmed = false;
                    if (order.user_coupon_id) {
                        couponConfirmed = await db.collection('user_coupons')
                            .doc(String(order.user_coupon_id))
                            .update({ data: { status: 'used', used_at: db.serverDate() } })
                            .then(() => true)
                            .catch(() => false);
                    }
                    if (!couponConfirmed && order.coupon_id) {
                        await db.collection('user_coupons')
                            .where({ openid: order.openid, coupon_id: order.coupon_id, status: 'unused' })
                            .update({ data: { status: 'used', used_at: db.serverDate() } })
                            .catch(() => {});
                    }
                } catch (postErr) {
                    console.error('[PaymentCallback] 后续处理失败:', postErr.message);
                    // 不影响回调响应
                }

                return { code: 'SUCCESS', message: 'Payment processed' };
            }

            // orders 表查不到 → 尝试货款充值订单（order_no 以 RCH 开头）
            if (outTradeNo && outTradeNo.startsWith('RCH')) {
                return handleRechargeCallback(outTradeNo, transaction);
            }

            return { code: 'FAIL', message: 'Order not found' };
        }

        // 6. 处理支付关闭/退款等事件
        if (tradeState === 'CLOSED') {
            await db.collection('orders').where({ order_no: outTradeNo }).update({
                data: { status: 'closed', updated_at: db.serverDate() },
            }).catch(() => {});
            return { code: 'SUCCESS', message: 'Order closed' };
        }

        if (tradeState === 'REFUND') {
            // 退款通知在 refund 模块处理
            return { code: 'SUCCESS', message: 'Refund notification received' };
        }

        if (tradeState === 'NOTPAY' || tradeState === 'USERPAYING') {
            return { code: 'SUCCESS', message: 'Pending payment' };
        }

        return { code: 'SUCCESS', message: `Trade state: ${tradeState}` };
    } catch (err) {
        console.error('[PaymentCallback] 处理异常:', err);
        return { code: 'FAIL', message: err.message };
    }
}

module.exports = {
    handleCallback,
    handleRefundCallback,
    processPaidOrder,
};
