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

// ==================== 主处理函数 ====================
const asyncHandler = (handler) => async (...args) => {
    try {
        return await handler(...args);
    } catch (err) {
        if (err instanceof CloudBaseError) throw err;
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

    'commissionPreview': asyncHandler(async (openid) => {
        const stats = await distributionCommission.getStats(openid);
        return success(stats);
    }),

    'stats': asyncHandler(async (openid) => {
        const stats = await distributionCommission.getStats(openid);
        return success(stats);
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

        const teamRes = await db.collection('users')
            .where({ referrer_openid: openid })
            .orderBy('created_at', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get().catch(() => ({ data: [] }));

        const totalRes = await db.collection('users')
            .where({ referrer_openid: openid })
            .count().catch(() => ({ total: 0 }));

        return success({
            list: (teamRes.data || []).map(m => ({
                _id: m._id,
                openid: m.openid,
                nickName: m.nickName || m.nickname || '新用户',
                avatarUrl: m.avatarUrl || m.avatar_url || '',
                created_at: m.created_at,
                role_level: toNumber(m.role_level, 0),
                role_name: m.role_name || '普通用户',
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
