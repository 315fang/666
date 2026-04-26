'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber, getAllRecords } = require('./shared/utils');
const { normalizeCouponRecord, reconcileLotteryCoupons } = require('./user-coupons');

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
    checkin: {
        points: 5,
        remark: '每日签到'
    },
    checkin_streak: {
        points: 50,
        streak_days: 7,
        remark: '连续签到奖励'
    },
    review: {
        points: 10,
        remark: '评价订单奖励'
    },
    invite_success: {
        points: 50,
        remark: '成功邀请新用户加入团队'
    }
};

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function uniqueValues(values) {
    const seen = {};
    const list = [];
    values.forEach((value) => {
        if (!hasValue(value)) return;
        const key = String(value);
        if (seen[key]) return;
        seen[key] = true;
        list.push(value);
    });
    return list;
}

function getDateKey(date = new Date()) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    return [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, '0'),
        String(value.getDate()).padStart(2, '0')
    ].join('-');
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

async function getConfigByKey(key) {
    const res = await db.collection('configs')
        .where(_.or([{ config_key: key }, { key }]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (res.data && res.data[0]) return res.data[0];
    const legacyRes = await db.collection('app_configs')
        .where({ config_key: key, status: _.in([true, 1, '1']) })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return legacyRes.data && legacyRes.data[0] ? legacyRes.data[0] : null;
}

function normalizePointRuleConfig(raw = {}) {
    const rule = raw && typeof raw === 'object' ? raw : {};
    const deduction = rule.deduction && typeof rule.deduction === 'object' ? rule.deduction : {};
    const purchaseMultiplierRaw = rule.purchase_multiplier_by_role && typeof rule.purchase_multiplier_by_role === 'object'
        ? rule.purchase_multiplier_by_role
        : {};
    const checkin = rule.checkin && typeof rule.checkin === 'object' ? rule.checkin : {};
    const checkinStreak = rule.checkin_streak && typeof rule.checkin_streak === 'object' ? rule.checkin_streak : {};
    const review = rule.review && typeof rule.review === 'object' ? rule.review : {};
    const inviteSuccess = rule.invite_success && typeof rule.invite_success === 'object' ? rule.invite_success : {};

    const purchaseMultiplierByRole = {};
    Object.keys(DEFAULT_POINT_RULES.purchase_multiplier_by_role).forEach((role) => {
        purchaseMultiplierByRole[role] = Math.max(
            0,
            toNumber(
                purchaseMultiplierRaw[role],
                DEFAULT_POINT_RULES.purchase_multiplier_by_role[role]
            )
        );
    });

    return {
        deduction: {
            yuan_per_point: Math.max(
                0.01,
                toNumber(deduction.yuan_per_point, DEFAULT_POINT_RULES.deduction.yuan_per_point)
            ),
            max_order_ratio: Math.max(
                0.01,
                Math.min(1, toNumber(deduction.max_order_ratio, DEFAULT_POINT_RULES.deduction.max_order_ratio))
            )
        },
        purchase_multiplier_by_role: purchaseMultiplierByRole,
        checkin: {
            points: Math.max(0, toNumber(checkin.points, DEFAULT_POINT_RULES.checkin.points)),
            remark: String(checkin.remark || DEFAULT_POINT_RULES.checkin.remark)
        },
        checkin_streak: {
            points: Math.max(0, toNumber(checkinStreak.points, DEFAULT_POINT_RULES.checkin_streak.points)),
            streak_days: Math.max(1, Math.floor(toNumber(checkinStreak.streak_days, DEFAULT_POINT_RULES.checkin_streak.streak_days))),
            remark: String(checkinStreak.remark || DEFAULT_POINT_RULES.checkin_streak.remark)
        },
        review: {
            points: Math.max(0, toNumber(review.points, DEFAULT_POINT_RULES.review.points)),
            remark: String(review.remark || DEFAULT_POINT_RULES.review.remark)
        },
        invite_success: {
            points: Math.max(0, toNumber(inviteSuccess.points, DEFAULT_POINT_RULES.invite_success.points)),
            remark: String(inviteSuccess.remark || DEFAULT_POINT_RULES.invite_success.remark)
        }
    };
}

async function loadPointRules() {
    const row = await getConfigByKey('point_rule_config');
    return normalizePointRuleConfig(parseConfigValue(row, {}));
}

async function getUserCouponIds(openid) {
    const userRes = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
    const values = [];
    if (user) {
        if (hasValue(user.id)) values.push(user.id, String(user.id));
        if (hasValue(user._id)) values.push(user._id);
        if (hasValue(user._legacy_id)) values.push(user._legacy_id, String(user._legacy_id));
    }
    const userIds = uniqueValues(values);
    return userIds.length > 0 ? userIds : uniqueValues([openid]);
}

async function queryUserCouponsByUserIds(userIds = []) {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
    const tasks = userIds.map(async (userId) => {
        const res = await db.collection('user_coupons')
            .where({ user_id: userId })
            .orderBy('expire_at', 'asc')
            .limit(50)
            .get()
            .catch(() => ({ data: [] }));
        return res.data || [];
    });
    return (await Promise.all(tasks)).flat();
}

function normalizeScopeIds(value) {
    if (Array.isArray(value)) {
        return uniqueValues(value.map((item) => String(item).trim()).filter(Boolean));
    }
    if (!hasValue(value)) return [];
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return uniqueValues(parsed.map((item) => String(item).trim()).filter(Boolean));
                }
            } catch (_) {}
        }
        return uniqueValues(trimmed.split(',').map((item) => item.trim()));
    }
    return uniqueValues([String(value).trim()].filter(Boolean));
}

