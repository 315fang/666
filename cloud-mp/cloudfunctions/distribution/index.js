'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const {
    CloudBaseError, cloudFunctionWrapper, withTransientDbReadRetry
} = require('./shared/errors');
const {
    success, badRequest, unauthorized, forbidden, notFound, serverError
} = require('./shared/response');
const { toNumber, getAllRecords } = require('./shared/utils');
const {
    buildCanonicalUser,
    resolveRoleLevel,
    resolveRoleName,
    resolveCommissionBalance,
    resolveGoodsFundBalance
} = require('./user-contract');

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

function goodsFundIdentityCandidates(user = {}, openid = '') {
    const values = [openid, user.id, user._id, user._legacy_id].filter(hasValue);
    return uniqueValues(values);
}

function goodsFundLogTypeText(type = '') {
    return String(type || '').trim().toLowerCase();
}

function isGoodsFundInflow(type = '', amount = 0) {
    const normalized = goodsFundLogTypeText(type);
    if (['recharge', 'manual_recharge', 'refund', 'commission_transfer', 'n_allocate_in', 'wx_recharge'].includes(normalized)) {
        return true;
    }
    if (['spend', 'deduct', 'manual_deduct', 'order_ship', 'n_allocate_out', 'adjust', 'refund_reopen_reversal'].includes(normalized)) {
        return false;
    }
    return amount > 0;
}

async function summarizeGoodsFundLogs(openid) {
    const rows = await getAllRecords(db, 'goods_fund_logs', { openid }).catch(() => []);
    const summary = {
        total_recharge: 0,
        total_deduct: 0,
        frozen_balance: 0
    };

    rows.forEach((row) => {
        const amount = roundMoney(Math.abs(toNumber(row.amount, 0)));
        if (amount <= 0) return;
        if (isGoodsFundInflow(row.type, toNumber(row.amount, 0))) {
            summary.total_recharge += amount;
            return;
        }
        summary.total_deduct += amount;
    });

    return {
        total_recharge: roundMoney(summary.total_recharge),
        total_deduct: roundMoney(summary.total_deduct),
        frozen_balance: roundMoney(summary.frozen_balance)
    };
}

async function getWalletAccount(user = {}, openid = '') {
    const ids = goodsFundIdentityCandidates(user, openid);
    for (const id of ids) {
        const res = await db.collection('wallet_accounts')
            .where({ user_id: id })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (res.data && res.data[0]) return res.data[0];
    }
    return null;
}

async function listUnifiedGoodsFundLogs(user = {}, openid = '') {
    const ids = goodsFundIdentityCandidates(user, openid);
    const [legacyLogs, cloudLogs] = await Promise.all([
        Promise.all(ids.map((id) => db.collection('wallet_logs').where({ user_id: id }).limit(200).get().catch(() => ({ data: [] })))),
        db.collection('goods_fund_logs').where({ openid }).limit(200).get().catch(() => ({ data: [] }))
    ]);

    const map = {};
    legacyLogs.flatMap((result) => result.data || []).forEach((row) => {
        map[`wallet_logs:${row._id || row.id || `${row.user_id}:${row.ref_id || ''}:${row.created_at || ''}`}`] = {
            ...row,
            type: row.change_type || row.type || '',
            source_collection: 'wallet_logs'
        };
    });
    (cloudLogs.data || []).forEach((row) => {
        map[`goods_fund_logs:${row._id || `${row.openid}:${row.order_id || ''}:${row.created_at || ''}`}`] = {
            ...row,
            type: row.type || row.change_type || '',
            source_collection: 'goods_fund_logs'
        };
    });

    return Object.values(map).sort((left, right) => {
        const leftTime = new Date(left.created_at || 0).getTime();
        const rightTime = new Date(right.created_at || 0).getTime();
        return rightTime - leftTime;
    });
}

async function appendWalletLog(entry) {
    return db.collection('wallet_logs').add({
        data: {
            ...entry,
            created_at: entry.created_at || db.serverDate()
        }
    });
}

