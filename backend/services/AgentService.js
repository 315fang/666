/**
 * AgentService
 * 从 agentController.js 提取的所有 DB 操作
 *
 * 约定：
 * - 不接触 req/res
 * - 返回数据或抛出 BusinessError
 * - Controller 层只做参数提取 → 调用 Service → res.json() / next(err)
 */

const { Order, Product, User, Address, CommissionLog, AgentWalletLog, sequelize } = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const { Op } = require('sequelize');
const CommissionService = require('./CommissionService');
const AgentWalletService = require('./AgentWalletService');
const { scheduleUploadShippingInfoAfterShip } = require('./WechatShippingInfoService');
const { BusinessError } = require('../utils/errors');
const { logError } = require('../utils/logger');
const { ORDER: ORDER_CONFIG } = require('../config/constants');

const WALLET_RECHARGE_EXPIRE_MINUTES = Math.max(1, parseInt(ORDER_CONFIG?.AUTO_CANCEL_MINUTES || 30, 10));

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}

function formatRechargeOrder(log, paidLog = null) {
    if (!log && !paidLog) return null;

    const source = paidLog || log;
    const createdAt = source.created_at ? new Date(source.created_at) : new Date();
    const expireAt = addMinutes(createdAt, WALLET_RECHARGE_EXPIRE_MINUTES);
    const now = Date.now();
    const canContinuePay = !!log && expireAt.getTime() > now;
    const secondsRemaining = canContinuePay
        ? Math.max(0, Math.floor((expireAt.getTime() - now) / 1000))
        : 0;

    let status = 'cancelled';
    let statusText = '充值单已关闭';
    if (paidLog) {
        status = 'paid';
        statusText = '充值成功';
    } else if (canContinuePay) {
        status = 'pending_payment';
        statusText = '待支付';
    }

    return {
        id: source.ref_id || String(source.id),
        order_no: source.ref_id || String(source.id),
        amount: parseFloat(source.amount || 0),
        status,
        status_text: statusText,
        can_continue_pay: canContinuePay,
        seconds_remaining: secondsRemaining,
        created_at: createdAt,
        expire_at: status === 'pending_payment' ? expireAt : null,
        paid_at: paidLog ? paidLog.created_at : null,
        cancelled_at: status === 'cancelled' ? expireAt : null,
        close_reason: status === 'cancelled' ? '充值单超时未支付' : '',
        remark: source.remark || ''
    };
}

async function findRechargeOrderLogs(userId, rechargeOrderId) {
    const idText = String(rechargeOrderId || '').trim();
    if (!idText) {
        throw new BusinessError('充值单号不能为空', 400);
    }

    const pendingWhere = {
        user_id: userId,
        change_type: 'recharge_pending',
        [Op.or]: [
            { id: Number.isFinite(Number(idText)) ? Number(idText) : -1 },
            { ref_id: idText }
        ]
    };

    const paidWhere = {
        user_id: userId,
        change_type: 'recharge',
        ref_type: 'wx_recharge',
        [Op.or]: [
            { id: Number.isFinite(Number(idText)) ? Number(idText) : -1 },
            { ref_id: idText }
        ]
    };

    const [pendingLog, directPaidLog] = await Promise.all([
        AgentWalletLog.findOne({
            where: pendingWhere,
            order: [['created_at', 'DESC']]
        }),
        AgentWalletLog.findOne({
            where: paidWhere,
            order: [['created_at', 'DESC']]
        })
    ]);

    let paidLog = directPaidLog;
    if (!paidLog && pendingLog?.ref_id) {
        paidLog = await AgentWalletLog.findOne({
            where: {
                user_id: userId,
                change_type: 'recharge',
                ref_type: 'wx_recharge',
                ref_id: pendingLog.ref_id
            },
            order: [['created_at', 'DESC']]
        });
    }

    if (!pendingLog && !paidLog) {
        throw new BusinessError('充值单不存在', 404);
    }

    return { pendingLog, paidLog };
}

