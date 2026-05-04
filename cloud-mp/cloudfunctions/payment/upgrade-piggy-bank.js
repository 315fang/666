'use strict';

const DEFAULT_ROLE_NAMES = {
    0: 'VIP用户',
    1: '初级会员',
    2: '高级会员',
    3: '推广合伙人',
    4: '运营合伙人',
    5: '区域合伙人',
    6: '店长'
};

const DEFAULT_UPGRADE_PIGGY_BANK_CONFIG = {
    enabled: true,
    include_team_direct: true,
    include_team_indirect: true,
    include_self_purchase: false,
    max_target_level: 5,
    min_incremental_amount: 0.01,
    unlock_to_commission_balance: true
};
const DEFAULT_SELF_PURCHASE_COMMISSION_ENABLED = false;

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function firstNumber(values = [], fallback = null) {
    for (const value of values) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return fallback;
}

function primaryId(user = {}) {
    return user.id || user._legacy_id || user._id || user.openid || '';
}

function normalizeRoleLevel(roleLevel) {
    const level = Math.floor(toNumber(roleLevel, 0));
    if (level < 0) return 0;
    if (level > 6) return 6;
    return level;
}

function resolveBenefitRoleLevel(roleLevel) {
    const normalized = normalizeRoleLevel(roleLevel);
    return normalized === 6 ? 4 : normalized;
}

function normalizePiggyBankConfig(config = {}) {
    const merged = { ...DEFAULT_UPGRADE_PIGGY_BANK_CONFIG, ...(config || {}) };
    const selfPurchaseCommissionEnabled = merged.self_purchase_commission_enabled === true
        || merged.self_purchase_commission_enabled === 1
        || merged.self_purchase_commission_enabled === '1';
    return {
        enabled: merged.enabled !== false,
        include_team_direct: merged.include_team_direct !== false,
        include_team_indirect: merged.include_team_indirect !== false,
        include_self_purchase: (selfPurchaseCommissionEnabled || DEFAULT_SELF_PURCHASE_COMMISSION_ENABLED) && merged.include_self_purchase !== false,
        max_target_level: Math.min(5, Math.max(1, normalizeRoleLevel(merged.max_target_level))),
        min_incremental_amount: Math.max(0.01, toNumber(merged.min_incremental_amount, 0.01)),
        unlock_to_commission_balance: merged.unlock_to_commission_balance !== false
    };
}

function matrixRate(matrix = {}, parentRole, buyerRole) {
    const row = matrix[String(parentRole)] || matrix[parentRole];
    if (!row) return 0;
    const raw = row[String(buyerRole)] ?? row[buyerRole];
    const n = toNumber(raw, NaN);
    if (!Number.isFinite(n)) return 0;
    return n > 1 ? n / 100 : n;
}

function normalizePctMap(input = {}, fallback = {}) {
    const out = {};
    Object.keys({ ...fallback, ...input }).forEach((key) => {
        const n = toNumber(input[key] ?? fallback[key], NaN);
        if (Number.isFinite(n)) out[key] = n > 1 ? n / 100 : n;
    });
    return out;
}

