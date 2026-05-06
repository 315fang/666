'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { verifySignature, decryptResource, loadPublicKey } = require('./wechat-pay-v3');
const {
    pickString,
    buildPaymentWritePatch,
    getRefundTargetText,
    normalizePaymentMethodCode,
    resolveOrderPayAmount,
    resolveOrderPaymentMethod,
    resolveRefundChannel,
    resolvePostPayStatus
} = require('./shared/order-payment');
const {
    handleDepositPaidCallback,
    handleDepositRefundCallback
} = require('./payment-deposit');
const { handleTransferCallbackNotification } = require('./payment-transfer');
const { applyPromotionSeparation } = require('./promotion-lineage');
const {
    DEFAULT_UPGRADE_PIGGY_BANK_CONFIG,
    createUpgradePiggyBankForOrder,
    reverseUpgradePiggyBankForRefund,
    unlockUpgradePiggyBankForRole
} = require('./upgrade-piggy-bank');
const {
    DEFAULT_ROLE_NAMES,
    DEFAULT_AGENT_UPGRADE_RULES,
    DEFAULT_COMMISSION_MATRIX,
    DEFAULT_BUNDLE_COMMISSION_MATRIX,
    DEFAULT_AGENT_COMMISSION_CONFIG,
    DEFAULT_COST_SPLIT
} = require('./shared/agent-config');

const DEFAULT_BRANCH_AGENT_POLICY = {
    enabled: true,
    region_reward_tiers: [
        { threshold: 100000, rate: 0.01, label: '10万' },
        { threshold: 300000, rate: 0.02, label: '30万' },
        { threshold: 1000000, rate: 0.03, label: '100万' }
    ]
};

const BRANCH_REGION_ELIGIBLE_STATUSES = [
    'pending_group',
    'paid',
    'pickup_pending',
    'agent_confirmed',
    'shipping_requested',
    'shipped',
    'completed'
];

const PAID_POST_PROCESS_STATUSES = [
    'paid',
    'pending_group',
    'pickup_pending',
    'agent_confirmed',
    'shipping_requested',
    'shipped',
    'completed'
];
const DEFAULT_SELF_PURCHASE_COMMISSION_ENABLED = false;

function isTruthyFlag(value) {
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0' || value === null || value === undefined || value === '') return false;
    return ['true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase());
}

function hasSettledRefundProgress(order = {}) {
    return pickString(order.status).toLowerCase() === 'refunded'
        || toNumber(order.refunded_cash_total, 0) > 0
        || toNumber(order.refunded_quantity_total, 0) > 0
        || isTruthyFlag(order.has_partial_refund)
        || hasValue(order.refunded_at)
        || hasValue(order.last_refunded_at)
        || hasValue(order.partially_refunded_at);
}

function getPaidPostProcessSkipReason(order = {}) {
    const status = pickString(order.status).toLowerCase();
    if (status && !PAID_POST_PROCESS_STATUSES.includes(status)) {
        return `status_${status || 'missing'}`;
    }
    if (hasSettledRefundProgress(order)) {
        return 'refund_progress_exists';
    }
    return '';
}

function shouldMarkPostProcessSkipped(order = {}) {
    const status = pickString(order.status).toLowerCase();
    return status === 'refunded' || hasSettledRefundProgress(order);
}

function shouldRunPaidOrderPostProcess(order = {}) {
    return !getPaidPostProcessSkipReason(order);
}

const DEFAULT_PEER_BONUS_CONFIG = {
    enabled: true,
    default_version: 'team',
    cooldown_days: 90,
    social: {
        level_3: { pct: 10 },
        level_4: { pct: 20 },
        level_5: { pct: 20 },
        level_6: { pct: 20 },
    },
    team: {
        level_3: { cash: 100, exchange_coupons: 2, coupon_product_value: 399, unlock_reward: 160, allowed_product_ids: [], allowed_sku_ids: [], exchange_title: '' },
        level_4: { cash: 2400, exchange_coupons: 15, coupon_product_value: 399, unlock_reward: 160, allowed_product_ids: [], allowed_sku_ids: [], exchange_title: '' },
        level_5: { cash: 0, exchange_coupons: 0, coupon_product_value: 0, unlock_reward: 0, allowed_product_ids: [], allowed_sku_ids: [], exchange_title: '' },
        level_6: { cash_pct: 20, cash: 0, exchange_coupons: 0, coupon_product_value: 0, unlock_reward: 0, allowed_product_ids: [], allowed_sku_ids: [], exchange_title: '' },
    },
    refund_dev_fee_pct: 1.5,
    // 兼容旧格式
    level_1: 0, level_2: 0, level_3: 100, level_4: 2000, level_5: 0, level_6: 0,
    product_sets_3: 2, product_sets_4: 15, product_sets_5: 0, product_sets_6: 0
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
        5: 500,
        6: 500
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
let agentRuntimeConfigCache = {
    value: null,
    updatedAt: 0
};
const AGENT_RUNTIME_CONFIG_TTL = 60 * 1000;

function toNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toBoolean(value, fallback = false) {
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
        if (['false', 'no', 'off', 'disabled'].includes(normalized)) return false;
    }
    return fallback;
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === '') return [];
    return [value];
}

function pickHeader(headers = {}, name) {
    if (!headers || typeof headers !== 'object') return '';
    const target = String(name || '').toLowerCase();
    const key = Object.keys(headers).find((item) => String(item).toLowerCase() === target);
    return key ? pickString(headers[key]) : '';
}

