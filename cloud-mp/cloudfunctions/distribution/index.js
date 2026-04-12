'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const {
    CloudBaseError, cloudFunctionWrapper
} = require('./shared/errors');
const {
    success, badRequest, unauthorized, forbidden, notFound, serverError
} = require('./shared/response');
const { toNumber, getAllRecords } = require('./shared/utils');

const db = cloud.database();
const _ = db.command;

// ==================== 子模块导入 ====================
const distributionQuery = require('./distribution-query');
const distributionCommission = require('./distribution-commission');
const internalActionToken = String(process.env.DISTRIBUTION_INTERNAL_TOKEN || '').trim();

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

function chunkArray(values = [], size = 100) {
    const out = [];
    for (let i = 0; i < values.length; i += size) {
        out.push(values.slice(i, i + size));
    }
    return out;
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
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

async function resolveCommissionWalletState(user = {}) {
    const agentWalletBalance = getAgentWalletBalance(user);
    const explicitCommission = hasExplicitCommissionBalance(user);
    const stats = await distributionCommission.getStats(user.openid);
    const derivedCommissionBalance = Math.max(0, roundMoney((stats.settled_commission || 0) - toNumber(user.total_withdrawn, 0)));
    const storedCommissionBalance = roundMoney(toNumber(user.commission_balance != null ? user.commission_balance : user.balance, 0));
    const shouldUseDerivedBalance = !explicitCommission || (storedCommissionBalance === 0 && derivedCommissionBalance > 0);
    const commissionBalance = shouldUseDerivedBalance ? derivedCommissionBalance : storedCommissionBalance;

    const updates = {};
    if (user.agent_wallet_balance == null) updates.agent_wallet_balance = agentWalletBalance;
    if (user.commission_balance == null || shouldUseDerivedBalance) updates.commission_balance = commissionBalance;
    if (user.balance == null || shouldUseDerivedBalance) updates.balance = commissionBalance;

    if (Object.keys(updates).length && user._id) {
        await db.collection('users').doc(String(user._id)).update({
            data: {
                ...updates,
                updated_at: db.serverDate()
            }
        }).catch(() => {});
        return { ...user, ...updates, _commission_balance: commissionBalance, _agent_wallet_balance: agentWalletBalance };
    }

    return { ...user, _commission_balance: commissionBalance, _agent_wallet_balance: agentWalletBalance };
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

function indirectRelationWhere(directMembers = []) {
    const clauses = [];
    const directOpenids = directMembers.map((item) => item.openid).filter(Boolean);
    if (directOpenids.length) clauses.push({ referrer_openid: _.in(directOpenids) });
    const ids = directMembers.flatMap(userRelationIds);
    if (ids.length) clauses.push({ parent_id: _.in(ids) });
    if (!clauses.length) return { referrer_openid: '__none__' };
    return clauses.length === 1 ? clauses[0] : _.or(clauses);
}

async function findUserByAnyId(id) {
    if (!hasValue(id)) return null;
    const stringId = String(id);
    const num = Number(stringId);
    const queries = [
        db.collection('users').doc(stringId).get().then((res) => ({ data: res.data ? [res.data] : [] })).catch(() => ({ data: [] }))
    ];
    if (Number.isFinite(num)) {
        queries.push(db.collection('users').where({ id: num }).limit(1).get().catch(() => ({ data: [] })));
    }
    queries.push(db.collection('users').where({ _legacy_id: stringId }).limit(1).get().catch(() => ({ data: [] })));
    const results = await Promise.all(queries);
    return results.flatMap((item) => item.data || [])[0] || null;
}

function isParentIdMatch(member = {}, ids = []) {
    if (!hasValue(member.parent_id)) return false;
    return ids.some((id) => String(id) === String(member.parent_id));
}

function resolveJoinedAt(member = {}) {
    return member.joined_team_at || member.bound_parent_at || member.created_at || null;
}

function normalizeTeamMember(member = {}, level = 1, extra = {}) {
    const nickname = member.nick_name || member.nickname || member.nickName || '团队成员';
    const avatar = member.avatar || member.avatar_url || member.avatarUrl || '';
    const roleLevel = toNumber(member.role_level, 0);
    return {
        _id: member._id,
        id: member._id,
        legacy_id: member.id || member._legacy_id || '',
        level,
        level_label: level === 2 ? '二级成员' : '一级成员',
        relation_text: level === 2 ? '由你的一级成员继续发展' : '你直接邀请并绑定的成员',
        openid: member.openid,
        nickName: nickname,
        nickname,
        nick_name: nickname,
        avatarUrl: avatar,
        avatar,
        avatar_url: avatar,
        joined_at: resolveJoinedAt(member),
        created_at: member.created_at,
        role_level: roleLevel,
        role_name: member.role_name || '',
        invite_code: member.my_invite_code || member.invite_code || '',
        phone: member.phone || '',
        total_sales: toNumber(member.total_spent || member.total_sales, 0),
        order_count: toNumber(member.order_count, 0),
        ...extra
    };
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

function resolveProductPrice(product = {}) {
    const legacyPrice = firstNumber([product.retail_price, product.price]);
    if (legacyPrice !== null) return legacyPrice;
    return centsToYuan(product.min_price, 0);
}

function resolveSkuPrice(sku = {}) {
    const legacyPrice = firstNumber([sku.retail_price]);
    if (legacyPrice !== null) return legacyPrice;
    return centsToYuan(sku.price, 0);
}

async function getProductById(id) {
    if (!hasValue(id)) return null;
    const num = toNumber(id, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('products').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('products').doc(String(id)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

async function getSkuById(id) {
    if (!hasValue(id)) return null;
    const num = toNumber(id, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('skus').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('skus').doc(String(id)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

function buildCommissionPreview(product = {}, baseAmount = 0) {
    const amount1 = toNumber(product.commission_amount_1, 0);
    const amount2 = toNumber(product.commission_amount_2, 0);
    const configuredRate1 = firstNumber([product.commission_rate_1, product.rate_1]);
    const configuredRate2 = firstNumber([product.commission_rate_2, product.rate_2]);
    const rate1 = configuredRate1 !== null ? configuredRate1 : 0.1;
    const rate2 = configuredRate2 !== null ? configuredRate2 : 0;
    const commission1 = amount1 > 0 ? amount1 : Math.round(baseAmount * rate1 * 100) / 100;
    const commission2 = amount2 > 0 ? amount2 : Math.round(baseAmount * rate2 * 100) / 100;
    return [
        { level: 1, rate: rate1, amount: commission1, label: '一级佣金' },
        { level: 2, rate: rate2, amount: commission2, label: '二级佣金' }
    ].filter((item) => item.amount > 0);
}

async function getEstimatedCommissionSummary(openid) {
    const emptySummary = {
        estimated_commission: 0,
        direct_estimated_commission: 0,
        indirect_estimated_commission: 0,
        pending_payment_orders: 0,
        direct_orders: 0,
        indirect_orders: 0
    };

    const userRes = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }));
    const currentUser = userRes.data && userRes.data[0];
    if (!currentUser) return emptySummary;

    const directMembers = await getAllRecords(db, 'users', directRelationWhere(currentUser)).catch(() => []);
    const indirectMembers = directMembers.length
        ? await getAllRecords(db, 'users', indirectRelationWhere(directMembers)).catch(() => [])
        : [];
    const candidateOpenids = uniqueValues(
        directMembers.concat(indirectMembers).map((item) => item && item.openid).filter(Boolean)
    );
    if (!candidateOpenids.length) return emptySummary;

    const orderGroups = await Promise.all(
        chunkArray(candidateOpenids, 100).map((batch) => getAllRecords(db, 'orders', {
            openid: _.in(batch),
            status: _.in(['pending_payment', 'pending'])
        }).catch(() => []))
    );
    const candidateOrders = orderGroups.flat().filter((order) => order && order._id && order.openid !== openid);
    if (!candidateOrders.length) return emptySummary;

    const existingCommissionGroups = await Promise.all(
        chunkArray(uniqueValues(candidateOrders.map((order) => order._id)), 100).map((batch) => getAllRecords(db, 'commissions', {
            openid,
            order_id: _.in(batch)
        }).catch(() => []))
    );
    const existingOrderIds = new Set(
        existingCommissionGroups
            .flat()
            .filter((row) => String(row.status || '') !== 'cancelled')
            .map((row) => String(row.order_id))
    );

    const summary = { ...emptySummary };
    for (const order of candidateOrders) {
        if (existingOrderIds.has(String(order._id))) continue;

        const calculated = await distributionCommission.calculateOrderCommissions(order);
        const rows = (calculated.rows || []).filter((row) => row.openid === openid);
        if (!rows.length) continue;

        let orderTotal = 0;
        let directTotal = 0;
        let indirectTotal = 0;
        rows.forEach((row) => {
            const amount = roundMoney(row.amount);
            orderTotal += amount;
            if (row.type === 'direct') directTotal += amount;
            else if (row.type === 'indirect') indirectTotal += amount;
        });

        orderTotal = roundMoney(orderTotal);
        directTotal = roundMoney(directTotal);
        indirectTotal = roundMoney(indirectTotal);
        if (orderTotal <= 0) continue;

        summary.pending_payment_orders += 1;
        summary.estimated_commission = roundMoney(summary.estimated_commission + orderTotal);
        summary.direct_estimated_commission = roundMoney(summary.direct_estimated_commission + directTotal);
        summary.indirect_estimated_commission = roundMoney(summary.indirect_estimated_commission + indirectTotal);
        if (directTotal > 0) summary.direct_orders += 1;
        if (indirectTotal > 0) summary.indirect_orders += 1;
    }

    return summary;
}

// ==================== 主处理函数 ====================
const asyncHandler = (handler) => async (...args) => {
    try {
        return await handler(...args);
    } catch (err) {
        if (err instanceof CloudBaseError) throw err;
        if (err && typeof err === 'object' && 'code' in err && 'success' in err && 'message' in err) throw err;
        throw serverError(err.message || '操作失败');
    }
};

const handleAction = {
    // ===== 中心/仪表板 =====
    'center': asyncHandler(async (openid) => {
        const dashboard = await distributionQuery.getDashboard(openid);
        return success(dashboard);
    }),

    'dashboard': asyncHandler(async (openid) => {
        const dashboard = await distributionQuery.getDashboard(openid);
        return success(dashboard);
    }),

    // ===== 佣金 =====
    'commLogs': asyncHandler(async (openid, params) => {
        const commissions = await distributionCommission.getCommissions(openid, params);
        return success({ list: commissions });
    }),

    'commission': asyncHandler(async (openid, params) => {
        const commissions = await distributionCommission.getCommissions(openid, params);
        return success({ list: commissions });
    }),

    'commissionPreview': asyncHandler(async (openid, params = {}) => {
        const quantity = Math.max(1, toNumber(params.quantity, 1));
        const product = await getProductById(params.product_id || params.id);
        const sku = await getSkuById(params.sku_id);
        const unitPrice = sku ? resolveSkuPrice(sku) : resolveProductPrice(product || {});
        const baseAmount = Math.round(unitPrice * quantity * 100) / 100;
        const commissions = product ? buildCommissionPreview(product, baseAmount) : [];
        const totalCommission = commissions.reduce((sum, item) => sum + toNumber(item.amount, 0), 0);
        return success({
            product_id: params.product_id || params.id || null,
            sku_id: params.sku_id || null,
            quantity,
            unit_price: unitPrice,
            base_amount: baseAmount,
            commissions,
            total_commission: Math.round(totalCommission * 100) / 100
        });
    }),

    'estimatedCommission': asyncHandler(async (openid) => {
        const summary = await getEstimatedCommissionSummary(openid);
        return success(summary);
    }),

    'stats': asyncHandler(async (openid) => {
        const dashboard = await distributionQuery.getDashboard(openid);
        return success(dashboard);
    }),

    'settleMatured': asyncHandler(async () => {
        throw forbidden('该接口已停用，请使用佣金冻结期 + 后台审批结算主链');
    }),

    // ===== 提现 =====
    'withdraw': asyncHandler(async (openid, params) => {
        const amount = toNumber(params.amount, 0);
        if (amount <= 0) throw badRequest('提现金额必须大于0');
        if (amount < 1) throw badRequest('最低提现1元');

        // 查询余额
        const userRes = await db.collection('users').where({ openid }).limit(1).get();
        if (!userRes.data || userRes.data.length === 0) throw notFound('用户不存在');

        const user = await resolveCommissionWalletState(userRes.data[0]);
        const balance = toNumber(user._commission_balance, 0);
        if (amount > balance) throw badRequest('佣金余额不足');

        const withdrawNo = 'WD' + Date.now() + Math.floor(Math.random() * 1000);

        // 条件扣减佣金余额（乐观锁：where commission_balance >= amount，防止并发超扣）
        const updateRes = await db.collection('users')
            .where({ openid, commission_balance: _.gte(amount) })
            .update({
                data: {
                    commission_balance: _.inc(-amount),
                    balance: _.inc(-amount),
                    total_withdrawn: _.inc(amount),
                    updated_at: db.serverDate()
                },
            });
        if (!updateRes.stats || updateRes.stats.updated === 0) {
            throw badRequest('余额不足或并发冲突，请稍后重试');
        }

        // 创建提现记录
        const result = await db.collection('withdrawals').add({
            data: {
                openid,
                withdraw_no: withdrawNo,
                amount,
                type: params.type || 'wechat',
                status: 'pending',
                created_at: db.serverDate(),
            },
        });

        // 记录钱包日志
        await db.collection('wallet_logs').add({
            data: {
                openid,
                type: 'withdraw',
                amount: -amount,
                withdraw_id: result._id,
                description: `提现${amount}元`,
                created_at: db.serverDate(),
            },
        });

        return success({ withdraw_id: result._id, withdraw_no: withdrawNo, amount });
    }),

    'withdrawList': asyncHandler(async (openid, params) => {
        const res = await db.collection('withdrawals')
            .where({ openid })
            .orderBy('created_at', 'desc')
            .limit(50)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 团队 =====
    'team': asyncHandler(async (openid, params) => {
        const page = toNumber(params && params.page, 1);
        const pageSize = toNumber(params && (params.pageSize || params.limit || params.size), 20);
        const level = params && params.level === 'indirect' ? 'indirect' : 'direct';

        const userRes = await db.collection('users').where({ openid }).limit(1).get();
        const currentUser = userRes.data && userRes.data[0] ? userRes.data[0] : { openid };
        let where = directRelationWhere(currentUser);
        if (level === 'indirect') {
            const directRes = await db.collection('users')
                .where(directRelationWhere(currentUser))
                .limit(100)
                .get()
                .catch(() => ({ data: [] }));
            where = indirectRelationWhere(directRes.data || []);
        }

        const teamRes = await db.collection('users')
            .where(where)
            .orderBy('created_at', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get().catch(() => ({ data: [] }));

        const totalRes = await db.collection('users')
            .where(where)
            .count().catch(() => ({ total: 0 }));

        return success({
            list: (teamRes.data || []).map(m => ({
                _id: m._id,
                id: m._id,
                level: level === 'indirect' ? 2 : 1,
                openid: m.openid,
                nickName: m.nickName || m.nickname || '新用户',
                nickname: m.nickname || m.nickName || '新用户',
                avatarUrl: m.avatarUrl || m.avatar_url || '',
                avatar: m.avatar || m.avatarUrl || m.avatar_url || '',
                avatar_url: m.avatar_url || m.avatarUrl || m.avatar || '',
                nick_name: m.nick_name || m.nickname || m.nickName || '新用户',
                joined_at: resolveJoinedAt(m),
                created_at: m.created_at,
                role_level: toNumber(m.role_level, 0),
                role_name: m.role_name || '普通用户',
                invite_code: m.my_invite_code || m.invite_code || '',
                phone: m.phone || '',
                total_sales: toNumber(m.total_spent || m.total_sales, 0),
                order_count: toNumber(m.order_count, 0),
            })),
            total: totalRes.total || 0,
            page,
            pageSize,
        });
    }),

    'teamDetail': asyncHandler(async (openid, params) => {
        const memberId = params.member_id || params.id;
        if (!memberId) throw badRequest('缺少成员 ID');

        const userRes = await db.collection('users').where({ openid }).limit(1).get();
        const currentUser = userRes.data && userRes.data[0] ? userRes.data[0] : { openid };
        const memberData = await findUserByAnyId(memberId);
        if (!memberData) {
            throw notFound('团队成员不存在');
        }

        const currentIds = userRelationIds(currentUser);
        let level = 0;
        if (memberData.referrer_openid === openid || isParentIdMatch(memberData, currentIds)) {
            level = 1;
        } else {
            const directRes = await db.collection('users')
                .where(directRelationWhere(currentUser))
                .limit(100)
                .get()
                .catch(() => ({ data: [] }));
            const directMembers = directRes.data || [];
            const directOpenids = directMembers.map((item) => item.openid).filter(Boolean);
            const directIds = directMembers.flatMap(userRelationIds);
            if ((memberData.referrer_openid && directOpenids.includes(memberData.referrer_openid)) || isParentIdMatch(memberData, directIds)) {
                level = 2;
            }
        }

        if (!level) throw notFound('团队成员不存在');

        // 查该成员贡献的佣金
        const commRes = await getAllRecords(db, 'commissions', { openid, from_openid: memberData.openid }).catch(() => []);

        let contributedAmount = 0;
        (commRes || []).forEach(c => { contributedAmount += toNumber(c.amount, 0); });

        return success(normalizeTeamMember(memberData, level, {
            contributed_amount: contributedAmount
        }));
    }),

    // ===== 代理/团长 =====
    'agentWorkbench': asyncHandler(async (openid) => {
        const dashboard = await distributionQuery.getDashboard(openid);
        return success(dashboard);
    }),

    'agentOrders': asyncHandler(async (openid, params) => {
        const res = await db.collection('orders')
            .where({ referrer_openid: openid })
            .orderBy('created_at', 'desc')
            .limit(50)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    'agentRestock': asyncHandler(async (openid, params) => {
        // 代理补货（简单记录）
        return success({ success: true, message: '补货申请已提交' });
    }),

    'agentWallet': asyncHandler(async (openid) => {
        const userRes = await db.collection('users').where({ openid }).limit(1).get();
        if (!userRes.data || userRes.data.length === 0) throw notFound('用户不存在');
        const user = await resolveCommissionWalletState(userRes.data[0]);
        return success({
            balance: toNumber(user._agent_wallet_balance, 0),
            agent_wallet_balance: toNumber(user._agent_wallet_balance, 0),
            commission_balance: toNumber(user._commission_balance, 0),
            total_earned: toNumber(user.total_earned, 0),
            total_withdrawn: toNumber(user.total_withdrawn, 0),
        });
    }),

    // 货款余额查询（用于订单确认页展示是否可以使用货款支付）
    'agentGoodsFund': asyncHandler(async (openid) => {
        const userRes = await db.collection('users').where({ openid }).limit(1).get();
        if (!userRes.data || userRes.data.length === 0) throw notFound('用户不存在');
        const u = userRes.data[0];
        const balance = toNumber(u.agent_wallet_balance != null ? u.agent_wallet_balance : u.wallet_balance, 0);
        return success({ balance, agent_wallet_balance: balance });
    }),

    'agentWalletLogs': asyncHandler(async (openid, params) => {
        const res = await db.collection('wallet_logs')
            .where({ openid })
            .orderBy('created_at', 'desc')
            .limit(50)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    'agentWalletRechargeConfig': asyncHandler(async (openid) => {
        const configRes = await db.collection('wallet_recharge_configs')
            .where({ is_active: true })
            .orderBy('sort_order', 'asc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        if (configRes.data && configRes.data.length) {
            return success({
                options: configRes.data.map((item) => ({
                    id: item._id,
                    title: item.title || `充值${toNumber(item.amount, 0)}元`,
                    amount: toNumber(item.amount, 0),
                    bonus: toNumber(item.bonus_amount != null ? item.bonus_amount : item.bonus, 0),
                    sort_order: toNumber(item.sort_order, 0)
                }))
            });
        }
        return success({
            options: [
                { amount: 100, bonus: 5 },
                { amount: 500, bonus: 30 },
                { amount: 1000, bonus: 80 },
            ],
        });
    }),

    'agentWalletPrepay': asyncHandler(async (openid, params) => {
        const wxPay = require('./wechat-pay-v3');

        let rechargeId, orderNo, amount;

        // 支持两种调用方式：
        // 1. 传 recharge_order_id → 对已有充值单重新发起支付
        // 2. 传 amount → 新建充值单并发起支付
        if (params.recharge_order_id || params.id) {
            const rid = params.recharge_order_id || params.id;
            const existingRes = await db.collection('wallet_recharge_orders').doc(rid).get().catch(() => ({ data: null }));
            if (!existingRes.data || existingRes.data.openid !== openid) throw notFound('充值订单不存在');
            if (existingRes.data.status === 'paid') {
                return success({ recharge_id: rid, order_no: existingRes.data.order_no, amount: existingRes.data.amount, already_paid: true });
            }
            rechargeId = rid;
            orderNo = existingRes.data.order_no;
            amount = toNumber(existingRes.data.amount, 0);
        } else {
            amount = toNumber(params.amount, 0);
            if (amount <= 0) throw badRequest('充值金额必须大于0');
            orderNo = 'RCH' + Date.now();
            const result = await db.collection('wallet_recharge_orders').add({
                data: { openid, order_no: orderNo, amount, status: 'pending', created_at: db.serverDate() },
            });
            rechargeId = result._id;
        }

        const amountInFen = Math.round(amount * 100);
        if (amountInFen <= 0) throw badRequest('充值金额无效');

        const privateKey = await wxPay.loadPrivateKey(cloud);
        const wxResult = await wxPay.jsapiOrder(openid, orderNo, amountInFen, '货款余额充值', privateKey);
        if (!wxResult.prepay_id) {
            throw serverError('微信支付下单失败: ' + (wxResult.message || '未返回prepay_id'));
        }

        const payParams = wxPay.buildMiniPayParams(wxResult.prepay_id, privateKey);

        await db.collection('wallet_recharge_orders').doc(rechargeId).update({
            data: { prepay_id: wxResult.prepay_id, updated_at: db.serverDate() },
        }).catch(() => {});

        return success({
            recharge_id: rechargeId,
            order_no: orderNo,
            amount,
            ...payParams,
        });
    }),

    'agentWalletRechargeOrderDetail': asyncHandler(async (openid, params) => {
        const id = params.recharge_order_id || params.id;
        if (!id) throw badRequest('缺少订单 ID');
        const orderRes = await db.collection('wallet_recharge_orders').doc(id).get().catch(() => ({ data: null }));
        if (!orderRes.data || orderRes.data.openid !== openid) throw notFound('订单不存在');
        const order = orderRes.data;

        // 计算超时（10分钟有效）
        const createdAt = order.created_at instanceof Date ? order.created_at : new Date(order.created_at);
        const expireMs = 10 * 60 * 1000;
        const expiresAt = new Date(createdAt.getTime() + expireMs);
        const now = Date.now();
        const secondsRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000));

        return success({
            ...order,
            can_continue_pay: order.status === 'pending' && secondsRemaining > 0,
            seconds_remaining: secondsRemaining,
            expires_at: expiresAt.toISOString(),
        });
    }),

    // ===== 邀请码 =====
    'wxacodeInvite': asyncHandler(async (openid, params) => {
        const user = await db.collection('users').where({ openid }).limit(1).get();
        if (!user.data || user.data.length === 0) throw notFound('用户不存在');
        const inviteCode = user.data[0].my_invite_code || user.data[0].invite_code || '';
        const scene = params && params.scene ? String(params.scene) : (inviteCode || openid.slice(-8));
        const page = (params && params.page) || 'pages/index/index';
        const width = toNumber((params && params.width) || 280, 280);

        // 尝试生成小程序码（需要 openapi.wxacode.getUnlimited 权限）
        try {
            const res = await cloud.openapi.wxacode.getUnlimited({
                scene,
                page,
                width,
                is_hyaline: false  // 白底，避免 canvas drawImage 透明渲染异常
            });
            // res.buffer 是 ArrayBuffer / Buffer，转为 base64
            const buf = res.buffer;
            if (!buf || (buf.byteLength === 0 && !Buffer.isBuffer(buf))) {
                console.warn('[wxacodeInvite] buffer 为空');
                return success({ invite_code: inviteCode, wxacode_base64: null, error: 'empty_buffer' });
            }
            const base64 = Buffer.isBuffer(buf)
                ? buf.toString('base64')
                : Buffer.from(buf).toString('base64');
            return success({ invite_code: inviteCode, wxacode_base64: base64 });
        } catch (wxacodeErr) {
            console.warn('[wxacodeInvite] 生成小程序码失败:', wxacodeErr.errCode || wxacodeErr.message);
            return success({ invite_code: inviteCode, wxacode_base64: null, error: wxacodeErr.message || 'wxacode_failed' });
        }
    }),

    // ===== 佣金管理（供其他云函数调用） =====
    'createCommissions': asyncHandler(async (openid, params) => {
        const { referrer_openid, from_openid, order_id, order_no, pay_amount, rate } = params;
        if (!referrer_openid || !from_openid || !order_id) {
            throw badRequest('缺少必要参数');
        }
        const result = await distributionCommission.createCommissions(
            referrer_openid, from_openid, order_id, order_no, toNumber(pay_amount, 0), toNumber(rate, 0.10)
        );
        return success(result);
    }),

    'unfreezeCommissions': asyncHandler(async (openid, params) => {
        const orderId = params.order_id;
        if (!orderId) throw badRequest('缺少订单 ID');
        const result = await distributionCommission.unfreezeCommissions(orderId);
        return success(result);
    }),

    'cancelCommissions': asyncHandler(async (openid, params) => {
        const orderId = params.order_id;
        if (!orderId) throw badRequest('缺少订单 ID');
        const result = await distributionCommission.cancelCommissions(orderId);
        return success(result);
    }),
};

// ==================== 云函数导出 ====================
exports.main = cloudFunctionWrapper(async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    if (!openid) {
        throw unauthorized('未登录');
    }

    // action 必须在任何使用前先声明
    const { action } = event;

    const internalActions = new Set(['createCommissions', 'unfreezeCommissions', 'cancelCommissions']);
    if (internalActions.has(action)) {
        const providedToken = String(event.internal_token || '').trim();
        if (!internalActionToken || providedToken !== internalActionToken) {
            throw forbidden('内部佣金接口禁止直接访问');
        }
    }

    // 查看类 action：非分销员也可访问（返回基础数据）
    const viewActions = ['center', 'dashboard', 'wxacodeInvite', 'agentWorkbench', 'stats', 'team', 'teamDetail', 'commissionPreview', 'estimatedCommission'];

    if (!viewActions.includes(action)) {
        // 写操作需要分销权限
        const user = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }));
        const userDoc = user.data && user.data[0];
        if (!userDoc || (!userDoc.distributor_level && !userDoc.agent_level)) {
            throw forbidden('您没有分销权限');
        }
    }

    const handler = handleAction[action];
    if (!handler) {
        throw badRequest(`未知 action: ${action}`);
    }

    const { action: _, ...params } = event;
    return handler(openid, params);
});
