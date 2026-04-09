'use strict';
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const BATCH_SIZE = 100;

const ROLE_NAMES = {
    0: '普通用户',
    1: '会员',
    2: '团长',
    3: '代理商',
    4: '高级代理',
    5: '合伙人',
    6: '运营中心',
    7: '品牌中心'
};

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function isoDate(value) {
    if (!value) return '';
    try {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return date.toISOString();
    } catch (_) {}
    return String(value);
}

function buildCollectionQuery(collectionName, where) {
    const collection = db.collection(collectionName);
    return where ? collection.where(where) : collection;
}

async function readAll(collectionName, where) {
    const countRes = await buildCollectionQuery(collectionName, where).count().catch(() => ({ total: 0 }));
    const total = toNumber(countRes.total, 0);
    if (!total) return [];

    const tasks = [];
    for (let skip = 0; skip < total; skip += BATCH_SIZE) {
        tasks.push(buildCollectionQuery(collectionName, where).skip(skip).limit(BATCH_SIZE).get().catch(() => ({ data: [] })));
    }
    const results = await Promise.all(tasks);
    return results.flatMap((item) => item.data || []);
}

async function getUsers() {
    return readAll('users');
}

function userKeys(user) {
    const keys = new Set();
    [user?.openid, user?.user_id, user?._id].forEach((item) => {
        if (item != null && item !== '') keys.add(String(item));
    });
    [user?.id, user?._legacy_id, user?.parent_id, user?.referrer_id].forEach((item) => {
        if (item != null && item !== '') keys.add(String(item));
    });
    return keys;
}

function userNumericIds(user) {
    const ids = new Set();
    [user?.id, user?._legacy_id].forEach((item) => {
        const num = Number(item);
        if (Number.isFinite(num) && num > 0) ids.add(num);
    });
    return ids;
}

function pickNickname(user) {
    return user?.nickName || user?.nickname || '用户';
}

function pickAvatar(user) {
    return user?.avatarUrl || user?.avatar_url || '';
}

function pickRoleLevel(user) {
    return toNumber(user?.role_level, 0);
}

function pickRoleName(user) {
    const level = pickRoleLevel(user);
    return user?.role_name || ROLE_NAMES[level] || '普通用户';
}

function pickBalance(user) {
    return toNumber(user?.wallet_balance != null ? user.wallet_balance : user?.balance, 0);
}

function pickInviteCode(user) {
    return user?.my_invite_code || user?.invite_code || '';
}

function ownsRow(row, openid, user) {
    const keys = userKeys(user);
    const candidates = [
        row?.openid,
        row?.user_id,
        row?.buyer_id,
        row?.owner_openid,
        row?.receiver_openid
    ];
    return candidates.some((item) => item != null && keys.has(String(item))) || false;
}

async function ownedRows(collectionName, openid, user) {
    const rows = await readAll(collectionName);
    return rows.filter((item) => ownsRow(item, openid, user));
}

function findInviter(user, users) {
    if (!user) return null;
    const parentKeys = new Set();
    [user.parent_openid, user.referrer_openid].forEach((item) => {
        if (item) parentKeys.add(String(item));
    });
    [user.parent_id, user.referrer_id].forEach((item) => {
        const num = Number(item);
        if (Number.isFinite(num) && num > 0) parentKeys.add(String(num));
    });
    return users.find((candidate) => {
        if (!candidate) return false;
        const candidateKeys = userKeys(candidate);
        return Array.from(parentKeys).some((item) => candidateKeys.has(item));
    }) || null;
}

function isDirectMember(candidate, currentUser) {
    const currentKeys = userKeys(currentUser);
    const currentIds = userNumericIds(currentUser);
    const candidateParents = [
        candidate?.parent_openid,
        candidate?.referrer_openid,
        candidate?.inviter_openid
    ].filter(Boolean).map(String);
    const candidateParentIds = [candidate?.parent_id, candidate?.referrer_id, candidate?.inviter_id]
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0);

    return candidateParents.some((item) => currentKeys.has(item))
        || candidateParentIds.some((item) => currentIds.has(item));
}

function buildTeamHierarchy(currentUser, users) {
    const direct = users.filter((candidate) => candidate?.openid !== currentUser?.openid && isDirectMember(candidate, currentUser));
    const directOpenids = new Set(direct.map((item) => String(item.openid || '')).filter(Boolean));
    const directIds = new Set(direct.flatMap((item) => Array.from(userNumericIds(item))));

    const indirect = users.filter((candidate) => {
        if (!candidate || candidate.openid === currentUser?.openid) return false;
        if (direct.some((item) => item._id === candidate._id)) return false;
        const parentOpenids = [candidate.parent_openid, candidate.referrer_openid, candidate.inviter_openid]
            .filter(Boolean)
            .map(String);
        const parentIds = [candidate.parent_id, candidate.referrer_id, candidate.inviter_id]
            .map((item) => Number(item))
            .filter((item) => Number.isFinite(item) && item > 0);
        return parentOpenids.some((item) => directOpenids.has(item))
            || parentIds.some((item) => directIds.has(item));
    });

    return { direct, indirect, total: [...direct, ...indirect] };
}

function monthKey(value) {
    return isoDate(value).slice(0, 7);
}

