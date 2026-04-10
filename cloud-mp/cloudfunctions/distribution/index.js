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

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
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

    'stats': asyncHandler(async (openid) => {
        const dashboard = await distributionQuery.getDashboard(openid);
        return success(dashboard);
    }),

    'settleMatured': asyncHandler(async (openid) => {
        // 结算已到期佣金
        const res = await getAllRecords(db, 'commissions', { openid, status: 'pending' }).catch(() => []);

        let settledCount = 0;
        let totalAmount = 0;
        for (const comm of (res || [])) {
            // 佣金创建超过7天可结算
            const created = new Date(comm.created_at);
            const daysDiff = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
            if (daysDiff >= 7) {
                await db.collection('commissions').doc(comm._id).update({
                    data: { status: 'settled', settled_at: db.serverDate() },
                });
                totalAmount += toNumber(comm.amount, 0);
                settledCount += 1;
            }
        }

        if (totalAmount > 0) {
            await db.collection('users').where({ openid }).update({
                data: { wallet_balance: _.inc(totalAmount), total_earned: _.inc(totalAmount), updated_at: db.serverDate() },
            });
        }

        return success({ settled_count: settledCount, total_amount: totalAmount });
    }),

    // ===== 提现 =====
    'withdraw': asyncHandler(async (openid, params) => {
        const amount = toNumber(params.amount, 0);
        if (amount <= 0) throw badRequest('提现金额必须大于0');
        if (amount < 1) throw badRequest('最低提现1元');

        // 查询余额
        const userRes = await db.collection('users').where({ openid }).limit(1).get();
        if (!userRes.data || userRes.data.length === 0) throw notFound('用户不存在');

        const user = userRes.data[0];
        const balance = toNumber(user.wallet_balance != null ? user.wallet_balance : user.balance, 0);
        if (amount > balance) throw badRequest('余额不足');

        const withdrawNo = 'WD' + Date.now() + Math.floor(Math.random() * 1000);

        // 扣减余额
        await db.collection('users').where({ openid }).update({
            data: { wallet_balance: _.inc(-amount), total_withdrawn: _.inc(amount), updated_at: db.serverDate() },
        });

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
                joined_at: m.created_at,
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

        const member = await db.collection('users').doc(memberId).get().catch(() => ({ data: null }));
        if (!member.data || member.data.referrer_openid !== openid) {
            throw notFound('团队成员不存在');
        }

        // 查该成员贡献的佣金
        const commRes = await getAllRecords(db, 'commissions', { openid, from_openid: member.data.openid }).catch(() => []);

        let contributedAmount = 0;
        (commRes || []).forEach(c => { contributedAmount += toNumber(c.amount, 0); });

        return success({
            _id: member.data._id,
            nickName: member.data.nickName || member.data.nickname || '新用户',
            avatarUrl: member.data.avatarUrl || member.data.avatar_url || '',
            created_at: member.data.created_at,
            contributed_amount: contributedAmount,
            order_count: (commRes || []).length,
        });
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
        const user = userRes.data[0];
        return success({
            balance: toNumber(user.wallet_balance != null ? user.wallet_balance : user.balance, 0),
            total_earned: toNumber(user.total_earned, 0),
            total_withdrawn: toNumber(user.total_withdrawn, 0),
        });
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
        return success({
            options: [
                { amount: 100, bonus: 5 },
                { amount: 500, bonus: 30 },
                { amount: 1000, bonus: 80 },
            ],
        });
    }),

    'agentWalletPrepay': asyncHandler(async (openid, params) => {
        const amount = toNumber(params.amount, 0);
        if (amount <= 0) throw badRequest('充值金额必须大于0');
        const orderNo = 'RCH' + Date.now();
        const result = await db.collection('wallet_recharge_orders').add({
            data: { openid, order_no: orderNo, amount, status: 'pending', created_at: db.serverDate() },
        });
        return success({ recharge_id: result._id, order_no: orderNo, amount });
    }),

    'agentWalletRechargeOrderDetail': asyncHandler(async (openid, params) => {
        const id = params.recharge_order_id || params.id;
        if (!id) throw badRequest('缺少订单 ID');
        const order = await db.collection('wallet_recharge_orders').doc(id).get().catch(() => ({ data: null }));
        if (!order.data || order.data.openid !== openid) throw notFound('订单不存在');
        return success(order.data);
    }),

    // ===== 邀请码 =====
    'wxacodeInvite': asyncHandler(async (openid) => {
        const user = await db.collection('users').where({ openid }).limit(1).get();
        if (!user.data || user.data.length === 0) throw notFound('用户不存在');
        const inviteCode = user.data[0].my_invite_code || user.data[0].invite_code || '';
        return success({ invite_code: inviteCode, page: 'pages/index/index', scene: inviteCode });
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

    // 对于 center/dashboard 等查看类 action，非分销员也可访问（返回基础数据）
    // createCommissions/unfreezeCommissions/cancelCommissions 为内部调用，跳过权限检查
    const viewActions = ['center', 'dashboard', 'wxacodeInvite', 'agentWorkbench', 'createCommissions', 'unfreezeCommissions', 'cancelCommissions'];
    const { action } = event;

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
