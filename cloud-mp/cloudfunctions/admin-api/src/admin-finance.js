'use strict';

const { isBusinessOrder, isVisibleAccount } = require('./shared/account-visibility');
const { isVisibleOrder } = require('./shared/record-visibility');

const ADMIN_FINANCE_TIME_ZONE = process.env.ADMIN_DEFAULT_TIME_ZONE || 'Asia/Shanghai';
const ADMIN_FINANCE_DEFAULT_OFFSET = '+08:00';
const ADMIN_FINANCE_BASELINE_AT = process.env.ADMIN_FINANCE_TRUSTED_BASELINE_AT || '2026-04-24T00:00:00+08:00';
const HAS_TIME_ZONE_SUFFIX_RE = /(?:z|[+-]\d{2}:\d{2})$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: ADMIN_FINANCE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

function normalizeDateString(raw) {
    const text = String(raw || '').trim();
    if (!text) return '';
    if (HAS_TIME_ZONE_SUFFIX_RE.test(text)) return text;
    if (DATE_ONLY_RE.test(text)) return `${text}T00:00:00${ADMIN_FINANCE_DEFAULT_OFFSET}`;
    return `${text}${ADMIN_FINANCE_DEFAULT_OFFSET}`;
}

function parseDateTimestamp(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const ts = new Date(normalizeDateString(value)).getTime();
        return Number.isFinite(ts) ? ts : 0;
    }
    if (typeof value === 'object') {
        if (typeof value._seconds === 'number') return value._seconds * 1000;
        if (typeof value.seconds === 'number') return value.seconds * 1000;
        if (value.$date !== undefined) return parseDateTimestamp(value.$date);
        if (typeof value.toDate === 'function') {
            const date = value.toDate();
            return date instanceof Date ? date.getTime() : 0;
        }
    }
    return 0;
}

function isValidTimestamp(value) {
    const ts = Number(value);
    return Number.isFinite(ts) && ts > 0;
}

function extractDateParts(ts) {
    if (!isValidTimestamp(ts)) return {};
    const parts = DATE_PARTS_FORMATTER.formatToParts(new Date(ts));
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return { year, month, day };
}

function getDateKeyInReportTimeZone(value, fallback = '') {
    const ts = parseDateTimestamp(value);
    if (!ts) return fallback;
    const { year, month, day } = extractDateParts(ts);
    return year && month && day ? `${year}-${month}-${day}` : fallback;
}

const ADMIN_FINANCE_BASELINE_TS = parseDateTimestamp(ADMIN_FINANCE_BASELINE_AT);
const ADMIN_FINANCE_BASELINE_DATE = getDateKeyInReportTimeZone(ADMIN_FINANCE_BASELINE_TS, '2026-04-24');

function buildFinanceScope(extra = {}) {
    return {
        mode: 'trusted_since',
        timezone: ADMIN_FINANCE_TIME_ZONE,
        baseline_at: ADMIN_FINANCE_BASELINE_AT,
        baseline_date: ADMIN_FINANCE_BASELINE_DATE,
        stock_fields_note: '代理欠款、基金池余额等存量字段仍显示当前值，不按起算点裁切。',
        ...extra
    };
}

function pickFirstTimestamp(row = {}, fields = []) {
    for (const field of fields) {
        const ts = parseDateTimestamp(row?.[field]);
        if (ts) return ts;
    }
    return 0;
}

function isRecordInFinanceScope(row = {}, fields = []) {
    const ts = pickFirstTimestamp(row, fields);
    return !!ts && ts >= ADMIN_FINANCE_BASELINE_TS;
}

function getUserLinkedRefs(row = {}) {
    return [row?.openid, row?.user_id, row?.buyer_id, row?.member_openid]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
}

function valueLookupTokens(value) {
    if (value == null || value === '') return [];
    const raw = String(value).trim();
    if (!raw) return [];
    const tokens = new Set([raw]);
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) tokens.add(String(numeric));
    return Array.from(tokens);
}

function userLookupTokens(user = {}) {
    return [
        user.id,
        user._legacy_id,
        user._id,
        user.openid,
        user.user_id,
        user.buyer_id,
        user.phone,
        user.member_no,
        user.my_invite_code,
        user.invite_code
    ].flatMap(valueLookupTokens);
}

