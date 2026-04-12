'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { verifySignature, decryptResource, loadPublicKey } = require('./wechat-pay-v3');

const DEFAULT_ROLE_NAMES = {
    0: '普通用户',
    1: '初级代理',
    2: '高级代理',
    3: '推广合伙人',
    4: '运营合伙人',
    5: '区域合伙人'
};

const DEFAULT_AGENT_UPGRADE_RULES = {
    enabled: true,
    // C1 晋升：购买满299（文档要求为"爆单产品"，系统暂以总消费额近似）
    c1_min_purchase: 299,
    // C2 晋升：直推 2 名 C1 + 销售额超580（文档要求需有"实物产品消耗"）
    c2_referee_count: 2,
    c2_min_sales: 580,
    // B1 晋升：推荐10名C2 或 充值3000（代理加盟费）
    b1_referee_count: 10,
    b1_recharge: 3000,
    // B2 晋升：推荐10名B1 或 充值30000
    b2_referee_count: 10,
    b2_recharge: 30000,
    // B3 晋升：充值198000（19.8万）
    b3_recharge: 198000
};

const DEFAULT_AGENT_COMMISSION_CONFIG = {
    // 直推佣金率（一级，直接上级按自身等级计算）
    // C1=20%, C2=30%, B1/B2/B3=40%
    direct_pct_by_role: { 1: 20, 2: 30, 3: 40, 4: 40, 5: 40 },
    // 动销奖励（二级，间接上级）：B2=10%，B3=10%
    // 依据业务文档：B2协助B1每单40元(≈10%)，B3协助B1每单60元(≈15%)
    // 当前取折中值10%，后续可在后台configs.agent_system_commission-config中精确配置
    indirect_pct_by_role: { 2: 0, 3: 0, 4: 10, 5: 10 }
};