async function expandProductScopeIds(productIds = []) {
    const aliases = new Set(normalizeScopeIds(productIds));
    const rawIds = Array.from(aliases);
    if (rawIds.length === 0) return [];

    await Promise.all(rawIds.map(async (rawId) => {
        const numericId = Number(rawId);
        const [byDoc, byLegacy] = await Promise.all([
            db.collection('products').doc(rawId).get().catch(() => ({ data: null })),
            Number.isFinite(numericId)
                ? db.collection('products').where({ id: numericId }).limit(1).get().catch(() => ({ data: [] }))
                : Promise.resolve({ data: [] })
        ]);
        const product = byDoc.data || (byLegacy.data && byLegacy.data[0]) || null;
        if (!product) return;

        [product._id, product.id]
            .filter(hasValue)
            .forEach((value) => aliases.add(String(value)));
    }));

    return Array.from(aliases);
}

async function buildCouponScopeContext(params = {}) {
    return {
        // 兼容购物袋链路传商品文档 _id，而券模板里存的是旧数字 id。
        productIds: await expandProductScopeIds(params.product_ids),
        categoryIds: normalizeScopeIds(params.category_ids)
    };
}

function couponMatchesScope(coupon = {}, scopeContext = {}) {
    const scope = String(coupon.scope || 'all').toLowerCase();
    const scopeIds = normalizeScopeIds(coupon.scope_ids);
    const productIds = normalizeScopeIds(scopeContext.productIds);
    const categoryIds = normalizeScopeIds(scopeContext.categoryIds);
    if (!scope || scope === 'all' || scopeIds.length === 0) return true;
    if (scope === 'product') {
        return productIds.length === 0 || productIds.some((id) => scopeIds.includes(id));
    }
    if (scope === 'category') {
        return categoryIds.length === 0 || categoryIds.some((id) => scopeIds.includes(id));
    }
    return true;
}