// ============================================================
// 辅助：校验代理商身份（返回 user 实例）
// ============================================================
async function ensureAgent(userId) {
    const user = await User.findByPk(userId);
    if (!user || user.role_level < 3) {
        throw new BusinessError('仅代理商可访问', 403);
    }
    return user;
}

// ============================================================
// 工作台
// ============================================================

/**
 * 获取代理商工作台数据
 */
async function getWorkbench(userId) {
    const user = await ensureAgent(userId);

    const [pendingShip, pendingConfirm, totalHandled] = await Promise.all([
        Order.count({
            where: {
                agent_id: userId,
                status: { [Op.in]: ['paid', 'agent_confirmed'] }
            }
        }),
        Order.count({
            where: {
                agent_id: userId,
                status: 'shipping_requested'
            }
        }),
        Order.count({
            where: {
                fulfillment_partner_id: userId,
                status: { [Op.in]: ['shipped', 'completed'] }
            }
        })
    ]);

    // 本月发货利润
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthProfit = await CommissionLog.sum('amount', {
        where: {
            user_id: userId,
            type: 'agent_fulfillment',
            status: { [Op.in]: ['frozen', 'settled'] },
            created_at: { [Op.gte]: startOfMonth }
        }
    }) || 0;
    const walletAccount = await AgentWalletService.getAccount(userId);

    return {
        stock_count: 0,
        pending_ship: pendingShip,
        pending_confirm: pendingConfirm,
        total_handled: totalHandled,
        pending_orders: pendingShip,
        month_shipped: totalHandled,
        total_stocked: 0,
        month_profit: parseFloat(monthProfit).toFixed(2),
        debt_amount: parseFloat(user.debt_amount || 0).toFixed(2),
        goods_fund_balance: parseFloat(walletAccount.balance || 0).toFixed(2)
    };
}

// ============================================================
// 订单列表
// ============================================================

/**
 * 获取代理商待处理订单列表
 */
async function getAgentOrderList(userId, query) {
    await ensureAgent(userId);

    const { status, page = 1, limit = 20 } = query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { agent_id: userId };
    if (status) {
        if (status === 'pending_ship') {
            where.status = { [Op.in]: ['paid', 'agent_confirmed'] };
        } else {
            where.status = status;
        }
    } else {
        where.status = { [Op.in]: ['paid', 'agent_confirmed', 'shipping_requested', 'shipped'] };
    }

    const { count, rows } = await Order.findAndCountAll({
        where,
        include: [
            { model: Product, as: 'product', attributes: ['id', 'name', 'images', 'price_agent'] },
            { model: User, as: 'buyer', attributes: ['id', 'nickname'] },
            { model: Address, as: 'address', attributes: ['receiver_name', 'phone', 'province', 'city', 'district', 'detail'] }
        ],
        order: [['created_at', 'DESC']],
        offset,
        limit: parseInt(limit)
    });

    return {
        list: rows,
        pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
    };
}

// ============================================================
// 发货（核心事务）
// ============================================================

/**
 * 代理商自行发货（确认+扣货款+填单号，一步完成）
 */
