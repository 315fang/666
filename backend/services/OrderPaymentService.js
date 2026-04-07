/** OrderPaymentService — 处理预支付、支付回调、补单与手动支付 */
const {
    Order,
    Product,
    User,
    AgentWalletAccount,
    AgentWalletLog,
    CommissionLog,
    AppConfig,
    UpgradeApplication,
    sequelize
} = require('../models');
const constants = require('../config/constants');
const { logOrder, error: logError } = require('../utils/logger');
const { createUnifiedOrder, buildJsApiParams, decryptNotifyResource, verifyNotifySign, queryJsapiOrderByOutTradeNo } = require('../utils/wechat');
const PointService = require('./PointService');
const AgentWalletService = require('./AgentWalletService');
const WechatShoppingOrderService = require('./WechatShoppingOrderService');
const { generatePickupCredentials } = require('./PickupService');
const { attributeRegionalProfit } = require('./StationProfitService');
const { sendNotification } = require('../models/notificationUtil');
const { runAfterCommit } = require('./TransactionHelper');
const { buildWxJsapiShoppingDescription } = require('./OrderCalcService');

/** 异步上报「小程序购物订单」（notify 与主动查单补单共用） */
function scheduleShoppingOrderUploadAfterWechatPay(paidOrderId, notifySnap) {
    setImmediate(() => {
        (async () => {
            try {
                const row = await Order.findByPk(paidOrderId);
                if (!row) return;
                const prod = await Product.findByPk(row.product_id);
                await WechatShoppingOrderService.uploadAfterWechatPay({
                    order: row,
                    product: prod,
                    notifyData: notifySnap
                });
            } catch (e) {
                logError('SHOPPING_ORDER', '异步上传失败', { error: e.message });
            }
        })();
    });
}

function buildNotifyResponse(ok, errorCode = null, statusCode = null) {
    if (ok) {
        return { json_success: true };
    }

    return { json_fail: errorCode, statusCode };
}

function buildWechatPayNotifySnapshot(notifyData, fallbackOrderNo = null) {
    return {
        out_trade_no: notifyData.out_trade_no || fallbackOrderNo,
        transaction_id: notifyData.transaction_id,
        mchid: notifyData.mchid,
        payer: notifyData.payer
    };
}

async function rollbackAndRespond(tx, errorCode, statusCode) {
    await tx.rollback();
    return buildNotifyResponse(false, errorCode, statusCode);
}

async function rollbackAndAcknowledge(tx) {
    await tx.rollback();
    return buildNotifyResponse(true);
}

async function rollbackWithError(tx, message) {
    if (!tx.finished) {
        await tx.rollback();
    }
    throw new Error(message);
}

async function awardBuyerAfterPayment({ buyer, order, amount, growthBaseAmount, buyerCity, distributableAmount, upgradedToMember }) {
    if (upgradedToMember) {
        await sendNotification(buyer.id, '身份升级成功', '恭喜！您已成功下单，系统已为您升级为"尊享会员"', 'upgrade');
    }

    const earnedPoints = Math.floor(amount);
    if (earnedPoints > 0) {
        await PointService.addPoints(order.buyer_id, earnedPoints, 'purchase', order.id, '消费积分');
    }

    if (growthBaseAmount > 0) {
        await PointService.addGrowthValue(order.buyer_id, growthBaseAmount, null, 'purchase');
    }

    const addrSnap = order?.address_snapshot || {};
    const location = {
        province: addrSnap?.province || buyer?.province || '',
        city: addrSnap?.city || buyerCity || '',
        district: addrSnap?.district || ''
    };
    if (location.province || location.city || location.district) {
        await attributeRegionalProfit(order.id, location, distributableAmount);
    }
}