async function getCommissionIdentity(openid) {
    const userRes = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
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

async function listCommissionRows(identity = {}) {
    const tasks = [];
    if (identity.openid) {
        tasks.push(getAllRecords(db, 'commissions', { openid: identity.openid }).catch(() => []));
    }
    if (identity.userIds && identity.userIds.length) {
        identity.userIds.forEach((userId) => {
            tasks.push(getAllRecords(db, 'commissions', { user_id: userId }).catch(() => []));
        });
    }
    if (!tasks.length) return [];

    const groups = await Promise.all(tasks);
    const merged = {};
    groups.flat().forEach((row) => {
        merged[commissionRecordKey(row)] = row;
    });
    return Object.values(merged);
}

function roundMoney(val) {
    return Math.round(toNumber(val, 0) * 100) / 100;
}

function getCommissionLogTypeText(type) {
    const map = {
        direct: '直推佣金',
        Direct: '直推佣金',
        indirect: '团队佣金',
        Indirect: '团队佣金',
        gap: '级差利润',
        Stock_Diff: '级差利润',
        agent_fulfillment: '发货利润',
        region_agent: '区域奖励',
        region_b3_virtual: '区域奖励',
        self: '自购返利',
        withdrawal: '提现申请',
        admin_adjustment: '系统调整',
        pickup_service_fee: '服务费'
    };
    return map[type] || String(type || '');
}

function getCommissionLogStatusText(status) {
    const map = {
        frozen: '冻结中',
        pending: '预计入账',
        pending_approval: '审核中',
        approved: '待打款',
        settled: '已到账',
        completed: '已到账',
        cancelled: '已取消',
        rejected: '已驳回'
    };
    return map[status] || String(status || '');
}

function getOrderSourceText(order = {}) {
    const firstItem = Array.isArray(order.items) ? (order.items[0] || {}) : {};
    const orderType = String(order.type || order.order_type || firstItem.activity_type || '').trim().toLowerCase();
    if (orderType === 'group' || order.group_no || firstItem.group_no || order.group_activity_id || firstItem.group_activity_id) {
        return '拼团订单';
    }
    if (orderType === 'slash' || order.slash_no || firstItem.slash_no) {
        return '砍价订单';
    }
    if (String(order.delivery_type || '').trim() === 'pickup') {
        return '到店自提订单';
    }
    return '小程序商城订单';
}

function getCommissionSourceText(item = {}, order = null) {
    const type = String(item.type || '').trim().toLowerCase();
    const sourceMap = {
        direct: '来自直推下级订单',
        indirect: '来自团队下级订单',
        same_level: '来自平级奖励结算',
        pickup_subsidy: '来自门店服务费',
        pickup_service_fee: '来自门店服务费',
        agent_assist: '来自代理协助奖励',
        agent_fulfillment: '来自代理发货利润',
        region_agent: item.description || '来自区域代理奖励',
        region_b3_virtual: item.description || '来自区域代理奖励',
        stock_diff: '来自级差利润',
        self: '来自自购返利'
    };
    return sourceMap[type] || (order ? `来自${getOrderSourceText(order)}` : '来自佣金结算');
}

function isRegionRewardCommissionType(type) {
    return ['region_agent', 'region_b3_virtual'].includes(String(type || '').trim().toLowerCase());
}

function canViewRegionRewardCommissions(user = {}) {
    const roleLevel = toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
    const virtualSettlementType = String(user.virtual_settlement_type || '').trim().toLowerCase();
    return roleLevel === 5 || virtualSettlementType === 'b3_region';
}

function getAgentWalletBalance(user = {}) {
    return roundMoney(toNumber(user.agent_wallet_balance != null ? user.agent_wallet_balance : user.wallet_balance, 0));
}

function hasExplicitCommissionBalance(user = {}) {
    if (user.commission_balance != null) return true;
    if (user.balance == null) return false;
    if (user.wallet_balance == null) return true;
    return roundMoney(user.balance) !== roundMoney(user.wallet_balance);
}

function deriveCommissionBalance(user = {}, stats = {}) {
    const settled = roundMoney(stats.settled);
    const withdrawn = roundMoney(user.total_withdrawn);
    const total = roundMoney(stats.total);
    const earned = roundMoney(user.total_earned);
    if (total <= 0 && earned > 0) {
        return Math.max(0, roundMoney(earned - withdrawn));
    }
    return Math.max(0, roundMoney(settled - withdrawn));
}

function shouldReconcileCommissionBalance(user = {}, stats = {}) {
    const explicit = hasExplicitCommissionBalance(user);
    const derived = deriveCommissionBalance(user, stats);
    if (!explicit) return { explicit, derived, useDerived: true };

    const stored = roundMoney(toNumber(user.commission_balance != null ? user.commission_balance : user.balance, 0));
    const useDerived = stored === 0 && derived > 0;
    return { explicit, derived, stored, useDerived };
}

async function syncWalletFields(user = {}, stats = {}) {
    const updates = {};
    const agentBalance = getAgentWalletBalance(user);
    const { explicit, derived, stored, useDerived } = shouldReconcileCommissionBalance(user, stats);
    const ambiguousLegacyBalance = !explicit && user.balance != null && user.wallet_balance != null;
    const commissionBalance = useDerived
        ? derived
        : roundMoney(toNumber(user.commission_balance != null ? user.commission_balance : user.balance, stored || 0));

    if (user.agent_wallet_balance == null) {
        updates.agent_wallet_balance = agentBalance;
    }
    if (user.commission_balance == null || ambiguousLegacyBalance || useDerived) {
        updates.commission_balance = commissionBalance;
    }
    if (user.balance == null || ambiguousLegacyBalance || useDerived) {
        updates.balance = commissionBalance;
    }

    if (Object.keys(updates).length && user._id) {
        try {
        await db.collection('users').doc(String(user._id)).update({
            data: {
                ...updates,
                updated_at: db.serverDate()
            }
        });
    } catch (err) {
        console.error('[user-wallet] ⚠️ 同步钱包字段失败:', err);
    }
        return { ...user, ...updates };
    }
    return user;
}

/**
 * 获取钱包信息
 * 实时从 commissions 集合汇总各状态金额，保证数据准确。
 * 返回结构与前端 wallet/index.js 的 loadWalletInfo 完全对应。
 */
async function getWalletInfo(openid) {
    const identity = await getCommissionIdentity(openid);
    if (!identity.user) throw new Error('用户不存在');
    let userData = identity.user;
    const commissionRows = await listCommissionRows(identity);

    // 实时汇总各佣金状态金额
    const stats = {
        frozen: 0,           // 冻结中（退款保护期内）
        pendingApproval: 0,  // 待入账（退款期过，等平台审核）
        approved: 0,         // 待结算（审核通过，等打款）
        settled: 0,          // 已结算完成（历史）
        cancelled: 0,        // 已取消
        total: 0             // 历史累计（不含 cancelled）
    };

    commissionRows.forEach(item => {
        const amt = toNumber(item.amount, 0);
        const s = String(item.status || '');
        if (s === 'frozen')           stats.frozen += amt;
        else if (s === 'pending_approval') stats.pendingApproval += amt;
        else if (s === 'approved')    stats.approved += amt;
        else if (s === 'settled' || s === 'completed') stats.settled += amt;

        if (s !== 'cancelled') stats.total += amt;
    });

    Object.keys(stats).forEach(k => { stats[k] = roundMoney(stats[k]); });

    userData = await syncWalletFields(userData, stats);

    const balance = roundMoney(toNumber(userData.commission_balance != null ? userData.commission_balance : userData.balance, 0));
    const totalWithdrawn = roundMoney(userData.total_withdrawn);
    const available = balance;
    const goodsFundBalance = getAgentWalletBalance(userData);
    const pendingIn = roundMoney(stats.frozen + stats.pendingApproval + stats.approved);

    return {
        balance,
        available_balance: available,
        commission_balance: balance,
        goods_fund_balance: goodsFundBalance,
        agent_wallet_balance: goodsFundBalance,
        pendingIn,
        total_withdrawn: totalWithdrawn,
        commission: {
            frozen: stats.frozen,                    // 冻结中（退款保护期内）
            pendingApproval: stats.pendingApproval,  // 审核中（等平台审核）
            approved: stats.approved,                // 待打款（审核通过等打款）
            // 待入账合计 = 所有尚未到账的金额之和
            pendingTotal: pendingIn,
            pendingIn,
            available,                               // 可提现（以实际余额为准）
            total: stats.total,                      // 历史累计
            settled: stats.settled,                  // 已结算
        }
    };
}

/**
 * 钱包佣金明细（含分页、类型筛选、来源用户/订单信息）
 */
async function walletCommissions(openid, params = {}) {
    const page  = Math.max(1, parseInt(params.page)  || 1);
    const limit = Math.min(50, parseInt(params.limit) || 20);
    const skip  = (page - 1) * limit;
    const typeFilter = params.type ? String(params.type).toLowerCase() : '';
    const identity = await getCommissionIdentity(openid);
    let list = await listCommissionRows(identity);
    const canViewRegionReward = canViewRegionRewardCommissions(identity.user || {});
    if (!canViewRegionReward) {
        list = list.filter(item => !isRegionRewardCommissionType(item.type));
    }

    list.sort((a, b) => {
        const ta = new Date(a.created_at || 0).getTime();
        const tb = new Date(b.created_at || 0).getTime();
        return tb - ta;
    });

    // 类型筛选（兼容大小写，如 'Direct'/'direct' 均可）
    if (typeFilter && typeFilter !== 'all') {
        list = list.filter(item => {
            const t = String(item.type || '').toLowerCase();
            if (typeFilter === 'region') return canViewRegionReward && isRegionRewardCommissionType(t);
            return t === typeFilter;
        });
    }

    // 分页截取（筛选后再截）
    const total = list.length;
    list = list.slice(skip, skip + limit);

    if (list.length === 0) return { list: [], total, page, limit };

    // ── 批量拉取来源用户信息（谁的订单触发了这笔佣金）
    const fromOpenids = uniqueValues(list.map(i => i.from_openid).filter(Boolean));
    let fromUserMap = {};
    if (fromOpenids.length > 0) {
        try {
            const userRes = await db.collection('users')
                .where({ openid: _.in(fromOpenids) })
                .field({ openid: true, nickName: true, nickname: true, phone: true, invite_code: true, member_no: true })
                .limit(fromOpenids.length)
                .get();
            (userRes.data || []).forEach(u => {
                fromUserMap[u.openid] = {
                    nick: u.nickName || u.nickname || u.phone || '下级用户',
                    member_no: u.member_no || u.invite_code || ''
                };
            });
        } catch (_) {}
    }

    // ── 批量拉取订单基本信息
    const orderNos = uniqueValues(list.map(i => i.order_no).filter(Boolean));
    let orderMap = {};
    if (orderNos.length > 0) {
        try {
            const orderRes = await db.collection('orders')
                .where({ order_no: _.in(orderNos) })
                .field({ order_no: true, items: true, total_amount: true, pay_amount: true, delivery_type: true, type: true, order_type: true, group_no: true, group_activity_id: true, slash_no: true })
                .limit(orderNos.length)
                .get();
            (orderRes.data || []).forEach(o => {
                orderMap[o.order_no] = {
                    order_no: o.order_no,
                    // 取第一个商品名作摘要
                    product_summary: (o.items && o.items[0]) ? (o.items[0].name || o.items[0].snapshot_name || '') : '',
                    pay_amount: o.pay_amount || o.total_amount || 0,
                    source_text: getOrderSourceText(o)
                };
            });
        } catch (_) {}
    }

    // ── 组合输出
    const enriched = list.map(item => {
        const typeKey = String(item.type || '').toLowerCase();
        const fromUser = item.from_openid ? (fromUserMap[item.from_openid] || null) : null;
        const order = item.order_no ? (orderMap[item.order_no] || null) : null;
        return {
            ...item,
            // 规范化 type（统一小写，前端按此匹配）
            type: typeKey,
            type_text: getCommissionLogTypeText(item.type),
            status_text: getCommissionLogStatusText(item.status),
            from_user_nick: fromUser ? fromUser.nick : null,
            from_user_member_no: fromUser ? fromUser.member_no : '',
            source_text: getCommissionSourceText(item, order),
            order_no_display: item.order_no || item.order_id || null,
            order_source_text: order ? order.source_text : '',
            product_summary: order ? order.product_summary : null,
            order_pay_amount: order ? order.pay_amount : null
        };
    });

    return { list: enriched, total, page, limit };
}

/**
 * 积分账户信息
 */
async function pointsAccount(openid) {
    const user = await db.collection('users').where({ openid }).limit(1).get();
    if (!user.data || user.data.length === 0) throw new Error('用户不存在');

    const userData = user.data[0];
    const points = toNumber(userData.points != null ? userData.points : userData.growth_value, 0);
    const growthValue = toNumber(userData.growth_value, 0);

    return {
        points,
        balance_points: points,
        growth_value: growthValue,
        level: toNumber(userData.role_level, 0),
        level_name: userData.role_name || 'VIP用户',
    };
}

/**
 * 签到状态
 */
async function pointsSignInStatus(openid) {
    const user = await db.collection('users').where({ openid }).limit(1).get();
    if (!user.data || user.data.length === 0) throw new Error('用户不存在');

    const userData = user.data[0];
    const pointRules = await loadPointRules();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = getDateKey(today);

    const lastSignIn = userData.last_sign_in_at ? new Date(userData.last_sign_in_at) : null;
    const signedToday = userData.last_sign_in_date === todayKey || (lastSignIn && lastSignIn >= today);

    // 计算连续签到天数
    let consecutiveDays = toNumber(userData.consecutive_sign_days, 0);
    if (lastSignIn) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (lastSignIn < yesterday) {
            consecutiveDays = 0; // 断签
        }
    }

    return {
        signed_today: !!signedToday,
        consecutive_days: consecutiveDays,
        last_sign_in_at: userData.last_sign_in_at || null,
        today_points: getSignInReward(consecutiveDays + 1, pointRules),
    };
}