const DEFAULT_PEER_BONUS_CONFIG = {
    enabled: true,
    // 文档未定义 C1/C2 平级奖，保留为 0
    level_1: 0,
    level_2: 0,
    // B1 平级奖：100元现金（另有2套产品机会，约赚160元，通过正常产品佣金流水体现）
    level_3: 100,
    // B2 平级奖：2000元现金（另有15套产品机会，约赚2400元，通过正常产品佣金流水体现）
    level_4: 2000,
    // B3 文档未定义平级奖，暂设 0
    level_5: 0,
    // 配套赠送产品套数（记录性质，不直接发货，需运营手动处理）
    product_sets_3: 2,
    product_sets_4: 15,
    product_sets_5: 0
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

async function loadAgentRuntimeConfig() {
    const [upgradeRow, commissionRow, memberLevelRow, peerBonusRow] = await Promise.all([
        getConfigByKeys(['agent_system_upgrade-rules', 'agent_system_upgrade_rules']),
        getConfigByKeys(['agent_system_commission-config', 'agent_system_commission_config']),
        getConfigByKeys(['member_level_config']),
        getConfigByKeys(['agent_system_peer-bonus', 'agent_system_peer_bonus'])
    ]);
    const upgradeRules = { ...DEFAULT_AGENT_UPGRADE_RULES, ...parseConfigValue(upgradeRow, {}) };
    const commission = parseConfigValue(commissionRow, {});
    const memberLevels = Array.isArray(parseConfigValue(memberLevelRow, [])) ? parseConfigValue(memberLevelRow, []) : [];
    const peerBonus = { ...DEFAULT_PEER_BONUS_CONFIG, ...parseConfigValue(peerBonusRow, {}) };
    return {
        upgradeRules,
        commissionConfig: {
            direct_pct_by_role: normalizePctMap(commission?.direct_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.direct_pct_by_role),
            indirect_pct_by_role: normalizePctMap(commission?.indirect_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.indirect_pct_by_role)
        },
        memberLevels,
        peerBonus
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

function deriveEligibleRoleLevel(user = {}, directMembers = [], rechargeTotal = 0, upgradeRules = DEFAULT_AGENT_UPGRADE_RULES) {
    const currentRoleLevel = toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
    let nextRoleLevel = currentRoleLevel;
    const totalSpent = roundMoney(user.total_spent != null ? user.total_spent : user.growth_value);

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

    const c2OrAboveCount = directMembers.filter((member) => toNumber(member.role_level ?? member.distributor_level, 0) >= 2).length;
    if (
        c2OrAboveCount >= toNumber(upgradeRules.b1_referee_count, DEFAULT_AGENT_UPGRADE_RULES.b1_referee_count)
        || rechargeTotal >= toNumber(upgradeRules.b1_recharge, DEFAULT_AGENT_UPGRADE_RULES.b1_recharge)
    ) {
        nextRoleLevel = Math.max(nextRoleLevel, 3);
    }

    const b1OrAboveCount = directMembers.filter((member) => toNumber(member.role_level ?? member.distributor_level, 0) >= 3).length;
    if (
        b1OrAboveCount >= toNumber(upgradeRules.b2_referee_count, DEFAULT_AGENT_UPGRADE_RULES.b2_referee_count)
        || rechargeTotal >= toNumber(upgradeRules.b2_recharge, DEFAULT_AGENT_UPGRADE_RULES.b2_recharge)
    ) {
        nextRoleLevel = Math.max(nextRoleLevel, 4);
    }

    if (rechargeTotal >= toNumber(upgradeRules.b3_recharge, DEFAULT_AGENT_UPGRADE_RULES.b3_recharge)) {
        nextRoleLevel = Math.max(nextRoleLevel, 5);
    }

    return nextRoleLevel;
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

function getOrderPayFen(order = {}) {
    return amountFen(order.pay_amount ?? order.actual_price ?? order.total_amount);
}

function getOrderTotalAmount(order = {}) {
    return roundMoney(order.pay_amount ?? order.actual_price ?? order.total_amount);
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
    const explicit = firstNumber([
        item.locked_agent_cost,
        order.locked_agent_cost,
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
    const directRates = normalizePctMap(commissionConfig.direct_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.direct_pct_by_role);
    const indirectRates = normalizePctMap(commissionConfig.indirect_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.indirect_pct_by_role);
    const rates = level === 1 ? directRates : indirectRates;
    return roundMoney(baseAmount * (rates[role] || 0));
}

async function ensureAgentRoleSynced(orderId, order) {
    if (!order.openid) return { skipped: true };
    const user = await findUserByAny(order.openid);
    if (!user) return { skipped: true };

    const { upgradeRules, memberLevels } = await loadAgentRuntimeConfig();
    if (upgradeRules.enabled === false) return { skipped: true };

    const [directMembers, rechargeTotal] = await Promise.all([
        getDirectMembers(user),
        getRechargeTotal(order.openid)
    ]);

    const currentRoleLevel = toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
    const nextRoleLevel = deriveEligibleRoleLevel(user, directMembers, rechargeTotal, upgradeRules);
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
    return { upgraded: true, previousRoleLevel: currentRoleLevel, nextRoleLevel, roleName: roleMeta.roleName };
}

async function ensurePeerBonusCreated(orderId, order, roleSyncResult) {
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

    const amount = roundMoney(peerBonus[`level_${bonusLevel}`] || 0);
    if (amount <= 0) return { skipped: true, reason: 'no_bonus_amount' };

    const existing = await db.collection('commissions')
        .where({
            order_id: orderId,
            openid: parent.openid,
            type: 'same_level',
            bonus_role_level: bonusLevel
        })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (existing.data && existing.data.length > 0) {
        return { skipped: true, reason: 'already_created' };
    }

    const productSets = toNumber(peerBonus[`product_sets_${bonusLevel}`], 0);
    await db.collection('commissions').add({
        data: {
            openid: parent.openid,
            user_id: parent.id || parent._legacy_id || parent._id || parent.openid,
            from_openid: buyer.openid,
            order_id: orderId,
            order_no: order.order_no,
            amount,
            level: bonusLevel,
            type: 'same_level',
            status: 'pending_approval',
            bonus_role_level: bonusLevel,
            product_sets: productSets,
            description: `平级奖：下级升级为 ${roleSyncResult.roleName}`,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });
    return { created: true, amount, bonusLevel, productSets };
}

async function ensurePointsAwarded(orderId, order) {
    if (order.points_awarded_at) return { skipped: true };
    const payAmount = getOrderTotalAmount(order);
    const pointsEarned = Math.floor(payAmount);
    if (pointsEarned <= 0 || !order.openid) {
        await db.collection('orders').doc(orderId).update({
            data: { points_awarded_at: db.serverDate(), updated_at: db.serverDate() },
        });
        return { awarded: 0 };
    }

    await db.collection('users').where({ openid: order.openid }).update({
        data: {
            points: _.inc(pointsEarned),
            growth_value: _.inc(pointsEarned),
            total_spent: _.inc(payAmount),
            order_count: _.inc(1),
            updated_at: db.serverDate(),
        },
    });

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
                description: `订单支付获得${pointsEarned}积分`,
                created_at: db.serverDate(),
            },
        });
    }

    await db.collection('orders').doc(orderId).update({
        data: { points_awarded_at: db.serverDate(), updated_at: db.serverDate() },
    });
    return { awarded: pointsEarned };
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
    if (order.commissions_created_at) return { skipped: true };
    const buyer = await findUserByAny(order.openid || order.buyer_id || order.user_id);
    if (!buyer) {
        await db.collection('orders').doc(orderId).update({
            data: { commissions_created_at: db.serverDate(), updated_at: db.serverDate() },
        });
        return { created: 0 };
    }

    const parent = await findUserByAny(getUserReferrer(buyer));
    const grandparent = parent ? await findUserByAny(getUserReferrer(parent)) : null;
    const beneficiaries = [
        { level: 1, type: 'direct', user: parent },
        { level: 2, type: 'indirect', user: grandparent }
    ].filter((item) => item.user && item.user.openid && item.user.openid !== order.openid);

    if (!beneficiaries.length) {
        await db.collection('orders').doc(orderId).update({
            data: { commissions_created_at: db.serverDate(), updated_at: db.serverDate() },
        });
        return { created: 0 };
    }

    const { commissionConfig } = await loadAgentRuntimeConfig();
    const totals = new Map();
    const items = toArray(order.items);
    const orderPayAmount = getOrderTotalAmount(order);
    const itemBaseTotal = items.reduce((sum, item) => {
        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        return sum + roundMoney(item.subtotal ?? item.item_amount ?? (toNumber(item.price || item.unit_price, 0) * qty));
    }, 0) || orderPayAmount;

    for (const item of items) {
        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        const product = await getDocByIdOrLegacy('products', item.product_id) || {};
        const sku = item.sku_id ? await getDocByIdOrLegacy('skus', item.sku_id) || {} : {};
        const rawBase = roundMoney(item.subtotal ?? item.item_amount ?? (toNumber(item.price || item.unit_price, 0) * qty));
        const allocatedBase = itemBaseTotal > 0 ? roundMoney(orderPayAmount * rawBase / itemBaseTotal) : rawBase;
        const cost = roundMoney(resolveUnitCost(product, sku, item, order) * qty);
        let remainingProfit = Math.max(0, roundMoney(allocatedBase - cost));

        for (const beneficiary of beneficiaries) {
            if (remainingProfit <= 0) break;
            const configured = commissionConfigForLevel(product, beneficiary.level, allocatedBase);
            const roleBased = roleBasedCommission(beneficiary.user, beneficiary.level, allocatedBase, commissionConfig);
            const amount = Math.min(remainingProfit, configured > 0 ? configured : roleBased);
            if (amount <= 0) continue;
            const key = `${beneficiary.user.openid}:${beneficiary.level}:${beneficiary.type}`;
            totals.set(key, {
                openid: beneficiary.user.openid,
                user_id: beneficiary.user.id || beneficiary.user._legacy_id || beneficiary.user._id || beneficiary.user.openid,
                amount: roundMoney((totals.get(key)?.amount || 0) + amount),
                level: beneficiary.level,
                type: beneficiary.type
            });
            remainingProfit = roundMoney(remainingProfit - amount);
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
    return { created };
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

async function ensurePaidGroupJoined(orderId, order) {
    if (!isGroupOrder(order)) return { skipped: true };
    if (order.group_joined_at) return { skipped: true };

    const activity = await getDocByIdOrLegacy('group_activities', order.group_activity_id || order.legacy_group_activity_id || order.activity_id);
    if (!activity) throw new Error('拼团活动不存在');
    if (!isActivityOpen(activity)) throw new Error('拼团活动已结束');

    const groupSize = Math.max(2, toNumber(activity.group_size || activity.min_members || order.group_size, 2));
    let groupNo = order.group_no || '';
    let groupOrder = await findGroupOrder(groupNo);

    if (groupOrder && !['pending', 'open'].includes(groupOrder.status)) {
        throw new Error('拼团已结束');
    }

    const member = {
        openid: order.openid,
        order_id: orderId,
        order_no: order.order_no,
        paid_at: db.serverDate(),
        joined_at: db.serverDate(),
    };

    if (!groupOrder) {
        groupNo = groupNo || ('GRP' + Date.now() + Math.floor(Math.random() * 1000));
        const data = {
            group_no: groupNo,
            activity_id: activity._id,
            legacy_activity_id: activity.id || activity._legacy_id || order.legacy_group_activity_id || '',
            leader_openid: order.openid,
            status: groupSize <= 1 ? 'completed' : 'pending',
            members: [member],
            group_size: groupSize,
            created_order_id: orderId,
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
        };
        const createRes = await db.collection('group_orders').add({ data });
        await db.collection('orders').doc(orderId).update({
            data: { group_no: groupNo, group_joined_at: db.serverDate(), updated_at: db.serverDate() },
        });
        return { created: true, group_id: createRes._id, group_no: groupNo, member_count: 1, completed: data.status === 'completed' };
    }

    const members = Array.isArray(groupOrder.members) ? groupOrder.members : [];
    const exists = members.some((item) => item.openid === order.openid || item.order_id === orderId);
    if (!exists) {
        if (members.length >= groupSize) throw new Error('该团已满员');
        await db.collection('group_orders').doc(groupOrder._id).update({
            data: {
                members: _.push(member),
                updated_at: db.serverDate(),
            },
        });
    }

    const memberCount = exists ? members.length : members.length + 1;
    const completed = memberCount >= groupSize;
    if (completed && groupOrder.status !== 'completed') {
        await db.collection('group_orders').doc(groupOrder._id).update({
            data: { status: 'completed', completed_at: db.serverDate(), updated_at: db.serverDate() },
        });
    }

    await db.collection('orders').doc(orderId).update({
        data: { group_no: groupOrder.group_no, group_joined_at: db.serverDate(), updated_at: db.serverDate() },
    });
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

        // 读取基金池配置
        const configRes = await db.collection('configs')
            .where({ key: 'agent_system_fund-pool' })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        const config = (configRes.data && configRes.data[0]) || {};
        const contributions = config.contribution_by_level || DEFAULT_CONTRIBUTIONS;
        const amount = toNumber(contributions[roleLevel] || DEFAULT_CONTRIBUTIONS[roleLevel], 0);
        if (amount <= 0) return { skipped: true, reason: 'amount_zero' };

        // 写入流水日志
        await db.collection('fund_pool_logs').add({
            data: {
                openid,
                role_level: roleLevel,
                amount,
                source: source || 'upgrade_payment',
                order_id: orderId || '',
                created_at: db.serverDate(),
            },
        }).catch((err) => {
            console.error('[FundPool] 写入fund_pool_logs失败:', err.message);
        });

        // 原子更新基金池余额（存于 configs 文档中的 balance 字段）
        if (config._id) {
            await db.collection('configs').doc(String(config._id)).update({
                data: {
                    balance: _.inc(amount),
                    total_in: _.inc(amount),
                    updated_at: db.serverDate(),
                },
            }).catch((err) => {
                console.error('[FundPool] 更新基金池余额失败:', err.message);
            });
        }

        console.log(`[FundPool] 入池成功: openid=${openid}, role_level=${roleLevel}, amount=${amount}, source=${source}`);
        return { success: true, amount, roleLevel };
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

    const group = needsGroupJoin ? await ensurePaidGroupJoined(orderId, latest) : { skipped: true };
    const slash = needsSlashPurchase ? await ensureSlashOrderPurchased(orderId, latest) : { skipped: true };
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

/**
 * 退还已使用的优惠券（退款时调用）
 */
async function restoreCoupon(order) {
    if (!order || !order.openid) return false;

    if (order.user_coupon_id) {
        const restored = await db.collection('user_coupons')
            .doc(String(order.user_coupon_id))
            .update({ data: { status: 'unused', used_at: db.command.remove() } })
            .then(() => true)
            .catch(() => false);
        if (restored) return true;
    }

    if (!order.coupon_id) return false;

    const couponIdStr = String(order.coupon_id);
    const couponIdNum = Number(order.coupon_id);
    const candidates = Number.isFinite(couponIdNum)
        ? [couponIdStr, couponIdNum]
        : [couponIdStr];

    const results = await Promise.all(
        candidates.map((cid) =>
            db.collection('user_coupons')
                .where({ openid: order.openid, coupon_id: cid, status: 'used' })
                .update({ data: { status: 'unused', used_at: db.command.remove() } })
                .then((r) => r && r.stats && r.stats.updated > 0)
                .catch(() => false)
        )
    );
    return results.some(Boolean);
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
    const outTradeNo = refundData.out_trade_no;
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

    const orderId = refund.order_id;

    if (refundStatus === 'SUCCESS') {
        // 退款成功：更新退款记录和订单状态
        await db.collection('refunds').doc(refund._id).update({
            data: {
                status: 'completed',
                completed_at: db.serverDate(),
                wx_refund_id: wxRefundId || refund.wx_refund_id || '',
                wx_refund_status: refundStatus,
                wx_success_time: refundData.success_time || '',
                updated_at: db.serverDate()
            }
        });

        if (orderId) {
            // 取消未结算佣金
            await db.collection('commissions')
                .where({ order_id: orderId, status: _.in(['pending', 'frozen', 'pending_approval', 'approved']) })
                .update({ data: { status: 'cancelled', cancelled_reason: '退款完成，佣金作废', updated_at: db.serverDate() } })
                .catch(() => {});

            // 追回已结算佣金（settled 状态已入账到用户余额，需原子扣回）
            const settledRes = await db.collection('commissions')
                .where({ order_id: orderId, status: 'settled' })
                .get()
                .catch(() => ({ data: [] }));
            for (const comm of (settledRes.data || [])) {
                const commAmount = toNumber(comm.amount, 0);
                if (commAmount <= 0 || comm.clawed_back_at) continue;
                // 原子扣回佣金余额（余额不足则允许出现负值/欠款）
                await db.collection('users').where({ openid: comm.openid }).update({
                    data: {
                        commission_balance: _.inc(-commAmount),
                        balance: _.inc(-commAmount),
                        updated_at: db.serverDate()
                    }
                }).catch((err) => {
                    console.error('[RefundCallback] 追回已结算佣金余额失败:', err.message);
                });
                // 标记已追回
                await db.collection('commissions').doc(String(comm._id)).update({
                    data: {
                        status: 'cancelled',
                        cancelled_reason: '退款追回已结算佣金',
                        clawed_back_at: db.serverDate(),
                        updated_at: db.serverDate()
                    }
                }).catch(() => {});
            }

            // 回滚库存 + 退积分 + 退优惠券
            const orderRes = await db.collection('orders').doc(String(orderId)).get().catch(() => ({ data: null }));
            const order = orderRes.data;
            if (order && Array.isArray(order.items)) {
                for (const item of order.items) {
                    const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
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
            }

            if (order) {
                // 退积分
                const pointsUsed = toNumber(order.points_used, 0);
                if (pointsUsed > 0) {
                    await db.collection('users')
                        .where({ openid: order.openid })
                        .update({
                            data: {
                                points: _.inc(pointsUsed),
                                growth_value: _.inc(pointsUsed),
                                updated_at: db.serverDate(),
                            },
                        }).catch((err) => {
                            console.error('[RefundCallback] 退积分失败:', err.message);
                        });
                }

                // 退优惠券
                if (order.user_coupon_id || order.coupon_id) {
                    const couponRestored = await restoreCoupon(order).catch(() => false);
                    if (!couponRestored) {
                        console.warn('[RefundCallback] 优惠券退还失败或无需退还, order_id:', orderId);
                    }
                }
            }

            await db.collection('orders').doc(String(orderId)).update({
                data: { status: 'refunded', refunded_at: db.serverDate(), updated_at: db.serverDate() }
            }).catch(() => {});
        }

        console.log(`[RefundCallback] 退款成功处理完毕: ${outRefundNo}`);
    } else if (['ABNORMAL', 'CLOSED'].includes(refundStatus)) {
        // 退款失败/关闭：将订单恢复到之前状态
        await db.collection('refunds').doc(refund._id).update({
            data: {
                status: 'failed',
                wx_refund_id: wxRefundId || refund.wx_refund_id || '',
                wx_refund_status: refundStatus,
                updated_at: db.serverDate()
            }
        });

        if (orderId) {
            const orderRes = await db.collection('orders').doc(String(orderId)).get().catch(() => ({ data: null }));
            const order = orderRes.data;
            if (order && order.status === 'refunding') {
                const revertStatus = order.shipped_at ? 'shipped' : (order.paid_at ? 'paid' : 'pending_payment');
                await db.collection('orders').doc(String(orderId)).update({
                    data: { status: revertStatus, updated_at: db.serverDate() }
                }).catch(() => {});
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
                // 签名验证异常时拒绝处理，防止伪造回调绕过验签触发改单等操作
                console.error('[PaymentCallback] 签名验证异常，拒绝处理:', verifyErr.message);
                return { code: 'FAIL', message: 'Signature verification error' };
            }
        } else if (wxTimestamp || wxNonce || wxSignature) {
            // 头信息不完整也拒绝（防止部分头攻击）
            console.error('[PaymentCallback] 签名头信息不完整，拒绝处理');
            return { code: 'FAIL', message: 'Incomplete signature headers' };
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
                if (order.status === 'paid' || order.status === 'shipped' || order.status === 'completed') {
                    await processPaidOrder(order._id, order).catch((postErr) => {
                        console.error('[PaymentCallback] 已支付订单后处理补偿失败:', postErr.message);
                    });
                    return { code: 'SUCCESS', message: 'Already processed' };
                }

                if (order.status !== 'pending_payment') {
                    console.error(`[PaymentCallback] 订单状态不允许支付回调处理: ${order.status}, order_no=${outTradeNo}`);
                    return { code: 'FAIL', message: 'Invalid order status' };
                }

                // 仅允许 pending_payment -> paid，避免重复回调重复后处理。
                const updateRes = await db.collection('orders')
                    .where({ _id: order._id, status: 'pending_payment' })
                    .update({
                    data: {
                        status: 'paid',
                        paid_at: db.serverDate(),
                        trade_id: transaction.transaction_id || '',
                        pay_time: transaction.success_time ? new Date(transaction.success_time) : db.serverDate(),
                        updated_at: db.serverDate(),
                    },
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
    processPaidOrder,
};