async function agentShip(userId, orderId, { tracking_no, tracking_company }) {
    const t = await sequelize.transaction();
    try {
        // 锁定订单
        const order = await Order.findOne({
            where: { id: orderId, agent_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!order) {
            await t.rollback();
            throw new BusinessError('订单不存在或您无权操作', 404);
        }

        const isPickup = order.delivery_type === 'pickup';
        const trimmedNo = tracking_no != null ? String(tracking_no).trim() : '';
        const effectiveTrackingNo = trimmedNo || (isPickup ? '自提备货' : '');
        if (!effectiveTrackingNo) {
            await t.rollback();
            throw new BusinessError('请填写物流单号', 400);
        }

        if (!['paid', 'agent_confirmed'].includes(order.status)) {
            await t.rollback();
            throw new BusinessError(`当前订单状态(${order.status})不可发货`, 400);
        }

        await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });

        const buyer = await User.findByPk(order.buyer_id, { transaction: t });
        const orderProduct = await Product.findByPk(order.product_id, { transaction: t });

        // 发货成本
        const agentCostPrice = parseFloat(
            order.locked_agent_cost
            || orderProduct?.cost_price
            || orderProduct?.price_agent
            || orderProduct?.price_leader
            || orderProduct?.price_member
            || orderProduct?.retail_price
            || 0
        );
        const shipCost = agentCostPrice * order.quantity;

        // 扣货款余额
        const walletDeduct = await AgentWalletService.deduct({
            userId,
            amount: shipCost,
            refType: 'order_ship',
            refId: order.id,
            remark: `订单${order.order_no}发货扣货款`
        }, t);

        // 计算团队级差佣金 + 代理商发货利润
        if (orderProduct && buyer) {
            await CommissionService.calculateGapAndFulfillmentCommissions({
                order,
                buyer,
                product: orderProduct,
                agentId: userId,
                transaction: t,
                notifySource: '代理商自行发货'
            });
        }

        // 更新订单
        order.status = 'shipped';
        order.shipped_at = new Date();
        order.tracking_no = effectiveTrackingNo;
        order.logistics_company = tracking_company || null;
        order.fulfillment_type = 'Agent';
        order.fulfillment_partner_id = userId;
        const settleSnapshot = `货款扣减¥${shipCost.toFixed(2)}(余额 ${walletDeduct.before.toFixed(2)}→${walletDeduct.after.toFixed(2)})`;
        if (tracking_company) {
            order.remark = (order.remark ? order.remark + ' | ' : '') + `物流: ${tracking_company} ${effectiveTrackingNo} | ${settleSnapshot}`;
        } else {
            order.remark = (order.remark ? order.remark + ' | ' : '') + settleSnapshot;
        }
        await order.save({ transaction: t });

        await t.commit();

        // 事务外操作
        scheduleUploadShippingInfoAfterShip(order.id);

        await sendNotification(
            order.buyer_id,
            '订单已发货',
            isPickup
                ? `您的订单 ${order.order_no} 已备货完成，可到店自提（单号: ${effectiveTrackingNo}）`
                : `您的订单 ${order.order_no} 已由代理商发货，物流单号: ${effectiveTrackingNo}`,
            'order',
            order.id
        );

        return {
            order_no: order.order_no,
            tracking_no: effectiveTrackingNo,
            goods_fund_balance: walletDeduct.after.toFixed(2)
        };
    } catch (error) {
        await t.rollback();
        if (error instanceof BusinessError) throw error;
        logError('AgentService', '代理商发货失败', { error: error.message, userId, orderId });
        throw new BusinessError('发货失败', 500);
    }
}

// ============================================================
// 货款充值（兼容旧 restock 接口）
// ============================================================

/**
 * 代理商货款充值（兼容旧采购入仓接口）
 */
async function restockOrder(userId, { product_id, quantity, amount }) {
    const t = await sequelize.transaction();
    try {
        const qtyNum = Number(quantity || 0);
        const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!user || user.role_level < 3) {
            await t.rollback();
            throw new BusinessError('仅代理商可操作', 403);
        }

        let unitCost = 0;
        let totalAmount = 0;
        let rechargeRemark = '代理商货款充值';

        if (product_id && qtyNum > 0) {
            const product = await Product.findByPk(product_id, { transaction: t });
            if (!product || product.status !== 1) {
                await t.rollback();
                throw new BusinessError('商品不存在或已下架', 404);
            }
            unitCost = parseFloat(
                product.cost_price
                || product.price_agent
                || product.price_leader
                || product.price_member
                || product.retail_price
                || 0
            );
            totalAmount = unitCost * qtyNum;
            rechargeRemark = `按商品成本口径充值货款 ${product.name}(${qtyNum}件 × ¥${unitCost.toFixed(2)})`;
        } else {
            totalAmount = parseFloat(amount || 0);
            if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
                await t.rollback();
                throw new BusinessError('请提供有效充值金额', 400);
            }
            unitCost = totalAmount;
            rechargeRemark = `代理商主动充值货款 ¥${totalAmount.toFixed(2)}`;
        }

        const rechargeResult = await AgentWalletService.recharge({
            userId,
            amount: totalAmount,
            refType: 'restock_recharge',
            refId: `RST${Date.now()}`,
            remark: rechargeRemark
        }, t);
        await t.commit();

        return {
            amount: totalAmount,
            quantity: qtyNum,
            unit_price: unitCost,
            total_amount: totalAmount,
            balance_before: rechargeResult.before.toFixed(2),
            balance_after: rechargeResult.after.toFixed(2)
        };
    } catch (error) {
        await t.rollback();
        if (error instanceof BusinessError) throw error;
        logError('AgentService', '代理商货款充值失败', { error: error.message, userId });
        throw new BusinessError(error.message || '充值失败', 500);
    }
}