async function accrueDividendPoolContribution(amount) {
    const dividendRuleCfg = await AppConfig.findOne({
        where: { config_key: 'agent_system_dividend_rules', status: 1 }
    });
    const dRules = dividendRuleCfg ? JSON.parse(dividendRuleCfg.config_value) : {};
    if (dRules.enabled === false) {
        return;
    }

    const sourcePct = parseFloat(dRules.source_pct || 3) / 100;
    const contribution = parseFloat((amount * sourcePct).toFixed(2));
    if (contribution <= 0) {
        return;
    }

    const poolT = await sequelize.transaction();
    try {
        const [poolCfg] = await AppConfig.findOrCreate({
            where: { config_key: 'dividend_pool_balance' },
            defaults: { config_value: '0', config_type: 'number', category: 'agent_system', status: 1 },
            transaction: poolT,
            lock: poolT.LOCK.UPDATE
        });
        const current = parseFloat(poolCfg.config_value || 0);
        poolCfg.config_value = String((current + contribution).toFixed(2));
        await poolCfg.save({ transaction: poolT });
        await poolT.commit();
    } catch (innerErr) {
        if (!poolT.finished) await poolT.rollback();
        throw innerErr;
    }
}

async function settleNMemberPriceGap({ buyer, order }) {
    if (buyer.role_level !== constants.ROLES.N_MEMBER || !buyer.n_leader_id) {
        return;
    }

    const nActualPrice = parseFloat(order.actual_price || order.total_amount || 0);
    const nLockedCost = parseFloat(order.locked_agent_cost || 0);
    const nGap = parseFloat((nActualPrice - nLockedCost).toFixed(2));
    if (nGap <= 0) {
        return;
    }

    const nTx = await sequelize.transaction();
    try {
        await User.increment('balance', { by: nGap, where: { id: buyer.n_leader_id }, transaction: nTx });
        await CommissionLog.create({
            user_id: buyer.n_leader_id,
            order_id: order.id,
            order_no: order.order_no,
            amount: nGap,
            type: 'n_price_gap',
            status: 'settled',
            settled_at: new Date(),
            remark: `N路径差价（小n #${buyer.id} 订单 ${order.order_no}）小n价¥${nActualPrice} - 大N价¥${nLockedCost}`
        }, { transaction: nTx });
        await nTx.commit();
    } catch (innerErr) {
        if (!nTx.finished) await nTx.rollback();
        throw innerErr;
    }
}

async function runPostPaymentSideEffects({ buyer, order, amount, growthBaseAmount, buyerCity, distributableAmount, upgradedToMember }) {
    await awardBuyerAfterPayment({ buyer, order, amount, growthBaseAmount, buyerCity, distributableAmount, upgradedToMember });

    try {
        await accrueDividendPoolContribution(amount);
    } catch (e) {
        logError('DIVIDEND', '分红池计提失败', { error: e.message });
    }

    try {
        await settleNMemberPriceGap({ buyer, order });
    } catch (e) {
        logError('N_PATH', 'N路径差价计提失败', { error: e.message });
    }
}

async function parseWechatPayNotifyRequest(req) {
    const rawBody = req.rawBody
        || (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : null)
        || (typeof req.body === 'string' ? req.body : null);

    if (!rawBody) {
        return { errorResponse: buildNotifyResponse(false, 'empty body', 400) };
    }

    if (!await verifyNotifySign(req.headers, rawBody)) {
        logError('PAYMENT', '[WechatNotify] 签名验证失败');
        return { errorResponse: buildNotifyResponse(false, 'sign error', 401) };
    }

    const parsed = JSON.parse(rawBody);
    const notifyData = decryptNotifyResource(parsed.resource);

    if (notifyData.trade_state !== 'SUCCESS') {
        logError('PAYMENT', `[WechatNotify] 支付失败: ${notifyData.trade_state_desc}`);
        return { errorResponse: buildNotifyResponse(true) };
    }

    const orderNo = notifyData.out_trade_no;
    const paidFee = parseInt(notifyData.amount && notifyData.amount.total, 10);
    if (!orderNo || Number.isNaN(paidFee) || paidFee <= 0) {
        logError('PAYMENT', '[WechatNotify] 关键字段缺失或异常', { orderNo, paidFee });
        return { errorResponse: buildNotifyResponse(false, 'invalid notify data', 400) };
    }

    return { notifyData, orderNo, paidFee };
}