function configuredCommission(product = {}, level, baseAmount) {
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

function isFlexBundleCommissionItem(order = {}, item = {}) {
    const commissionMode = pickString(item.bundle_commission_mode || order.bundle_commission_snapshot?.mode || order.bundle_meta?.commission_mode);
    if (commissionMode) return commissionMode === 'fixed' || commissionMode === 'matrix';
    return pickString(item.bundle_scene_type || order.bundle_meta?.scene_type) === 'flex_bundle';
}

function resolveSelfCommissionRate(costSplit = {}) {
    const raw = toNumber(costSplit.direct_sales_pct, 40);
    return raw > 1 ? raw / 100 : Math.max(0, raw);
}

function roleBasedRate(commissionConfig = {}, beneficiaryLevel, roleLevel) {
    const direct = normalizePctMap(commissionConfig.direct_pct_by_role, { 1: 20, 2: 30, 3: 40, 4: 40, 5: 40 });
    const indirect = normalizePctMap(commissionConfig.indirect_pct_by_role, { 2: 0, 3: 0, 4: 10, 5: 10 });
    const rates = beneficiaryLevel === 1 ? direct : indirect;
    return rates[resolveBenefitRoleLevel(roleLevel)] || 0;
}

function commissionAmountForRole(input = {}) {
    const {
        allocatedBase = 0,
        activeMatrix = {},
        useMatrix = true,
        commissionConfig = {},
        product = {},
        beneficiaryLevel = 1,
        buyerRole = 0,
        targetRole = 0,
        parentRole = 0,
        useBundleMatrix = false
    } = input;

    if (useMatrix) {
        const configured = useBundleMatrix ? 0 : configuredCommission(product, beneficiaryLevel, allocatedBase);
        if (configured > 0) return Math.min(allocatedBase, configured);
        const targetRate = matrixRate(activeMatrix, resolveBenefitRoleLevel(targetRole), resolveBenefitRoleLevel(buyerRole));
        const parentRate = beneficiaryLevel === 2
            ? matrixRate(activeMatrix, resolveBenefitRoleLevel(parentRole), resolveBenefitRoleLevel(buyerRole))
            : 0;
        const effectiveRate = beneficiaryLevel === 1 ? targetRate : Math.max(0, targetRate - parentRate);
        return roundMoney(allocatedBase * effectiveRate);
    }

    if (useBundleMatrix) {
        return 0;
    }
    const configured = configuredCommission(product, beneficiaryLevel, allocatedBase);
    if (configured > 0) return Math.min(allocatedBase, configured);
    return roundMoney(allocatedBase * roleBasedRate(commissionConfig, beneficiaryLevel, targetRole));
}

function buildIncrementalBuckets(input = {}) {
    const currentRoleLevel = normalizeRoleLevel(input.currentRoleLevel);
    const maxTargetLevel = normalizeRoleLevel(input.maxTargetLevel || 5);
    const minIncrementalAmount = toNumber(input.minIncrementalAmount, 0.01);
    const amountForRole = input.amountForRole || (() => 0);
    const buckets = [];
    let previousRoleLevel = currentRoleLevel;
    let previousAmount = roundMoney(amountForRole(currentRoleLevel));

    for (let targetRoleLevel = currentRoleLevel + 1; targetRoleLevel <= maxTargetLevel; targetRoleLevel += 1) {
        const targetAmount = roundMoney(amountForRole(targetRoleLevel));
        const incrementalAmount = roundMoney(Math.max(0, targetAmount - previousAmount));
        if (incrementalAmount >= minIncrementalAmount) {
            buckets.push({
                from_role_level: previousRoleLevel,
                target_role_level: targetRoleLevel,
                current_amount: previousAmount,
                target_amount: targetAmount,
                incremental_amount: incrementalAmount
            });
        }
        previousRoleLevel = targetRoleLevel;
        previousAmount = targetAmount;
    }

    return buckets;
}

async function getDocByIdOrLegacy(context, collectionName, id) {
    if (!hasValue(id)) return null;
    if (typeof context.getDocByIdOrLegacy === 'function') {
        return context.getDocByIdOrLegacy(collectionName, id);
    }
    const db = context.db;
    const num = toNumber(id, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num)
            ? db.collection(collectionName).where({ id: num }).limit(1).get().catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        db.collection(collectionName).doc(String(id)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data?.[0] || doc.data || null;
}

async function findUserByAny(context, value) {
    if (!hasValue(value)) return null;
    if (typeof context.findUserByAny === 'function') return context.findUserByAny(value);
    const db = context.db;
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

function getOrderTotalAmount(order = {}) {
    return roundMoney(firstNumber([
        order.pay_amount,
        order.actual_price,
        order.total_amount,
        order.amount
    ], 0));
}

function buildItemBaseTotal(order = {}, items = [], commissionBase = 0) {
    return items.reduce((sum, item) => {
        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        return sum + roundMoney(item.subtotal ?? item.item_amount ?? (toNumber(item.price || item.unit_price, 0) * qty));
    }, 0) || commissionBase;
}

async function buildTeamPiggyRows(context, orderId, order = {}, buyer = {}, runtimeConfig = {}, config = {}) {
    const rows = [];
    const orderPayAmount = getOrderTotalAmount(order);
    if (orderPayAmount <= 0) return rows;

    const parent = await findUserByAny(context, order.direct_referrer_openid || getUserReferrer(buyer));
    const grandparent = await findUserByAny(context, order.indirect_referrer_openid || (parent ? getUserReferrer(parent) : ''));
    const fulfillmentPartner = await findUserByAny(context, order.fulfillment_partner_openid || order.nearest_agent_openid || order.agent_info?.openid || '');
    const fulfillmentPartnerOpenid = fulfillmentPartner?.openid || order.fulfillment_partner_openid || '';
    const beneficiaries = [
        { level: 1, source_type: 'team_direct', user: parent },
        { level: 2, source_type: 'team_indirect', user: grandparent }
    ].filter((beneficiary) => {
        if (!beneficiary.user?.openid || beneficiary.user.openid === order.openid) return false;
        if (fulfillmentPartnerOpenid && beneficiary.user.openid === fulfillmentPartnerOpenid) return false;
        if (beneficiary.level === 1 && config.include_team_direct === false) return false;
        if (beneficiary.level === 2 && config.include_team_indirect === false) return false;
        return true;
    });

    if (!beneficiaries.length) return rows;

    const buyerRole = normalizeRoleLevel(buyer.role_level ?? buyer.distributor_level ?? buyer.level);
    const items = toArray(order.items);
    const itemBaseTotal = buildItemBaseTotal(order, items, orderPayAmount);

    for (const beneficiary of beneficiaries) {
        const currentRoleLevel = normalizeRoleLevel(beneficiary.user.role_level ?? beneficiary.user.distributor_level ?? beneficiary.user.level);
        if (currentRoleLevel >= config.max_target_level) continue;
        const parentRole = parent ? normalizeRoleLevel(parent.role_level ?? parent.distributor_level ?? parent.level) : 0;
        const amountByRole = new Map();
        for (let role = currentRoleLevel; role <= config.max_target_level; role += 1) {
            amountByRole.set(role, 0);
        }

        for (const item of items) {
            const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
            const product = await getDocByIdOrLegacy(context, 'products', item.product_id).catch(() => null) || {};
            const rawBase = roundMoney(item.subtotal ?? item.item_amount ?? (toNumber(item.price || item.unit_price, 0) * qty));
            const allocatedBase = itemBaseTotal > 0 ? roundMoney(orderPayAmount * rawBase / itemBaseTotal) : rawBase;
            const useBundleMatrix = isFlexBundleCommissionItem(order, item);
            const activeMatrix = useBundleMatrix ? runtimeConfig.bundleCommissionMatrix : runtimeConfig.commissionMatrix;
            const useMatrix = activeMatrix && Object.keys(activeMatrix).length > 0;

            for (let role = currentRoleLevel; role <= config.max_target_level; role += 1) {
                const amount = commissionAmountForRole({
                    allocatedBase,
                    activeMatrix,
                    useMatrix,
                    commissionConfig: runtimeConfig.commissionConfig,
                    product,
                    beneficiaryLevel: beneficiary.level,
                    buyerRole,
                    targetRole: role,
                    parentRole,
                    useBundleMatrix
                });
                amountByRole.set(role, roundMoney((amountByRole.get(role) || 0) + amount));
            }
        }

        const buckets = buildIncrementalBuckets({
            currentRoleLevel,
            maxTargetLevel: config.max_target_level,
            minIncrementalAmount: config.min_incremental_amount,
            amountForRole: (role) => amountByRole.get(role) || 0
        });

        buckets.forEach((bucket) => {
            rows.push({
                openid: beneficiary.user.openid,
                user_id: primaryId(beneficiary.user),
                order_id: orderId,
                order_no: order.order_no || '',
                from_openid: order.openid || '',
                source_type: beneficiary.source_type,
                current_role_level: currentRoleLevel,
                buyer_role_level: buyerRole,
                level: beneficiary.level,
                ...bucket
            });
        });
    }

    return rows;
}

function buildSelfPiggyRows(orderId, order = {}, buyer = {}, runtimeConfig = {}, config = {}) {
    if (!config.include_self_purchase) return [];
    const currentRoleLevel = normalizeRoleLevel(buyer.role_level ?? buyer.distributor_level ?? buyer.level);
    if (currentRoleLevel >= config.max_target_level) return [];
    const orderPayAmount = getOrderTotalAmount(order);
    if (orderPayAmount <= 0) return [];
    const selfRate = resolveSelfCommissionRate(runtimeConfig.costSplit || {});
    const amountForRole = (role) => role >= 3 ? roundMoney(orderPayAmount * selfRate) : 0;
    return buildIncrementalBuckets({
        currentRoleLevel,
        maxTargetLevel: config.max_target_level,
        minIncrementalAmount: config.min_incremental_amount,
        amountForRole
    }).map((bucket) => ({
        openid: buyer.openid,
        user_id: primaryId(buyer),
        order_id: orderId,
        order_no: order.order_no || '',
        from_openid: order.openid || '',
        source_type: 'self_purchase',
        current_role_level: currentRoleLevel,
        buyer_role_level: currentRoleLevel,
        level: currentRoleLevel,
        ...bucket
    }));
}

async function addPiggyRows(context, rows = []) {
    const { db, command } = context;
    let created = 0;
    let amount = 0;
    for (const row of rows) {
        const incrementalAmount = roundMoney(row.incremental_amount);
        if (incrementalAmount <= 0) continue;

        // 原子幂等插入：用 where 条件尝试插入，防止并发重复
        const existing = await db.collection('upgrade_piggy_bank_logs')
            .where({
                order_id: row.order_id,
                openid: row.openid,
                target_role_level: row.target_role_level,
                source_type: row.source_type
            })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (existing.data && existing.data.length > 0) continue;

        await db.collection('upgrade_piggy_bank_logs').add({
            data: {
                ...row,
                incremental_amount: incrementalAmount,
                status: 'locked',
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
        try {
            await db.collection('users').where({ openid: row.openid, piggy_bank_locked_amount: command.gte(0) }).update({
                data: {
                    piggy_bank_locked_amount: command.inc(incrementalAmount),
                    updated_at: db.serverDate()
                }
            });
        } catch (err) {
            console.error('[piggy-bank] 更新用户锁定金额失败:', err.message);
        }
        created += 1;
        amount = roundMoney(amount + incrementalAmount);
    }
    return { created, amount };
}

async function createUpgradePiggyBankForOrder(context, orderId, order = {}, runtimeConfig = {}) {
    const { db, command } = context;
    const config = normalizePiggyBankConfig({
        ...(runtimeConfig.piggyBank || runtimeConfig.piggyBankConfig || {}),
        self_purchase_commission_enabled: runtimeConfig.commissionConfig?.self_purchase_commission_enabled
    });
    if (!config.enabled) return { skipped: true, reason: 'disabled' };
    if (!orderId || order.piggy_bank_created_at) return { skipped: true, reason: 'already_created' };
    if (pickString(order.order_type || order.type) === 'exchange' || order.exchange_mode === true) {
        return { skipped: true, reason: 'exchange_order' };
    }

    // 原子幂等锁：只允许一个调用通过
    const lockRes = await db.collection('orders')
        .where({ _id: String(orderId), piggy_bank_created_at: command.exists(false) })
        .update({ data: { piggy_bank_created_at: db.serverDate(), updated_at: db.serverDate() } });
    if (!lockRes || !lockRes.stats || lockRes.stats.updated === 0) {
        console.log('[piggy-bank] 存钱罐创建已被并发处理，跳过 orderId=%s', orderId);
        return { skipped: true, reason: 'concurrent_lock' };
    }

    const buyer = await findUserByAny(context, order.openid || order.buyer_id || order.user_id);
    if (!buyer?.openid) return { skipped: true, reason: 'buyer_not_found' };

    const buyerRole = normalizeRoleLevel(buyer.role_level ?? buyer.distributor_level ?? buyer.level);
    const rows = [
        ...buildSelfPiggyRows(orderId, order, buyer, runtimeConfig, config)
    ];
    if (buyerRole < 3) {
        rows.push(...await buildTeamPiggyRows(context, orderId, order, buyer, runtimeConfig, config));
    }
    const result = await addPiggyRows(context, rows);

    try {
        await db.collection('orders').doc(String(orderId)).update({
            data: {
                piggy_bank_log_count: result.created,
                piggy_bank_locked_amount: result.amount,
                updated_at: db.serverDate()
            }
        });
    } catch (e) {
        console.error('[piggy-bank] 订单存钱罐状态标记失败 orderId=%s error=%s', orderId, e.message);
    }

    return {
        ...result,
        checked: true
    };
}

async function listPiggyRowsByOrder(db, orderId) {
    if (!orderId) return [];
    const res = await db.collection('upgrade_piggy_bank_logs')
        .where({ order_id: orderId })
        .limit(500)
        .get()
        .catch(() => ({ data: [] }));
    return res.data || [];
}

async function reverseUpgradePiggyBankForRefund(context, orderId) {
    const { db, command } = context;
    const rows = await listPiggyRowsByOrder(db, orderId);
    let reversedLockedAmount = 0;
    let clawedBackAmount = 0;
    let changed = 0;
    for (const row of rows) {
        const amount = roundMoney(row.incremental_amount);
        if (amount <= 0) continue;
        if (row.status === 'locked') {
            try {
                await db.collection('upgrade_piggy_bank_logs').doc(String(row._id)).update({
                    data: {
                        status: 'reversed',
                        reversed_at: db.serverDate(),
                        updated_at: db.serverDate()
                    }
                });
            } catch (e) {
                console.error('[piggy-bank] ⚠️ 存钱罐日志状态反写失败 id=%s openid=%s error=%s', row._id, row.openid, e.message);
                await db.collection('rollback_error_logs').add({ data: { module: 'piggy-bank', operation: 'reverse_log_status', error: e.message, log_id: String(row._id), openid: row.openid, order_id: orderId, created_at: db.serverDate() } }).catch(() => {});
            }
            try {
                await db.collection('users').where({ openid: row.openid }).update({
                    data: {
                        piggy_bank_locked_amount: command.inc(-amount),
                        piggy_bank_reversed_amount: command.inc(amount),
                        updated_at: db.serverDate()
                    }
                });
            } catch (e) {
                console.error('[piggy-bank] ⚠️ 用户存钱罐锁定金额回滚失败 openid=%s amount=%s error=%s', row.openid, amount, e.message);
                await db.collection('rollback_error_logs').add({ data: { module: 'piggy-bank', operation: 'reverse_user_balance', error: e.message, openid: row.openid, amount, order_id: orderId, created_at: db.serverDate() } }).catch(() => {});
            }
            reversedLockedAmount = roundMoney(reversedLockedAmount + amount);
            changed += 1;
        } else if (row.status === 'unlocked') {
            try {
                await db.collection('upgrade_piggy_bank_logs').doc(String(row._id)).update({
                    data: {
                        status: 'clawed_back',
                        reversed_at: db.serverDate(),
                        updated_at: db.serverDate()
                    }
                });
            } catch (e) {
                console.error('[piggy-bank] ⚠️ 存钱罐日志状态扣回标记失败 id=%s openid=%s error=%s', row._id, row.openid, e.message);
                await db.collection('rollback_error_logs').add({ data: { module: 'piggy-bank', operation: 'clawback_log_status', error: e.message, log_id: String(row._id), openid: row.openid, order_id: orderId, created_at: db.serverDate() } }).catch(() => {});
            }
            try {
                await db.collection('users').where({ openid: row.openid }).update({
                    data: {
                        commission_balance: command.inc(-amount),
                        balance: command.inc(-amount),
                        total_earned: command.inc(-amount),
                        piggy_bank_unlocked_amount: command.inc(-amount),
                        piggy_bank_reversed_amount: command.inc(amount),
                        updated_at: db.serverDate()
                    }
                });
            } catch (e) {
                console.error('[piggy-bank] ⚠️ 用户佣金余额扣回失败 openid=%s amount=%s error=%s', row.openid, amount, e.message);
                await db.collection('rollback_error_logs').add({ data: { module: 'piggy-bank', operation: 'clawback_user_balance', error: e.message, openid: row.openid, amount, order_id: orderId, created_at: db.serverDate() } }).catch(() => {});
            }
            try {
                await db.collection('wallet_logs').add({
                    data: {
                        openid: row.openid,
                        type: 'upgrade_piggy_bank_clawback',
                        amount: -amount,
                        order_id: orderId,
                        order_no: row.order_no || '',
                        description: `退款扣回升级存钱罐 ${amount} 元`,
                        created_at: db.serverDate()
                    }
                });
            } catch (e) {
                console.error('[piggy-bank] 钱包日志写入失败(clawback) openid=%s amount=%s error=%s', row.openid, amount, e.message);
            }
            clawedBackAmount = roundMoney(clawedBackAmount + amount);
            changed += 1;
        }
    }
    return { changed, reversed_locked_amount: reversedLockedAmount, clawed_back_amount: clawedBackAmount };
}

async function listLockedRowsForUnlock(db, openid, targetRoleLevel) {
    const res = await db.collection('upgrade_piggy_bank_logs')
        .where({ openid, status: 'locked' })
        .limit(500)
        .get()
        .catch(() => ({ data: [] }));
    return (res.data || []).filter((row) => normalizeRoleLevel(row.target_role_level) <= targetRoleLevel);
}

async function unlockUpgradePiggyBankForRole(context, payload = {}) {
    const { db, command } = context;
    const openid = pickString(payload.openid);
    const targetRoleLevel = normalizeRoleLevel(payload.targetRoleLevel);
    if (!openid || targetRoleLevel <= 0) return { skipped: true, reason: 'invalid_payload' };
    const config = normalizePiggyBankConfig(payload.config || {});
    const rows = await listLockedRowsForUnlock(db, openid, targetRoleLevel);
    if (!rows.length) return { unlocked: 0, amount: 0 };
    const total = roundMoney(rows.reduce((sum, row) => sum + roundMoney(row.incremental_amount), 0));
    if (total <= 0) return { unlocked: 0, amount: 0 };
    const user = await findUserByAny(context, openid) || { openid };
    const userId = primaryId(user);

    if (config.unlock_to_commission_balance) {
        const unlockRes = await db.collection('users').where({ openid, piggy_bank_locked_amount: command.gte(total) }).update({
            data: {
                commission_balance: command.inc(total),
                balance: command.inc(total),
                total_earned: command.inc(total),
                piggy_bank_locked_amount: command.inc(-total),
                piggy_bank_unlocked_amount: command.inc(total),
                updated_at: db.serverDate()
            }
        });
        if (!unlockRes || !unlockRes.stats || unlockRes.stats.updated === 0) {
            console.error('[piggy-bank] ⚠️ 存钱罐解锁余额更新失败（并发冲突） openid=%s total=%s', openid, total);
            return { unlocked: 0, amount: 0, error: 'concurrent_unlock_conflict' };
        }
        try {
            await db.collection('commissions').add({
                data: {
                    openid,
                    user_id: userId,
                    from_openid: '',
                    order_id: payload.triggerOrderId || '',
                    order_no: '',
                    amount: total,
                    level: targetRoleLevel,
                    type: 'upgrade_piggy_bank_unlock',
                    status: 'settled',
                    settled_at: db.serverDate(),
                    created_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            });
        } catch (e) {
            console.error('[piggy-bank] ⚠️ 佣金记录创建失败 openid=%s amount=%s error=%s', openid, total, e.message);
            await db.collection('rollback_error_logs').add({ data: { module: 'piggy-bank', operation: 'unlock_commission_create', error: e.message, openid, amount: total, order_id: payload.triggerOrderId || '', created_at: db.serverDate() } }).catch(() => {});
        }
        try {
            await db.collection('wallet_logs').add({
                data: {
                    openid,
                    user_id: userId,
                    type: 'upgrade_piggy_bank_unlock',
                    amount: total,
                    order_id: payload.triggerOrderId || '',
                    description: `升级解锁存钱罐 ${total} 元`,
                    created_at: db.serverDate()
                }
            });
        } catch (e) {
            console.error('[piggy-bank] 钱包日志写入失败(unlock) openid=%s amount=%s error=%s', openid, total, e.message);
        }
    }

    for (const row of rows) {
        try {
            const logUpdate = await db.collection('upgrade_piggy_bank_logs')
                .where({ _id: String(row._id), status: 'locked' })
                .update({
                    data: {
                        status: 'unlocked',
                        unlock_order_id: payload.triggerOrderId || '',
                        unlocked_at: db.serverDate(),
                        updated_at: db.serverDate()
                    }
                });
            if (!logUpdate || !logUpdate.stats || logUpdate.stats.updated === 0) {
                console.warn('[piggy-bank] 存钱罐日志已不是locked状态，跳过 id=%s', row._id);
            }
        } catch (e) {
            console.error('[piggy-bank] ⚠️ 存钱罐日志状态解锁失败 id=%s error=%s', row._id, e.message);
            await db.collection('rollback_error_logs').add({ data: { module: 'piggy-bank', operation: 'unlock_log_status', error: e.message, log_id: String(row._id), openid, order_id: payload.triggerOrderId || '', created_at: db.serverDate() } }).catch(() => {});
        }
    }
    return { unlocked: rows.length, amount: total };
}

module.exports = {
    DEFAULT_UPGRADE_PIGGY_BANK_CONFIG,
    DEFAULT_ROLE_NAMES,
    buildIncrementalBuckets,
    buildSelfPiggyRows,
    commissionAmountForRole,
    createUpgradePiggyBankForOrder,
    normalizePiggyBankConfig,
    reverseUpgradePiggyBankForRefund,
    unlockUpgradePiggyBankForRole
};