function isWechatpayTimestampFresh(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return false;
    return Math.abs(Math.floor(Date.now() / 1000) - seconds) <= 5 * 60;
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

async function getConfigByKeys(keys = []) {
    for (const key of keys) {
        const current = String(key || '').trim();
        if (!current) continue;
        const res = await db.collection('configs')
            .where(_.or([{ config_key: current }, { key: current }]))
            .limit(20)
            .get()
            .catch(() => ({ data: [] }));
        const row = pickPreferredConfigRow(res.data || []);
        if (row) return row;
        const legacyRes = await db.collection('app_configs')
            .where(_.or([{ config_key: current }, { key: current }]))
            .limit(20)
            .get()
            .catch(() => ({ data: [] }));
        const legacyRow = pickPreferredConfigRow(legacyRes.data || []);
        if (legacyRow) return legacyRow;
    }
    return null;
}

async function upsertJsonConfigRow(key, nextValue, extra = {}) {
    const existing = await getConfigByKeys([key]);
    const now = new Date().toISOString();
    const payload = {
        key,
        config_key: key,
        config_group: extra.config_group || 'agent_system',
        config_type: extra.config_type || 'json',
        config_value: nextValue,
        value: nextValue,
        updated_at: now
    };
    if (existing && existing._id) {
        await db.collection('configs').doc(String(existing._id)).update({
            data: payload
        });
        return { ...existing, ...payload };
    }
    const createPayload = {
        ...payload,
        created_at: now
    };
    await db.collection('configs').add({
        data: createPayload
    });
    return createPayload;
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

function resolveBenefitRoleLevel(roleLevel) {
    const normalized = toNumber(roleLevel, 0);
    return normalized === 6 ? 4 : normalized;
}

function resolvePointBenefitRoleLevel(roleLevel) {
    const normalized = Math.max(0, Math.floor(toNumber(roleLevel, 0)));
    return normalized >= 5 ? 5 : normalized;
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
    if (agentRuntimeConfigCache.value && Date.now() - Number(agentRuntimeConfigCache.updatedAt || 0) <= AGENT_RUNTIME_CONFIG_TTL) {
        return agentRuntimeConfigCache.value;
    }
    const [upgradeRow, commissionRow, matrixRow, bundleMatrixRow, memberLevelRow, peerBonusRow, pointRuleRow, growthRuleRow, piggyBankRow] = await Promise.all([
        getConfigByKeys(['member_upgrade_rule_config', 'agent_system_upgrade-rules', 'agent_system_upgrade_rules']),
        getConfigByKeys(['agent_system_commission-config', 'agent_system_commission_config']),
        getConfigByKeys(['agent_system_commission-matrix', 'agent_system_commission_matrix']),
        getConfigByKeys(['agent_system_bundle-commission-matrix', 'agent_system_bundle_commission_matrix']),
        getConfigByKeys(['member_level_config']),
        getConfigByKeys(['agent_system_peer-bonus', 'agent_system_peer_bonus']),
        getConfigByKeys(['point_rule_config']),
        getConfigByKeys(['growth_rule_config']),
        getConfigByKeys(['agent_system_upgrade-piggy-bank', 'agent_system_upgrade_piggy_bank'])
    ]);
    const upgradeRules = { ...DEFAULT_AGENT_UPGRADE_RULES, ...parseConfigValue(upgradeRow, {}) };
    const commission = parseConfigValue(commissionRow, {});
    const dbMatrix = parseConfigValue(matrixRow, null);
    const dbBundleMatrix = parseConfigValue(bundleMatrixRow, null);
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
    const piggyBank = {
        ...DEFAULT_UPGRADE_PIGGY_BANK_CONFIG,
        ...(parseConfigValue(piggyBankRow, {}) || {}),
        self_purchase_commission_enabled: toBoolean(commission?.self_purchase_commission_enabled, DEFAULT_SELF_PURCHASE_COMMISSION_ENABLED)
    };
    const commissionMatrix = normalizeCommissionMatrix(
        dbMatrix || commission?.commission_matrix,
        DEFAULT_COMMISSION_MATRIX
    );
    const bundleCommissionMatrix = normalizeCommissionMatrix(
        dbBundleMatrix || commission?.bundle_commission_matrix,
        DEFAULT_BUNDLE_COMMISSION_MATRIX
    );
    const result = {
        upgradeRules,
        commissionConfig: {
            direct_pct_by_role: normalizePctMap(commission?.direct_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.direct_pct_by_role),
            indirect_pct_by_role: normalizePctMap(commission?.indirect_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.indirect_pct_by_role),
            self_purchase_commission_enabled: toBoolean(commission?.self_purchase_commission_enabled, DEFAULT_SELF_PURCHASE_COMMISSION_ENABLED),
            commission_matrix: commissionMatrix,
            bundle_commission_matrix: bundleCommissionMatrix
        },
        costSplit: {
            ...DEFAULT_COST_SPLIT,
            ...(commission?.cost_split && typeof commission.cost_split === 'object' ? commission.cost_split : {})
        },
        commissionMatrix,
        bundleCommissionMatrix,
        memberLevels,
        peerBonus,
        piggyBank,
        pointRules,
        growthRules
    };
    agentRuntimeConfigCache = {
        value: result,
        updatedAt: Date.now()
    };
    return result;
}

function getRoleMeta(roleLevel, memberLevels = []) {
    const current = (memberLevels || []).find((item) => toNumber(item.level, -1) === roleLevel);
    return {
        roleName: current?.name || DEFAULT_ROLE_NAMES[roleLevel] || 'VIP用户',
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
    const where = directRelationWhere(user);
    const rows = [];
    const pageSize = 200;
    let skip = 0;
    while (true) {
        const res = await db.collection('users')
            .where(where)
            .skip(skip)
            .limit(pageSize)
            .get()
            .catch((err) => { console.error('[getDirectMembers] 查询失败, skip=' + skip + ':', err.message); return { data: [] }; });
        const batch = res.data || [];
        rows.push(...batch);
        if (batch.length < pageSize) break;
        skip += pageSize;
    }
    return rows;
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
    if (order.is_test_order === true || order.is_test_order === 1 || order.is_test_order === '1') {
        return false;
    }
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

function getOrderNetGrowthForUpgrade(order = {}) {
    const earned = Math.max(0, Math.floor(toNumber(order.growth_earned, 0)));
    const clawedBack = Math.max(0, Math.floor(toNumber(order.growth_clawback_total, 0)));
    return Math.max(0, earned - clawedBack);
}

async function getEffectiveOrderSales(openid, effectiveDays = DEFAULT_AGENT_UPGRADE_RULES.effective_order_days) {
    const rows = await getAllOrdersByOpenid(openid);
    return roundMoney(rows.reduce((sum, row) => {
        if (!isEffectiveUpgradeOrder(row, effectiveDays)) return sum;
        return sum + toNumber(row.pay_amount ?? row.actual_price ?? row.total_amount, 0);
    }, 0));
}

async function getStableUpgradeGrowth(openid, currentGrowthValue = 0, effectiveDays = DEFAULT_AGENT_UPGRADE_RULES.effective_order_days) {
    const rows = await getAllOrdersByOpenid(openid);
    const unstableOrderGrowth = rows.reduce((sum, row) => {
        const netGrowth = getOrderNetGrowthForUpgrade(row);
        if (netGrowth <= 0) return sum;
        return isEffectiveUpgradeOrder(row, effectiveDays) ? sum : sum + netGrowth;
    }, 0);
    return Math.max(0, Math.floor(toNumber(currentGrowthValue, 0) - unstableOrderGrowth));
}

function isGrowthRuleMet(growthValue, target) {
    const threshold = toNumber(target, 0);
    return threshold > 0 && toNumber(growthValue, 0) >= threshold;
}

function deriveEligibleRoleLevel(currentRoleLevel = 0, effectiveSales = 0, directMembers = [], rechargeTotal = 0, upgradeRules = DEFAULT_AGENT_UPGRADE_RULES, growthValue = 0) {
    const resolvedCurrentRoleLevel = toNumber(currentRoleLevel, 0);
    let nextRoleLevel = resolvedCurrentRoleLevel;
    const totalSpent = roundMoney(effectiveSales);
    const currentGrowthValue = toNumber(growthValue, 0);

    if (totalSpent >= toNumber(upgradeRules.c1_min_purchase, DEFAULT_AGENT_UPGRADE_RULES.c1_min_purchase)) {
        nextRoleLevel = Math.max(nextRoleLevel, 1);
    }

    const c1OrAboveCount = directMembers.filter((member) => toNumber(member.role_level ?? member.distributor_level, 0) >= 1).length;
    if (
        (
            totalSpent >= toNumber(upgradeRules.c2_min_sales, DEFAULT_AGENT_UPGRADE_RULES.c2_min_sales)
            && c1OrAboveCount >= toNumber(upgradeRules.c2_referee_count, DEFAULT_AGENT_UPGRADE_RULES.c2_referee_count)
        )
        || isGrowthRuleMet(currentGrowthValue, upgradeRules.c2_growth_value ?? DEFAULT_AGENT_UPGRADE_RULES.c2_growth_value)
    ) {
        nextRoleLevel = Math.max(nextRoleLevel, 2);
    }

    // B1 晋级：推荐 10 个 C1（及以上）、充值 3000 或成长值达标
    if (
        c1OrAboveCount >= toNumber(upgradeRules.b1_referee_count, DEFAULT_AGENT_UPGRADE_RULES.b1_referee_count)
        || rechargeTotal >= toNumber(upgradeRules.b1_recharge, DEFAULT_AGENT_UPGRADE_RULES.b1_recharge)
        || isGrowthRuleMet(currentGrowthValue, upgradeRules.b1_growth_value ?? DEFAULT_AGENT_UPGRADE_RULES.b1_growth_value)
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
        b2OrAboveCount >= toNumber(upgradeRules.b3_referee_b2_count, DEFAULT_AGENT_UPGRADE_RULES.b3_referee_b2_count)
        || b1OrAboveCount >= toNumber(upgradeRules.b3_referee_b1_count, DEFAULT_AGENT_UPGRADE_RULES.b3_referee_b1_count)
        || rechargeTotal >= toNumber(upgradeRules.b3_recharge, DEFAULT_AGENT_UPGRADE_RULES.b3_recharge)
    ) {
        nextRoleLevel = Math.max(nextRoleLevel, 5);
    }

    return nextRoleLevel;
}

function resolveUpgradeTriggerType(nextRoleLevel, growthValue, rechargeTotal, upgradeRules = DEFAULT_AGENT_UPGRADE_RULES) {
    if (nextRoleLevel >= 3 && isGrowthRuleMet(growthValue, upgradeRules.b1_growth_value ?? DEFAULT_AGENT_UPGRADE_RULES.b1_growth_value)) return 'growth';
    if (nextRoleLevel === 2 && isGrowthRuleMet(growthValue, upgradeRules.c2_growth_value ?? DEFAULT_AGENT_UPGRADE_RULES.c2_growth_value)) return 'growth';
    if (nextRoleLevel >= 5 && rechargeTotal >= toNumber(upgradeRules.b3_recharge, DEFAULT_AGENT_UPGRADE_RULES.b3_recharge)) return 'recharge';
    if (nextRoleLevel >= 4 && rechargeTotal >= toNumber(upgradeRules.b2_recharge, DEFAULT_AGENT_UPGRADE_RULES.b2_recharge)) return 'recharge';
    if (nextRoleLevel >= 3 && rechargeTotal >= toNumber(upgradeRules.b1_recharge, DEFAULT_AGENT_UPGRADE_RULES.b1_recharge)) return 'recharge';
    return 'referral';
}

function isExchangeOrder(order = {}) {
    return String(order.type || order.order_type || '').trim().toLowerCase() === 'exchange';
}

function isFlexBundleOrder(order = {}) {
    const bundleMeta = order.bundle_meta && typeof order.bundle_meta === 'object' ? order.bundle_meta : {};
    if (pickString(bundleMeta.scene_type).toLowerCase() === 'flex_bundle') return true;
    if (pickString(order.bundle_scene_type).toLowerCase() === 'flex_bundle') return true;
    return toArray(order.items).some((item) => pickString(item?.bundle_scene_type).toLowerCase() === 'flex_bundle');
}

function isLimitedSpotRewardRestrictedOrder(order = {}) {
    const type = pickString(order.type || order.order_type).toLowerCase();
    if (type === 'limited_sale' || type === 'limited_spot') return true;
    if (hasValue(order.limited_sale_slot_id) || hasValue(order.limited_sale_item_id)) return true;
    if (hasValue(order.limited_spot_card_id) || hasValue(order.limited_spot_offer_id)) return true;
    if (order.limited_sale || order.limited_spot) return true;
    return toArray(order.items).some((item = {}) => {
        const activityType = pickString(item.activity_type).toLowerCase();
        return activityType === 'limited_sale'
            || activityType === 'limited_spot'
            || hasValue(item.limited_sale_slot_id)
            || hasValue(item.limited_sale_item_id)
            || hasValue(item.limited_spot_card_id)
            || hasValue(item.limited_spot_offer_id);
    });
}

function isExplosiveRewardRestrictedOrder(order = {}) {
    return toArray(order.items).some((item = {}) => (
        isTruthyFlag(item.is_explosive)
        || pickString(item.product_tag).toLowerCase() === 'hot'
    ));
}

function isRewardPointsRestrictedOrder(order = {}) {
    return isFlexBundleOrder(order)
        || isLimitedSpotRewardRestrictedOrder(order)
        || isExplosiveRewardRestrictedOrder(order);
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
    const account = existingAccount || await ensureWalletAccountForUser(user, getUserGoodsFundBalance(user));
    if (!account) throw new Error('货款账本同步失败：无法创建钱包账户');
    const before = toNumber(account.balance, 0);
    const after = before + amount;

    await db.collection('wallet_accounts').doc(String(account._id)).update({
        data: {
            balance: _.inc(amount),
            updated_at: db.serverDate()
        }
    });

    try {
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
    } catch (err) {
        await db.collection('wallet_accounts').doc(String(account._id)).update({
            data: {
                balance: _.inc(-amount),
                updated_at: db.serverDate()
            }
        }).catch((rollbackErr) => {
            console.error('[payment-callback] ⚠️ 货款充值账本日志失败后账户回滚失败 account=%s error=%s', account._id, rollbackErr.message);
        });
        throw err;
    }

    return true;
}

function getOrderPayFen(order = {}) {
    return amountFen(resolveOrderPayAmount(order, 0));
}

function getOrderTotalAmount(order = {}) {
    return resolveOrderPayAmount(order, 0);
}

function calculateOrderPayPoints(payAmount, purchasePointsPerHundred) {
    const amount = Math.max(0, toNumber(payAmount, 0));
    const pointsPerHundred = Math.max(0, toNumber(purchasePointsPerHundred, 0));
    return Math.max(0, Math.floor((amount * pointsPerHundred) / 100));
}

function removeFieldPatch() {
    return typeof _.remove === 'function' ? _.remove() : undefined;
}

function assignRemoveField(patch, field) {
    const removeValue = removeFieldPatch();
    if (removeValue !== undefined) {
        patch[field] = removeValue;
    }
    return patch;
}

async function acquireOrderStepLock(orderId, doneField, lockField, errorField) {
    const where = { _id: orderId };
    where[doneField] = _.exists(false);
    where[lockField] = _.exists(false);
    const data = {
        [lockField]: db.serverDate(),
        updated_at: db.serverDate()
    };
    assignRemoveField(data, errorField);

    const result = await db.collection('orders').where(where).update({ data });
    return Boolean(result && result.stats && result.stats.updated > 0);
}

async function completeOrderStep(orderId, doneField, lockField, patch = {}, extraRemoveFields = []) {
    const data = {
        ...patch,
        [doneField]: db.serverDate(),
        updated_at: db.serverDate()
    };
    assignRemoveField(data, lockField);
    extraRemoveFields.forEach((field) => assignRemoveField(data, field));
    await db.collection('orders').doc(orderId).update({ data });
}

async function failOrderStep(orderId, lockField, errorField, error) {
    const data = {
        [errorField]: error?.message || String(error || 'unknown_error'),
        updated_at: db.serverDate()
    };
    assignRemoveField(data, lockField);
    if (errorField) {
        data[`${errorField.replace(/_error$/, '')}_failed_at`] = db.serverDate();
    }
    await db.collection('orders').doc(orderId).update({ data }).catch((patchErr) => {
        console.error('[payment-callback] ⚠️ 支付后处理失败状态写入失败', patchErr.message);
    });
}

function normalizeAdministrativeRegionText(value) {
    let text = pickString(value).replace(/\s+/g, '').trim().toLowerCase();
    if (!text) return '';
    const suffixes = ['特别行政区', '维吾尔自治区', '壮族自治区', '回族自治区', '自治区', '自治州', '地区', '盟', '省', '市', '区', '县'];
    let changed = true;
    while (changed) {
        changed = false;
        for (const suffix of suffixes) {
            if (text.length > suffix.length && text.endsWith(suffix)) {
                text = text.slice(0, -suffix.length);
                changed = true;
                break;
            }
        }
    }
    return text;
}

function normalizeCityText(city, province) {
    const normalizedCity = normalizeAdministrativeRegionText(city);
    if (normalizedCity && !['市辖', '县辖', '省直辖', '自治区直辖'].includes(normalizedCity)) {
        return normalizedCity;
    }
    return normalizeAdministrativeRegionText(province);
}

function normalizeBranchScopeLevel(value) {
    const raw = pickString(value).trim().toLowerCase();
    if (raw === 'area') return 'district';
    if (['province', 'city', 'district', 'school'].includes(raw)) return raw;
    return 'district';
}

function branchScopePriority(scopeLevel) {
    return ({
        district: 3,
        city: 2,
        province: 1
    }[normalizeBranchScopeLevel(scopeLevel)] || 0);
}

function getOrderRegionParts(order = {}) {
    const addr = order.address_snapshot || order.address || order.receiver_address || {};
    const province = normalizeAdministrativeRegionText(addr.province || order.province);
    return {
        province,
        city: normalizeCityText(addr.city || order.city, addr.province || order.province),
        district: normalizeAdministrativeRegionText(addr.district || order.district)
    };
}

function branchAssignmentMatchesOrder(station = {}, order = {}) {
    const scopeLevel = normalizeBranchScopeLevel(station.branch_type);
    if (!['province', 'city', 'district'].includes(scopeLevel)) return false;
    const orderRegion = getOrderRegionParts(order);
    if (!orderRegion.province) return false;
    const stationProvince = normalizeAdministrativeRegionText(station.province);
    const stationCity = normalizeCityText(station.city, station.province);
    const stationDistrict = normalizeAdministrativeRegionText(station.district);
    if (scopeLevel === 'province') {
        return !!stationProvince && stationProvince === orderRegion.province;
    }
    if (scopeLevel === 'city') {
        return !!stationProvince && !!stationCity
            && stationProvince === orderRegion.province
            && stationCity === orderRegion.city;
    }
    return !!stationProvince && !!stationCity && !!stationDistrict
        && stationProvince === orderRegion.province
        && stationCity === orderRegion.city
        && stationDistrict === orderRegion.district;
}

function normalizeBranchAgentPolicy(rawPolicy = {}) {
    const rawTiers = Array.isArray(rawPolicy.region_reward_tiers) && rawPolicy.region_reward_tiers.length
        ? rawPolicy.region_reward_tiers
        : DEFAULT_BRANCH_AGENT_POLICY.region_reward_tiers;
    const tiers = isLegacyDefaultRegionRewardTiers(rawTiers)
        ? DEFAULT_BRANCH_AGENT_POLICY.region_reward_tiers
        : rawTiers;
    return {
        ...DEFAULT_BRANCH_AGENT_POLICY,
        ...rawPolicy,
        enabled: rawPolicy.enabled === undefined ? DEFAULT_BRANCH_AGENT_POLICY.enabled : rawPolicy.enabled !== false,
        region_reward_tiers: tiers.map((tier) => ({
            threshold: Math.max(0, toNumber(tier.threshold, 0)),
            rate: Math.max(0, toNumber(tier.rate, 0)),
            label: pickString(tier.label)
        })).sort((left, right) => left.threshold - right.threshold)
    };
}

function isLegacyDefaultRegionRewardTiers(tiers = []) {
    if (!Array.isArray(tiers) || tiers.length !== 3) return false;
    const legacyCandidates = [
        [
            { threshold: 100000, rate: 0.01 },
            { threshold: 300000, rate: 0.02 },
            { threshold: 1000000, rate: 0.03 }
        ],
        [
            { threshold: 0, rate: 0.01 },
            { threshold: 100000, rate: 0.02 },
            { threshold: 1000000, rate: 0.03 }
        ]
    ];
    return legacyCandidates.some((legacy) => legacy.every((expected, index) => {
        const tier = tiers[index] || {};
        return toNumber(tier.threshold, -1) === expected.threshold
            && Math.abs(toNumber(tier.rate, -1) - expected.rate) < 0.000001;
    }));
}

async function fetchCollectionRows(collectionName, whereClause = null, maxRows = 5000) {
    const rows = [];
    const pageSize = 100;
    let offset = 0;
    while (rows.length < maxRows) {
        let query = db.collection(collectionName);
        if (whereClause) query = query.where(whereClause);
        const response = await query.skip(offset).limit(Math.min(pageSize, maxRows - rows.length)).get().catch(() => ({ data: [] }));
        const batch = Array.isArray(response.data) ? response.data : [];
        rows.push(...batch);
        if (batch.length < pageSize) break;
        offset += batch.length;
    }
    return rows;
}

async function loadBranchAgentPolicy() {
    const row = await getConfigByKeys(['branch-agent-policy']);
    return normalizeBranchAgentPolicy(parseConfigValue(row, {}));
}

async function loadActiveBranchAgentStations() {
    const rows = await fetchCollectionRows('branch_agent_stations', null, 1000);
    return rows
        .filter((row) => pickString(row.status || 'active') === 'active')
        .map((row) => ({
            ...row,
            branch_type: normalizeBranchScopeLevel(row.branch_type || row.type || 'district')
        }))
        .sort((left, right) => {
            const scopeDiff = branchScopePriority(right.branch_type) - branchScopePriority(left.branch_type);
            if (scopeDiff !== 0) return scopeDiff;
            return parseTimestamp(right.updated_at || right.created_at) - parseTimestamp(left.updated_at || left.created_at);
        });
}

function findBranchAgentStationForOrder(order = {}, stations = []) {
    return stations.find((station) => branchAssignmentMatchesOrder(station, order)) || null;
}

function branchStationId(station = {}) {
    return station.id || station._legacy_id || station._id || null;
}

function isVirtualB3SettlementUser(user = {}) {
    return user.is_virtual_settlement === true
        || pickString(user.virtual_settlement_type).toLowerCase() === 'b3_region';
}

function isBranchRegionEligibleOrder(order = {}) {
    if (isExchangeOrder(order)) return false;
    const status = pickString(order.status).toLowerCase();
    return BRANCH_REGION_ELIGIBLE_STATUSES.includes(status);
}

async function calculateBranchStationCumulativeAmount(station, stations) {
    const stationId = branchStationId(station);
    const rows = await fetchCollectionRows('orders', { status: _.in(BRANCH_REGION_ELIGIBLE_STATUSES) }, 5000);
    return roundMoney(rows.reduce((sum, row) => {
        if (!isBranchRegionEligibleOrder(row)) return sum;
        const matched = findBranchAgentStationForOrder(row, stations);
        if (!matched || String(branchStationId(matched)) !== String(stationId)) return sum;
        return sum + getOrderTotalAmount(row);
    }, 0));
}

async function ensureBranchAgentRegionCommissionForOrder(orderId, order = {}, options = {}) {
    if (isExchangeOrder(order)) return { skipped: true, reason: 'exchange_order' };
    const payAmount = roundMoney(options.orderPayAmount ?? getOrderTotalAmount(order));
    if (payAmount <= 0) return { skipped: true, reason: 'non_positive_amount' };
    const [policy, stations] = await Promise.all([
        loadBranchAgentPolicy(),
        loadActiveBranchAgentStations()
    ]);
    if (!policy.enabled) return { skipped: true, reason: 'policy_disabled' };
    const station = findBranchAgentStationForOrder(order, stations);
    if (!station) return { skipped: true, reason: 'no_station_match' };
    const claimantId = station.claimant_id || station.openid || station.user_id;
    const claimant = await findUserByAny(claimantId);
    if (!claimant?.openid) return { skipped: true, reason: 'no_claimant' };
    const isVirtualB3 = isVirtualB3SettlementUser(claimant);
    const type = isVirtualB3 ? 'region_b3_virtual' : 'region_agent';
    const existing = await db.collection('commissions')
        .where({ order_id: orderId, openid: claimant.openid, type })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (existing.data && existing.data[0]) return { skipped: true, existing: true, id: existing.data[0]._id };

    const cumulativeAmount = await calculateBranchStationCumulativeAmount(station, stations);
    const rate = (policy.region_reward_tiers || []).reduce((current, tier) => {
        return cumulativeAmount >= toNumber(tier.threshold, 0) ? toNumber(tier.rate, current) : current;
    }, 0);
    const amount = roundMoney(payAmount * rate);
    if (amount <= 0) return { skipped: true, reason: 'zero_amount', cumulative_amount: cumulativeAmount, rate };

    const result = await db.collection('commissions').add({
        data: {
            openid: claimant.openid,
            user_id: claimant.id || claimant._legacy_id || claimant._id || claimant.openid,
            from_openid: order.openid || order.buyer_id || '',
            order_id: orderId,
            order_no: order.order_no || '',
            amount,
            level: isVirtualB3 ? 5 : toNumber(claimant.role_level ?? claimant.distributor_level, 0),
            status: 'pending_approval',
            type,
            branch_station_id: branchStationId(station),
            branch_type: normalizeBranchScopeLevel(station.branch_type),
            claimant_virtual_settlement: isVirtualB3,
            claimant_virtual_settlement_type: pickString(claimant.virtual_settlement_type),
            region_cumulative_amount: cumulativeAmount,
            region_reward_rate: rate,
            description: `${isVirtualB3 ? '虚拟B3区域佣金' : '区域奖励'}：${station.name || station.region_name || '区域'}（累计${cumulativeAmount.toFixed(2)}元）`,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });
    return { created: 1, id: result._id, amount, rate, cumulative_amount: cumulativeAmount, type };
}

async function ensureBranchAgentRegionCommissionWithRetryState(orderId, order = {}, options = {}) {
    try {
        const result = await ensureBranchAgentRegionCommissionForOrder(orderId, order, options);
        const patch = {
            branch_region_commission_checked_at: db.serverDate(),
            branch_region_commission_error: _.remove(),
            branch_region_commission_retry_required: _.remove(),
            updated_at: db.serverDate()
        };
        if (result.created || result.existing) {
            patch.branch_region_commission_created_at = db.serverDate();
            patch.branch_region_commission_skip_reason = _.remove();
        } else if (result.reason) {
            patch.branch_region_commission_skip_reason = result.reason;
        }
        try { await db.collection('orders').doc(orderId).update({ data: patch }); } catch (e) { console.error('[payment-callback] ⚠️ 区域代理佣金状态更新失败', e.message); await db.collection('rollback_error_logs').add({ data: { module: 'payment-callback', operation: 'branch_region_commission_patch', error: e.message, order_id: orderId, created_at: db.serverDate() } }).catch(() => {}); }
        return result;
    } catch (err) {
        const message = err?.message || 'branch_region_commission_failed';
try {
            await db.collection('orders').doc(orderId).update({
                data: {
                    branch_region_commission_error: message,
                    branch_region_commission_retry_required: true,
                    branch_region_commission_failed_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            });
        } catch (e) {
            console.error('[payment-callback] ⚠️ 区域代理佣金错误状态记录失败', e.message);
            await db.collection('rollback_error_logs').add({ data: { module: 'payment-callback', operation: 'branch_region_commission_error', error: e.message, order_id: orderId, created_at: db.serverDate() } }).catch(() => {});
        }
        console.error('[PaymentCallback] 区域代理佣金创建失败:', message);
        return { error: message, created: 0 };
    }
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
    const role = resolveBenefitRoleLevel(user.role_level ?? user.distributor_level ?? user.level);
    if (commissionConfig.commission_matrix) {
        return 0;
    }
    const directRates = normalizePctMap(commissionConfig.direct_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.direct_pct_by_role);
    const indirectRates = normalizePctMap(commissionConfig.indirect_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.indirect_pct_by_role);
    const rates = level === 1 ? directRates : indirectRates;
    return roundMoney(baseAmount * (rates[role] || 0));
}

function isFlexBundleCommissionItem(order = {}, item = {}) {
    const commissionMode = pickString(item.bundle_commission_mode || order.bundle_commission_snapshot?.mode || order.bundle_meta?.commission_mode);
    if (commissionMode) return commissionMode === 'fixed' || commissionMode === 'matrix';
    return pickString(item.bundle_scene_type || order.bundle_meta?.scene_type) === 'flex_bundle';
}

function resolveSelfCommissionRate(costSplit = {}) {
    const directSalesPct = toNumber(costSplit?.direct_sales_pct, DEFAULT_COST_SPLIT.direct_sales_pct);
    const normalized = directSalesPct > 1 ? directSalesPct / 100 : directSalesPct;
    return Math.max(0, normalized);
}

async function ensureAgentRoleSynced(orderId, order) {
    if (isExchangeOrder(order)) {
        return { skipped: true, reason: 'exchange_order' };
    }
    if (!order.openid) return { skipped: true };
    // 原子幂等锁：使用条件更新确保并发安全
    const lockRes = await db.collection('orders').where({
        _id: orderId,
        role_synced_at: _.exists(false)
    }).update({
        data: { role_synced_at: db.serverDate(), updated_at: db.serverDate() }
    }).catch(() => ({ stats: { updated: 0 } }));
    if (!lockRes || !lockRes.stats || lockRes.stats.updated === 0) {
        return { skipped: true, reason: 'already_synced_or_concurrent' };
    }

    try {
        const result = await _doRoleSync(orderId, order);
        if (!result || result.upgraded !== true) {
            await db.collection('orders').doc(orderId).update({
                data: { role_synced_at: _.remove(), updated_at: db.serverDate() }
            }).catch((unlockErr) => {
                console.error('[RoleSync] 未晋升锁释放失败:', unlockErr.message);
            });
        }
        return result;
    } catch (err) {
        // 锁后失败：回滚幂等标记，允许重试
        try {
            await db.collection('orders').doc(orderId).update({
                data: { role_synced_at: _.remove(), updated_at: db.serverDate() }
            });
        } catch (rollbackErr) {
            console.error('[RoleSync] 幂等锁回滚失败:', rollbackErr.message);
        }
        throw err;
    }
}

async function _doRoleSync(orderId, order) {
    const user = await findUserByAny(order.openid);
    if (!user) return { skipped: true };

    const { upgradeRules, memberLevels, piggyBank } = await loadAgentRuntimeConfig();
    if (upgradeRules.enabled === false) return { skipped: true };

    const effectiveDays = toNumber(upgradeRules.effective_order_days, DEFAULT_AGENT_UPGRADE_RULES.effective_order_days);
    const growthValue = toNumber(user.growth_value, 0);
    const [directMembers, rechargeTotal, effectiveSales, upgradeGrowthValue] = await Promise.all([
        getDirectMembers(user),
        getRechargeTotal(order.openid),
        getEffectiveOrderSales(order.openid, effectiveDays),
        getStableUpgradeGrowth(order.openid, growthValue, effectiveDays)
    ]);

    const currentRoleLevel = toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
    const nextRoleLevel = deriveEligibleRoleLevel(currentRoleLevel, effectiveSales, directMembers, rechargeTotal, upgradeRules, upgradeGrowthValue);
    if (nextRoleLevel <= currentRoleLevel) {
        return { skipped: true, currentRoleLevel, nextRoleLevel, growthValue, upgradeGrowthValue };
    }

    const previousParent = await findUserByAny(getUserReferrer(user));
    const previousGrandparent = previousParent ? await findUserByAny(getUserReferrer(previousParent)) : null;
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
            discount_rate: 1,
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
            from_name: DEFAULT_ROLE_NAMES[currentRoleLevel] || 'VIP用户',
            to_name: roleMeta.roleName,
            trigger_type: resolveUpgradeTriggerType(nextRoleLevel, upgradeGrowthValue, rechargeTotal, upgradeRules),
            trigger_order_id: orderId,
            total_spent: effectiveSales,
            recharge_total: rechargeTotal,
            growth_value: growthValue,
            upgrade_growth_value: upgradeGrowthValue,
            direct_member_count: directMembers.length,
            promoted_at: db.serverDate(),
            created_at: db.serverDate()
        }
    }).catch((err) => console.error('[RoleSync] 晋升日志写入失败:', err.message));

    let separation = { skipped: true, reason: 'disabled' };
    if (upgradeRules.promotion_separation_enabled !== false) {
        try {
            separation = await applyPromotionSeparation(db, _, {
                user,
                parent: previousParent,
                directMembers,
                previousRoleLevel: currentRoleLevel,
                nextRoleLevel,
                triggerOrderId: orderId,
                minRoleLevel: upgradeRules.promotion_separation_min_role_level || 3
            });
        } catch (err) {
            separation = { error: err.message };
            console.error('[RoleSync] 晋升脱离关系重排失败:', err.message);
            try {
                await db.collection('users').where({ openid: order.openid }).update({
                    data: {
                        promotion_separation_error: err.message,
                        promotion_separation_failed_at: db.serverDate(),
                        updated_at: db.serverDate()
                    }
                });
            } catch (e) {
                console.error('[payment-callback] 晋升脱离错误标记失败', e.message);
            }
        }
    }

    // 脱离成功后，为原上级创建脱离奖励佣金
    if (separation.separated && previousParent && previousParent.openid) {
        try {
            await ensureSeparationBonusCreated(orderId, order, {
                user,
                previousParent,
                previousRoleLevel: currentRoleLevel,
                nextRoleLevel,
                separation
            });
        } catch (err) {
            console.error('[RoleSync] 脱离奖励创建失败:', err.message);
        }
    }

    let piggyBankUnlock = { skipped: true, reason: 'not_checked' };
    try {
        piggyBankUnlock = await unlockUpgradePiggyBankForRole({
            db,
            command: _,
            findUserByAny
        }, {
            openid: order.openid,
            targetRoleLevel: nextRoleLevel,
            triggerOrderId: orderId,
            config: piggyBank
        });
    } catch (err) {
        piggyBankUnlock = { error: err.message };
        console.error('[RoleSync] 升级存钱罐解锁失败:', err.message);
    }

    return {
        upgraded: true,
        previousRoleLevel: currentRoleLevel,
        nextRoleLevel,
        roleName: roleMeta.roleName,
        previousParentOpenid: previousParent?.openid || '',
        previousParentId: previousParent ? (previousParent._id || previousParent.id || previousParent._legacy_id || '') : '',
        previousGrandparentOpenid: previousGrandparent?.openid || '',
        previousGrandparentId: previousGrandparent ? (previousGrandparent._id || previousGrandparent.id || previousGrandparent._legacy_id || '') : '',
        separation,
        piggyBankUnlock
    };
}

async function ensureSeparationBonusCreated(orderId, order, ctx) {
    const { user, previousParent, previousRoleLevel, nextRoleLevel, separation } = ctx;
    if (!separation || !separation.separated) return { skipped: true, reason: 'not_separated' };
    if (!previousParent || !previousParent.openid) return { skipped: true, reason: 'no_parent' };

    // 原子幂等锁：同一订单对同一上级只创建一次脱离奖励
    const lockKey = `separation_bonus_synced_at`;
    const lockRes = await db.collection('orders').where({
        _id: orderId,
        separation_bonus_synced_at: _.exists(false)
    }).update({
        data: { [lockKey]: db.serverDate(), updated_at: db.serverDate() }
    }).catch(() => ({ stats: { updated: 0 } }));
    if (!lockRes || !lockRes.stats || lockRes.stats.updated === 0) {
        return { skipped: true, reason: 'already_created_or_concurrent' };
    }

    const config = (await loadAgentRuntimeConfig()).upgradeRules || {};
    const bonusPct = toNumber(config.separation_bonus_pct, 0);
    if (bonusPct <= 0) {
        // 配置为0时不发奖励，但需写标记防止重试
        return { skipped: true, reason: 'no_bonus_config' };
    }

    const orderAmount = getOrderTotalAmount(order);
    const bonusAmount = roundMoney(orderAmount * bonusPct / 100);
    if (bonusAmount <= 0) return { skipped: true, reason: 'zero_amount' };

    // 冷却期配置，默认90天后释放
    const cooldownDays = toNumber(config.separation_bonus_cooldown_days, 90);
    const releaseAt = new Date(Date.now() + cooldownDays * 24 * 60 * 60 * 1000);

    await db.collection('commissions').add({
        data: {
            openid: previousParent.openid,
            user_id: previousParent.id || previousParent._legacy_id || previousParent._id || previousParent.openid,
            from_openid: user.openid || order.openid,
            order_id: orderId,
            order_no: order.order_no || '',
            amount: bonusAmount,
            level: nextRoleLevel,
            type: 'n_separation_bonus',
            status: 'frozen',
            bonus_role_level: nextRoleLevel,
            separated_user_openid: user.openid || order.openid,
            separated_from_role_level: previousRoleLevel,
            peer_bonus_release_at: releaseAt,
            refund_deadline: releaseAt,
            description: '脱离奖励：下级晋升脱离后奖励',
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });

    // 同时写一条钱包流水
    await db.collection('wallet_logs').add({
        data: {
            openid: previousParent.openid,
            user_id: previousParent.id || previousParent._legacy_id || previousParent._id || previousParent.openid,
            type: 'n_separation_bonus',
            amount: bonusAmount,
            balance_after: 0,
            order_id: orderId,
            order_no: order.order_no || '',
            from_openid: user.openid || order.openid,
            description: '脱离奖励到账',
            status: 'frozen',
            released_at: releaseAt,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    }).catch((err) => { console.error('[SeparationBonus] 钱包流水写入失败:', err.message); });

    return { created: true, amount: bonusAmount, bonusPct };
}

async function ensurePeerBonusCreated(orderId, order, roleSyncResult) {
    if (isExchangeOrder(order)) return { skipped: true, reason: 'exchange_order' };
    if (!roleSyncResult?.upgraded) return { skipped: true };
    const buyer = await findUserByAny(order.openid || order.buyer_id || order.user_id);
    if (!buyer) return { skipped: true };
    const parent = await findUserByAny(roleSyncResult.previousParentOpenid || getUserReferrer(buyer));
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

    // Lv6实体门店平级奖按业务图固定为一次性20%现金，不走兑换券版本。
    const version = bonusLevel === 6 ? 'store_cash' : (parent.peer_bonus_version || peerBonus.default_version || 'team');
    const upgradePayment = getOrderTotalAmount(order);
    const cooldownDays = toNumber(peerBonus.cooldown_days, 90);
    const releaseAt = new Date(Date.now() + cooldownDays * 24 * 60 * 60 * 1000);

    let amount = 0;
    let exchangeCoupons = 0;
    let description = '';

    if (bonusLevel === 6) {
        const teamConfig = (peerBonus.team || {}).level_6 || DEFAULT_PEER_BONUS_CONFIG.team.level_6;
        const pct = toNumber(teamConfig.cash_pct, DEFAULT_PEER_BONUS_CONFIG.team.level_6.cash_pct);
        amount = roundMoney(upgradePayment * pct / 100);
        exchangeCoupons = 0;
        description = `实体门店平级奖（${pct}%现金）：下级升级为 ${roleSyncResult.roleName}`;
    } else if (version === 'social') {
        const socialConfig = (peerBonus.social || {})[`level_${bonusLevel}`] || DEFAULT_PEER_BONUS_CONFIG.social[`level_${bonusLevel}`] || {};
        const pct = toNumber(socialConfig.pct, 0);
        amount = roundMoney(upgradePayment * pct / 100);
        description = `平级奖（社会版${pct}%）：下级升级为 ${roleSyncResult.roleName}`;
    } else {
        const teamConfig = (peerBonus.team || {})[`level_${bonusLevel}`] || DEFAULT_PEER_BONUS_CONFIG.team[`level_${bonusLevel}`] || {};
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
    if (order.points_awarded_at) return { skipped: true };
    const skipReason = getPaidPostProcessSkipReason(order);
    if (skipReason) {
        if (shouldMarkPostProcessSkipped(order)) {
            await completeOrderStep(orderId, 'points_awarded_at', 'points_awarding_at', {
                points_earned: 0,
                growth_earned: 0,
                points_award_skipped_reason: skipReason
            }, ['points_award_error', 'points_log_error']);
        }
        return { skipped: true, reason: skipReason, awarded: 0, growth: 0 };
    }

    // 原子幂等锁：用 where 条件确保只有一个调用能通过
    const locked = await acquireOrderStepLock(orderId, 'points_awarded_at', 'points_awarding_at', 'points_award_error');
    if (!locked) {
        console.log('[payment-callback] 积分发放已被并发处理，跳过 orderId=%s', orderId);
        return { skipped: true, reason: 'concurrent_lock' };
    }

    try {
        if (isExchangeOrder(order)) {
            await completeOrderStep(orderId, 'points_awarded_at', 'points_awarding_at', {
                points_earned: 0,
                growth_earned: 0
            }, ['points_award_error', 'points_log_error']);
            return { skipped: true, reason: 'exchange_order', awarded: 0, growth: 0, multiplier: 0, buyerRole: 0 };
        }
        if (order.is_test_order === true || order.is_test_order === 1 || order.is_test_order === '1') {
            await completeOrderStep(orderId, 'points_awarded_at', 'points_awarding_at', {
                points_earned: 0,
                growth_earned: 0
            }, ['points_award_error', 'points_log_error']);
            return { skipped: true, reason: 'test_order', awarded: 0, growth: 0, multiplier: 0, buyerRole: 0 };
        }

        const payAmount = getOrderTotalAmount(order);
        if (payAmount <= 0 || !order.openid) {
            await completeOrderStep(orderId, 'points_awarded_at', 'points_awarding_at', {
                points_earned: 0,
                growth_earned: 0
            }, ['points_award_error', 'points_log_error']);
            return { awarded: 0 };
        }

        // 查买家等级，按等级倍率赠送积分
        const buyerRes = await db.collection('users').where({ openid: order.openid }).limit(1).get().catch(() => ({ data: [] }));
        const buyerRole = buyerRes.data && buyerRes.data[0]
            ? toNumber(buyerRes.data[0].role_level ?? buyerRes.data[0].distributor_level ?? buyerRes.data[0].level, 0)
            : 0;
        const benefitBuyerRole = resolvePointBenefitRoleLevel(buyerRole);
        const { pointRules, growthRules } = await loadAgentRuntimeConfig();
        const purchasePointsPerHundred = Math.max(
            0,
            toNumber(pointRules.purchase_multiplier_by_role?.[benefitBuyerRole], pointRules.purchase_multiplier_by_role?.[0] || DEFAULT_POINT_RULES.purchase_multiplier_by_role[0])
        );
        const pointsEarned = isRewardPointsRestrictedOrder(order)
            ? 0
            : calculateOrderPayPoints(payAmount, purchasePointsPerHundred);

        const purchaseGrowthRule = growthRules.purchase || DEFAULT_GROWTH_RULES.purchase;
        const growthBaseAmount = purchaseGrowthRule.use_original_amount
            ? toNumber(order.original_amount ?? order.total_amount ?? payAmount, payAmount)
            : payAmount;
        const growthEarned = purchaseGrowthRule.enabled === false
            ? 0
            : Math.max(0, Math.floor(growthBaseAmount * toNumber(purchaseGrowthRule.multiplier, 1) + toNumber(purchaseGrowthRule.fixed, 0)));

        if (pointsEarned <= 0 && growthEarned <= 0) {
            await completeOrderStep(orderId, 'points_awarded_at', 'points_awarding_at', {
                points_earned: 0,
                growth_earned: 0
            }, ['points_award_error', 'points_log_error']);
            return { awarded: 0 };
        }

        const updates = { total_spent: _.inc(payAmount), order_count: _.inc(1), updated_at: db.serverDate() };
        if (growthEarned > 0) updates.growth_value = _.inc(growthEarned);

        const userUpdate = await db.collection('users').where({ openid: order.openid }).update({ data: updates });
        if (!userUpdate || !userUpdate.stats || userUpdate.stats.updated === 0) {
            throw new Error('用户积分/成长值更新失败');
        }

        let pointLogError = '';
        const existingLog = await db.collection('point_logs')
            .where({ openid: order.openid, source: 'order_pay', order_id: orderId })
            .limit(1).get().catch(() => ({ data: [] }));
        const releaseAt = pointsEarned > 0 ? getRewardPointsReleaseAt() : null;
        if (pointsEarned > 0 && (!existingLog.data || existingLog.data.length === 0)) {
            await db.collection('point_logs').add({
                data: {
                    openid: order.openid,
                    type: 'earn',
                    amount: pointsEarned,
                    original_amount: pointsEarned,
                    source: 'order_pay',
                    status: 'frozen',
                    order_id: orderId,
                    buyer_role: buyerRole,
                    multiplier: purchasePointsPerHundred,
                    release_at: releaseAt,
                    refund_deadline: releaseAt,
                    description: `订单支付获得${pointsEarned}积分（退款保护期后入账，每100元赠送${purchasePointsPerHundred}积分）`,
                    created_at: db.serverDate(),
                    updated_at: db.serverDate(),
                },
            }).catch((err) => {
                pointLogError = err.message || String(err);
                console.error('[payment-callback] ⚠️ 支付积分流水写入失败 orderId=%s error=%s', orderId, pointLogError);
            });
        }

        const completionPatch = {
            points_earned: pointsEarned,
            growth_earned: growthEarned,
            reward_points_released_total: pointsEarned > 0 ? 0 : _.remove(),
            points_award_status: pointsEarned > 0 ? 'frozen' : 'no_points',
            points_release_at: releaseAt || _.remove()
        };
        const removeFields = ['points_award_error'];
        if (pointLogError) {
            completionPatch.points_log_error = pointLogError;
        } else {
            removeFields.push('points_log_error');
        }
        await completeOrderStep(orderId, 'points_awarded_at', 'points_awarding_at', completionPatch, removeFields);
        return { awarded: pointsEarned, growth: growthEarned, multiplier: purchasePointsPerHundred, buyerRole, point_log_error: pointLogError || undefined };
    } catch (err) {
        await failOrderStep(orderId, 'points_awarding_at', 'points_award_error', err);
        throw err;
    }
}

async function ensureStockDeducted(orderId, order) {
    if (order.stock_deducted_at) return { skipped: true };
    if (pickString(order.delivery_type) === 'pickup' && pickString(order.pickup_stock_reservation_mode) === 'station') {
        return { skipped: true, mode: 'pickup_station_stock' };
    }
    const items = toArray(order.items);
    for (const item of items) {
        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        if (item.product_id) {
            const product = await getDocByIdOrLegacy('products', item.product_id);
            if (product && product._id) {
                const productRes = await db.collection('products')
                    .where({ _id: String(product._id), stock: _.gte(qty) })
                    .update({ data: { stock: _.inc(-qty), sales_count: _.inc(qty), updated_at: db.serverDate() } });
                if (!productRes.stats || productRes.stats.updated === 0) {
                    console.error('[payment-callback] ⚠️ 商品库存不足或并发冲突 productId=%s qty=%s', product._id, qty);
                    return { deducted: 0, stockError: `商品库存不足: ${product.name || item.product_id}` };
                }
            }
        }
        if (item.sku_id) {
            const sku = await getDocByIdOrLegacy('skus', item.sku_id);
            if (sku && sku._id) {
                const skuRes = await db.collection('skus')
                    .where({ _id: String(sku._id), stock: _.gte(qty) })
                    .update({ data: { stock: _.inc(-qty), updated_at: db.serverDate() } });
                if (!skuRes.stats || skuRes.stats.updated === 0) {
                    console.error('[payment-callback] ⚠️ SKU库存不足或并发冲突 skuId=%s qty=%s', sku._id, qty);
                    return { deducted: 0, stockError: `SKU库存不足: ${item.sku_id}` };
                }
            }
        }
    }
    await db.collection('orders').doc(orderId).update({
        data: { stock_deducted_at: db.serverDate(), updated_at: db.serverDate() },
    });
    return { deducted: items.length };
}

async function ensureCommissionsCreated(orderId, order) {
    if (order.commissions_created_at) return { skipped: true };

    // 原子幂等锁：用 where 条件确保只有一个调用能通过
    const locked = await acquireOrderStepLock(orderId, 'commissions_created_at', 'commissions_creating_at', 'commissions_create_error');
    if (!locked) {
        console.log('[payment-callback] 佣金创建已被并发处理，跳过 orderId=%s', orderId);
        return { skipped: true, reason: 'concurrent_lock' };
    }
    try {
        if (isExchangeOrder(order)) {
            await completeOrderStep(orderId, 'commissions_created_at', 'commissions_creating_at', {}, ['commissions_create_error']);
            return { skipped: true, reason: 'exchange_order', created: 0 };
        }

        const orderPayAmount = getOrderTotalAmount(order);
        const commissionBase = orderPayAmount;
        const branchRegion = commissionBase > 0
            ? await ensureBranchAgentRegionCommissionWithRetryState(orderId, order, { orderPayAmount })
            : { skipped: true, reason: 'non_positive_amount' };
        const buyer = await findUserByAny(order.openid || order.buyer_id || order.user_id);
        if (!buyer) {
            await completeOrderStep(orderId, 'commissions_created_at', 'commissions_creating_at', {}, ['commissions_create_error']);
            return { created: toNumber(branchRegion.created, 0), branch_region: branchRegion };
        }

        const parent = await findUserByAny(order.direct_referrer_openid || getUserReferrer(buyer));
        const grandparent = await findUserByAny(order.indirect_referrer_openid || (parent ? getUserReferrer(parent) : ''));
        const fulfillmentPartner = await findUserByAny(order.fulfillment_partner_openid || order.nearest_agent_openid || order.agent_info?.openid || '');
        const fulfillmentPartnerOpenid = fulfillmentPartner?.openid || order.fulfillment_partner_openid || '';
        const beneficiaries = [
            { level: 1, type: 'direct', user: parent },
            { level: 2, type: 'indirect', user: grandparent }
        ].filter((b) => b.user && b.user.openid && b.user.openid !== order.openid);

        const { commissionConfig, commissionMatrix, bundleCommissionMatrix, costSplit } = await loadAgentRuntimeConfig();
        const buyerRole = toNumber(buyer.role_level ?? buyer.distributor_level ?? buyer.level, 0);
        const benefitBuyerRole = resolveBenefitRoleLevel(buyerRole);
        const isAgentSelfPurchase = buyerRole >= 3;
        const totals = new Map();
        const items = toArray(order.items);

        // 佣金基数 = 实付金额（pay_amount 已扣除积分抵扣和优惠券，无需再减 points_discount）
        if (commissionBase <= 0) {
            await completeOrderStep(orderId, 'commissions_created_at', 'commissions_creating_at', {}, ['commissions_create_error']);
            return { created: 0, reason: 'all_points_payment', branch_region: branchRegion };
        }

        if (isAgentSelfPurchase && commissionConfig.self_purchase_commission_enabled) {
            const existingSelfRes = await db.collection('commissions')
                .where({ order_id: orderId, openid: buyer.openid, type: 'self' })
                .limit(1)
                .get()
                .catch(() => ({ data: [] }));
            const selfCommissionRate = resolveSelfCommissionRate(costSplit);
            const selfCommissionAmount = roundMoney(orderPayAmount * selfCommissionRate);

            if ((!existingSelfRes.data || existingSelfRes.data.length === 0) && selfCommissionAmount > 0) {
                await db.collection('commissions').add({
                    data: {
                        openid: buyer.openid,
                        user_id: buyer.id || buyer._legacy_id || buyer._id || buyer.openid,
                        from_openid: order.openid,
                        buyer_role: buyerRole,
                        order_id: orderId,
                        order_no: order.order_no,
                        amount: selfCommissionAmount,
                        level: buyerRole,
                        type: 'self',
                        self_sale_rate: selfCommissionRate,
                        self_sale_profit_amount: selfCommissionAmount,
                        self_sale_goods_value_amount: roundMoney(orderPayAmount - selfCommissionAmount),
                        status: 'pending',
                        created_at: db.serverDate(),
                        updated_at: db.serverDate()
                    }
                });
            }

            await completeOrderStep(orderId, 'commissions_created_at', 'commissions_creating_at', {}, ['commissions_create_error']);
            return {
                created: (selfCommissionAmount > 0 ? 1 : 0) + toNumber(branchRegion.created, 0),
                commission_base: orderPayAmount,
                mode: 'self_purchase',
                branch_region: branchRegion
            };
        }

        if (!beneficiaries.length) {
            await completeOrderStep(orderId, 'commissions_created_at', 'commissions_creating_at', {}, ['commissions_create_error']);
            return { created: toNumber(branchRegion.created, 0), branch_region: branchRegion };
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
            const useBundleMatrix = isFlexBundleCommissionItem(order, item);
            const activeMatrix = useBundleMatrix ? bundleCommissionMatrix : commissionMatrix;
            const useMatrix = activeMatrix && Object.keys(activeMatrix).length > 0;
            if (useMatrix) {
                // 组合商品与普通商品使用同一套级差矩阵算法，但矩阵参数各自独立。
                // 级差矩阵制：parent 拿 matrix[parentRole][buyerRole]%，grandparent 拿级差
                // 即便父级被跳过（因为 openid == buyer 等），也要用父级应得比例计算级差
                const parentBeneficiary = beneficiaries.find(b => b.level === 1);
                const parentRole = parentBeneficiary
                    ? resolveBenefitRoleLevel(parentBeneficiary.user.role_level ?? parentBeneficiary.user.distributor_level ?? parentBeneficiary.user.level)
                    : 0;
                // 无论是否使用商品级配置，都应基于矩阵比例计算级差基准
                const parentMatrixRate = parentBeneficiary ? matrixRate(activeMatrix, parentRole, benefitBuyerRole) : 0;

                for (const beneficiary of beneficiaries) {
                    const bRole = resolveBenefitRoleLevel(beneficiary.user.role_level ?? beneficiary.user.distributor_level ?? beneficiary.user.level);

                    let amount;
                    const configured = useBundleMatrix ? 0 : commissionConfigForLevel(product, beneficiary.level, allocatedBase);
                    if (configured > 0) {
                        amount = Math.min(allocatedBase, configured);
                    } else {
                        const myRate = matrixRate(activeMatrix, bRole, benefitBuyerRole);
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
                    let amount;
                    if (useBundleMatrix) {
                        amount = roundMoney(beneficiary.level === 1 ? item.direct_commission_fixed_amount : item.indirect_commission_fixed_amount);
                    } else {
                        const configured = commissionConfigForLevel(product, beneficiary.level, allocatedBase);
                        const roleBased = roleBasedCommission(beneficiary.user, beneficiary.level, allocatedBase, commissionConfig);
                        amount = configured > 0
                            ? Math.min(allocatedBase, configured)
                            : roleBased;
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
            }
        }

        let created = toNumber(branchRegion.created, 0);
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

        await completeOrderStep(orderId, 'commissions_created_at', 'commissions_creating_at', {}, ['commissions_create_error']);
        return { created, commission_base: commissionBase, branch_region: branchRegion };
    } catch (err) {
        await failOrderStep(orderId, 'commissions_creating_at', 'commissions_create_error', err);
        throw err;
    }
}

function isGroupOrder(order = {}) {
    return order.type === 'group' || hasValue(order.group_activity_id) || hasValue(order.group_no);
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

async function findGroupOrder(groupNo) {
    if (!hasValue(groupNo)) return null;
    const res = await db.collection('group_orders')
        .where({ group_no: String(groupNo) })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

function valuesOverlap(leftValues = [], rightValues = []) {
    const left = leftValues.filter(hasValue).map((value) => String(value));
    const right = new Set(rightValues.filter(hasValue).map((value) => String(value)));
    if (!left.length || !right.size) return true;
    return left.some((value) => right.has(value));
}

function firstOrderItem(order = {}) {
    return toArray(order.items)[0] || {};
}

function assertGroupOrderMatchesPaidOrder(groupOrder = {}, order = {}, activity = {}) {
    const activityMatches = valuesOverlap(
        [groupOrder.activity_id, groupOrder.legacy_activity_id],
        [order.group_activity_id, order.legacy_group_activity_id, order.activity_id, activity?._id, activity?.id, activity?._legacy_id]
    );
    if (!activityMatches) throw new Error('拼团活动与订单不一致');

    const item = firstOrderItem(order);
    const productMatches = valuesOverlap(
        [groupOrder.product_id, groupOrder.productId],
        [order.product_id, item.product_id, activity?.product_id]
    );
    if (!productMatches) throw new Error('拼团商品与订单不一致');

    const skuMatches = valuesOverlap(
        [groupOrder.sku_id, groupOrder.skuId],
        [order.sku_id, item.sku_id]
    );
    if (!skuMatches) throw new Error('拼团规格与订单不一致');
}

/**
 * 成团后将所有参团订单从 pending_group → paid
 */
async function promoteGroupOrdersToPaid(groupOrder) {
    if (!groupOrder) return;
    const groupNo = groupOrder.group_no;
    const activityId = groupOrder.activity_id || groupOrder.legacy_activity_id || '';
    const resolveCompletedGroupOrderStatus = (order = {}) => (
        pickString(order.delivery_type).toLowerCase() === 'pickup' ? 'pickup_pending' : 'paid'
    );
    try {
        // 通过 group_no 查找关联订单
        if (groupNo) {
            const pendingRes = await db.collection('orders')
                .where({ group_no: groupNo, status: 'pending_group' })
                .limit(100)
                .get()
                .catch(() => ({ data: [] }));
            for (const order of pendingRes.data || []) {
                try {
                    await db.collection('orders').doc(String(order._id))
                        .update({
                            data: {
                                status: resolveCompletedGroupOrderStatus(order),
                                group_completed_at: db.serverDate(),
                                updated_at: db.serverDate()
                            }
                        });
                } catch (e) {
                    console.error('[payment-callback] ⚠️ 团单完成状态更新失败', e.message);
                }
            }
        }
        // 通过 members 列表精确更新（防止误更新同活动其他团的订单）
        const members = Array.isArray(groupOrder.members) ? groupOrder.members : [];
        for (const m of members) {
            if (m.order_id) {
                const orderDoc = await db.collection('orders').doc(String(m.order_id)).get().catch(() => ({ data: null }));
                const order = orderDoc.data || {};
                if (order.status && order.status !== 'pending_group') continue;
                try {
                    await db.collection('orders').doc(String(m.order_id))
                        .update({
                            data: {
                                status: resolveCompletedGroupOrderStatus(order),
                                group_no: groupNo,
                                group_completed_at: db.serverDate(),
                                updated_at: db.serverDate()
                            }
                        });
                } catch (e) {
                    console.error('[payment-callback] ⚠️ 团成员订单状态更新失败', e.message);
                }
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
    if (groupOrder) {
        assertGroupOrderMatchesPaidOrder(groupOrder, order, activity);
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
        const item = firstOrderItem(order);
        const data = {
            group_no: groupNo,
            activity_id: activity?._id || order.group_activity_id || '',
            legacy_activity_id: activity?.id || activity?._legacy_id || order.legacy_group_activity_id || '',
            product_id: order.product_id || item.product_id || activity?.product_id || '',
            sku_id: order.sku_id || item.sku_id || '',
            leader_openid: order.openid,
            status: groupSize <= 1 ? 'completed' : 'pending',
            members: [member],
            member_count: 1,
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
    const persistedMemberCount = toNumber(groupOrder.member_count, NaN);
    let currentMemberCount = Number.isFinite(persistedMemberCount) ? persistedMemberCount : members.length;
    if (!Number.isFinite(persistedMemberCount)) {
        try {
            await db.collection('group_orders').doc(groupOrder._id).update({
                data: { member_count: currentMemberCount, updated_at: db.serverDate() }
            });
        } catch (e) {
            console.error('[payment-callback] 团成员数量修正失败', e.message);
        }
    }
    const nextMembers = exists ? members : [...members, member];
    if (!exists) {
        if (currentMemberCount >= groupSize) throw new Error('该团已满员');
        const joinRes = await db.collection('group_orders')
            .where({ _id: groupOrder._id, status: _.in(['pending', 'open']), member_count: _.lt(groupSize) })
            .update({
                data: {
                    members: _.push(member),
                    member_count: _.inc(1),
                    updated_at: db.serverDate(),
                },
            })
            .catch(() => ({ stats: { updated: 0 } }));
        if (!joinRes.stats || joinRes.stats.updated === 0) {
            throw new Error('拼团人数已变更，请刷新后重试');
        }
        currentMemberCount += 1;
    }

    const memberCount = exists ? currentMemberCount : Math.max(currentMemberCount, nextMembers.length);
    const completed = memberCount >= groupSize;
    await writeGroupNoToOrder(groupOrder.group_no);
    if (completed && groupOrder.status !== 'completed') {
        const completeRes = await db.collection('group_orders')
            .where({ _id: groupOrder._id, status: _.in(['pending', 'open']), member_count: _.gte(groupSize) })
            .update({
                data: { status: 'completed', completed_at: db.serverDate(), updated_at: db.serverDate() },
            })
            .catch(() => ({ stats: { updated: 0 } }));
        if (completeRes.stats && completeRes.stats.updated > 0) {
            await promoteGroupOrdersToPaid({
                ...groupOrder,
                status: 'completed',
                members: nextMembers
            });
        }
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
    const existingOrderId = pickString(record.order_id || record.locked_order_id);
    if (record.status === 'purchased') {
        if (existingOrderId && existingOrderId !== String(orderId)) {
            throw new Error('该砍价已被其他订单使用');
        }
    } else {
        if (record.status === 'expired') throw new Error('砍价已过期');
        const updateRes = await db.collection('slash_records')
            .where({ _id: record._id, openid: order.openid, status: _.in(['active', 'completed']) })
            .update({
                data: {
                    status: 'purchased',
                    order_id: orderId,
                    order_no: order.order_no,
                    purchased_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            })
            .catch(() => ({ stats: { updated: 0 } }));
        if (!updateRes.stats || updateRes.stats.updated === 0) {
            throw new Error('砍价状态已变更，请刷新后重试');
        }
    }
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
        const config = parseConfigValue(rawConfig, rawConfig) || {};
        const levelKey = LEVEL_KEY[roleLevel] || '';
        if (config && typeof config === 'object' && config.enabled === false) {
            return { skipped: true, reason: 'disabled' };
        }

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

async function accrueDividendPoolContribution(orderId, order) {
    if (order.dividend_pool_accrued_at) return { skipped: true, reason: 'already_accrued' };

    const amount = roundMoney(getOrderTotalAmount(order));
    const rulesRow = await getConfigByKeys(['agent_system_dividend-rules', 'agent_system_dividend_rules']);
    const rules = {
        enabled: false,
        source_pct: 0,
        ...parseConfigValue(rulesRow, {})
    };
    const sourcePct = Math.max(0, toNumber(rules.source_pct, 0));
    const contribution = roundMoney(amount * sourcePct / 100);

    if (!rules.enabled || contribution <= 0) {
        try {
            await db.collection('orders').doc(orderId).update({
                data: {
                    dividend_pool_accrued_at: db.serverDate(),
                    dividend_pool_contribution: 0,
                    updated_at: db.serverDate()
                }
            });
        } catch (e) {
            console.error('[payment-callback] 分红池标记更新失败', e.message);
        }
        return { skipped: true, reason: !rules.enabled ? 'disabled' : 'zero_contribution' };
    }

    const poolKey = 'agent_system_dividend-pool';
    const poolRow = await getConfigByKeys([poolKey]);
    const poolState = {
        balance: 0,
        total_in: 0,
        total_out: 0,
        ...parseConfigValue(poolRow, {})
    };
    const nextPoolState = {
        ...poolState,
        balance: roundMoney(toNumber(poolState.balance, 0) + contribution),
        total_in: roundMoney(toNumber(poolState.total_in, 0) + contribution),
        total_out: roundMoney(toNumber(poolState.total_out, 0)),
        updated_at: new Date().toISOString()
    };

    await upsertJsonConfigRow(poolKey, nextPoolState, { config_group: 'agent_system' });
    await db.collection('orders').doc(orderId).update({
        data: {
            dividend_pool_accrued_at: db.serverDate(),
            dividend_pool_contribution: contribution,
            updated_at: db.serverDate()
        }
    });

    return { accrued: true, contribution, balance: nextPoolState.balance };
}

async function processPaidOrder(orderId, order) {
    const latest = await db.collection('orders').doc(orderId).get().then((res) => res.data || order).catch(() => order);
    const skipReason = getPaidPostProcessSkipReason(latest);
    if (skipReason) {
        if (!latest.payment_post_processed_at && shouldMarkPostProcessSkipped(latest)) {
            const skipPatch = {
                payment_post_processed_at: db.serverDate(),
                payment_post_process_skipped_at: db.serverDate(),
                payment_post_process_skipped_reason: skipReason,
                updated_at: db.serverDate()
            };
            if (!hasValue(latest.points_earned)) skipPatch.points_earned = 0;
            if (!hasValue(latest.growth_earned)) skipPatch.growth_earned = 0;
            await db.collection('orders').doc(orderId).update({ data: skipPatch }).catch((err) => {
                console.error('[payment-callback] ⚠️ 支付后处理跳过标记失败 orderId=%s reason=%s error=%s', orderId, skipReason, err.message);
            });
        }
        return { skipped: true, reason: skipReason };
    }
    const needsGroupJoin = isGroupOrder(latest) && !latest.group_joined_at;
    const needsSlashPurchase = hasValue(latest.slash_no) && !latest.slash_purchased_at;
    const needsBranchRegionRetry = latest.branch_region_commission_retry_required === true;
    if (latest.payment_post_processed_at && !needsGroupJoin && !needsSlashPurchase) {
        if (needsBranchRegionRetry && PAID_POST_PROCESS_STATUSES.includes(pickString(latest.status).toLowerCase())) {
            const branchRegion = await ensureBranchAgentRegionCommissionWithRetryState(orderId, latest, {
                orderPayAmount: getOrderTotalAmount(latest)
            });
            return { branchRegion };
        }
        return { skipped: true };
    }

    const group = needsGroupJoin ? await ensurePaidGroupJoined(orderId, latest) : { skipped: true };
    const slash = needsSlashPurchase ? await ensureSlashOrderPurchased(orderId, latest) : { skipped: true };
    if (latest.payment_post_processed_at) return { group, slash };

    const stock = await ensureStockDeducted(orderId, latest);
    const points = await ensurePointsAwarded(orderId, { ...latest, stock_deducted_at: true });
    const roles = await ensureAgentRoleSynced(orderId, { ...latest, stock_deducted_at: true, points_awarded_at: true });
    const settlementOrder = {
        ...latest,
        stock_deducted_at: true,
        points_awarded_at: true,
        direct_referrer_openid: latest.direct_referrer_openid || roles.previousParentOpenid || '',
        indirect_referrer_openid: latest.indirect_referrer_openid || roles.previousGrandparentOpenid || ''
    };

    // 代理升级时记录基金池入池
    if (roles && roles.upgraded && roles.nextRoleLevel >= 3) {
        try {
            await recordFundPoolEntry(order.openid, roles.nextRoleLevel, 'upgrade_payment', orderId);
        } catch (e) {
            console.error('[payment-callback] ⚠️ 基金池入池记录失败', e.message);
            await db.collection('rollback_error_logs').add({ data: { module: 'payment-callback', operation: 'fund_pool_entry', error: e.message, order_id: orderId, created_at: db.serverDate() } }).catch(() => {});
        }
    }

    const peerBonus = await ensurePeerBonusCreated(orderId, settlementOrder, roles);
    const commissions = await ensureCommissionsCreated(orderId, settlementOrder);
    const runtimeConfig = await loadAgentRuntimeConfig();
    const piggyBank = await createUpgradePiggyBankForOrder({
        db,
        command: _,
        findUserByAny,
        getDocByIdOrLegacy
    }, orderId, settlementOrder, runtimeConfig).catch((err) => {
        console.error('[PaymentCallback] 升级存钱罐计算失败:', err.message);
        return { error: err.message };
    });
    const dividendPool = await accrueDividendPoolContribution(orderId, {
        ...latest,
        stock_deducted_at: true,
        points_awarded_at: true,
        commissions_created_at: true
    });

    await db.collection('orders').doc(orderId).update({
        data: { payment_post_processed_at: db.serverDate(), updated_at: db.serverDate() },
    });
    return { group, slash, stock, points, roles, peerBonus, commissions, piggyBank, dividendPool };
}

function deriveRefundRevertStatus(order = {}) {
    return order.prev_status
        || (order.confirmed_at || order.auto_confirmed_at ? 'completed'
            : (order.shipped_at ? 'shipped'
                : (order.paid_at ? 'paid' : 'pending_payment')));
}

function resolveGrowthClawbackBasis(order = {}) {
    if (order.growth_earned !== undefined && order.growth_earned !== null && order.growth_earned !== '') {
        return {
            amount: Math.max(0, Math.floor(toNumber(order.growth_earned, 0))),
            basis: 'order_growth_earned'
        };
    }
    return {
        amount: Math.max(0, Math.floor(getOrderTotalAmount(order))),
        basis: 'legacy_pay_amount'
    };
}

function resolveRewardPointsClawbackBasis(order = {}) {
    const totalEarned = Math.max(0, Math.floor(toNumber(order.points_earned, 0)));
    const status = pickString(order.points_award_status).toLowerCase();
    const hasReleaseSnapshot = hasValue(order.reward_points_released_total)
        || ['frozen', 'released', 'partially_released', 'cancelled'].includes(status);
    if (!hasReleaseSnapshot) return totalEarned;
    return Math.max(0, Math.min(totalEarned, Math.floor(toNumber(order.reward_points_released_total, 0))));
}

function getRewardPointsReleaseAt() {
    const days = Math.max(
        0,
        Math.floor(toNumber(process.env.POINTS_REWARD_FREEZE_DAYS || process.env.REFUND_MAX_DAYS || process.env.COMMISSION_FREEZE_DAYS, 7))
    );
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
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
            growthClawbackBasis: pickString(refund.growth_clawback_basis, 'already_applied'),
            patch: {
                items: toArray(order.items),
                refunded_quantity_total: toNumber(order.refunded_quantity_total, 0),
                refunded_cash_total: roundMoney(toNumber(order.refunded_cash_total, 0)),
                last_refunded_at: order.last_refunded_at || db.serverDate(),
                partially_refunded_at: pickString(order.status) === 'refunded' ? _.remove() : (order.partially_refunded_at || db.serverDate()),
                status: pickString(order.status || deriveRefundRevertStatus(order)),
                refunded_at: order.refunded_at || (pickString(order.status) === 'refunded' ? db.serverDate() : _.remove()),
                auto_refund_error: _.remove(),
                auto_refund_failed_at: _.remove(),
                auto_refund_partial: _.remove(),
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
    const totalPointsEarned = resolveRewardPointsClawbackBasis(order);
    const growthBasis = resolveGrowthClawbackBasis(order);
    const totalGrowthEarned = growthBasis.amount;
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
        growthClawbackBasis: growthBasis.basis,
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
            auto_refund_error: _.remove(),
            auto_refund_failed_at: _.remove(),
            auto_refund_partial: _.remove(),
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

function isRefundCompletionConfirmed(refund = {}) {
    const status = pickString(refund.status).toLowerCase();
    const wxStatus = pickString(refund.wx_refund_status || refund.refund_status).toUpperCase();
    return refund.refund_completion_confirmed === true || status === 'completed' || wxStatus === 'SUCCESS';
}

async function cancelPendingCommissionsForRefund(orderId, reason) {
    try {
        await db.collection('commissions')
            .where({ order_id: orderId, status: _.in(['pending', 'frozen', 'pending_approval', 'approved']) })
            .update({
                data: {
                    status: 'cancelled',
                    cancel_reason: reason,
                    cancelled_reason: reason,
                    commission_cancel_scope: 'whole_order_on_any_refund',
                    commission_cancel_policy: 'partial_refund_policy_v1',
                    updated_at: db.serverDate()
                }
            });
    } catch (e) {
        console.error('[payment-callback] ⚠️ 取消退款待结算佣金失败', e.message);
        await db.collection('rollback_error_logs').add({ data: { module: 'payment-callback', operation: 'cancel_pending_commissions', error: e.message, order_id: orderId, created_at: db.serverDate() } }).catch(() => {});
    }
}

async function applySettledCommissionClawback(comm = {}) {
    const amount = roundMoney(toNumber(comm.amount, 0));
    const openid = pickString(comm.openid || comm.receiver_openid || comm.beneficiary_openid);
    if (!openid || amount <= 0) return null;

    const userRes = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const user = userRes.data && userRes.data[0];
    if (!user) return null;

    const currentBalance = roundMoney(toNumber(user.commission_balance ?? user.balance, 0));
    const currentDebt = roundMoney(toNumber(user.debt_amount, 0));
    const paidFromBalance = roundMoney(Math.min(currentBalance, amount));
    const debtAdded = roundMoney(amount - paidFromBalance);
    const nextBalance = roundMoney(currentBalance - paidFromBalance);
    const nextPatch = {
        commission_balance: nextBalance,
        balance: nextBalance,
        total_earned: roundMoney(Math.max(0, toNumber(user.total_earned, 0) - paidFromBalance)),
        debt_amount: roundMoney(currentDebt + debtAdded),
        updated_at: db.serverDate()
    };
    if (debtAdded > 0) {
        nextPatch.debt_reason = `退款追回佣金 ${pickString(comm.order_no || comm.order_id)}`;
    }

    await db.collection('users').where({ openid }).update({ data: nextPatch });
    return {
        debited: paidFromBalance,
        debt_added: debtAdded
    };
}

async function clawBackSettledCommissions(orderId) {
    const settledRes = await db.collection('commissions')
        .where({ order_id: orderId, status: 'settled' })
        .get()
        .catch(() => ({ data: [] }));
    for (const comm of (settledRes.data || [])) {
        const commAmount = toNumber(comm.amount, 0);
        if (commAmount <= 0 || comm.clawed_back_at) continue;
        const statusUpdate = await db.collection('commissions')
            .where({ _id: String(comm._id), status: 'settled' })
            .update({
                data: {
                    status: 'cancelled',
                    cancel_reason: '退款追回已结算佣金',
                    cancelled_reason: '退款追回已结算佣金',
                    commission_cancel_scope: 'whole_order_on_any_refund',
                    commission_cancel_policy: 'partial_refund_policy_v1',
                    clawed_back_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            }).catch((err) => {
                console.error('[payment-callback] ⚠️ 佣金取消状态更新失败', err.message);
                return { stats: { updated: 0 } };
        });
        if (!statusUpdate || !statusUpdate.stats || statusUpdate.stats.updated === 0) continue;
        try {
            const clawback = await applySettledCommissionClawback(comm);
            if (clawback && comm._id) {
                await db.collection('commissions').doc(String(comm._id)).update({
                    data: {
                        clawback_debited: clawback.debited,
                        clawback_debt_added: clawback.debt_added,
                        updated_at: db.serverDate()
                    }
                }).catch((err) => {
                    console.error('[payment-callback] ⚠️ 佣金追回金额标记失败:', err.message);
                });
            }
        } catch (err) {
            console.error('[payment-callback] ⚠️ 追回已结算佣金余额失败:', err.message);
            await db.collection('rollback_error_logs').add({ data: { module: 'payment-callback', operation: 'clawback_commission_balance', openid: comm.openid, commission_id: String(comm._id), amount: commAmount, error: err.message, created_at: db.serverDate() } }).catch(() => {});
        }
    }
}

async function restoreRefundOrderInventory(orderId, order = {}, refund = {}) {
    if (!order || !Array.isArray(order.items)) return;
    const isGroupExpiredRefund = pickString(refund.system_refund_scene) === 'group_expired';
    if (pickString(refund.type) !== 'return_refund' && !isGroupExpiredRefund) return;
    if (refund.stock_restored_at) return;
    const allocations = buildRefundItemAllocations(order, inferRefundQuantityEffective(order, refund), refund);
    for (const { item, qty } of allocations) {
        if (item.product_id) {
            try {
                await db.collection('products').doc(String(item.product_id)).update({
                    data: { stock: _.inc(qty), sales_count: _.inc(-qty), updated_at: db.serverDate() }
                });
            } catch (e) {
                console.error('[payment-callback] ⚠️ 商品库存回滚失败', e.message);
                await db.collection('rollback_error_logs').add({ data: { module: 'payment-callback', operation: 'product_stock_restore', error: e.message, order_id: orderId, product_id: String(item.product_id), created_at: db.serverDate() } }).catch(() => {});
            }
        }
        if (item.sku_id) {
            try {
                await db.collection('skus').doc(String(item.sku_id)).update({
                    data: { stock: _.inc(qty), updated_at: db.serverDate() }
                });
            } catch (e) {
                console.error('[payment-callback] ⚠️ SKU库存回滚失败', e.message);
                await db.collection('rollback_error_logs').add({ data: { module: 'payment-callback', operation: 'sku_stock_restore', error: e.message, order_id: orderId, sku_id: String(item.sku_id), created_at: db.serverDate() } }).catch(() => {});
            }
        }
    }
    if (refund && refund._id) {
        try {
            await db.collection('refunds').doc(String(refund._id)).update({
                data: { stock_restored_at: db.serverDate(), updated_at: db.serverDate() }
            });
        } catch (e) {
            console.error('[payment-callback] 退款库存回滚标记失败', e.message);
        }
    }
}

async function reverseBuyerAssetsForRefund(orderId, order = {}, refund = {}) {
    if (!order || !order.openid) return;
    if (refund.buyer_assets_reversed_at) return;
    if (!isRefundCompletionConfirmed(refund)) return;
    const settlement = buildOrderPatchAfterRefund(order, refund);
    const pointsDelta = settlement.rewardPointsClawback > 0 ? -settlement.rewardPointsClawback : 0;
    const growthDelta = settlement.growthClawback > 0 ? -settlement.growthClawback : 0;

    const userUpdates = { updated_at: db.serverDate() };
    if (settlement.refundAmount > 0) userUpdates.total_spent = _.inc(-settlement.refundAmount);
    if (settlement.isFullRefund) userUpdates.order_count = _.inc(-1);
    if (pointsDelta !== 0) userUpdates.points = _.inc(pointsDelta);
    if (growthDelta !== 0) userUpdates.growth_value = _.inc(growthDelta);

    const userUpdateRes = await db.collection('users')
        .where({ openid: order.openid })
        .update({ data: userUpdates });
    if (!userUpdateRes.stats || userUpdateRes.stats.updated === 0) {
        throw new Error(`退款买家资产回退失败：用户未更新(${order.openid})`);
    }

    if (refund && refund._id) {
        try {
            await db.collection('refunds').doc(String(refund._id)).update({
                data: {
                    reward_points_clawback_amount: settlement.rewardPointsClawback,
                    growth_clawback_amount: settlement.growthClawback,
                    growth_clawback_basis: settlement.growthClawbackBasis,
                    order_progress_applied_at: db.serverDate(),
                    buyer_assets_reversed_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            });
        } catch (e) {
            console.error('[payment-callback] ⚠️ 退款扣回信息更新失败', e.message);
            await db.collection('rollback_error_logs').add({ data: { module: 'payment-callback', operation: 'refund_clawback_update', error: e.message, refund_id: String(refund._id), created_at: db.serverDate() } }).catch(() => {});
        }
    }

    if (settlement.rewardPointsClawback > 0) {
        try {
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
            });
        } catch (e) {
            console.error('[payment-callback] ⚠️ 奖励积分扣回日志写入失败', e.message);
            await db.collection('rollback_error_logs').add({ data: { module: 'payment-callback', operation: 'reward_points_clawback_log', error: e.message, order_id: orderId, created_at: db.serverDate() } }).catch(() => {});
        }
    }
    if (settlement.growthClawback > 0) {
        try {
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
            });
        } catch (e) {
            console.error('[payment-callback] ⚠️ 成长值扣回日志写入失败', e.message);
            await db.collection('rollback_error_logs').add({ data: { module: 'payment-callback', operation: 'growth_clawback_log', error: e.message, order_id: orderId, created_at: db.serverDate() } }).catch(() => {});
        }
    }
}

function normalizeDocData(data) {
    if (Array.isArray(data)) return data[0] || null;
    return data || null;
}

async function getRechargeOrderByNo(orderNo) {
    const res = await db.collection('wallet_recharge_orders')
        .where({ order_no: orderNo })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function creditRechargeUserBalanceOnce(recharge, amount) {
    if (recharge.balance_credited_at) return false;
    if (typeof db.runTransaction !== 'function') {
        throw new Error('充值到账失败：当前数据库不支持事务');
    }

    return await db.runTransaction(async (tx) => {
        const latestSnap = await tx.collection('wallet_recharge_orders')
            .doc(String(recharge._id))
            .get()
            .catch(() => ({ data: null }));
        const latest = normalizeDocData(latestSnap.data);
        if (!latest) throw new Error('充值到账失败：充值单不存在');
        if (latest.status === 'paid' || latest.balance_credited_at) return false;
        if (latest.status !== 'crediting') throw new Error(`充值到账失败：充值单状态异常(${latest.status || 'unknown'})`);

        const creditRes = await tx.collection('users')
            .where({ openid: latest.openid || recharge.openid })
            .update({
                data: {
                    agent_wallet_balance: _.inc(amount),
                    wallet_balance: _.inc(amount),
                    goods_fund_total_recharged: _.inc(amount),
                    updated_at: db.serverDate(),
                },
            });
        if (!creditRes.stats || creditRes.stats.updated === 0) {
            throw new Error('充值到账失败：用户不存在或余额未更新');
        }

        await tx.collection('wallet_recharge_orders')
            .doc(String(recharge._id))
            .update({
                data: {
                    balance_credited_at: db.serverDate(),
                    updated_at: db.serverDate(),
                },
            });
        return true;
    });
}

async function hasWalletLedgerLog(refId, refType) {
    const res = await db.collection('wallet_logs')
        .where({ ref_id: refId, ref_type: refType })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return !!(res.data && res.data[0]);
}

async function syncRechargeLedgerOnce(recharge, amount, orderNo) {
    if (recharge.ledger_synced_at) return false;
    const refType = 'wx_recharge';
    const alreadyLogged = await hasWalletLedgerLog(orderNo, refType);
    if (!alreadyLogged) {
        await increaseGoodsFundLedger(recharge.openid, amount, orderNo, '货款余额充值', refType);
    }
    await db.collection('wallet_recharge_orders').doc(String(recharge._id)).update({
        data: {
            ledger_synced_at: db.serverDate(),
            updated_at: db.serverDate(),
        },
    });
    return !alreadyLogged;
}

async function hasGoodsFundRechargeLog(orderNo) {
    const res = await db.collection('goods_fund_logs')
        .where({ order_no: orderNo, type: 'recharge' })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return !!(res.data && res.data[0]);
}

async function writeRechargeGoodsFundLogOnce(recharge, amount, orderNo) {
    if (recharge.goods_fund_log_written_at) return false;
    const alreadyLogged = await hasGoodsFundRechargeLog(orderNo);
    if (!alreadyLogged) {
        await db.collection('goods_fund_logs').add({
            data: {
                openid: recharge.openid,
                type: 'recharge',
                amount,
                recharge_order_id: recharge._id,
                order_no: orderNo,
                remark: '货款余额充值',
                created_at: db.serverDate(),
            },
        });
    }
    await db.collection('wallet_recharge_orders').doc(String(recharge._id)).update({
        data: {
            goods_fund_log_written_at: db.serverDate(),
            updated_at: db.serverDate(),
        },
    });
    return !alreadyLogged;
}

/**
 * 处理货款充值回调（order_no 以 RCH 开头，来自 wallet_recharge_orders）
 */
async function handleRechargeCallback(outTradeNo, transaction) {
    console.log(`[RechargeCallback] 处理充值回调: ${outTradeNo}`);

    let recharge = await getRechargeOrderByNo(outTradeNo);
    if (!recharge) {
        console.warn(`[RechargeCallback] 充值订单不存在: ${outTradeNo}`);
        return { code: 'SUCCESS', message: 'Recharge order not found' };
    }

    // 幂等
    if (recharge.status === 'paid') {
        return { code: 'SUCCESS', message: 'Already processed' };
    }

    const amount = toNumber(recharge.amount, 0);
    if (amount <= 0) throw new Error(`充值金额异常: ${amount}`);

    if (recharge.status === 'pending') {
        const lockRes = await db.collection('wallet_recharge_orders')
            .where({ _id: recharge._id, status: 'pending' })
            .update({
                data: {
                    status: 'crediting',
                    paid_at: db.serverDate(),
                    trade_id: transaction.transaction_id || '',
                    updated_at: db.serverDate(),
                },
            }).catch(() => ({ stats: { updated: 0 } }));

        if (!lockRes.stats || lockRes.stats.updated === 0) {
            recharge = await getRechargeOrderByNo(outTradeNo);
            if (recharge && recharge.status === 'paid') {
                return { code: 'SUCCESS', message: 'Already processed' };
            }
            if (!recharge || recharge.status !== 'crediting') {
                throw new Error(`充值单状态锁定失败: ${outTradeNo}`);
            }
        } else {
            recharge = await getRechargeOrderByNo(outTradeNo);
        }
    }

    if (!recharge) {
        throw new Error(`充值单重读失败: ${outTradeNo}`);
    }
    if (recharge.status !== 'crediting') {
        return { code: 'SUCCESS', message: 'Recharge order not payable state' };
    }

    await creditRechargeUserBalanceOnce(recharge, amount);
    recharge = await getRechargeOrderByNo(outTradeNo);
    await syncRechargeLedgerOnce(recharge, amount, outTradeNo);
    recharge = await getRechargeOrderByNo(outTradeNo);
    await writeRechargeGoodsFundLogOnce(recharge, amount, outTradeNo);

    const paidRes = await db.collection('wallet_recharge_orders')
        .where({ _id: recharge._id, status: 'crediting' })
        .update({
            data: {
                status: 'paid',
                paid_at: recharge.paid_at || db.serverDate(),
                trade_id: transaction.transaction_id || recharge.trade_id || '',
                updated_at: db.serverDate(),
            },
        });
    if (!paidRes.stats || paidRes.stats.updated === 0) {
        const latest = await getRechargeOrderByNo(outTradeNo);
        if (!latest || latest.status !== 'paid') {
            throw new Error(`充值单完成标记失败: ${outTradeNo}`);
        }
    }

    console.log(`[RechargeCallback] 充值成功: ${outTradeNo}, 金额: ${amount}, openid: ${recharge.openid}`);
    return { code: 'SUCCESS', message: 'Recharge processed' };
}

/**
 * 处理退款回调通知
 * 微信退款回调格式（V3）解密后的数据结构：
 * { out_trade_no, out_refund_no, refund_id, refund_status: 'SUCCESS'|'ABNORMAL'|'CLOSED', success_time, ... }
 */
async function handleRefundCallback(refundData, eventType) {
    const depositResult = await handleDepositRefundCallback(refundData, eventType).catch((error) => {
        console.error('[DepositRefundCallback] 处理失败:', error.message);
        throw error;
    });
    if (depositResult && depositResult.handled) {
        return { code: depositResult.code, message: depositResult.message };
    }

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
        // 使用 where 条件确保只从非终态转换，防止并发回调双倍处理
        const processingUpdate = await db.collection('refunds')
            .where({ _id: refund._id, status: _.in(['pending', 'approved', 'processing']) })
            .update({
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
        if (!processingUpdate || !processingUpdate.stats || processingUpdate.stats.updated === 0) {
            console.warn('[RefundCallback] 退款不在可处理状态，跳过 refundId=%s', refund._id);
            return { code: 'SUCCESS', message: 'Refund not in processable state' };
        }

        try {
                if (canonicalOrderId) {
                    if (!order?.refund_commissions_resolved_at) {
                        await cancelPendingCommissionsForRefund(canonicalOrderId, '退款完成，佣金作废');
                        await clawBackSettledCommissions(canonicalOrderId);
                        await reverseUpgradePiggyBankForRefund({
                            db,
                            command: _
                        }, canonicalOrderId);
                        try {
                            await db.collection('orders').doc(canonicalOrderId).update({
                            data: { refund_commissions_resolved_at: db.serverDate(), updated_at: db.serverDate() }
                        });
                        } catch (e) {
                            console.error('[payment-callback] 退款佣金处理标记失败', e.message);
                        }
                    }

                    if (order) {
                        const completionRefund = {
                            ...refund,
                            refund_completion_confirmed: true,
                            wx_refund_status: refundStatus
                        };
                        const settlement = buildOrderPatchAfterRefund(order, completionRefund);
                        await restoreRefundOrderInventory(canonicalOrderId, order, completionRefund);
                        await reverseBuyerAssetsForRefund(canonicalOrderId, order, completionRefund);
                        try {
                            await db.collection('orders').doc(canonicalOrderId).update({ data: settlement.patch });
                        } catch (e) {
                            console.error('[payment-callback] ⚠️ 退款结算补丁更新失败', e.message);
                            await db.collection('rollback_error_logs').add({ data: { module: 'payment-callback', operation: 'refund_settlement_patch', error: e.message, order_id: canonicalOrderId, created_at: db.serverDate() } }).catch(() => {});
                        }
                    }
                }

            await db.collection('refunds').where({ _id: refund._id, status: 'processing' }).update({
                data: {
                    status: 'completed',
                    completed_at: db.serverDate(),
                    callback_error: _.remove(),
                    callback_retry_needed_at: _.remove(),
                    updated_at: db.serverDate()
                }
            });
        } catch (settleErr) {
            try {
                await db.collection('refunds').doc(refund._id).update({
                    data: {
                        status: 'processing',
                        callback_error: settleErr.message,
                        callback_retry_needed_at: db.serverDate(),
                        updated_at: db.serverDate()
                    }
                });
            } catch (e) {
                console.error('[payment-callback] ⚠️ 退款结算错误状态更新失败', e.message);
                await db.collection('rollback_error_logs').add({ data: { module: 'payment-callback', operation: 'refund_settle_error_status', error: e.message, refund_id: String(refund._id), created_at: db.serverDate() } }).catch(() => {});
            }
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

        const shouldKeepRefunding = refund.skip_order_revert_on_fail === true
            || pickString(refund.system_refund_scene) === 'group_expired';
        if (canonicalOrderId && order && order.status === 'refunding' && !shouldKeepRefunding) {
            const revertStatus = deriveRefundRevertStatus(order);
try {
                await db.collection('orders').doc(canonicalOrderId).update({
                    data: { status: revertStatus, prev_status: _.remove(), updated_at: db.serverDate() }
                });
            } catch (e) {
                console.error('[payment-callback] ⚠️ 退款失败订单状态回退失败', e.message);
            }
        } else if (canonicalOrderId && order && shouldKeepRefunding) {
            try {
                await db.collection('orders').doc(canonicalOrderId).update({
                    data: {
                        auto_refund_error: `微信退款失败: ${refundStatus}`,
                        auto_refund_failed_at: db.serverDate(),
                        updated_at: db.serverDate()
                    }
                });
            } catch (e) {
                console.error('[payment-callback] ⚠️ 退款失败状态标记失败', e.message);
            }
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
        const wxTimestamp = pickHeader(headers, 'wechatpay-timestamp');
        const wxNonce = pickHeader(headers, 'wechatpay-nonce');
        const wxSignature = pickHeader(headers, 'wechatpay-signature');
        const wxSerial = pickHeader(headers, 'wechatpay-serial');

        if (!wxTimestamp || !wxNonce || !wxSignature || !wxSerial) {
            console.error('[PaymentCallback] 签名头信息不完整，拒绝处理');
            return { code: 'FAIL', message: 'Incomplete signature headers' };
        }
        if (!isWechatpayTimestampFresh(wxTimestamp)) {
            console.error('[PaymentCallback] 签名时间戳非法或过期，拒绝处理');
            return { code: 'FAIL', message: 'Invalid signature timestamp' };
        }
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
        if (!callbackData.resource || !callbackData.resource.ciphertext) {
            console.error('[PaymentCallback] 回调缺少加密 resource，拒绝处理');
            return { code: 'FAIL', message: 'Missing encrypted resource' };
        }
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

        const eventType = callbackData.event_type || '';
        console.log(`[PaymentCallback] event_type=${eventType}`);

        if (eventType.startsWith('MCHTRANSFER.')) {
            return handleTransferCallbackNotification({
                ...callbackData,
                decrypted: transaction
            });
        }

        // 5. 退款回调处理（REFUND.SUCCESS / REFUND.ABNORMAL / REFUND.CLOSED）
        if (eventType.startsWith('REFUND.')) {
            return handleRefundCallback(transaction, eventType);
        }

        const outTradeNo = transaction.out_trade_no;
        const tradeState = transaction.trade_state;

        console.log(`[PaymentCallback] out_trade_no=${outTradeNo}, trade_state=${tradeState}`);

        // 5. 处理支付成功
        if (tradeState === 'SUCCESS' && outTradeNo) {
            const depositResult = await handleDepositPaidCallback(transaction).catch((error) => {
                console.error('[DepositPaymentCallback] 处理失败:', error.message);
                throw error;
            });
            if (depositResult && depositResult.handled) {
                return { code: depositResult.code, message: depositResult.message };
            }

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
                        try {
                            await db.collection('user_coupons')
                                .where({ openid: order.openid, coupon_id: order.coupon_id, status: 'unused' })
                                .update({ data: { status: 'used', used_at: db.serverDate() } });
                        } catch (e) {
                            console.error('[payment-callback] 优惠券标记已用失败', e.message);
                        }
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
            try {
                await db.collection('orders').where({ order_no: outTradeNo }).update({
                    data: { status: 'closed', updated_at: db.serverDate() },
                });
            } catch (e) {
                console.error('[payment-callback] ⚠️ 订单关闭状态更新失败', e.message);
            }
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
    shouldRunPaidOrderPostProcess,
    _test: {
        calculateOrderPayPoints,
        resolvePointBenefitRoleLevel,
        isFlexBundleOrder,
        isRewardPointsRestrictedOrder,
        ensurePointsAwarded,
        ensureCommissionsCreated,
        ensurePeerBonusCreated,
        clawBackSettledCommissions,
        buildOrderPatchAfterRefund,
        getPaidPostProcessSkipReason,
        shouldRunPaidOrderPostProcess,
        deriveEligibleRoleLevel,
        getOrderNetGrowthForUpgrade,
        getStableUpgradeGrowth
    }
};
