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
    c1_min_purchase: 299,
    c2_referee_count: 2,
    c2_min_sales: 580,
    b1_referee_count: 10,
    b1_recharge: 3000,
    b2_referee_count: 10,
    b2_recharge: 30000,
    b3_recharge: 198000
};

const DEFAULT_AGENT_COMMISSION_CONFIG = {
    direct_pct_by_role: { 1: 20, 2: 30, 3: 40, 4: 40, 5: 40 },
    indirect_pct_by_role: { 2: 0, 3: 0, 4: 0, 5: 0 }
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
    const [upgradeRow, commissionRow, memberLevelRow] = await Promise.all([
        getConfigByKeys(['agent_system_upgrade-rules', 'agent_system_upgrade_rules']),
        getConfigByKeys(['agent_system_commission-config', 'agent_system_commission_config']),
        getConfigByKeys(['member_level_config'])
    ]);
    const upgradeRules = { ...DEFAULT_AGENT_UPGRADE_RULES, ...parseConfigValue(upgradeRow, {}) };
    const commission = parseConfigValue(commissionRow, {});
    const memberLevels = Array.isArray(parseConfigValue(memberLevelRow, [])) ? parseConfigValue(memberLevelRow, []) : [];
    return {
        upgradeRules,
        commissionConfig: {
            direct_pct_by_role: normalizePctMap(commission?.direct_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.direct_pct_by_role),
            indirect_pct_by_role: normalizePctMap(commission?.indirect_pct_by_role, DEFAULT_AGENT_COMMISSION_CONFIG.indirect_pct_by_role)
        },
        memberLevels
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
            updated_at: db.serverDate()
        }
    });
    return { upgraded: true, previousRoleLevel: currentRoleLevel, nextRoleLevel, roleName: roleMeta.roleName };
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
    const commissions = await ensureCommissionsCreated(orderId, { ...latest, stock_deducted_at: true, points_awarded_at: true });

    await db.collection('orders').doc(orderId).update({
        data: { payment_post_processed_at: db.serverDate(), updated_at: db.serverDate() },
    });
    return { group, slash, stock, points, roles, commissions };
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
                    console.error('[PaymentCallback] 签名验证失败');
                    return { code: 'FAIL', message: 'Signature verification failed' };
                }
            } catch (verifyErr) {
                console.warn('[PaymentCallback] 签名验证异常（继续处理）:', verifyErr.message);
                // 签名验证失败不阻断，记录日志后继续
            }
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
        const outTradeNo = transaction.out_trade_no;
        const tradeState = transaction.trade_state;

        console.log(`[PaymentCallback] event_type=${eventType}, out_trade_no=${outTradeNo}, trade_state=${tradeState}`);

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