async function handleWalletRechargeNotify(orderNo, paidFee) {
    const t = await sequelize.transaction();
    try {
        const pending = await AgentWalletLog.findOne({
            where: { ref_id: orderNo, change_type: 'recharge_pending' },
            transaction: t,
            lock: t.LOCK.UPDATE
        });
        if (!pending) {
            logError('PAYMENT', `[WechatNotify] 货款充值单 pending 不存在: ${orderNo}`, { orderNo });
            return rollbackAndAcknowledge(t);
        }

        const rechargeAmount = parseFloat(pending.amount);
        const expectedFee = Math.round(rechargeAmount * 100);
        if (Math.abs(paidFee - expectedFee) > 1) {
            logError('PAYMENT', '[WechatNotify] 货款充值金额不一致', { expectedFee, paidFee, orderNo });
            return rollbackAndRespond(t, 'amount mismatch', 400);
        }

        await AgentWalletService.recharge({
            userId: pending.user_id,
            amount: rechargeAmount,
            refType: 'wx_recharge',
            refId: orderNo,
            remark: `微信支付充值 ¥${rechargeAmount.toFixed(2)}`
        }, t);

        await pending.destroy({ transaction: t });
        await t.commit();
        logOrder('[WechatNotify] 货款充值成功', { orderNo, rechargeAmount });

        setImmediate(async () => {
            try {
                const cfgRow = await AppConfig.findOne({ where: { config_key: 'agent_system_recharge_config', status: 1 } });
                if (!cfgRow?.config_value) return;
                const cfg = JSON.parse(cfgRow.config_value);
                if (!cfg.bonus_enabled || !Array.isArray(cfg.bonus_tiers) || !cfg.bonus_tiers.length) return;
                const sorted = cfg.bonus_tiers.sort((a, b) => b.min - a.min);
                const matched = sorted.find(tier => rechargeAmount >= tier.min);
                if (!matched || !matched.bonus || matched.bonus <= 0) return;
                await AgentWalletService.recharge({
                    userId: pending.user_id,
                    amount: matched.bonus,
                    refType: 'recharge_bonus',
                    refId: orderNo,
                    remark: `充值满赠：充 ¥${rechargeAmount} 送 ¥${matched.bonus}`
                });
                logOrder(`[满购] 用户${pending.user_id} 充 ¥${rechargeAmount} 送 ¥${matched.bonus}`);
            } catch (e) {
                logError('PAYMENT', '[满购] 发放失败', { error: e.message });
            }
        });

        return buildNotifyResponse(true);
    } catch (innerErr) {
        if (!t.finished) await t.rollback();
        logError('PAYMENT', '[WechatNotify] 货款充值事务失败', { error: innerErr.message });
        return buildNotifyResponse(false, 'server error', 500);
    }
}

async function handleUpgradePaymentNotify(orderNo, paidFee) {
    try {
        const app = await UpgradeApplication.findOne({ where: { payment_no: orderNo } });
        if (!app || app.status !== 'pending_payment') {
            logError('PAYMENT', `[WechatNotify] 升级单已处理: ${orderNo}`, { orderNo });
            return buildNotifyResponse(true);
        }

        const expectedFee = Math.round(parseFloat(app.amount) * 100);
        if (Math.abs(paidFee - expectedFee) > 1) {
            logError('PAYMENT', '[WechatNotify] 升级缴费金额不一致', { expectedFee, paidFee, orderNo });
            return buildNotifyResponse(false, 'amount mismatch', 400);
        }

        const t = await sequelize.transaction();
        try {
            app.status = 'pending_review';
            await app.save({ transaction: t });

            await AgentWalletService.recharge({
                userId: app.user_id,
                amount: parseFloat(app.amount),
                refType: 'upgrade_payment',
                refId: String(app.id),
                remark: `升级缴费 ¥${app.amount}`
            }, t);

            await t.commit();
            logOrder('[WechatNotify] 升级缴费成功', { orderNo, amount: app.amount });

            sendNotification(
                app.user_id,
                '升级缴费成功',
                `您的 ¥${app.amount} 已充入货款钱包，升级申请正在等待审核。`,
                'upgrade',
                String(app.id)
            ).catch(() => {});

            return buildNotifyResponse(true);
        } catch (innerErr) {
            if (!t.finished) await t.rollback();
            throw innerErr;
        }
    } catch (err) {
        logError('PAYMENT', '[WechatNotify] 升级缴费处理失败', { error: err.message });
        return buildNotifyResponse(false, 'server error', 500);
    }
}