async function appendGoodsFundLog(entry) {
    return db.collection('goods_fund_logs').add({
        data: {
            ...entry,
            created_at: entry.created_at || db.serverDate()
        }
    });
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
    const canonical = buildCanonicalUser(member);
    const roleLevel = resolveRoleLevel(member);
    return {
        ...canonical,
        _id: canonical.id,
        id: canonical.id,
        legacy_id: member.id || member._legacy_id || '',
        level,
        level_label: level === 2 ? '二级成员' : '一级成员',
        relation_text: level === 2 ? '由你的一级成员继续发展' : '你直接邀请并绑定的成员',
        joined_at: resolveJoinedAt(member),
        created_at: member.created_at,
        role_level: roleLevel,
        role_name: resolveRoleName(member),
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

    const rows = await distributionCommission.getCommissions(openid).catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return emptySummary;

    const summary = { ...emptySummary };
    const countedOrderKeys = new Set();

    rows.forEach((row) => {
        if (String(row?.status || '').trim().toLowerCase() !== 'pending') return;
        const amount = roundMoney(row.amount);
        if (amount <= 0) return;

        const orderKey = String(row.order_id || row.order_no || row._id || '');
        const type = String(row.type || '').trim().toLowerCase();

        if (orderKey && !countedOrderKeys.has(orderKey)) {
            countedOrderKeys.add(orderKey);
            summary.pending_payment_orders += 1;
        }

        summary.estimated_commission = roundMoney(summary.estimated_commission + amount);
        if (type === 'direct') {
            summary.direct_estimated_commission = roundMoney(summary.direct_estimated_commission + amount);
            summary.direct_orders += 1;
        } else if (type === 'indirect') {
            summary.indirect_estimated_commission = roundMoney(summary.indirect_estimated_commission + amount);
            summary.indirect_orders += 1;
        }
    });

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
        const now = new Date();
        // 查找已过退款期限的冻结佣金（refund_deadline < now 且状态为 frozen）
        const frozenRes = await db.collection('commissions')
            .where({ status: 'frozen', refund_deadline: _.lt(now) })
            .limit(200)
            .get().catch(() => ({ data: [] }));
        // 同时处理旧流程 pending_approval 状态的佣金（兼容历史数据）
        const pendingRes = await db.collection('commissions')
            .where({ status: 'pending_approval', refund_deadline: _.lt(now) })
            .limit(200)
            .get().catch(() => ({ data: [] }));
        const allComms = [...(frozenRes.data || []), ...(pendingRes.data || [])];
        let settledCount = 0;
        let totalAmount = 0;
        for (const comm of allComms) {
            const amount = toNumber(comm.amount, 0);
            await db.collection('commissions').doc(comm._id).update({
                data: { status: 'settled', settled_at: db.serverDate(), updated_at: db.serverDate() }
            }).catch(() => {});
            if (amount > 0) {
                await distributionCommission.settleCommission(comm.openid, amount, {
                    order_id: comm.order_id,
                    order_no: comm.order_no,
                    type: comm.type,
                    level: comm.level
                });
                totalAmount += amount;
            }
            settledCount++;
        }
        return success({ settled: settledCount, total_amount: totalAmount });
    }),

    // ===== 提现 =====
    'withdraw': asyncHandler(async (openid, params) => {
        const amount = toNumber(params.amount, 0);
        if (amount <= 0) throw badRequest('提现金额必须大于0');

        const userRes = await db.collection('users').where({ openid }).limit(1).get();
        if (!userRes.data || userRes.data.length === 0) throw notFound('用户不存在');

        const user = await resolveCommissionWalletState(userRes.data[0]);
        const balance = toNumber(user._commission_balance, 0);
        const roleLevel = toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);

        // B1(3) 及以下：100元起提，3%税费（封顶100元）
        // B2(4) 及以上：免手续费（需人工审核资质）
        let fee = 0;
        if (roleLevel < 4) {
            if (amount < 100) throw badRequest('最低提现100元');
            fee = Math.min(roundMoney(amount * 0.03), 100);
        } else {
            if (amount < 1) throw badRequest('提现金额必须大于0');
        }

        const actualAmount = roundMoney(amount - fee);
        if (amount > balance) throw badRequest('佣金余额不足');

        const withdrawNo = 'WD' + Date.now() + Math.floor(Math.random() * 1000);

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

        const result = await db.collection('withdrawals').add({
            data: {
                openid,
                withdraw_no: withdrawNo,
                amount,
                fee,
                actual_amount: actualAmount,
                role_level: roleLevel,
                type: params.type || 'wechat',
                status: 'pending',
                created_at: db.serverDate(),
            },
        });

        const feeDesc = fee > 0 ? `（手续费${fee}元，到账${actualAmount}元）` : '';
        try {
            await appendWalletLog({
                openid,
                type: 'withdraw',
                amount: -amount,
                fee,
                actual_amount: actualAmount,
                withdraw_id: result._id,
                description: `提现${amount}元${feeDesc}`,
            });
        } catch (logErr) {
            await db.collection('users')
                .where({ openid })
                .update({
                    data: {
                        commission_balance: _.inc(amount),
                        balance: _.inc(amount),
                        total_withdrawn: _.inc(-amount),
                        updated_at: db.serverDate()
                    }
                })
                .catch(() => {});
            await db.collection('withdrawals').doc(String(result._id)).remove().catch(() => {});
            throw serverError(`提现流水写入失败：${logErr.message}`);
        }

        return success({ withdraw_id: result._id, withdraw_no: withdrawNo, amount, fee, actual_amount: actualAmount });
    }),

    'withdrawList': asyncHandler(async (openid, params) => {
        const res = await db.collection('withdrawals')
            .where({ openid })
            .orderBy('created_at', 'desc')
            .limit(50)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 佣金 1:1 转货款 =====
    'commissionToGoodsFund': asyncHandler(async (openid, params) => {
        const amount = toNumber(params.amount, 0);
        if (amount <= 0) throw badRequest('转入金额必须大于0');
        if (amount < 1) throw badRequest('最低转入1元');

        const userRes = await db.collection('users').where({ openid }).limit(1).get();
        if (!userRes.data || userRes.data.length === 0) throw notFound('用户不存在');

        const user = await resolveCommissionWalletState(userRes.data[0]);
        const balance = toNumber(user._commission_balance, 0);
        if (amount > balance) throw badRequest('佣金余额不足');

        const updateRes = await db.collection('users')
            .where({ openid, commission_balance: _.gte(amount) })
            .update({
                data: {
                    commission_balance: _.inc(-amount),
                    balance: _.inc(-amount),
                    agent_wallet_balance: _.inc(amount),
                    updated_at: db.serverDate()
                },
            });
        if (!updateRes.stats || updateRes.stats.updated === 0) {
            throw badRequest('余额不足或并发冲突，请稍后重试');
        }

        const transferNo = 'CT' + Date.now() + Math.floor(Math.random() * 1000);

        try {
            await Promise.all([
                appendWalletLog({
                    openid,
                    type: 'commission_transfer',
                    amount: -amount,
                    transfer_no: transferNo,
                    description: `佣金转货款${amount}元`,
                }),
                appendGoodsFundLog({
                    openid,
                    type: 'commission_transfer',
                    amount,
                    transfer_no: transferNo,
                    description: `佣金转入货款${amount}元`,
                })
            ]);
        } catch (logErr) {
            await db.collection('users')
                .where({ openid })
                .update({
                    data: {
                        commission_balance: _.inc(amount),
                        balance: _.inc(amount),
                        agent_wallet_balance: _.inc(-amount),
                        updated_at: db.serverDate()
                    }
                })
                .catch(() => {});
            throw serverError(`佣金转货款流水写入失败：${logErr.message}`);
        }

        return success({ transfer_no: transferNo, amount });
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
            list: (teamRes.data || []).map((member) => normalizeTeamMember(member, level === 'indirect' ? 2 : 1)),
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

    'agentWallet': asyncHandler(async (openid) => {
        const userRes = await withTransientDbReadRetry(
            () => db.collection('users').where({ openid }).limit(1).get(),
            { action: 'agentWallet', openid }
        );
        if (!userRes.data || userRes.data.length === 0) throw notFound('用户不存在');
        const baseUser = userRes.data[0];
        const userStateResult = resolveCommissionWalletState(baseUser).catch((error) => {
            console.error('[distribution.agentWallet] resolveCommissionWalletState 失败:', error && error.message ? error.message : error);
            return null;
        });
        const goodsFundSummaryResult = withTransientDbReadRetry(
            () => summarizeGoodsFundLogs(openid),
            { action: 'agentWallet.goodsFundSummary', openid }
        ).catch((error) => {
            console.error('[distribution.agentWallet] summarizeGoodsFundLogs 失败:', error && error.message ? error.message : error);
            return null;
        });
        const walletAccountResult = withTransientDbReadRetry(
            () => getWalletAccount(baseUser, openid),
            { action: 'agentWallet.walletAccount', openid }
        ).catch((error) => {
            console.error('[distribution.agentWallet] getWalletAccount 失败:', error && error.message ? error.message : error);
            return null;
        });

        const [userState, goodsFundSummary, walletAccount] = await Promise.all([
            userStateResult,
            goodsFundSummaryResult,
            walletAccountResult
        ]);
        const user = userState || baseUser;
        const summary = goodsFundSummary || {
            total_recharge: 0,
            total_deduct: 0,
            frozen_balance: 0
        };
        const roleLevel = toNumber(user.role_level, 0);
        const goodsFundBalance = walletAccount
            ? roundMoney(toNumber(walletAccount.balance, 0))
            : resolveGoodsFundBalance(user);
        return success({
            role_level: roleLevel,
            role_name: resolveRoleName(user),
            balance: goodsFundBalance,
            goods_fund_balance: goodsFundBalance,
            agent_wallet_balance: goodsFundBalance,
            frozen_balance: walletAccount ? roundMoney(toNumber(walletAccount.frozen_balance, 0)) : summary.frozen_balance,
            total_recharge: walletAccount ? roundMoney(toNumber(walletAccount.total_recharge, 0)) : summary.total_recharge,
            total_deduct: walletAccount ? roundMoney(toNumber(walletAccount.total_deduct, 0)) : summary.total_deduct,
            commission_balance: resolveCommissionBalance(user),
            total_earned: toNumber(user.total_earned, 0),
            total_withdrawn: toNumber(user.total_withdrawn, 0),
        });
    }),

    // 货款余额查询（用于订单确认页展示是否可以使用货款支付）
    'agentGoodsFund': asyncHandler(async (openid) => {
        const userRes = await withTransientDbReadRetry(
            () => db.collection('users').where({ openid }).limit(1).get(),
            { action: 'agentGoodsFund', openid }
        );
        if (!userRes.data || userRes.data.length === 0) throw notFound('用户不存在');
        const u = userRes.data[0];
        const balance = resolveGoodsFundBalance(u);
        return success({ balance, goods_fund_balance: balance, agent_wallet_balance: balance });
    }),

    // ===== 晋升进度 =====
    'promotionProgress': asyncHandler(async (openid) => {
        const userRes = await db.collection('users').where({ openid }).limit(1).get();
        if (!userRes.data || userRes.data.length === 0) throw notFound('用户不存在');
        const user = userRes.data[0];
        const currentLevel = toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
        const totalSpent = toNumber(user.total_spent ?? user.growth_value, 0);

        // 查直属下级
        const clauses = [];
        if (user.openid) clauses.push({ referrer_openid: user.openid });
        const ids = [user.openid, user.id, user._legacy_id, user._id].filter(v => v != null && v !== '');
        if (ids.length) clauses.push({ parent_id: _.in(ids) });
        const directRes = clauses.length > 0
            ? await db.collection('users').where(clauses.length === 1 ? clauses[0] : _.or(clauses)).limit(200).get().catch(() => ({ data: [] }))
            : { data: [] };
        const directMembers = directRes.data || [];

        const c1Count = directMembers.filter(m => toNumber(m.role_level ?? m.distributor_level, 0) >= 1).length;
        const b1Count = directMembers.filter(m => toNumber(m.role_level ?? m.distributor_level, 0) >= 3).length;
        const b2Count = directMembers.filter(m => toNumber(m.role_level ?? m.distributor_level, 0) >= 4).length;

        const rechargeRes = await db.collection('wallet_recharge_orders')
            .where({ openid, status: _.in(['paid', 'completed', 'success']) })
            .limit(200).get().catch(() => ({ data: [] }));
        const rechargeTotal = (rechargeRes.data || []).reduce((s, r) => s + toNumber(r.amount, 0), 0);

        const ROLE_NAMES = { 0: 'VIP会员', 1: '初级会员 C1', 2: '高级会员 C2', 3: '推广合伙人 B1', 4: '运营合伙人 B2', 5: '区域合伙人 B3' };
        const nextLevel = Math.min(currentLevel + 1, 5);
        const conditions = [];
        if (nextLevel === 1) {
            conditions.push({ type: 'spend', label: '消费满299元', current: totalSpent, target: 299, met: totalSpent >= 299 });
        } else if (nextLevel === 2) {
            conditions.push({ type: 'spend', label: '销售额超580元', current: totalSpent, target: 580, met: totalSpent >= 580 });
            conditions.push({ type: 'referral', label: '直推2个C1', current: c1Count, target: 2, met: c1Count >= 2 });
        } else if (nextLevel === 3) {
            conditions.push({ type: 'referral', label: '推荐10个C1', current: c1Count, target: 10, met: c1Count >= 10 });
            conditions.push({ type: 'recharge', label: '充值3000元', current: rechargeTotal, target: 3000, met: rechargeTotal >= 3000 });
        } else if (nextLevel === 4) {
            conditions.push({ type: 'referral', label: '推荐10个B1', current: b1Count, target: 10, met: b1Count >= 10 });
            conditions.push({ type: 'recharge', label: '充值30000元', current: rechargeTotal, target: 30000, met: rechargeTotal >= 30000 });
        } else if (nextLevel === 5) {
            conditions.push({ type: 'referral', label: '推荐3个B2', current: b2Count, target: 3, met: b2Count >= 3 });
            conditions.push({ type: 'referral', label: '推荐30个B1', current: b1Count, target: 30, met: b1Count >= 30 });
            conditions.push({ type: 'recharge', label: '充值198000元', current: rechargeTotal, target: 198000, met: rechargeTotal >= 198000 });
        }

        return success({
            current_level: currentLevel,
            current_name: ROLE_NAMES[currentLevel] || '普通用户',
            next_level: currentLevel >= 5 ? null : nextLevel,
            next_name: currentLevel >= 5 ? null : (ROLE_NAMES[nextLevel] || ''),
            conditions,
            stats: { total_spent: totalSpent, recharge_total: rechargeTotal, c1_count: c1Count, b1_count: b1Count, b2_count: b2Count }
        });
    }),

    // ===== 晋升日志 =====
    'promotionLogs': asyncHandler(async (openid) => {
        const res = await db.collection('promotion_logs')
            .where({ openid })
            .orderBy('promoted_at', 'desc')
            .limit(50)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 我的基金池汇总 =====
    'myFundPoolSummary': asyncHandler(async (openid) => {
        const [logs, configRes] = await Promise.all([
            db.collection('fund_pool_logs')
                .where({ openid })
                .orderBy('created_at', 'desc')
                .limit(200)
                .get()
                .catch(() => ({ data: [] })),
            db.collection('configs')
                .where(_.or([{ key: 'agent_system_fund-pool' }, { config_key: 'agent_system_fund-pool' }]))
                .limit(1)
                .get()
                .catch(() => ({ data: [] }))
        ]);

        const entries = logs.data || [];
        const fundPoolRow = (configRes.data && configRes.data[0]) || {};
        let totalContribution = 0;
        const mySubTotals = {
            mirror_ops: 0,
            travel: 0,
            parent: 0,
            personal: 0
        };

        entries.forEach((entry) => {
            totalContribution += toNumber(entry.amount, 0);
            const subAmounts = entry.sub_amounts || {};
            mySubTotals.mirror_ops += toNumber(subAmounts.mirror_ops, 0);
            mySubTotals.travel += toNumber(subAmounts.travel, 0);
            mySubTotals.parent += toNumber(subAmounts.parent, 0);
            mySubTotals.personal += toNumber(subAmounts.personal, 0);
        });

        let fundPoolConfig = fundPoolRow.config_value !== undefined ? fundPoolRow.config_value : fundPoolRow.value;
        if (typeof fundPoolConfig === 'string') {
            try {
                fundPoolConfig = JSON.parse(fundPoolConfig);
            } catch (_) {
                fundPoolConfig = {};
            }
        }

        const currentBalance = roundMoney(toNumber(fundPoolRow.balance, 0));
        const totalIn = roundMoney(toNumber(fundPoolRow.total_in, currentBalance));
        const totalOut = roundMoney(Math.max(0, totalIn - currentBalance));

        return success({
            total_contribution: roundMoney(totalContribution),
            my_sub_totals: {
                mirror_ops: roundMoney(mySubTotals.mirror_ops),
                travel: roundMoney(mySubTotals.travel),
                parent: roundMoney(mySubTotals.parent),
                personal: roundMoney(mySubTotals.personal)
            },
            pool_overview: {
                enabled: !!(fundPoolConfig && typeof fundPoolConfig === 'object' ? fundPoolConfig.enabled : fundPoolRow.enabled),
                current_balance: currentBalance,
                total_in: totalIn,
                total_out: totalOut,
                sub_balances: {
                    mirror_ops: roundMoney(toNumber(fundPoolRow.sub_mirror_ops, 0)),
                    travel: roundMoney(toNumber(fundPoolRow.sub_travel, 0)),
                    parent: roundMoney(toNumber(fundPoolRow.sub_parent, 0)),
                    personal: roundMoney(toNumber(fundPoolRow.sub_personal, 0))
                }
            },
            entries: entries.slice(0, 20),
            count: entries.length
        });
    }),

    'agentWalletLogs': asyncHandler(async (openid, params) => {
        const userRes = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }));
        const user = userRes.data && userRes.data[0] ? userRes.data[0] : {};
        let list = await listUnifiedGoodsFundLogs(user, openid);

        const filter = String((params && (params.filter || params.type)) || 'all').trim().toLowerCase();
        if (filter === 'in') {
            list = list.filter((item) => isGoodsFundInflow(item.type, toNumber(item.amount, 0)));
        } else if (filter === 'out') {
            list = list.filter((item) => !isGoodsFundInflow(item.type, toNumber(item.amount, 0)));
        } else if (filter && filter !== 'all') {
            list = list.filter((item) => goodsFundLogTypeText(item.type) === filter);
        }

        return success({ list: list.slice(0, 50) });
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
    const viewActions = ['center', 'dashboard', 'wxacodeInvite', 'agentWorkbench', 'stats', 'team', 'teamDetail', 'commissionPreview', 'estimatedCommission', 'promotionProgress', 'promotionLogs', 'myFundPoolSummary', 'agentWallet', 'agentGoodsFund', 'agentWalletLogs'];

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