function buildTeamMember(item, level, userOrderStats = {}, userSalesStats = {}) {
    const memberId = item.id || item._legacy_id || item._id;
    const numericId = Number(item.id || item._legacy_id);
    const orderCount = userOrderStats[String(item.openid || '')] != null
        ? userOrderStats[String(item.openid || '')]
        : (Number.isFinite(numericId) ? (userOrderStats[String(numericId)] || 0) : 0);
    const totalSales = userSalesStats[String(item.openid || '')] != null
        ? userSalesStats[String(item.openid || '')]
        : (Number.isFinite(numericId) ? (userSalesStats[String(numericId)] || 0) : toNumber(item.total_sales, 0));

    return {
        id: memberId,
        _id: item._id,
        openid: item.openid || '',
        nickname: pickNickname(item),
        nickName: pickNickname(item),
        avatar_url: pickAvatar(item),
        avatarUrl: pickAvatar(item),
        role_level: pickRoleLevel(item),
        role_name: pickRoleName(item),
        level,
        level_label: level === 1 ? '一级成员' : '二级成员',
        relation_text: level === 1 ? '直属团队成员' : '间推团队成员',
        joined_at: item.joined_team_at || item.created_at || '',
        member_no: item.member_no || item.uid || item.id || '',
        phone: item.phone || '',
        order_count: toNumber(orderCount, 0),
        total_sales: toNumber(totalSales, 0)
    };
}

function buildOrderOwnerStats(orders) {
    const orderCountMap = {};
    const salesMap = {};

    orders.forEach((order) => {
        const amount = toNumber(order.actual_price != null ? order.actual_price : order.total_amount, 0);
        const keys = [];
        if (order.openid) keys.push(String(order.openid));
        if (order.buyer_id != null) keys.push(String(order.buyer_id));
        keys.forEach((key) => {
            orderCountMap[key] = toNumber(orderCountMap[key], 0) + 1;
            salesMap[key] = toNumber(salesMap[key], 0) + amount;
        });
    });

    return { orderCountMap, salesMap };
}

function buildCommissionStats(rows) {
    return rows.reduce((acc, row) => {
        const status = row.status || 'pending_approval';
        const amount = toNumber(row.amount, 0);
        acc.total += amount;
        if (status === 'frozen') acc.frozen += amount;
        else if (status === 'pending' || status === 'pending_approval') acc.pendingApproval += amount;
        else if (status === 'approved' || status === 'available') acc.approved += amount;
        else if (status === 'settled' || status === 'completed') acc.settled += amount;
        return acc;
    }, {
        total: 0,
        frozen: 0,
        pendingApproval: 0,
        approved: 0,
        settled: 0
    });
}

const WALLET_COMMISSION_STATUSES = new Set(['settled', 'available', 'completed']);
const WALLET_WITHDRAWAL_STATUSES = new Set(['pending', 'approved', 'processing', 'completed', 'paid']);

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function buildWalletLedger(commissions, withdrawals, storedBalance) {
    const settledCommission = roundMoney((commissions || []).reduce((sum, row) => {
        const status = String(row.status || '').toLowerCase();
        return WALLET_COMMISSION_STATUSES.has(status) ? sum + toNumber(row.amount, 0) : sum;
    }, 0));
    const committedWithdrawal = roundMoney((withdrawals || []).reduce((sum, row) => {
        const status = String(row.status || '').toLowerCase();
        return WALLET_WITHDRAWAL_STATUSES.has(status) ? sum + toNumber(row.amount, 0) : sum;
    }, 0));
    const safeStoredBalance = Math.max(0, roundMoney(storedBalance));
    const hasLedger = (commissions || []).length > 0 || (withdrawals || []).length > 0;
    const balance = hasLedger
        ? Math.max(0, roundMoney(settledCommission - committedWithdrawal))
        : safeStoredBalance;
    return {
        hasLedger,
        balance,
        drift: roundMoney(balance - safeStoredBalance)
    };
}

async function syncWalletBalance(user, balance) {
    if (!user?._id) return;
    const current = Math.max(0, roundMoney(user.wallet_balance != null ? user.wallet_balance : user.balance));
    const next = Math.max(0, roundMoney(balance));
    if (Math.abs(current - next) < 0.01) return;
    await db.collection('users').doc(user._id).update({
        data: {
            wallet_balance: next,
            balance: next,
            updated_at: db.serverDate()
        }
    }).catch((err) => {
        console.warn('[distribution wallet] sync balance failed:', err);
    });
}

function summarizeTeam(teamMembers) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlyNewMembers = teamMembers.filter((item) => monthKey(item.joined_at || item.joined_team_at || item.created_at) === currentMonth).length;
    const totalSales = teamMembers.reduce((sum, item) => sum + toNumber(item.total_sales, 0), 0);
    return { monthlyNewMembers, totalSales };
}

function buildDashboardPayload(user, hierarchy, commissions, walletAccount, inviter, walletBalance) {
    const commissionStats = buildCommissionStats(commissions);
    const teamSummary = summarizeTeam(hierarchy.total);
    const goodsFundBalance = toNumber(walletAccount?.balance != null ? walletAccount.balance : 0, 0);
    const roleLevel = pickRoleLevel(user);
    const availableBalance = Math.max(0, roundMoney(walletBalance));

    return {
        distributor_level: toNumber(user?.distributor_level != null ? user.distributor_level : user?.agent_level, 0),
        role_level: roleLevel,
        balance: availableBalance,
        wallet_balance: availableBalance,
        pending_commission: commissionStats.pendingApproval + commissionStats.frozen,
        total_commission: commissionStats.total,
        team_count: hierarchy.total.length,
        order_count: toNumber(user?.order_count, 0),
        stats: {
            totalEarnings: commissionStats.total,
            availableAmount: availableBalance,
            frozenAmount: commissionStats.frozen,
            pendingApprovalAmount: commissionStats.pendingApproval,
            approvedAmount: commissionStats.approved
        },
        team: {
            totalCount: hierarchy.total.length,
            directCount: hierarchy.direct.length,
            indirectCount: hierarchy.indirect.length,
            monthlyNewMembers: teamSummary.monthlyNewMembers,
            totalSales: teamSummary.totalSales,
            agentGoodsFund: {
                goods_fund_balance: goodsFundBalance
            },
            goods_fund_balance: goodsFundBalance
        },
        userInfo: {
            id: user?.id || user?._legacy_id || user?._id,
            openid: user?.openid || '',
            nickname: pickNickname(user),
            nickName: pickNickname(user),
            avatar_url: pickAvatar(user),
            avatarUrl: pickAvatar(user),
            role: roleLevel,
            role_level: roleLevel,
            role_name: pickRoleName(user),
            invite_code: pickInviteCode(user),
            inviter: inviter ? {
                id: inviter.id || inviter._legacy_id || inviter._id,
                nickname: pickNickname(inviter),
                avatar_url: pickAvatar(inviter),
                avatarUrl: pickAvatar(inviter),
                role_level: pickRoleLevel(inviter),
                role_name: pickRoleName(inviter)
            } : null,
            growth_value: toNumber(user?.growth_value != null ? user.growth_value : user?.points, 0),
            growth_progress: user?.growth_progress || null
        }
    };
}