async function handleOrderWechatPayNotify(orderNo, paidFee, notifyData) {
    const t = await sequelize.transaction();
    try {
        const order = await Order.findOne({
            where: { order_no: orderNo },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!order) {
            logError('PAYMENT', '[WechatNotify] 订单不存在', { orderNo });
            return rollbackAndRespond(t, 'order not found', 404);
        }

        if (order.status !== 'pending') {
            return rollbackAndAcknowledge(t);
        }

        const expectedFee = Math.round(parseFloat(order.total_amount) * 100);
        if (Math.abs(paidFee - expectedFee) > 1) {
            logError('PAYMENT', '[WechatNotify] 金额不一致', { expectedFee, paidFee, orderNo });
            return rollbackAndRespond(t, 'amount mismatch', 400);
        }

        order.payment_method = 'wechat';
        await order.save({ transaction: t });
        await _markOrderAsPaid(order, t);
        await t.commit();

        logOrder('[WechatNotify] 订单支付成功', { orderNo });
        scheduleShoppingOrderUploadAfterWechatPay(order.id, buildWechatPayNotifySnapshot(notifyData, orderNo));

        return buildNotifyResponse(true);
    } catch (innerErr) {
        if (!t.finished) await t.rollback();
        logError('PAYMENT', '[WechatNotify] 事务失败', { error: innerErr.message });
        return buildNotifyResponse(false, 'server error', 500);
    }
}

/** 支付成功后核心枢纽函数：标记订单+子订单为已支付，触发所有异步副作用 */
const _markOrderAsPaid = async (order, t) => {
    order.status = 'paid';
    order.paid_at = new Date();
    if (order.delivery_type === 'pickup' && !order.pickup_code) {
        const creds = generatePickupCredentials(order.id);
        order.pickup_code = creds.pickup_code;
        order.pickup_qr_token = creds.pickup_qr_token;
    }
    await order.save({ transaction: t });

    const childOrders = await Order.findAll({
        where: { parent_order_id: order.id },
        transaction: t,
        lock: t.LOCK.UPDATE
    });
    for (const child of childOrders) {
        if (child.status !== 'pending') {
            throw new Error("关联子订单状态异常");
        }
        child.status = 'paid';
        child.paid_at = new Date();
        await child.save({ transaction: t });
    }

    const buyer = await User.findByPk(order.buyer_id, { transaction: t });
    const amount = parseFloat(order.total_amount);
    const distributableAmount = parseFloat(order.actual_price || order.total_amount || 0);
    let growthBaseAmount = 0;
    try {
        const cfg = await AppConfig.findOne({
            where: { config_key: `product_growth_reward_${order.product_id}`, status: 1 },
            transaction: t
        });
        const customReward = cfg ? parseFloat(cfg.config_value || 0) : 0;
        if (customReward > 0) {
            growthBaseAmount = customReward * (order.quantity || 1);
        } else {
            growthBaseAmount = Math.floor(Math.max(0, amount));
        }
    } catch (_) {
        growthBaseAmount = Math.floor(Math.max(0, amount));
    }
    const buyerCity = buyer?.city || null;
    let upgradedToMember = false;
    const minPurchase = constants.UPGRADE_RULES.GUEST_TO_MEMBER.min_purchase_amount || 0;
    if (buyer.role_level === constants.ROLES.GUEST && amount >= minPurchase) {
        buyer.role_level = constants.ROLES.MEMBER;
        await buyer.save({ transaction: t });
        upgradedToMember = true;
    }
    await buyer.increment('total_sales', { by: amount, transaction: t });

    logOrder('订单支付', {
        userId: order.buyer_id,
        orderId: order.id,
        orderNo: order.order_no,
        amount
    });

    runAfterCommit(t, async () => {
        await runPostPaymentSideEffects({
            buyer,
            order,
            amount,
            growthBaseAmount,
            buyerCity,
            distributableAmount,
            upgradedToMember
        });
    });

    return { order, childOrders };
};

class OrderPaymentService {

    /**
     * 预下单（统一下单）：生成 wx.requestPayment() 所需参数
     */
    static async prepayOrder(req) {
        try {
            const userId = req.user.id;
            const { id } = req.params;
            const useWalletBalance = req.body?.use_wallet_balance === true;

            const order = await Order.findOne({ where: { id, buyer_id: userId } });
            if (!order) throw new Error('订单不存在');
            if (order.status !== 'pending') throw new Error('订单状态不正确，无法发起支付');

            const user = await User.findByPk(userId, { attributes: ['id', 'openid', 'role_level'] });
            if (!user || !user.openid) throw new Error('用户 openid 缺失，请重新登录后重试');

            const orderAmount = parseFloat(order.total_amount);

            // 零元订单直接标记已支付
            if (orderAmount <= 0) {
                const t = await sequelize.transaction();
                try {
                    order.payment_method = 'free';
                    await order.save({ transaction: t });
                    await _markOrderAsPaid(order, t);
                    await t.commit();
                    return { data: { paid_by_free: true, amount: 0, message: '订单金额为0，已自动完成支付' } };
                } catch (e) {
                    if (!t.finished) await t.rollback();
                    throw e;
                }
            }

            let walletFallbackInfo = null;

            // 货款余额支付
            if (useWalletBalance && (user.role_level >= 3 || user.role_level === constants.ROLES.N_MEMBER || user.role_level === constants.ROLES.N_LEADER)) {
                const t = await sequelize.transaction();
                try {
                    const account = await AgentWalletAccount.findOne({
                        where: { user_id: userId },
                        transaction: t, lock: t.LOCK.UPDATE
                    });
                    const walletBalance = account ? parseFloat(account.balance || 0) : 0;

                    if (walletBalance >= orderAmount) {
                        const newBalance = parseFloat((walletBalance - orderAmount).toFixed(2));
                        account.balance = newBalance;
                        await account.save({ transaction: t });

                        await AgentWalletLog.create({
                            account_id: account.id,
                            change_type: 'deduct',
                            amount: -orderAmount,
                            balance_before: walletBalance,
                            balance_after: newBalance,
                            ref_type: 'order_payment',
                            ref_id: order.order_no,
                            remark: `货款余额支付订单 ${order.order_no}`
                        }, { transaction: t });

                        order.payment_method = 'wallet';
                        await order.save({ transaction: t });
                        await _markOrderAsPaid(order, t);
                        await t.commit();

                        return { data: { paid_by_wallet: true, amount: orderAmount, message: '货款余额支付成功' } };
                    } else {
                        await t.rollback();
                        walletFallbackInfo = {
                            wallet_balance_insufficient: true,
                            wallet_balance: walletBalance,
                            order_amount: orderAmount
                        };
                    }
                } catch (e) {
                    if (!t.finished) await t.rollback();
                    throw e;
                }
            }

            const productRow = await Product.findByPk(order.product_id, { attributes: ['name'] });
            const payDescription = buildWxJsapiShoppingDescription(order, productRow?.name);

            const prepayId = await createUnifiedOrder({
                orderNo: order.order_no,
                amount: orderAmount,
                openid: user.openid,
                body: payDescription
            });

            const jsApiParams = buildJsApiParams(prepayId);
            return { data: { ...jsApiParams, ...(walletFallbackInfo || {}) } };
        } catch (error) {
            logError('ORDER', '预下单失败', { error: error.message, userId: req.user?.id, orderId: req.params?.id });
            throw new Error(error.message || '预下单失败');
        }
    };

    /**
     * 微信支付回调（notify）
     */
    static async wechatPayNotify(req) {
        try {
            const { notifyData, orderNo, paidFee, errorResponse } = await parseWechatPayNotifyRequest(req);
            if (errorResponse) {
                return errorResponse;
            }

            if (orderNo && orderNo.startsWith('WR')) {
                return handleWalletRechargeNotify(orderNo, paidFee);
            }

            if (orderNo && orderNo.startsWith('UP')) {
                return handleUpgradePaymentNotify(orderNo, paidFee);
            }

            return handleOrderWechatPayNotify(orderNo, paidFee, notifyData);
        } catch (error) {
            logError('PAYMENT', '[WechatNotify] 处理异常', { error: error.message });
            return buildNotifyResponse(false, 'server error', 500);
        }
    };

    /**
     * 主动查单同步微信支付状态（弥补 notify 未达）
     */
    static async syncPendingOrderWechatPay(req) {
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);
        if (!Number.isFinite(id) || id <= 0) {
            throw new Error('订单参数无效');
        }

        const order = await Order.findOne({
            where: { id, buyer_id: userId }
        });
        if (!order) {
            throw new Error('订单不存在');
        }
        if (order.status !== 'pending') {
            return { data: { synced: false, status: order.status } };
        }

        let wxData;
        try {
            wxData = await queryJsapiOrderByOutTradeNo(order.order_no);
        } catch (e) {
            const st = e.response && e.response.status;
            if (st === 404) {
                logError('PAYMENT', `[SyncWechatPay] 微信无此单号: ${order.order_no}`, { orderNo: order.order_no });
                return { data: { synced: false, message: '微信侧暂无该支付单' } };
            }
            logError('PAYMENT', '[SyncWechatPay] 微信查单失败', { error: e.message });
            throw new Error('查询微信支付状态失败，请稍后重试');
        }

        if (!wxData || wxData.trade_state !== 'SUCCESS') {
            return {
                data: {
                    synced: false,
                    trade_state: wxData ? wxData.trade_state : null
                }
            };
        }

        const paidFee = parseInt(wxData.amount && wxData.amount.total, 10);
        const expectedFee = Math.round(parseFloat(order.total_amount) * 100);
        if (!paidFee || Number.isNaN(paidFee) || Math.abs(paidFee - expectedFee) > 1) {
            logError('PAYMENT', `[SyncWechatPay] 金额不一致`, { expectedFee, paidFee, orderNo: order.order_no });
            throw new Error('支付金额与订单不一致，请联系客服处理');
        }

        const t = await sequelize.transaction();
        try {
            const locked = await Order.findOne({
                where: { id: order.id },
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!locked || locked.status !== 'pending') {
                await t.rollback();
                return { data: { synced: false, status: locked && locked.status } };
            }

            locked.payment_method = 'wechat';
            await locked.save({ transaction: t });
            await _markOrderAsPaid(locked, t);
            await t.commit();

            logOrder('[SyncWechatPay] 主动同步成功', { orderNo: order.order_no });

            const notifySnap = {
                out_trade_no: wxData.out_trade_no || order.order_no,
                transaction_id: wxData.transaction_id,
                mchid: wxData.mchid,
                payer: wxData.payer
            };
            scheduleShoppingOrderUploadAfterWechatPay(locked.id, notifySnap);

            return { data: { synced: true } };
        } catch (innerErr) {
            await t.rollback();
            logError('PAYMENT', '[SyncWechatPay] 事务失败', { error: innerErr.message });
            throw innerErr;
        }
    }

    /** 后台手动支付 */
    static async payOrder(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const { id } = req.params;

            const order = await Order.findOne({
                where: { id, buyer_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!order) {
                await rollbackWithError(t, '订单不存在');
            }

            if (order.status !== 'pending') {
                await rollbackWithError(t, '订单状态不正确');
            }

            let allOrders;
            try {
                const result = await _markOrderAsPaid(order, t);
                allOrders = [result.order, ...result.childOrders];
            } catch (innerErr) {
                await t.rollback();
                throw new Error(innerErr.message);
            }

            await t.commit();

            return { data: allOrders.length === 1 ? allOrders[0] : allOrders, message: '支付成功' };
        } catch (error) {
            if (!t.finished) {
                await t.rollback();
            }
            logError('ORDER', '支付订单失败', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id,
                orderId: req.params?.id
            });
            throw new Error('支付失败');
        }
    };
}

module.exports = OrderPaymentService;