// ============================================================
// 货款流水（兼容旧 stock-logs 路径）
// ============================================================

/**
 * 获取货款流水
 */
async function getStockLogs(userId, page = 1, limit = 20) {
    await ensureAgent(userId);

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await AgentWalletLog.findAndCountAll({
        where: { user_id: userId },
        order: [['created_at', 'DESC']],
        offset,
        limit: parseInt(limit)
    });

    const walletAccount = await AgentWalletService.getAccount(userId);

    const paginatedLogs = rows.map((log) => {
        const isIn = log.change_type === 'recharge' || log.change_type === 'refund';
        const amount = parseFloat(log.amount || 0);
        return {
            id: log.id,
            type: isIn ? 'in' : 'out',
            label: isIn ? '货款增加' : '货款扣减',
            amount,
            time: log.created_at,
            created_at: log.created_at,
            change: isIn ? amount : -amount,
            stock_after: parseFloat(log.balance_after || 0).toFixed(2),
            order_id: log.ref_id || '',
            ref_type: log.ref_type || '',
            ref_id: log.ref_id || '',
            remark: log.remark || ''
        };
    });

    return {
        list: paginatedLogs,
        current_stock: parseFloat(walletAccount.balance || 0).toFixed(2),
        current_balance: parseFloat(walletAccount.balance || 0).toFixed(2),
        pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
    };
}

// ============================================================
// 钱包相关
// ============================================================

/**
 * 代理商货款账户信息
 */
async function getWalletInfo(userId) {
    await ensureAgent(userId);
    const account = await AgentWalletService.getAccount(userId);
    return {
        balance: parseFloat(account.balance || 0).toFixed(2),
        frozen_balance: parseFloat(account.frozen_balance || 0).toFixed(2),
        total_recharge: parseFloat(account.total_recharge || 0).toFixed(2),
        total_deduct: parseFloat(account.total_deduct || 0).toFixed(2)
    };
}

/**
 * 手动充值货款（默认关闭）
 */
async function rechargeWallet(userId, amount) {
    const t = await sequelize.transaction();
    try {
        const user = await User.findByPk(userId, { transaction: t });
        if (!user || user.role_level < 3) {
            await t.rollback();
            throw new BusinessError('仅代理商可操作', 403);
        }

        const allowManualRecharge = process.env.ENABLE_AGENT_MANUAL_RECHARGE === 'true' && process.env.NODE_ENV !== 'production';
        if (!allowManualRecharge) {
            await t.rollback();
            throw new BusinessError('请使用微信支付充值货款', 403);
        }
        if (!amount || amount <= 0) {
            await t.rollback();
            throw new BusinessError('充值金额必须大于0', 400);
        }

        const result = await AgentWalletService.recharge({
            userId,
            amount,
            refType: 'manual_recharge',
            refId: `RG${Date.now()}`,
            remark: '代理商主动充值货款'
        }, t);
        await t.commit();

        return {
            amount: amount.toFixed(2),
            balance_before: result.before.toFixed(2),
            balance_after: result.after.toFixed(2)
        };
    } catch (error) {
        await t.rollback();
        if (error instanceof BusinessError) throw error;
        logError('AgentService', '货款充值失败', { error: error.message, userId });
        throw new BusinessError(error.message || '充值失败', 500);
    }
}

/**
 * 货款流水（新接口）
 */
