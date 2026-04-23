'use strict';

function registerFinanceRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        getCollection,
        sortByUpdatedDesc,
        findUserByAnyId,
        normalizeLegacyRoleLevel,
        pickString,
        toNumber,
        roundMoney,
        paginate,
        ok
    } = deps;

    app.get('/admin/api/finance/overview', auth, requirePermission('statistics'), (_req, res) => {
        const orders = getCollection('orders');
        const commissions = getCollection('commissions');
        const withdrawals = getCollection('withdrawals');
        const users = getCollection('users');
        const dividendExecs = getCollection('dividend_executions');
        const fundPoolLogs = getCollection('fund_pool_logs');
        const configs = getCollection('configs');

        function getAgentConfig(key, fallback) {
            const row = configs.find((c) => c.config_key === `agent_system_${key}` || c.key === `agent_system_${key}`);
            if (!row) return fallback;
            if (row.config_value !== undefined) {
                try { return typeof row.config_value === 'string' ? JSON.parse(row.config_value) : row.config_value; } catch (_) { return row.config_value; }
            }
            return row.value !== undefined ? row.value : fallback;
        }

        const paidStatuses = ['paid', 'pending_group', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];
        const paidOrders = orders.filter((o) => paidStatuses.includes(String(o.status || '')));
        const since30d = Date.now() - 30 * 86400000;
        const gmv = paidOrders.reduce((s, o) => s + toNumber(o.pay_amount ?? o.total_amount ?? o.actual_price, 0), 0);
        const gmv30d = paidOrders
            .filter((o) => new Date(o.created_at || 0).getTime() >= since30d)
            .reduce((s, o) => s + toNumber(o.pay_amount ?? o.total_amount ?? o.actual_price, 0), 0);

        const commissionStats = { total: 0, frozen: 0, pending_approval: 0, settled: 0, cancelled: 0 };
        commissions.forEach((c) => {
            const amt = toNumber(c.amount, 0);
            commissionStats.total += amt;
            const status = String(c.status || '');
            if (status === 'frozen') commissionStats.frozen += amt;
            else if (status === 'pending_approval') commissionStats.pending_approval += amt;
            else if (['settled', 'completed', 'approved'].includes(status)) commissionStats.settled += amt;
            else if (status === 'cancelled') commissionStats.cancelled += amt;
        });

        const withdrawalStats = { pending_amount: 0, completed_amount: 0, total_fee: 0, pending_count: 0 };
        withdrawals.forEach((w) => {
            const amt = toNumber(w.amount, 0);
            const fee = toNumber(w.fee, 0);
            const status = String(w.status || '');
            if (['pending', 'approved', 'processing'].includes(status)) {
                withdrawalStats.pending_amount += amt;
                withdrawalStats.pending_count += 1;
            }
            if (status === 'completed') {
                withdrawalStats.completed_amount += amt;
            }
            withdrawalStats.total_fee += fee;
        });

        const debtors = users
            .filter((u) => toNumber(u.debt_amount, 0) > 0)
            .map((u) => ({
                user_id: u.id || u._legacy_id || u._id,
                nickname: pickString(u.nickname || u.nickName || u.name || ''),
                invite_code: pickString(u.my_invite_code || u.invite_code || u.member_no || ''),
                member_no: pickString(u.my_invite_code || u.invite_code || u.member_no || ''),
                role_level: normalizeLegacyRoleLevel(u.role_level ?? u.distributor_level),
                debt_amount: toNumber(u.debt_amount, 0),
                debt_reason: pickString(u.debt_reason || '')
            }))
            .sort((a, b) => b.debt_amount - a.debt_amount);

        const fundPool = getAgentConfig('fund-pool', { enabled: false });
        const fundPoolRow = configs.find((c) => c.config_key === 'agent_system_fund-pool' || c.key === 'agent_system_fund-pool') || {};
        const sortedExecs = sortByUpdatedDesc(dividendExecs);
        const lastExec = sortedExecs[0] || null;
        const dividendPool = getAgentConfig('dividend-pool', { balance: 0, total_in: 0, total_out: 0 });

        ok(res, {
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
                log_count: fundPoolLogs.length
            },
            dividend: {
                last_executed_year: lastExec?.year || null,
                last_total_distributed: toNumber(lastExec?.totalDistributed, dividendPool.last_total_distributed || 0),
                pool: {
                    balance: toNumber(dividendPool.balance, 0),
                    total_in: toNumber(dividendPool.total_in, 0),
                    total_out: toNumber(dividendPool.total_out, 0)
                },
                executions: sortedExecs.slice(0, 10)
            }
        });
    });

    app.get('/admin/api/finance/fund-pool-logs', auth, requirePermission('statistics'), (req, res) => {
        const users = getCollection('users');
        const sourceLabelMap = {
            upgrade_payment: '升级支付入池',
            admin_upgrade: '后台升级入池'
        };
        const rows = sortByUpdatedDesc(getCollection('fund_pool_logs')).map((row) => {
            const user = findUserByAnyId(users, row.openid || row.user_id);
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
        ok(res, paginate(rows, req));
    });

    app.get('/admin/api/finance/dividend-executions', auth, requirePermission('statistics'), (req, res) => {
        const rows = sortByUpdatedDesc(getCollection('dividend_executions')).map((row) => ({
            ...row,
            totalDistributed: roundMoney(row.totalDistributed),
            pool_balance_before: roundMoney(row.pool_balance_before),
            pool_balance_after: roundMoney(row.pool_balance_after)
        }));
        ok(res, paginate(rows, req));
    });

    app.get('/admin/api/finance/agent-performance', auth, requirePermission('statistics'), (req, res) => {
        const period = pickString(req.query.period || 'month');
        const refDate = req.query.date ? new Date(req.query.date) : new Date();
        const limit = toNumber(req.query.limit, 50);

        let periodStart;
        let periodEnd;
        const year = refDate.getFullYear();
        const month = refDate.getMonth();
        if (period === 'day') {
            const iso = refDate.toISOString().slice(0, 10);
            periodStart = iso;
            periodEnd = iso;
        } else if (period === 'month') {
            periodStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month + 1, 0).getDate();
            periodEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else {
            const quarter = Math.floor(month / 3);
            const quarterStartMonth = quarter * 3;
            const quarterEndMonth = quarterStartMonth + 2;
            periodStart = `${year}-${String(quarterStartMonth + 1).padStart(2, '0')}-01`;
            const quarterEndLastDay = new Date(year, quarterEndMonth + 1, 0).getDate();
            periodEnd = `${year}-${String(quarterEndMonth + 1).padStart(2, '0')}-${String(quarterEndLastDay).padStart(2, '0')}`;
        }

        const paidStatuses = ['paid', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];
        const orders = getCollection('orders');
        const users = getCollection('users');

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
            if (!paidStatuses.includes(String(order.status || ''))) return false;
            const dateStr = String(order.created_at || order.pay_time || '').slice(0, 10);
            return dateStr >= periodStart && dateStr <= periodEnd;
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
            .sort((a, b) => b.gmv - a.gmv)
            .slice(0, limit)
            .map((item, index) => {
                const user = users.find((row) => row.openid === item.openid) || {};
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
            period,
            period_start: periodStart,
            period_end: periodEnd,
            total_agents: Object.keys(agentMap).length,
            list: ranked
        });
    });

    app.get('/admin/api/finance/pool-contributions', auth, requirePermission('statistics'), (req, res) => {
        const users = getCollection('users');
        const configs = getCollection('configs');
        const commissions = getCollection('commissions');

        function getAgentCfg(key, fallback) {
            const row = configs.find((c) => c.config_key === `agent_system_${key}` || c.key === `agent_system_${key}`);
            if (!row) return fallback;
            if (row.config_value !== undefined) {
                try { return typeof row.config_value === 'string' ? JSON.parse(row.config_value) : row.config_value; } catch (_) { return row.config_value; }
            }
            return row.value !== undefined ? row.value : fallback;
        }

        const dividendRules = getAgentCfg('dividend-rules', { enabled: false, source_pct: 0, b_team_award: { enabled: false, ranks: [] }, b1_personal_award: { enabled: false, ranks: [] } });

        function getAllDescendants(userList, openid, visited = new Set()) {
            visited.add(openid);
            const result = [];
            for (const user of userList) {
                const parentOpenid = user.invited_by || user.referrer_openid || user.parent_openid || '';
                if (parentOpenid === openid && !visited.has(user.openid)) {
                    result.push(user);
                    result.push(...getAllDescendants(userList, user.openid, visited));
                }
            }
            return result;
        }

        const partnerContributions = users
            .filter((user) => toNumber(user.role_level ?? user.distributor_level, 0) >= 4)
            .map((user) => {
                const descendants = getAllDescendants(users, user.openid, new Set());
                const teamSales = [user, ...descendants].reduce((sum, member) => sum + toNumber(member.total_spent, 0), 0);
                const personalSales = toNumber(user.total_spent, 0);
                const totalCommission = commissions
                    .filter((commission) => (commission.openid === user.openid || commission.user_id === String(user.id || user._id)) && ['settled', 'completed', 'approved'].includes(String(commission.status || '')))
                    .reduce((sum, commission) => sum + toNumber(commission.amount, 0), 0);
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
            .sort((a, b) => b.team_sales - a.team_sales);

        const agentContributions = users
            .filter((user) => toNumber(user.role_level ?? user.distributor_level, 0) === 3)
            .map((user) => {
                const personalSales = toNumber(user.total_spent, 0);
                const totalCommission = commissions
                    .filter((commission) => (commission.openid === user.openid || commission.user_id === String(user.id || user._id)) && ['settled', 'completed', 'approved'].includes(String(commission.status || '')))
                    .reduce((sum, commission) => sum + toNumber(commission.amount, 0), 0);
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
            .sort((a, b) => b.personal_sales - a.personal_sales)
            .slice(0, 50);

        ok(res, {
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