function paginate(rows, page, limit) {
    const safePage = Math.max(1, toNumber(page, 1));
    const safeLimit = Math.max(1, toNumber(limit, 20));
    const skip = (safePage - 1) * safeLimit;
    return {
        list: rows.slice(skip, skip + safeLimit),
        pagination: {
            page: safePage,
            limit: safeLimit,
            total: rows.length
        }
    };
}

// ── 佣金配置常量 ──────────────────────────────────────────────
const COMMISSION_RATES = {
    direct: 0.10,     // 直推佣金 10%
    indirect: 0.05,   // 间推佣金 5%
    minRoleLevel: 1    // 最低角色等级（1=初级代理）才可获得佣金
};
const SETTLE_DAYS = 15; // T+15 结算
const BATCH_SIZE_COMM = 50; // 佣金批量处理大小

/**
 * 获取佣金配置（优先从 settings 集合读取，否则用默认值）
 */
async function getCommissionConfig() {
    try {
        const settingsDoc = await readAll('settings');
        const settings = settingsDoc[0] || {};
        const commissionGroup = settings.COMMISSION || {};
        return {
            directRate: toNumber(commissionGroup.COMMISSION_DIRECT_RATE, COMMISSION_RATES.direct),
            indirectRate: toNumber(commissionGroup.COMMISSION_INDIRECT_RATE, COMMISSION_RATES.indirect),
            minRoleLevel: toNumber(commissionGroup.COMMISSION_MIN_ROLE_LEVEL, COMMISSION_RATES.minRoleLevel),
            settleDays: toNumber(commissionGroup.COMMISSION_SETTLE_DAYS, SETTLE_DAYS),
            enabled: commissionGroup.COMMISSION_ENABLED !== false
        };
    } catch (_) {
        return {
            directRate: COMMISSION_RATES.direct,
            indirectRate: COMMISSION_RATES.indirect,
            minRoleLevel: COMMISSION_RATES.minRoleLevel,
            settleDays: SETTLE_DAYS,
            enabled: true
        };
    }
}

/**
 * 根据订单创建佣金记录
 * 被支付成功后调用，为买家的上级链路创建冻结佣金
 * @param {string} orderNo - 订单编号
 * @param {string} buyerOpenid - 买家 openid
 * @param {number} orderAmount - 订单实付金额
 * @param {Array} orderItems - 订单商品列表
 */
async function createCommissionsForOrder(orderNo, buyerOpenid, orderAmount, orderItems) {
    const config = await getCommissionConfig();
    if (!config.enabled) return { created: 0, reason: 'commission_disabled' };

    const amount = toNumber(orderAmount, 0);
    if (amount <= 0) return { created: 0, reason: 'zero_amount' };

    // 获取买家信息
    const buyerUsers = await readAll('users', { openid: buyerOpenid });
    const buyer = buyerUsers[0] || null;
    if (!buyer) return { created: 0, reason: 'buyer_not_found' };

    // 买家自己买自己不产生佣金（但买家的上级可以拿）
    // 查找买家的推荐人（一级）
    const allUsers = await getUsers();
    const inviter = findInviter(buyer, allUsers);
    if (!inviter) return { created: 0, reason: 'no_inviter' };

    const now = new Date();
    const settleAt = new Date(now.getTime() + config.settleDays * 24 * 60 * 60 * 1000);
    const orderId = orderNo; // 用 order_no 作为关联

    const commissions = [];

    // ── 一级佣金（直推） ──
    if (pickRoleLevel(inviter) >= config.minRoleLevel) {
        const directAmount = Math.round(amount * config.directRate * 100) / 100;
        if (directAmount > 0) {
            commissions.push({
                openid: inviter.openid,
                user_id: inviter.id || inviter._legacy_id || inviter.openid,
                receiver_nickname: pickNickname(inviter),
                receiver_role_level: pickRoleLevel(inviter),
                order_id: orderId,
                order_no: orderNo,
                buyer_openid: buyerOpenid,
                buyer_nickname: pickNickname(buyer),
                type: 'direct',
                level: 1,
                level_label: '直推佣金',
                amount: directAmount,
                rate: config.directRate,
                order_amount: amount,
                status: 'frozen',
                frozen_at: now.toISOString(),
                refund_deadline: settleAt.toISOString(),
                available_at: settleAt.toISOString(),
                remark: `订单${orderNo}直推佣金 ${config.directRate * 100}%`,
                product_snapshot: (orderItems || []).map((item) => ({
                    name: item.snapshot_name || '',
                    qty: item.qty || 0,
                    amount: item.item_amount || 0
                })),
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            });
        }
    }

    // ── 二级佣金（间推） ──
    const inviter2 = findInviter(inviter, allUsers);
    if (inviter2 && pickRoleLevel(inviter2) >= config.minRoleLevel) {
        const indirectAmount = Math.round(amount * config.indirectRate * 100) / 100;
        if (indirectAmount > 0) {
            commissions.push({
                openid: inviter2.openid,
                user_id: inviter2.id || inviter2._legacy_id || inviter2.openid,
                receiver_nickname: pickNickname(inviter2),
                receiver_role_level: pickRoleLevel(inviter2),
                order_id: orderId,
                order_no: orderNo,
                buyer_openid: buyerOpenid,
                buyer_nickname: pickNickname(buyer),
                type: 'indirect',
                level: 2,
                level_label: '间推佣金',
                amount: indirectAmount,
                rate: config.indirectRate,
                order_amount: amount,
                status: 'frozen',
                frozen_at: now.toISOString(),
                refund_deadline: settleAt.toISOString(),
                available_at: settleAt.toISOString(),
                remark: `订单${orderNo}间推佣金 ${config.indirectRate * 100}%`,
                product_snapshot: (orderItems || []).map((item) => ({
                    name: item.snapshot_name || '',
                    qty: item.qty || 0,
                    amount: item.item_amount || 0
                })),
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            });
        }
    }

    // 批量写入佣金记录
    let created = 0;
    for (const comm of commissions) {
        try {
            await db.collection('commissions').add({ data: comm });
            created += 1;
        } catch (err) {
            console.error('创建佣金记录失败:', err);
        }
    }

    return { created, total: commissions.length };
}