async function getWalletLogs(userId, page = 1, limit = 20, filter = 'all') {
    await ensureAgent(userId);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 20);
    const offset = (pageNum - 1) * limitNum;
    const where = { user_id: userId };
    const incomeTypes = ['recharge', 'refund', 'manual_recharge', 'recharge_pending'];
    if (filter === 'in') {
        where.change_type = { [Op.in]: incomeTypes };
    } else if (filter === 'out') {
        where.change_type = { [Op.notIn]: incomeTypes };
    }

    const { count, rows } = await AgentWalletLog.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        offset,
        limit: limitNum
    });
    return {
        list: rows,
        pagination: { total: count, page: pageNum, limit: limitNum }
    };
}

// ============================================================
// 门户地址
// ============================================================

/**
 * 获取代理门户地址（用于小程序 web-view 跳转）
 */
async function getPortalToken(userId) {
    const user = await ensureAgent(userId);
    const base = process.env.AGENT_PORTAL_URL || 'http://localhost:3002/login';
    const sep = base.includes('?') ? '&' : '?';
    return {
        portal_url: `${base}${sep}member_no=${encodeURIComponent(user.member_no || '')}`
    };
}

// ============================================================
// 微信支付预下单
// ============================================================

async function getRechargeOrderDetail(userId, rechargeOrderId) {
    await ensureAgent(userId);
    const { pendingLog, paidLog } = await findRechargeOrderLogs(userId, rechargeOrderId);
    return formatRechargeOrder(pendingLog, paidLog);
}

/**
 * 货款充值微信支付预下单
 */
async function prepayWalletRecharge(userId, amount, rechargeOrderId = null) {
    const user = await ensureAgent(userId);

    if (!user.openid) {
        throw new BusinessError('用户 openid 缺失，请重新登录', 400);
    }

    let rechargeAmount = parseFloat(amount || 0);
    let rechargeNo = '';

    if (rechargeOrderId) {
        const { pendingLog, paidLog } = await findRechargeOrderLogs(userId, rechargeOrderId);
        if (paidLog) {
            throw new BusinessError('该充值单已支付完成', 400);
        }
        const detail = formatRechargeOrder(pendingLog, null);
        if (!detail?.can_continue_pay) {
            throw new BusinessError('该充值单已超时关闭，请重新发起充值', 400);
        }
        rechargeAmount = parseFloat(pendingLog.amount || 0);
        rechargeNo = pendingLog.ref_id || `WR${pendingLog.id}`;
    }

    if (!rechargeAmount || rechargeAmount <= 0 || rechargeAmount > 100000) {
        throw new BusinessError('充值金额无效（0 < 金额 ≤ 100000）', 400);
    }

    const { createUnifiedOrder, buildJsApiParams } = require('../utils/wechat');
    if (!rechargeNo) {
        // 货款充值单号：WR + 时间戳 + userId 后4位
        rechargeNo = `WR${Date.now()}${String(userId).slice(-4).padStart(4, '0')}`;
    }

    const prepayId = await createUnifiedOrder({
        orderNo: rechargeNo,
        amount: rechargeAmount,
        openid: user.openid,
        body: '货款充值'
    });

    const jsApiParams = buildJsApiParams(prepayId);

    if (!rechargeOrderId) {
        // 暂存充值记录（pending 状态）
        await AgentWalletLog.create({
            user_id: userId,
            account_id: null,
            change_type: 'recharge_pending',
            amount: rechargeAmount,
            balance_before: 0,
            balance_after: 0,
            ref_type: 'wx_recharge',
            ref_id: rechargeNo,
            remark: `微信充值待确认 ¥${rechargeAmount.toFixed(2)}`
        });
    }

    return { ...jsApiParams, recharge_no: rechargeNo, amount: rechargeAmount };
}

module.exports = {
    getWorkbench,
    getAgentOrderList,
    agentShip,
    restockOrder,
    getStockLogs,
    getWalletInfo,
    rechargeWallet,
    prepayWalletRecharge,
    getRechargeOrderDetail,
    getWalletLogs,
    getPortalToken
};