/**
 * 执行签到
 */
async function pointsSignIn(openid) {
    const user = await db.collection('users').where({ openid }).limit(1).get();
    if (!user.data || user.data.length === 0) throw new Error('用户不存在');

    const userData = user.data[0];
    const pointRules = await loadPointRules();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = getDateKey(today);

    const lastSignIn = userData.last_sign_in_at ? new Date(userData.last_sign_in_at) : null;
    if (userData.last_sign_in_date === todayKey || (lastSignIn && lastSignIn >= today)) {
        throw new Error('今日已签到');
    }

    // 计算连续签到天数
    let consecutiveDays = toNumber(userData.consecutive_sign_days, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (lastSignIn && lastSignIn >= yesterday) {
        consecutiveDays += 1;
    } else {
        consecutiveDays = 1;
    }

    const rewardPoints = getSignInReward(consecutiveDays, pointRules);

    // 发放积分：按 last_sign_in_date 做条件更新，避免多端并发重复领取。
    const signInUpdateRes = await db.collection('users').where({ openid, last_sign_in_date: _.neq(todayKey) }).update({
        data: {
            points: _.inc(rewardPoints),
            consecutive_sign_days: consecutiveDays,
            last_sign_in_at: db.serverDate(),
            last_sign_in_date: todayKey,
            updated_at: db.serverDate(),
        },
    });
    if (!signInUpdateRes.stats || signInUpdateRes.stats.updated === 0) {
        throw new Error('今日已签到');
    }

    // 记录日志
    try {
        await db.collection('point_logs').add({
            data: {
                openid,
                type: 'earn',
                amount: rewardPoints,
                source: 'sign_in',
                description: `签到奖励（连续${consecutiveDays}天）`,
                created_at: db.serverDate(),
            },
        });
    } catch (logErr) {
        const rollbackData = {
            points: _.inc(-rewardPoints),
            consecutive_sign_days: toNumber(userData.consecutive_sign_days, 0),
            last_sign_in_at: userData.last_sign_in_at || _.remove(),
            last_sign_in_date: userData.last_sign_in_date || _.remove(),
            updated_at: db.serverDate()
        };
        try {
            await db.collection('users')
                .where({ openid, last_sign_in_date: todayKey })
                .update({ data: rollbackData });
        } catch (rollbackErr) {
            console.error('[user-wallet] ⚠️ 签到回滚失败:', rollbackErr);
        }
        throw new Error(`签到流水写入失败：${logErr.message || '未知错误'}`);
    }

    return {
        success: true,
        points_earned: rewardPoints,
        consecutive_days: consecutiveDays,
    };
}

/**
 * 获取签到奖励积分（连续签到递增）
 */
function getSignInReward(day, pointRules = DEFAULT_POINT_RULES) {
    const safeDay = Math.max(1, Math.floor(toNumber(day, 1)));
    const basePoints = Math.max(0, toNumber(pointRules?.checkin?.points, DEFAULT_POINT_RULES.checkin.points));
    const streakDays = Math.max(1, Math.floor(toNumber(pointRules?.checkin_streak?.streak_days, DEFAULT_POINT_RULES.checkin_streak.streak_days)));
    const streakBonus = Math.max(0, toNumber(pointRules?.checkin_streak?.points, DEFAULT_POINT_RULES.checkin_streak.points));
    return basePoints + (safeDay % streakDays === 0 ? streakBonus : 0);
}

/**
 * 积分任务列表
 */
async function pointsTasks(openid) {
    const user = await db.collection('users').where({ openid }).limit(1).get();
    if (!user.data || user.data.length === 0) throw new Error('用户不存在');

    const userData = user.data[0];
    const pointRules = await loadPointRules();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastSignIn = userData.last_sign_in_at ? new Date(userData.last_sign_in_at) : null;
    const signedToday = lastSignIn && lastSignIn >= today;
    const roleLevel = toNumber(userData.role_level ?? userData.distributor_level ?? userData.level, 0);
    const orderPayPoints = Math.max(
        0,
        toNumber(pointRules.purchase_multiplier_by_role?.[roleLevel], DEFAULT_POINT_RULES.purchase_multiplier_by_role[String(roleLevel)] || 0)
    );
    const reviewPoints = Math.max(0, toNumber(pointRules.review.points, DEFAULT_POINT_RULES.review.points));
    const invitePoints = Math.max(0, toNumber(pointRules.invite_success.points, DEFAULT_POINT_RULES.invite_success.points));

    const tasks = [
        {
            id: 'sign_in',
            name: '每日签到',
            points: getSignInReward(toNumber(userData.consecutive_sign_days, 0) + 1, pointRules),
            completed: !!signedToday,
            daily: true
        },
        {
            id: 'order_pay',
            name: '下单支付',
            points: orderPayPoints,
            completed: false,
            daily: false,
            description: `每消费100元得${orderPayPoints}积分`
        },
        {
            id: 'review',
            name: '评价订单',
            points: reviewPoints,
            completed: false,
            daily: false,
            description: `评价一次得${reviewPoints}积分`
        }
    ];

    if (invitePoints > 0) {
        tasks.push({
            id: 'invite_success',
            name: '邀请新用户',
            points: invitePoints,
            completed: false,
            daily: false,
            description: `成功邀请新用户得${invitePoints}积分`
        });
    }

    return tasks;
}

/**
 * 积分日志
 */
async function pointsLogs(openid, params = {}) {
    let query = db.collection('point_logs').where({ openid });

    if (params.type) {
        query = query.where({ type: params.type });
    }

    const res = await query.orderBy('created_at', 'desc').limit(50).get().catch(() => ({ data: [] }));
    return res.data || [];
}

/**
 * 可用优惠券
 */
async function availableCoupons(openid, params = {}) {
    const minPurchase = toNumber(params.min_purchase != null ? params.min_purchase : params.amount, 0);
    const userIds = await getUserCouponIds(openid);
    const scopeContext = await buildCouponScopeContext(params);
    await reconcileLotteryCoupons(openid).catch(() => 0);

    const [openidRes, userIdRes] = await Promise.all([
        db.collection('user_coupons').where({ openid }).orderBy('expire_at', 'asc').limit(50).get().catch(() => ({ data: [] })),
        Promise.resolve({ data: await queryUserCouponsByUserIds(userIds) })
    ]);

    const map = {};
    (openidRes.data || []).concat(userIdRes.data || []).forEach((coupon) => {
        const key = String(coupon._id || coupon.id || `${coupon.user_id || coupon.openid || ''}:${coupon.coupon_id || ''}`);
        map[key] = coupon;
    });
    let coupons = await Promise.all(Object.keys(map).map((key) => normalizeCouponRecord(map[key])));
    coupons = coupons.filter((coupon) => coupon.status === 'unused');
    if (minPurchase > 0) {
        coupons = coupons.filter(c => toNumber(c.min_purchase, 0) <= minPurchase);
    }
    coupons = coupons.filter((coupon) => couponMatchesScope(coupon, scopeContext));

    return coupons.sort((a, b) => {
        const ta = a.expire_at ? new Date(a.expire_at).getTime() : 0;
        const tb = b.expire_at ? new Date(b.expire_at).getTime() : 0;
        return ta - tb;
    });
}

module.exports = {
    getWalletInfo,
    walletCommissions,
    pointsAccount,
    pointsSignInStatus,
    pointsSignIn,
    pointsTasks,
    pointsLogs,
    availableCoupons,
};