/**
 * 确认收货后：将冻结佣金转为待审核（pending_approval）
 */
async function unfreezeCommissionsForOrder(orderNo) {
    const rows = await readAll('commissions', { order_no: orderNo, order_id: orderNo });
    let updated = 0;
    for (const row of rows.filter((item) => item.status === 'frozen')) {
        try {
            await db.collection('commissions').doc(row._id).update({
                data: {
                    status: 'pending_approval',
                    unfrozen_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            });
            updated += 1;
        } catch (err) {
            console.error('解冻佣金失败:', err);
        }
    }
    return { updated };
}

/**
 * T+N 定时结算：将超时的待审核佣金转为已批准，并加到用户余额
 */
async function settleMaturedCommissions() {
    const now = new Date();
    // 查询所有 available_at 已过且状态为 pending_approval 的佣金
    const allCommissions = await readAll('commissions');
    const matured = allCommissions.filter((item) => {
        if (item.status !== 'pending_approval') return false;
        const availableAt = item.available_at ? new Date(item.available_at) : null;
        if (!availableAt) return false;
        return availableAt <= now;
    });

    let settled = 0;
    let totalAmount = 0;
    for (const comm of matured) {
        try {
            // 更新佣金状态
            await db.collection('commissions').doc(comm._id).update({
                data: {
                    status: 'approved',
                    approved_at: db.serverDate(),
                    settled_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            });

            // 将佣金加到接收者钱包余额
            if (comm.openid) {
                const receiverUsers = await readAll('users', { openid: comm.openid });
                const receiver = receiverUsers[0];
                if (receiver) {
                    await db.collection('users').doc(receiver._id).update({
                        data: {
                            wallet_balance: _.inc(toNumber(comm.amount, 0)),
                            balance: _.inc(toNumber(comm.amount, 0)),
                            updated_at: db.serverDate()
                        }
                    });
                }
            }

            settled += 1;
            totalAmount += toNumber(comm.amount, 0);
        } catch (err) {
            console.error('结算佣金失败:', err);
        }
    }

    return { settled, totalAmount };
}

/**
 * 取消订单的佣金（退款时调用）
 */
async function cancelCommissionsForOrder(orderNo) {
    const rows = await readAll('commissions', { order_no: orderNo, order_id: orderNo });
    let cancelled = 0;
    for (const row of rows.filter((item) => !['settled', 'cancelled'].includes(item.status))) {
        try {
            await db.collection('commissions').doc(row._id).update({
                data: {
                    status: 'cancelled',
                    cancelled_at: db.serverDate(),
                    remark: (row.remark || '') + ' [订单退款取消]',
                    updated_at: db.serverDate()
                }
            });
            cancelled += 1;
        } catch (err) {
            console.error('取消佣金失败:', err);
        }
    }
    return { cancelled };
}

/**
 * 佣金预览：计算某个商品/金额的预估佣金
 */
async function commissionPreview(openid, amount, productIds) {
    const config = await getCommissionConfig();
    const userDoc = (await readAll('users', { openid }))[0] || null;
    const roleLevel = pickRoleLevel(userDoc);

    const result = {
        eligible: roleLevel >= config.minRoleLevel,
        role_level: roleLevel,
        commissions: []
    };

    if (!result.eligible) return result;

    const directAmount = Math.round(amount * config.directRate * 100) / 100;
    result.commissions.push({
        level: 1,
        type: 'direct',
        label: '直推佣金',
        rate: config.directRate,
        amount: directAmount,
        description: `直推 ${config.directRate * 100}%`
    });

    const indirectAmount = Math.round(amount * config.indirectRate * 100) / 100;
    result.commissions.push({
        level: 2,
        type: 'indirect',
        label: '间推佣金',
        rate: config.indirectRate,
        amount: indirectAmount,
        description: `间推 ${config.indirectRate * 100}%`
    });

    return result;
}

function mapWalletLog(item) {
    const changeType = item.change_type || item.type || '';
    const amount = toNumber(item.amount, 0);
    return {
        ...item,
        id: item.id || item._legacy_id || item._id,
        amount,
        change_type: changeType,
        balance_after: toNumber(item.balance_after, 0),
        balance_before: toNumber(item.balance_before, 0),
        created_at: isoDate(item.created_at),
        updated_at: isoDate(item.updated_at),
        ref_id: item.ref_id || item.order_no || '',
        remark: item.remark || '',
        is_income: ['recharge', 'refund', 'income', 'recharge_pending'].includes(changeType)
    };
}

function buildAgentWalletPayload(user, walletAccount, walletLogs) {
    const account = walletAccount || {};
    const balance = toNumber(account.balance != null ? account.balance : pickBalance(user), 0);
    const frozenBalance = toNumber(account.frozen_balance, 0);
    const totalRecharge = toNumber(account.total_recharge, walletLogs
        .filter((item) => ['recharge', 'recharge_pending'].includes(item.change_type))
        .reduce((sum, item) => sum + toNumber(item.amount, 0), 0));
    const totalDeduct = toNumber(account.total_deduct, walletLogs
        .filter((item) => ['deduct', 'consume', 'payment'].includes(item.change_type))
        .reduce((sum, item) => sum + toNumber(item.amount, 0), 0));

    return {
        balance,
        frozen_balance: frozenBalance,
        freeze_balance: frozenBalance,
        total_recharge: totalRecharge,
        total_deduct: totalDeduct,
        total_income: totalRecharge
    };
}

function buildAgentWorkbenchPayload(user, walletAccount, walletLogs, orders, commissions) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthProfit = commissions
        .filter((item) => monthKey(item.settled_at || item.created_at) === currentMonth)
        .reduce((sum, item) => sum + toNumber(item.amount, 0), 0);
    const pendingShip = orders.filter((item) => item.status === 'pending_ship').length;
    const stockCount = walletLogs
        .filter((item) => ['deduct', 'refund'].includes(item.change_type))
        .reduce((sum, item) => sum + 1, 0);

    return {
        pending_ship: pendingShip,
        month_profit: monthProfit.toFixed(2),
        debt_amount: '0.00',
        goods_fund_balance: toNumber(walletAccount?.balance, pickBalance(user), 0).toFixed(2),
        stock_count: stockCount,
        total_orders: orders.length
    };
}

function mapOrderForAgent(order) {
    return {
        ...order,
        id: order.id || order._legacy_id || order._id,
        order_no: order.order_no || '',
        status: order.status || 'pending_payment',
        actual_price: toNumber(order.actual_price != null ? order.actual_price : order.total_amount, 0),
        total_amount: toNumber(order.total_amount != null ? order.total_amount : order.actual_price, 0),
        created_at: isoDate(order.created_at),
        updated_at: isoDate(order.updated_at),
        address_snapshot: order.address_snapshot || order.address || null
    };
}

async function getCurrentUser(openid) {
    const users = await readAll('users', { openid });
    return users[0] || null;
}

exports.main = async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    // ── 定时触发器：自动结算到期佣金 ──
    if (event.Type === 'Timer' && event.TriggerName === 'settleMaturedTimer') {
        const result = await settleMaturedCommissions();
        console.log('定时结算佣金结果:', JSON.stringify(result));
        return result;
    }

    const { action, ...params } = event;

    const user = await getCurrentUser(openid);
    if (!user && action !== 'settle' && action !== 'settleMatured' && action !== 'createCommissions' && action !== 'unfreezeCommissions' && action !== 'cancelCommissions') {
        return { code: 401, success: false, message: '请先登录' };
    }

    if (action === 'center' || action === 'stats' || action === 'team' || action === 'teamDetail') {
        const users = await getUsers();
        const hierarchy = buildTeamHierarchy(user, users);
        const orders = await readAll('orders');
        const { orderCountMap, salesMap } = buildOrderOwnerStats(orders);
        const directMembers = hierarchy.direct.map((item) => buildTeamMember(item, 1, orderCountMap, salesMap));
        const indirectMembers = hierarchy.indirect.map((item) => buildTeamMember(item, 2, orderCountMap, salesMap));
        const commissions = (await ownedRows('commissions', openid, user)).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        const withdrawals = await ownedRows('withdrawals', openid, user);
        const walletAccounts = await ownedRows('wallet_accounts', openid, user);
        const inviter = findInviter(user, users);
        const walletLedger = buildWalletLedger(commissions, withdrawals, pickBalance(user));
        if (walletLedger.hasLedger && Math.abs(walletLedger.drift) >= 0.01) {
            await syncWalletBalance(user, walletLedger.balance);
        }
        const dashboard = buildDashboardPayload(
            user,
            { direct: directMembers, indirect: indirectMembers, total: [...directMembers, ...indirectMembers] },
            commissions,
            walletAccounts[0] || null,
            inviter,
            walletLedger.balance
        );

        if (action === 'center') {
            return { code: 0, success: true, data: dashboard };
        }

        if (action === 'stats') {
            return {
                code: 0,
                success: true,
                data: {
                    team: dashboard.team,
                    stats: {
                        totalEarnings: dashboard.team.totalSales,
                        totalCommission: dashboard.stats.totalEarnings,
                        frozenAmount: dashboard.stats.frozenAmount
                    },
                    userInfo: dashboard.userInfo
                }
            };
        }

        if (action === 'team') {
            const rawLevel = String(params.level || 'direct').toLowerCase();
            const level = rawLevel === 'indirect' ? 'indirect' : 'direct';
            const rows = level === 'indirect' ? indirectMembers : directMembers;
            const result = paginate(rows, params.page, params.limit || params.size || 20);
            return { code: 0, success: true, data: { list: result.list, pagination: result.pagination, total: result.pagination.total } };
        }

        const memberId = String(params.member_id || '');
        const rows = [...directMembers, ...indirectMembers];
        const member = rows.find((item) => String(item.id) === memberId || String(item._id) === memberId || String(item.openid) === memberId);
        if (!member) return { code: 404, success: false, message: '成员不存在' };
        return { code: 0, success: true, data: member };
    }

    if (action === 'commLogs') {
        const rows = (await ownedRows('commissions', openid, user))
            .filter((item) => !params.status || item.status === params.status)
            .filter((item) => !params.type || String(item.type || '').toLowerCase() === String(params.type).toLowerCase())
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .map((item) => ({
                ...item,
                id: item.id || item._legacy_id || item._id,
                amount: toNumber(item.amount, 0),
                rate: toNumber(item.rate, 0),
                order_amount: toNumber(item.order_amount, 0),
                type: item.type || 'direct',
                level: toNumber(item.level, 0),
                level_label: item.level_label || (item.type === 'indirect' ? '间推佣金' : '直推佣金'),
                buyer_nickname: item.buyer_nickname || '',
                order_no: item.order_no || item.order_id || '',
                created_at: isoDate(item.created_at),
                frozen_at: isoDate(item.frozen_at),
                unfrozen_at: isoDate(item.unfrozen_at),
                approved_at: isoDate(item.approved_at),
                settled_at: isoDate(item.settled_at),
                cancelled_at: isoDate(item.cancelled_at),
                refund_deadline: isoDate(item.refund_deadline),
                available_at: isoDate(item.available_at),
                remark: item.remark || ''
            }));
        const result = paginate(rows, params.page, params.limit || params.size || 20);
        return { code: 0, success: true, data: { list: result.list, pagination: result.pagination, total: result.pagination.total } };
    }

    if (action === 'withdraw') {
        const amount = toNumber(params.amount, 0);
        const commissions = await ownedRows('commissions', openid, user);
        const withdrawals = await ownedRows('withdrawals', openid, user);
        const walletLedger = buildWalletLedger(commissions, withdrawals, pickBalance(user));
        const balance = walletLedger.balance;
        if (amount <= 0) return { code: 400, success: false, message: '提现金额不正确' };
        if (amount > balance) return { code: 400, success: false, message: '余额不足' };

        const withdrawalNo = `WD${Date.now()}`;
        const nextBalance = Math.max(0, roundMoney(balance - amount));
        await db.collection('withdrawals').add({
            data: {
                openid,
                user_id: user.id || user._legacy_id || openid,
                withdrawal_no: withdrawalNo,
                amount,
                actual_amount: amount,
                fee: 0,
                balance_before: balance,
                balance_after: nextBalance,
                method: params.method || 'wechat',
                account_no: params.account_no || '',
                account_name: params.account_name || '',
                bank_name: params.bank_name || '',
                status: 'pending',
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
        await db.collection('users').doc(user._id).update({
            data: {
                wallet_balance: nextBalance,
                balance: nextBalance,
                updated_at: db.serverDate()
            }
        });
        return { code: 0, success: true, data: { withdrawal_no: withdrawalNo } };
    }

    if (action === 'withdrawList') {
        const rows = (await ownedRows('withdrawals', openid, user))
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .map((item) => ({
                ...item,
                id: item.id || item._legacy_id || item._id,
                amount: toNumber(item.amount, 0),
                fee: toNumber(item.fee, 0),
                actual_amount: toNumber(item.actual_amount != null ? item.actual_amount : item.amount, 0),
                created_at: isoDate(item.created_at)
            }));
        const result = paginate(rows, params.page, params.limit || 20);
        return { code: 0, success: true, data: { list: result.list, pagination: result.pagination } };
    }

    if (action === 'settle') {
        const rows = await readAll('commissions', { order_id: params.order_id });
        for (const row of rows.filter((item) => item.status === 'pending')) {
            await db.collection('commissions').doc(row._id).update({
                data: { status: 'settled', settled_at: db.serverDate(), updated_at: db.serverDate() }
            });
            const receiver = row.openid ? await getCurrentUser(row.openid) : null;
            if (receiver) {
                await db.collection('users').doc(receiver._id).update({
                    data: {
                        wallet_balance: _.inc(toNumber(row.amount, 0)),
                        balance: _.inc(toNumber(row.amount, 0)),
                        updated_at: db.serverDate()
                    }
                });
            }
        }
        return { code: 0, success: true };
    }

    if (action === 'agentWorkbench' || action === 'agentWallet' || action === 'agentWalletLogs' || action === 'agentWalletRechargeConfig' || action === 'agentWalletPrepay' || action === 'agentWalletRechargeOrderDetail' || action === 'agentOrders') {
        const walletAccounts = await ownedRows('wallet_accounts', openid, user);
        const walletLogs = (await ownedRows('wallet_logs', openid, user))
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .map(mapWalletLog);
        const orders = (await readAll('orders')).filter((item) => {
            if (item.openid === openid) return true;
            if (String(item.buyer_id || '') === String(user.id || user._legacy_id || '')) return true;
            return pickRoleLevel(user) >= 3;
        }).map(mapOrderForAgent);
        const commissions = await ownedRows('commissions', openid, user);

        if (action === 'agentWorkbench') {
            return {
                code: 0,
                success: true,
                data: buildAgentWorkbenchPayload(user, walletAccounts[0] || null, walletLogs, orders, commissions)
            };
        }

        if (action === 'agentWallet') {
            return {
                code: 0,
                success: true,
                data: buildAgentWalletPayload(user, walletAccounts[0] || null, walletLogs)
            };
        }

        if (action === 'agentWalletLogs') {
            const filter = String(params.filter || params.type || 'all').toLowerCase();
            const rows = walletLogs.filter((item) => {
                if (filter === 'in') return item.is_income;
                if (filter === 'out') return !item.is_income;
                return true;
            });
            const result = paginate(rows, params.page, params.limit || 20);
            return { code: 0, success: true, data: { list: result.list, pagination: result.pagination } };
        }

        if (action === 'agentWalletRechargeConfig') {
            // 优先从数据库读取配置，否则用默认值
            const configRes = await db.collection('wallet_recharge_configs')
                .where({ is_active: _.in([true, 1, '1']) })
                .orderBy('sort_order', 'asc')
                .limit(20)
                .get()
                .catch(() => ({ data: [] }));
            const list = configRes.data.length
                ? configRes.data.map((item) => ({
                    ...item,
                    id: item._id || item.id,
                    amount: toNumber(item.amount, 0),
                    bonus_amount: toNumber(item.bonus_amount, 0)
                }))
                : [100, 300, 500, 1000].map((amount) => ({ amount, bonus_amount: 0 }));
            // 检查支付是否配置（通过调用 payment 云函数的 configCheck）
            let paymentEnabled = false;
            try {
                const payCheck = await cloud.callFunction({
                    name: 'payment',
                    data: { action: 'configCheck' }
                });
                paymentEnabled = !!(payCheck.result && payCheck.result.data && payCheck.result.data.formal_configured);
            } catch (_) {}
            return {
                code: 0,
                success: true,
                data: {
                    enabled: paymentEnabled,
                    list,
                    payment_methods: paymentEnabled ? ['wechat'] : [],
                    message: paymentEnabled ? '' : '货款充值正式支付尚未接通，当前仅保留账本读取能力'
                }
            };
        }

        if (action === 'agentWalletPrepay') {
            // 尝试调用 payment 云函数发起真实支付
            const amount = toNumber(params.amount, 0);
            if (amount <= 0) return { code: 400, success: false, message: '充值金额无效' };
            try {
                const payCheck = await cloud.callFunction({
                    name: 'payment',
                    data: { action: 'configCheck' }
                });
                const formalConfigured = !!(payCheck.result && payCheck.result.data && payCheck.result.data.formal_configured);
                if (!formalConfigured) {
                    // 支付未配置时，直接充值（模拟模式）
                    const walletAccounts = await ownedRows('wallet_accounts', openid, user);
                    const walletAccount = walletAccounts[0] || null;
                    const currentBalance = toNumber(walletAccount?.balance != null ? walletAccount.balance : pickBalance(user), 0);
                    if (walletAccount) {
                        await db.collection('wallet_accounts').doc(walletAccount._id).update({
                            data: { balance: _.inc(amount), total_recharge: _.inc(amount), updated_at: db.serverDate() }
                        });
                    } else {
                        await db.collection('wallet_accounts').add({
                            data: {
                                openid,
                                user_id: user.id || user._legacy_id || openid,
                                balance: amount,
                                frozen_balance: 0,
                                total_recharge: amount,
                                total_deduct: 0,
                                created_at: db.serverDate(),
                                updated_at: db.serverDate()
                            }
                        });
                    }
                    await db.collection('wallet_logs').add({
                        data: {
                            openid,
                            user_id: user.id || user._legacy_id || openid,
                            change_type: 'recharge',
                            amount,
                            balance_before: currentBalance,
                            balance_after: currentBalance + amount,
                            ref_type: 'wallet_recharge_simulated',
                            ref_id: `WR${Date.now()}`,
                            remark: `模拟充值货款 ¥${amount.toFixed(2)}`,
                            created_at: db.serverDate(),
                            updated_at: db.serverDate()
                        }
                    });
                    return {
                        code: 0,
                        success: true,
                        data: {
                            simulated: true,
                            amount,
                            balance_before: currentBalance,
                            balance_after: currentBalance + amount,
                            message: '模拟模式：充值已直接到账'
                        }
                    };
                }
                // 正式支付模式 — 创建充值单并调用支付
                const orderNo = `WR${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
                const bonus = toNumber(params.bonus_amount, 0);
                await db.collection('wallet_recharge_orders').add({
                    data: {
                        openid,
                        user_id: user.id || user._legacy_id || openid,
                        order_no: orderNo,
                        amount,
                        bonus_amount: bonus,
                        total_amount: amount + bonus,
                        status: 'pending',
                        created_at: db.serverDate(),
                        updated_at: db.serverDate(),
                        expire_at: new Date(Date.now() + 30 * 60 * 1000)
                    }
                });
                return {
                    code: 0,
                    success: true,
                    data: {
                        simulated: false,
                        order_no: orderNo,
                        amount,
                        message: '充值单已创建，等待支付'
                    }
                };
            } catch (err) {
                return { code: 500, success: false, message: `充值处理失败: ${err.message || '未知错误'}` };
            }
        }

        if (action === 'agentWalletRechargeOrderDetail') {
            const rows = await ownedRows('wallet_recharge_orders', openid, user);
            const rechargeOrderId = String(params.recharge_order_id || '');
            const order = rows.find((item) => String(item.id) === rechargeOrderId || String(item.order_no) === rechargeOrderId || String(item._id) === rechargeOrderId);
            if (!order) return { code: 404, success: false, message: '充值单不存在' };
            const expireAt = order.expire_at ? new Date(order.expire_at).getTime() : 0;
            const remaining = expireAt ? Math.max(0, Math.floor((expireAt - Date.now()) / 1000)) : 0;
            return {
                code: 0,
                success: true,
                data: {
                    ...order,
                    id: order.id || order._legacy_id || order._id,
                    amount: toNumber(order.amount, 0),
                    created_at: isoDate(order.created_at),
                    updated_at: isoDate(order.updated_at),
                    expire_at: isoDate(order.expire_at),
                    paid_at: isoDate(order.paid_at),
                    cancelled_at: isoDate(order.cancelled_at),
                    can_continue_pay: order.status === 'pending' && remaining > 0,
                    seconds_remaining: remaining
                }
            };
        }

        const status = String(params.status || '').trim();
        let rows = orders;
        if (status) rows = rows.filter((item) => item.status === status);
        const result = paginate(rows, params.page, params.limit || 20);
        return { code: 0, success: true, data: { list: result.list, pagination: result.pagination } };
    }

    if (action === 'agentRestock') {
        const roleLevel = pickRoleLevel(user);
        if (roleLevel < 3) return { code: 403, success: false, message: '仅代理商可操作' };

        const qtyNum = toNumber(params.quantity, 0);
        let unitCost = 0;
        let totalAmount = 0;
        let remark = '代理商货款充值';

        if (params.product_id && qtyNum > 0) {
            // 按商品成本口径充值
            const productRes = await db.collection('products').doc(String(params.product_id)).get().catch(() => null);
            const product = productRes?.data;
            if (!product) {
                // 尝试按 id 字段查询
                const altRes = await db.collection('products').where({ id: toNumber(params.product_id, NaN) }).limit(1).get().catch(() => ({ data: [] }));
                if (!altRes.data.length) return { code: 404, success: false, message: '商品不存在' };
            }
            const prod = product || (await db.collection('products').where({ id: toNumber(params.product_id, NaN) }).limit(1).get().catch(() => ({ data: [] }))).data[0];
            if (!prod) return { code: 404, success: false, message: '商品不存在' };

            unitCost = toNumber(prod.cost_price != null ? prod.cost_price : (prod.price_agent || prod.price_leader || prod.price_member || prod.retail_price), 0);
            totalAmount = unitCost * qtyNum;
            remark = `按商品成本口径充值货款 ${prod.name || ''}(${qtyNum}件 × ¥${unitCost.toFixed(2)})`;
        } else {
            totalAmount = toNumber(params.amount, 0);
            if (totalAmount <= 0) return { code: 400, success: false, message: '请提供有效充值金额' };
            unitCost = totalAmount;
            remark = `代理商主动充值货款 ¥${totalAmount.toFixed(2)}`;
        }

        // 检查钱包余额是否足够
        const walletAccounts = await ownedRows('wallet_accounts', openid, user);
        const walletAccount = walletAccounts[0] || null;
        const currentBalance = toNumber(walletAccount?.balance != null ? walletAccount.balance : pickBalance(user), 0);

        // 更新钱包余额（增加货款）
        if (walletAccount) {
            await db.collection('wallet_accounts').doc(walletAccount._id).update({
                data: {
                    balance: _.inc(totalAmount),
                    total_recharge: _.inc(totalAmount),
                    updated_at: db.serverDate()
                }
            });
        } else {
            await db.collection('wallet_accounts').add({
                data: {
                    openid,
                    user_id: user.id || user._legacy_id || openid,
                    balance: totalAmount,
                    frozen_balance: 0,
                    total_recharge: totalAmount,
                    total_deduct: 0,
                    created_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            });
        }

        // 写入钱包流水
        await db.collection('wallet_logs').add({
            data: {
                openid,
                user_id: user.id || user._legacy_id || openid,
                change_type: 'recharge',
                amount: totalAmount,
                balance_before: currentBalance,
                balance_after: currentBalance + totalAmount,
                ref_type: 'restock_recharge',
                ref_id: `RST${Date.now()}`,
                remark,
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });

        return {
            code: 0,
            success: true,
            data: {
                amount: totalAmount,
                quantity: qtyNum,
                unit_price: unitCost,
                total_amount: totalAmount,
                balance_before: currentBalance.toFixed(2),
                balance_after: (currentBalance + totalAmount).toFixed(2),
                stock_after: (currentBalance + totalAmount).toFixed(2)
            }
        };
    }

    // ── 佣金创建（支付成功后由 payment 云函数调用） ──
    if (action === 'createCommissions') {
        const { order_no, buyer_openid, order_amount, order_items } = params;
        if (!order_no || !buyer_openid) {
            return { code: 400, success: false, message: '缺少订单信息' };
        }
        const result = await createCommissionsForOrder(order_no, buyer_openid, order_amount, order_items);
        return { code: 0, success: true, data: result };
    }

    // ── 佣金解冻（确认收货后由 order 云函数调用） ──
    if (action === 'unfreezeCommissions') {
        const { order_no } = params;
        if (!order_no) return { code: 400, success: false, message: '缺少订单编号' };
        const result = await unfreezeCommissionsForOrder(order_no);
        return { code: 0, success: true, data: result };
    }

    // ── 佣金取消（退款时由 order 云函数调用） ──
    if (action === 'cancelCommissions') {
        const { order_no } = params;
        if (!order_no) return { code: 400, success: false, message: '缺少订单编号' };
        const result = await cancelCommissionsForOrder(order_no);
        return { code: 0, success: true, data: result };
    }

    // ── T+N 定时结算（由定时触发器或管理员调用） ──
    if (action === 'settleMatured') {
        const result = await settleMaturedCommissions();
        return { code: 0, success: true, data: result };
    }

    // ── 佣金预览（商品详情页用） ──
    if (action === 'commissionPreview') {
        const amount = toNumber(params.amount, 0);
        const productIds = toArray(params.product_ids);
        const result = await commissionPreview(openid, amount, productIds);
        return { code: 0, success: true, data: result };
    }

    return { code: 400, success: false, message: `未知 action: ${action}` };
};