function buildUserFinanceContext(users = [], fallbackFindUserByAnyId) {
    const rows = Array.isArray(users) ? users : [];
    const lookup = new Map();
    const userByOpenid = new Map();

    rows.forEach((user) => {
        if (!user || typeof user !== 'object') return;
        userLookupTokens(user).forEach((token) => {
            if (!lookup.has(token)) lookup.set(token, user);
        });
        const openid = String(user.openid || '').trim();
        if (openid && !userByOpenid.has(openid)) userByOpenid.set(openid, user);
    });

    const visibleUsers = rows.filter(isVisibleAccount);
    const childrenByParentOpenid = new Map();
    visibleUsers.forEach((user) => {
        const openid = String(user.openid || '').trim();
        const parentOpenid = String(user.invited_by || user.referrer_openid || user.parent_openid || '').trim();
        if (!openid || !parentOpenid) return;
        if (!childrenByParentOpenid.has(parentOpenid)) childrenByParentOpenid.set(parentOpenid, []);
        childrenByParentOpenid.get(parentOpenid).push(user);
    });

    const findUserByAnyIdIndexed = (sourceUsers, value) => {
        for (const token of valueLookupTokens(value)) {
            const user = lookup.get(token);
            if (user) return user;
        }
        return typeof fallbackFindUserByAnyId === 'function' ? fallbackFindUserByAnyId(sourceUsers, value) : null;
    };

    return {
        visibleUsers,
        userByOpenid,
        childrenByParentOpenid,
        findUserByAnyId: findUserByAnyIdIndexed
    };
}

function collectDescendants(childrenByParentOpenid, openid) {
    const rootOpenid = String(openid || '').trim();
    if (!rootOpenid) return [];
    const result = [];
    const visited = new Set([rootOpenid]);
    const stack = [...(childrenByParentOpenid.get(rootOpenid) || [])];

    while (stack.length) {
        const user = stack.shift();
        const userOpenid = String(user?.openid || '').trim();
        if (!userOpenid || visited.has(userOpenid)) continue;
        visited.add(userOpenid);
        result.push(user);
        stack.push(...(childrenByParentOpenid.get(userOpenid) || []));
    }

    return result;
}

function resolveVisibleOwnerByRefs(row = {}, users = [], findUserByAnyId) {
    const refs = getUserLinkedRefs(row);
    let visibleOwner = null;
    for (const ref of refs) {
        const owner = findUserByAnyId(users, ref);
        if (!owner) continue;
        if (!isVisibleAccount(owner)) {
            return { hasRefs: true, owner: null };
        }
        if (!visibleOwner) visibleOwner = owner;
    }
    return { hasRefs: refs.length > 0, owner: visibleOwner };
}

function isVisibleUserLinkedRow(row = {}, users = [], findUserByAnyId) {
    const resolved = resolveVisibleOwnerByRefs(row, users, findUserByAnyId);
    if (!resolved.hasRefs) return true;
    return !!resolved.owner;
}

function clampPeriodStart(periodStart) {
    if (!periodStart) return ADMIN_FINANCE_BASELINE_DATE;
    return periodStart < ADMIN_FINANCE_BASELINE_DATE ? ADMIN_FINANCE_BASELINE_DATE : periodStart;
}

function buildBuyerSalesMap(orders = [], pickString, toNumber) {
    return orders.reduce((acc, order) => {
        const openid = pickString(order?.openid).trim();
        if (!openid) return acc;
        acc[openid] = (acc[openid] || 0) + toNumber(order.pay_amount ?? order.total_amount ?? order.actual_price, 0);
        return acc;
    }, {});
}

function buildSettledCommissionMap(commissions = [], users = [], findUserByAnyId, pickString, toNumber) {
    return commissions.reduce((acc, commission) => {
        const { owner } = resolveVisibleOwnerByRefs(commission, users, findUserByAnyId);
        const openid = pickString(owner?.openid).trim();
        if (!openid) return acc;
        acc[openid] = (acc[openid] || 0) + toNumber(commission.amount, 0);
        return acc;
    }, {});
}

function registerFinanceRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        ensureFreshCollections = async () => {},
        getCollection,
        sortByUpdatedDesc,
        findUserByAnyId,
        normalizeLegacyRoleLevel,
        pickString,
        toNumber,
        roundMoney,
        paginate,
        ok,
        fail
    } = deps;

    app.get('/admin/api/finance/overview', auth, requirePermission('statistics'), async (_req, res) => {
        await ensureFreshCollections(['orders', 'commissions', 'withdrawals', 'users', 'dividend_executions', 'fund_pool_logs', 'configs']);
        const orders = getCollection('orders');
        const commissions = getCollection('commissions');
        const withdrawals = getCollection('withdrawals');
        const users = getCollection('users');
        const dividendExecs = getCollection('dividend_executions');
        const fundPoolLogs = getCollection('fund_pool_logs');
        const configs = getCollection('configs');
        const userFinance = buildUserFinanceContext(users, findUserByAnyId);

        function getAgentConfig(key, fallback) {
            const row = configs.find((c) => c.config_key === `agent_system_${key}` || c.key === `agent_system_${key}`);
            if (!row) return fallback;
            if (row.config_value !== undefined) {
                try { return typeof row.config_value === 'string' ? JSON.parse(row.config_value) : row.config_value; } catch (_) { return row.config_value; }
            }
            return row.value !== undefined ? row.value : fallback;
        }

        const visibleUsers = userFinance.visibleUsers;
        const paidStatuses = ['paid', 'pending_group', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];
        const financeOrders = orders.filter((order) => (
            isBusinessOrder(order)
            && isVisibleOrder(order)
            && isRecordInFinanceScope(order, ['paid_at', 'pay_time', 'created_at'])
        ));
        const paidOrders = financeOrders.filter((order) => paidStatuses.includes(String(order.status || '')));
        const since30d = Math.max(Date.now() - 30 * 86400000, ADMIN_FINANCE_BASELINE_TS);
        const gmv = paidOrders.reduce((sum, order) => sum + toNumber(order.pay_amount ?? order.total_amount ?? order.actual_price, 0), 0);
        const gmv30d = paidOrders
            .filter((order) => pickFirstTimestamp(order, ['paid_at', 'pay_time', 'created_at']) >= since30d)
            .reduce((sum, order) => sum + toNumber(order.pay_amount ?? order.total_amount ?? order.actual_price, 0), 0);

        const scopedCommissions = commissions.filter((commission) => (
            isRecordInFinanceScope(commission, ['created_at', 'settled_at', 'unfrozen_at', 'updated_at'])
            && isVisibleUserLinkedRow(commission, users, userFinance.findUserByAnyId)
        ));
        const commissionStats = { total: 0, frozen: 0, pending_approval: 0, settled: 0, cancelled: 0 };
        scopedCommissions.forEach((commission) => {
            const amount = toNumber(commission.amount, 0);
            commissionStats.total += amount;
            const status = String(commission.status || '');
            if (status === 'frozen') commissionStats.frozen += amount;
            else if (status === 'pending_approval') commissionStats.pending_approval += amount;
            else if (['settled', 'completed', 'approved'].includes(status)) commissionStats.settled += amount;
            else if (status === 'cancelled') commissionStats.cancelled += amount;
        });

        const scopedWithdrawals = withdrawals.filter((withdrawal) => (
            isRecordInFinanceScope(withdrawal, ['created_at', 'completed_at', 'processing_at', 'updated_at'])
            && isVisibleUserLinkedRow(withdrawal, users, userFinance.findUserByAnyId)
        ));
        const withdrawalStats = { pending_amount: 0, completed_amount: 0, total_fee: 0, pending_count: 0 };
        scopedWithdrawals.forEach((withdrawal) => {
            const amount = toNumber(withdrawal.amount, 0);
            const fee = toNumber(withdrawal.fee, 0);
            const status = String(withdrawal.status || '');
            if (['pending', 'approved', 'processing'].includes(status)) {
                withdrawalStats.pending_amount += amount;
                withdrawalStats.pending_count += 1;
            }
            if (status === 'completed') {
                withdrawalStats.completed_amount += amount;
            }
            withdrawalStats.total_fee += fee;
        });

        const debtors = visibleUsers
            .filter((user) => toNumber(user.debt_amount, 0) > 0)
            .map((user) => ({
                user_id: user.id || user._legacy_id || user._id,
                nickname: pickString(user.nickname || user.nickName || user.name || ''),
                invite_code: pickString(user.my_invite_code || user.invite_code || user.member_no || ''),
                member_no: pickString(user.my_invite_code || user.invite_code || user.member_no || ''),
                role_level: normalizeLegacyRoleLevel(user.role_level ?? user.distributor_level),
                debt_amount: toNumber(user.debt_amount, 0),
                debt_reason: pickString(user.debt_reason || '')
            }))
            .sort((left, right) => right.debt_amount - left.debt_amount);

        const fundPool = getAgentConfig('fund-pool', { enabled: false });
        const fundPoolRow = configs.find((row) => row.config_key === 'agent_system_fund-pool' || row.key === 'agent_system_fund-pool') || {};
        const scopedFundPoolLogs = fundPoolLogs.filter((row) => isRecordInFinanceScope(row, ['created_at', 'updated_at']));
        const sortedExecs = sortByUpdatedDesc(dividendExecs.filter((row) => isRecordInFinanceScope(row, ['created_at', 'updated_at'])));
        const lastExec = sortedExecs[0] || null;
        const dividendPool = getAgentConfig('dividend-pool', { balance: 0, total_in: 0, total_out: 0 });

        ok(res, {
            scope: buildFinanceScope(),
            gmv,
            gmv_30d: gmv30d,
            commissions: commissionStats,
            withdrawals: withdrawalStats,
            agent_debt: {
                total_debt: debtors.reduce((sum, item) => sum + item.debt_amount, 0),
                debtor_count: debtors.length,
                debtors
            },
            fund_pool: fundPool,
            fund_pool_sub: {
                mirror_ops: toNumber(fundPoolRow.sub_mirror_ops, 0),
                travel: toNumber(fundPoolRow.sub_travel, 0),
                parent: toNumber(fundPoolRow.sub_parent, 0),
                personal: toNumber(fundPoolRow.sub_personal, 0),
                total_balance: toNumber(fundPoolRow.balance, 0),
                total_in: toNumber(fundPoolRow.total_in, 0),
                log_count: scopedFundPoolLogs.length
            },
            dividend: {
                last_executed_year: lastExec?.year || null,
                last_total_distributed: toNumber(lastExec?.totalDistributed, 0),
                pool: {
                    balance: toNumber(dividendPool.balance, 0),
                    total_in: toNumber(dividendPool.total_in, 0),
                    total_out: toNumber(dividendPool.total_out, 0)
                },
                executions: sortedExecs.slice(0, 10)
            }
        });
    });

    app.get('/admin/api/finance/fund-pool-logs', auth, requirePermission('statistics'), async (req, res) => {
        await ensureFreshCollections(['users', 'fund_pool_logs']);
        const users = getCollection('users');
        const userFinance = buildUserFinanceContext(users, findUserByAnyId);
        const sourceLabelMap = {
            upgrade_payment: '升级支付入池',
            admin_upgrade: '后台升级入池'
        };
        const rows = sortByUpdatedDesc(
            getCollection('fund_pool_logs').filter((row) => (
                isRecordInFinanceScope(row, ['created_at', 'updated_at'])
                && isVisibleUserLinkedRow(row, users, userFinance.findUserByAnyId)
            ))
        ).map((row) => {
            const { owner: user } = resolveVisibleOwnerByRefs(row, users, userFinance.findUserByAnyId);
            const roleLevel = normalizeLegacyRoleLevel(row.role_level);
            return {
                ...row,
                amount: roundMoney(row.amount),
                role_level: roleLevel,
                role_label: ({ 0: 'VIP用户', 1: '初级会员', 2: '高级会员', 3: '推广合伙人', 4: '运营合伙人', 5: '区域合伙人', 6: '线下实体门店' }[roleLevel] || `等级${roleLevel}`),
                nickname: pickString(user?.nickname || user?.nickName || user?.name || ''),
                invite_code: pickString(user?.my_invite_code || user?.invite_code || user?.member_no || ''),
                source_text: sourceLabelMap[pickString(row.source)] || pickString(row.source || '未知来源'),
                sub_amounts: row.sub_amounts || {}
            };
        });
        ok(res, {
            ...paginate(rows, req),
            scope: buildFinanceScope()
        });
    });

    app.get('/admin/api/finance/dividend-executions', auth, requirePermission('statistics'), async (req, res) => {
        await ensureFreshCollections(['dividend_executions']);
        const rows = sortByUpdatedDesc(
            getCollection('dividend_executions').filter((row) => isRecordInFinanceScope(row, ['created_at', 'updated_at']))
        ).map((row) => ({
            ...row,
            totalDistributed: roundMoney(row.totalDistributed),
            pool_balance_before: roundMoney(row.pool_balance_before),
            pool_balance_after: roundMoney(row.pool_balance_after)
        }));
        ok(res, {
            ...paginate(rows, req),
            scope: buildFinanceScope()
        });
    });

    app.get('/admin/api/finance/agent-performance', auth, requirePermission('statistics'), async (req, res) => {
        const period = pickString(req.query.period || 'month');
        const requestedDate = pickString(req.query.date || '');
        const refTs = requestedDate ? parseDateTimestamp(requestedDate) : Date.now();
        if (requestedDate && !refTs) return fail(res, '财务统计日期参数不合法', 400);
        const limit = toNumber(req.query.limit, 50);
        const { year, month } = extractDateParts(refTs);
        const fallbackParts = extractDateParts(Date.now());
        const numericYear = Number(year || fallbackParts.year || new Date().getFullYear());
        const numericMonth = Math.max(1, Number(month || fallbackParts.month || (new Date().getMonth() + 1)));

        let periodStart;
        let periodEnd;
        if (period === 'day') {
            const dateKey = getDateKeyInReportTimeZone(refTs, ADMIN_FINANCE_BASELINE_DATE);
            periodStart = dateKey;
            periodEnd = dateKey;
        } else if (period === 'month') {
            periodStart = `${numericYear}-${String(numericMonth).padStart(2, '0')}-01`;
            const lastDay = new Date(numericYear, numericMonth, 0).getDate();
            periodEnd = `${numericYear}-${String(numericMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else {
            const quarter = Math.floor((numericMonth - 1) / 3);
            const quarterStartMonth = quarter * 3 + 1;
            const quarterEndMonth = quarterStartMonth + 2;
            periodStart = `${numericYear}-${String(quarterStartMonth).padStart(2, '0')}-01`;
            const quarterEndLastDay = new Date(numericYear, quarterEndMonth, 0).getDate();
            periodEnd = `${numericYear}-${String(quarterEndMonth).padStart(2, '0')}-${String(quarterEndLastDay).padStart(2, '0')}`;
        }

        periodStart = clampPeriodStart(periodStart);
        if (periodEnd < periodStart) {
            periodEnd = periodStart;
        }

        const paidStatuses = ['paid', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];
        await ensureFreshCollections(['orders', 'users']);
        const orders = getCollection('orders');
        const users = getCollection('users');
        const userFinance = buildUserFinanceContext(users, findUserByAnyId);

        function getOrderAgentOpenid(order) {
            return order?.fulfillment_partner_openid
                || order?.nearest_agent_openid
                || order?.agent_info?.openid
                || order?.agent?.openid
                || order?.distributor?.openid
                || order?.referrer_openid
                || null;
        }

        const periodOrders = orders.filter((order) => {
            if (!isBusinessOrder(order) || !isVisibleOrder(order)) return false;
            if (!paidStatuses.includes(String(order.status || ''))) return false;
            const eventTs = pickFirstTimestamp(order, ['paid_at', 'pay_time', 'created_at']);
            if (!eventTs || eventTs < ADMIN_FINANCE_BASELINE_TS) return false;
            const dateKey = getDateKeyInReportTimeZone(eventTs, '');
            return dateKey >= periodStart && dateKey <= periodEnd;
        });

        const agentMap = {};
        for (const order of periodOrders) {
            const agentOpenid = getOrderAgentOpenid(order);
            if (!agentOpenid) continue;
            if (!agentMap[agentOpenid]) {
                agentMap[agentOpenid] = { openid: agentOpenid, order_count: 0, gmv: 0 };
            }
            agentMap[agentOpenid].order_count += 1;
            agentMap[agentOpenid].gmv += toNumber(order.pay_amount ?? order.total_amount ?? order.actual_price, 0);
        }

        const ranked = Object.values(agentMap)
            .sort((left, right) => right.gmv - left.gmv)
            .slice(0, limit)
            .map((item, index) => {
                const user = userFinance.userByOpenid.get(item.openid) || {};
                return {
                    rank: index + 1,
                    openid: item.openid,
                    user_id: user.id || user._legacy_id || user._id || item.openid,
                    nickname: pickString(user.nickname || user.nickName || user.name || item.openid),
                    invite_code: pickString(user.my_invite_code || user.invite_code || user.member_no || ''),
                    member_no: pickString(user.my_invite_code || user.invite_code || user.member_no || ''),
                    role_level: toNumber(user.role_level ?? user.distributor_level, 0),
                    order_count: item.order_count,
                    gmv: Number(item.gmv.toFixed(2))
                };
            });

        ok(res, {
            scope: buildFinanceScope(),
            period,
            period_start: periodStart,
            period_end: periodEnd,
            total_agents: Object.keys(agentMap).length,
            list: ranked
        });
    });

    app.get('/admin/api/finance/pool-contributions', auth, requirePermission('statistics'), async (req, res) => {
        await ensureFreshCollections(['users', 'configs', 'commissions', 'orders']);
        const users = getCollection('users');
        const configs = getCollection('configs');
        const commissions = getCollection('commissions');
        const orders = getCollection('orders');
        const userFinance = buildUserFinanceContext(users, findUserByAnyId);

        function getAgentCfg(key, fallback) {
            const row = configs.find((config) => config.config_key === `agent_system_${key}` || config.key === `agent_system_${key}`);
            if (!row) return fallback;
            if (row.config_value !== undefined) {
                try { return typeof row.config_value === 'string' ? JSON.parse(row.config_value) : row.config_value; } catch (_) { return row.config_value; }
            }
            return row.value !== undefined ? row.value : fallback;
        }

        const dividendRules = getAgentCfg('dividend-rules', { enabled: false, source_pct: 0, b_team_award: { enabled: false, ranks: [] }, b1_personal_award: { enabled: false, ranks: [] } });
        const visibleUsers = userFinance.visibleUsers;
        const scopedPaidOrders = orders.filter((order) => (
            isBusinessOrder(order)
            && isVisibleOrder(order)
            && ['paid', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'].includes(String(order.status || ''))
            && isRecordInFinanceScope(order, ['paid_at', 'pay_time', 'created_at'])
        ));
        const scopedSettledCommissions = commissions.filter((commission) => (
            ['settled', 'completed', 'approved'].includes(String(commission.status || ''))
            && isRecordInFinanceScope(commission, ['created_at', 'settled_at', 'unfrozen_at', 'updated_at'])
            && isVisibleUserLinkedRow(commission, users, userFinance.findUserByAnyId)
        ));
        const personalSalesByOpenid = buildBuyerSalesMap(scopedPaidOrders, pickString, toNumber);
        const settledCommissionByOpenid = buildSettledCommissionMap(scopedSettledCommissions, users, userFinance.findUserByAnyId, pickString, toNumber);

        const partnerContributions = visibleUsers
            .filter((user) => toNumber(user.role_level ?? user.distributor_level, 0) >= 4)
            .map((user) => {
                const descendants = collectDescendants(userFinance.childrenByParentOpenid, user.openid);
                const personalSales = toNumber(personalSalesByOpenid[user.openid], 0);
                const teamSales = [user, ...descendants]
                    .reduce((sum, member) => sum + toNumber(personalSalesByOpenid[member.openid], 0), 0);
                const totalCommission = toNumber(settledCommissionByOpenid[user.openid], 0);
                return {
                    user_id: user.id || user._legacy_id || user._id,
                    openid: user.openid,
                    nickname: pickString(user.nickname || user.nickName || user.name || ''),
                    invite_code: pickString(user.my_invite_code || user.invite_code || user.member_no || ''),
                    member_no: pickString(user.my_invite_code || user.invite_code || user.member_no || ''),
                    role_level: toNumber(user.role_level ?? user.distributor_level, 0),
                    personal_sales: Number(personalSales.toFixed(2)),
                    team_size: descendants.length + 1,
                    team_sales: Number(teamSales.toFixed(2)),
                    settled_commission: Number(totalCommission.toFixed(2))
                };
            })
            .sort((left, right) => right.team_sales - left.team_sales);

        const agentContributions = visibleUsers
            .filter((user) => toNumber(user.role_level ?? user.distributor_level, 0) === 3)
            .map((user) => {
                const personalSales = toNumber(personalSalesByOpenid[user.openid], 0);
                const totalCommission = toNumber(settledCommissionByOpenid[user.openid], 0);
                return {
                    user_id: user.id || user._legacy_id || user._id,
                    openid: user.openid,
                    nickname: pickString(user.nickname || user.nickName || user.name || ''),
                    invite_code: pickString(user.my_invite_code || user.invite_code || user.member_no || ''),
                    member_no: pickString(user.my_invite_code || user.invite_code || user.member_no || ''),
                    personal_sales: Number(personalSales.toFixed(2)),
                    settled_commission: Number(totalCommission.toFixed(2))
                };
            })
            .sort((left, right) => right.personal_sales - left.personal_sales)
            .slice(0, 50);

        ok(res, {
            scope: buildFinanceScope(),
            dividend_enabled: !!dividendRules.enabled,
            dividend_source_pct: toNumber(dividendRules.source_pct, 0),
            partner_contributions: partnerContributions,
            agent_contributions: agentContributions.slice(0, 50)
        });
    });
}

module.exports = {
    registerFinanceRoutes
};
