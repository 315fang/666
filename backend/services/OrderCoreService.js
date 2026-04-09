
const { Order, Product, SKU, User, Cart, CommissionLog, Address, Notification, sequelize } = require('../models');
const { UserCoupon } = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const { Op } = require('sequelize');
const constants = require('../config/constants');
const { logOrder, logCommission, error: logError } = require('../utils/logger');
const { createUnifiedOrder, buildJsApiParams, parseXml, verifyNotifySign } = require('../utils/wechat');
const PointService = require('./PointService');
const CommissionService = require('./CommissionService');
const { normalizeCompanyCode, getCompanyDisplayName } = require('./LogisticsService');
const { generatePickupCredentials } = require('../controllers/pickupController');
const { attributeRegionalProfit } = require('../controllers/stationController');
const { calcCouponDiscount } = require('../controllers/couponController');
const { appendReservedStockMarker, hasReservedStockMarker, removeReservedStockMarker } = require('../utils/orderStock');
const crypto = require('crypto');

/**
 * 生成加密安全的订单号
 * 格式: ORD + 24位无序随机字符（使用 crypto.randomBytes，12字节hex）
 * 总长度 27 位，不可预测
 */
const generateOrderNo = () => {
    const randomPart = crypto.randomBytes(12).toString('hex').toUpperCase();
    return "ORD" + randomPart;
};

const sumOrderField = (orders, field) => orders.reduce((sum, current) => {
    const value = parseFloat(current?.[field]);
    return sum + (Number.isFinite(value) ? value : 0);
}, 0);

const loadRelatedOrders = async (order, buyerId, transaction, lock) => {
    const rootOrderId = order.parent_order_id || order.id;
    const relatedOrders = await Order.findAll({
        where: {
            buyer_id: buyerId,
            [Op.or]: [{ id: rootOrderId }, { parent_order_id: rootOrderId }]
        },
        transaction,
        lock
    });

    if (!relatedOrders.length) {
        return [order];
    }

    return relatedOrders.sort((a, b) => {
        if (a.id === rootOrderId) return -1;
        if (b.id === rootOrderId) return 1;
        return a.id - b.id;
    });
};

const _markOrderAsPaid = async (order, t) => {
    order.status = 'paid';
    order.paid_at = new Date();
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

    const paidOrders = [order, ...childOrders];
    const totalPaidAmount = sumOrderField(paidOrders, 'total_amount');

    const buyer = await User.findByPk(order.buyer_id, { transaction: t });
    if (buyer.role_level === constants.ROLES.GUEST) {
        buyer.role_level = constants.ROLES.MEMBER;
        await buyer.save({ transaction: t });
        await sendNotification(buyer.id, '身份升级成功', '恭喜！您已成功下单，系统已为您升级为"尊享会员"', 'upgrade');
    }
    await buyer.increment('total_sales', { by: totalPaidAmount, transaction: t });

    logOrder('订单支付', {
        userId: order.buyer_id,
        orderId: order.id,
        orderNo: order.order_no,
        amount: totalPaidAmount
    });

    setImmediate(async () => {
        try {
            const amount = totalPaidAmount;
            const earnedPoints = Math.floor(amount);
            if (earnedPoints > 0) {
                await PointService.addPoints(order.buyer_id, earnedPoints, 'purchase', order.id, "消费积分");
                await PointService.addGrowthValue(order.buyer_id, amount);
            }
        } catch (e) { }
    });

    setImmediate(async () => {
        try {
            const b = await User.findByPk(order.buyer_id, { attributes: ['city'] });
            if (b?.city) await attributeRegionalProfit(order.id, b.city, totalPaidAmount);
        } catch (e) { }
    });

    if (order.delivery_type === 'pickup' && !order.pickup_code) {
        try {
            const creds = generatePickupCredentials(order.id);
            await Order.update({ pickup_code: creds.pickup_code, pickup_qr_token: creds.pickup_qr_token }, { where: { id: order.id } });
        } catch (e) { }
    }

    return { order, childOrders };
};

class OrderCoreService {
    static async createOrder(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            // ★ 兼容两种下单格式:
            // 1. 前端标准: { items:[{product_id,sku_id,quantity,cart_id}], address_id, remark }
            // 2. 历史格式: { product_id, sku_id, quantity, address_id, remark, cart_id }
            let items = req.body.items;
            const address_id = req.body.address_id;
            const remark = req.body.remark;
            const user_coupon_id = req.body.user_coupon_id || null;

            if (!items || !Array.isArray(items) || items.length === 0) {
                const { product_id: pid, sku_id: sid, quantity: qty, cart_id: cid } = req.body;
                if (!pid || !qty || qty < 1) {
                    await t.rollback();
                    throw new Error('缺少必要参数（product_id/quantity 或 items[]）');
                }
                items = [{ product_id: pid, sku_id: sid, quantity: qty, cart_id: cid }];
            }

            for (const item of items) {
                if (!item.product_id || !item.quantity || item.quantity < 1) {
                    await t.rollback();
                    throw new Error('items 中每项都需要 product_id 和 quantity');
                }
            }

            if (!address_id) {
                await t.rollback();
                throw new Error('请选择收货地址');
            }

            // 获取用户身份（所有商品共用同一个用户）
            const user = await User.findByPk(userId, { transaction: t });
            const roleLevel = user.role_level || 0;
            let agentId = user.agent_id || null;

            // 获取地址快照（所有商品共用同一个地址）
            let addressSnapshot = null;
            const addr = await Address.findByPk(address_id, { transaction: t });
            if (addr) {
                addressSnapshot = {
                    receiver_name: addr.receiver_name,
                    phone: addr.phone,
                    province: addr.province,
                    city: addr.city,
                    district: addr.district,
                    detail: addr.detail
                };
            }

            const distributorRole = user.parent_id
                ? (await User.findByPk(user.parent_id, { attributes: ['role_level'], transaction: t }))?.role_level || 0
                : null;

            const allOrders = []; // 收集所有创建的订单
            let totalAmountSum = 0;

            // ★★★ 对每个商品分别处理（多商品循环）
            for (const item of items) {
                const { product_id, sku_id, quantity, cart_id } = item;

                // 查询商品（行锁防并发超卖）
                const product = await Product.findByPk(product_id, { transaction: t, lock: t.LOCK.UPDATE });
                if (!product || product.status !== 1) {
                    await t.rollback();
                    throw new Error(`商品 ${product_id} 不存在或已下架`);
                }

                let price;
                let stockTarget = product;

                if (sku_id) {
                    const sku = await SKU.findOne({
                        where: { id: sku_id, product_id, status: 1 },
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    });
                    if (!sku) {
                        await t.rollback();
                        throw new Error(`商品 ${product_id} 的规格 ${sku_id} 不存在`);
                    }
                    price = parseFloat(sku.retail_price);
                    if (roleLevel >= 1 && sku.member_price) price = parseFloat(sku.member_price);
                    if (roleLevel >= 2 && sku.wholesale_price) price = parseFloat(sku.wholesale_price);
                    stockTarget = sku;
                } else {
                    price = parseFloat(product.retail_price);
                    if (roleLevel === 1) price = parseFloat(product.price_member || product.retail_price);
                    else if (roleLevel === 2) price = parseFloat(product.price_leader || product.price_member || product.retail_price);
                    else if (roleLevel === 3) price = parseFloat(product.price_agent || product.price_leader || product.price_member || product.retail_price);
                }

                // 库存校验
                if (stockTarget.stock < quantity) {
                    await t.rollback();
                    throw new Error(`商品「${product.name}」库存不足，当前仅剩 ${stockTarget.stock} 件`);
                }

                // 锁定代理成本价
                const lockedAgentCost = parseFloat(product.price_agent || product.price_leader || product.price_member || product.retail_price);

                // 拆单逻辑（代理商云库存判断）
                let agentQuantity = 0;
                let platformQuantity = quantity;

                if (agentId) {
                    const agent = await User.findByPk(agentId, { transaction: t, lock: t.LOCK.UPDATE });
                    if (agent && agent.role_level >= 3 && agent.stock_count > 0) {
                        agentQuantity = 0; // 当前策略：全部转平台发货
                        platformQuantity = quantity - agentQuantity;
                    }
                }

                // 公共订单字段
                const commonFields = {
                    buyer_id: userId,
                    product_id,
                    sku_id: sku_id || null,
                    address_id,
                    address_snapshot: addressSnapshot,
                    remark,
                    status: 'pending',
                    agent_id: agentId,
                    distributor_id: user.parent_id || null,
                    distributor_role: distributorRole,
                    locked_agent_cost: lockedAgentCost,
                };

                // 价格倒挂保护
                if (agentQuantity > 0 && price < lockedAgentCost) {
                    await t.rollback();
                    throw new Error(`商品「${product.name}」价格倒挂，无法作为代理发货，请联系客服`);
                }

                // 扣减库存
                await stockTarget.decrement('stock', { by: quantity, transaction: t });
                if (sku_id) {
                    await product.decrement('stock', { by: quantity, transaction: t });
                }

                const itemOrders = [];

                if (agentQuantity > 0 && platformQuantity > 0) {
                    const parentOrder = await Order.create({
                        ...commonFields,
                        order_no: generateOrderNo(),
                        quantity: agentQuantity,
                        total_amount: price * agentQuantity,
                        actual_price: price * agentQuantity,
                        fulfillment_type: 'Agent_Pending',
                        platform_stock_deducted: 1,
                    }, { transaction: t });

                    const childOrder = await Order.create({
                        ...commonFields,
                        order_no: generateOrderNo(),
                        quantity: platformQuantity,
                        total_amount: price * platformQuantity,
                        actual_price: price * platformQuantity,
                        fulfillment_type: 'Company',
                        platform_stock_deducted: 1,
                        parent_order_id: parentOrder.id,
                    }, { transaction: t });

                    itemOrders.push(parentOrder, childOrder);
                } else if (agentQuantity > 0) {
                    const order = await Order.create({
                        ...commonFields,
                        order_no: generateOrderNo(),
                        quantity,
                        total_amount: price * quantity,
                        actual_price: price * quantity,
                        fulfillment_type: 'Agent_Pending',
                        platform_stock_deducted: 1,
                    }, { transaction: t });
                    itemOrders.push(order);
                } else {
                    const order = await Order.create({
                        ...commonFields,
                        order_no: generateOrderNo(),
                        quantity,
                        total_amount: price * quantity,
                        actual_price: price * quantity,
                        fulfillment_type: 'Company',
                        platform_stock_deducted: 1,
                    }, { transaction: t });
                    itemOrders.push(order);
                }

                // 删除对应购物车项
                if (cart_id) {
                    await Cart.destroy({ where: { id: cart_id, user_id: userId }, transaction: t });
                }

                allOrders.push(...itemOrders);
                totalAmountSum += price * quantity;
            }

            // ★ 优惠券抵扣（整单级别）
            let couponDiscount = 0;
            let appliedUserCoupon = null;
            if (user_coupon_id) {
                const uc = await UserCoupon.findOne({
                    where: { id: user_coupon_id, user_id: userId },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });
                if (!uc) {
                    await t.rollback();
                    throw new Error('优惠券不存在或不属于当前用户');
                }
                if (uc.status !== 'unused') {
                    await t.rollback();
                    throw new Error('优惠券已使用或已过期');
                }
                if (new Date(uc.expire_at) < new Date()) {
                    await t.rollback();
                    throw new Error('优惠券已过期');
                }
                if (parseFloat(uc.min_purchase) > totalAmountSum) {
                    await t.rollback();
                    throw new Error(`订单金额未满足优惠券最低消费 ${uc.min_purchase} 元`);
                }
                couponDiscount = calcCouponDiscount(uc, totalAmountSum);
                appliedUserCoupon = uc;
            }

            // 将优惠券信息写入首个主订单（单商品场景）或按比例分摊到各订单（多商品）
            // 当前策略：将折扣信息记录在第一个非子订单上，total_amount 减去折扣
            if (couponDiscount > 0 && allOrders.length > 0) {
                // 找出所有根订单（无 parent_order_id 的）
                const rootOrders = allOrders.filter(o => !o.parent_order_id);
                if (rootOrders.length === 1) {
                    // 单根订单：全额抵扣
                    const o = rootOrders[0];
                    o.coupon_id = appliedUserCoupon.id;
                    o.coupon_discount = couponDiscount;
                    o.total_amount = Math.max(0, parseFloat(o.total_amount) - couponDiscount).toFixed(2);
                    await o.save({ transaction: t });
                } else {
                    // 多根订单：按各订单金额比例分摊折扣
                    const rootTotal = rootOrders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
                    let remainDiscount = couponDiscount;
                    for (let i = 0; i < rootOrders.length; i++) {
                        const o = rootOrders[i];
                        const ratio = parseFloat(o.total_amount) / rootTotal;
                        const share = i < rootOrders.length - 1
                            ? parseFloat((couponDiscount * ratio).toFixed(2))
                            : remainDiscount; // 最后一个收尾，避免浮点累计误差
                        remainDiscount = parseFloat((remainDiscount - share).toFixed(2));
                        o.coupon_id = appliedUserCoupon.id;
                        o.coupon_discount = share;
                        o.total_amount = Math.max(0, parseFloat(o.total_amount) - share).toFixed(2);
                        await o.save({ transaction: t });
                    }
                }

                // 标记优惠券为已使用
                appliedUserCoupon.status = 'used';
                appliedUserCoupon.used_at = new Date();
                await appliedUserCoupon.save({ transaction: t });
            }

            await t.commit();

            logOrder('订单创建', {
                userId,
                orderIds: allOrders.map(o => o.id),
                orderNos: allOrders.map(o => o.order_no),
                totalAmount: totalAmountSum,
                itemCount: items.length,
                splitOrders: allOrders.length > items.length,
            });

            // 返回：单商品返回对象，多商品或拆单返回数组
            const returnData = allOrders.length === 1 ? allOrders[0] : allOrders;
            return { data: returnData, message: items.length > 1 ? `订单创建成功，共 ${items.length} 件商品` : '订单创建成功' };
        } catch (error) {
            await t.rollback();
            logError('ORDER', '创建订单失败', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id
            });
            console.error('创建订单失败:', error);
            throw new Error('创建订单失败');
        }
    };

    /**
     * 预下单（统一下单）：生成 wx.requestPayment() 所需参数
     * POST /api/orders/:id/prepay
     */

    static async prepayOrder(req) {
        try {
            const userId = req.user.id;
            const { id } = req.params;

            // 查询订单并验证归属
            const order = await Order.findOne({ where: { id, buyer_id: userId } });
            if (!order) {
                throw new Error('订单不存在');
            }
            if (order.status !== 'pending') {
                throw new Error('订单状态不正确，无法发起支付');
            }

            // 获取用户 openid
            const user = await User.findByPk(userId, { attributes: ['id', 'openid'] });
            if (!user || !user.openid) {
                throw new Error('用户 openid 缺失，请重新登录后重试');
            }

            // 获取客户端 IP
            const clientIp = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1')
                .split(',')[0].trim().replace(/^::ffff:/, '');

            // 调用微信统一下单
            const prepayId = await createUnifiedOrder({
                orderNo: order.order_no,
                amount: parseFloat(order.total_amount),
                openid: user.openid,
                clientIp,
                body: '商品购买',
            });

            // 生成前端支付参数
            const jsApiParams = buildJsApiParams(prepayId);

            return { data: jsApiParams };
        } catch (error) {
            logError('ORDER', '预下单失败', { error: error.message, userId: req.user?.id, orderId: req.params?.id });
            console.error('预下单失败:', error);
            throw new Error(error.message || '预下单失败');
        }
    };

    /**
     * 微信支付回调（notify）
     * POST /wechat/pay/notify  ← 无需鉴权，由签名验证保障安全
     * 请求体格式：text/xml（由路由层中间件 express.text({ type: 'text/xml' }) 解析）
     */

    static async wechatPayNotify(req) {
        // ★ 注意：XML 回包由上层 orderController.wechatPayNotify(req, res) 统一处理
        //   本服务层通过返回 { xml_success: true } 或 { xml_fail: 'reason' } 通知上层
        try {
            const rawBody = req.body; // express.text() 中间件已将 body 解析为字符串
            if (!rawBody || typeof rawBody !== 'string') {
                return { xml_fail: 'empty body' };
            }

            const notifyData = parseXml(rawBody);

            // 1. 通信层校验
            if (notifyData.return_code !== 'SUCCESS') {
                console.error('[WechatNotify] return_code FAIL:', notifyData.return_msg);
                return { xml_success: true }; // 仍返回 SUCCESS，避免微信重复推送
            }

            // 2. 验签
            const apiKey = process.env.WECHAT_API_KEY;
            if (!verifyNotifySign(notifyData, apiKey)) {
                console.error('[WechatNotify] 签名验证失败');
                return { xml_fail: 'sign error' };
            }

            // 3. 业务层校验
            if (notifyData.result_code !== 'SUCCESS') {
                console.error('[WechatNotify] 支付失败:', notifyData.err_code, notifyData.err_code_des);
                return { xml_success: true };
            }

            const orderNo = notifyData.out_trade_no;
            const paidFee = parseInt(notifyData.total_fee, 10); // 分

            const t = await sequelize.transaction();
            try {
                // ★ 幂等处理：使用原子更新，只有 status='pending' 的订单才会被更新
                const [affectedRows] = await Order.update(
                    { status: 'paid', paid_at: new Date() },
                    {
                        where: { order_no: orderNo, status: 'pending' },
                        transaction: t
                    }
                );

                // 如果没有更新任何行，说明订单已不是 pending 状态（可能已支付或已取消）
                if (affectedRows === 0) {
                    const existingOrder = await Order.findOne({
                        where: { order_no: orderNo },
                        transaction: t
                    });
                    await t.rollback();
                    if (!existingOrder) {
                        console.error('[WechatNotify] 订单不存在:', orderNo);
                        return { xml_fail: 'order not found' };
                    }
                    // 订单已处理过，返回成功确保微信不重复推送
                    console.log(`[WechatNotify] 订单已处理，跳过: ${orderNo}, 当前状态: ${existingOrder.status}`);
                    return { xml_success: true };
                }

                // 金额一致性校验（误差容忍 1 分，防止浮点精度问题）
                // 注意：此时订单已是 'paid' 状态，需要重新查询获取金额
                const order = await Order.findOne({
                    where: { order_no: orderNo },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });
                const expectedFee = Math.round(parseFloat(order.total_amount) * 100);
                if (Math.abs(paidFee - expectedFee) > 1) {
                    // 金额不匹配，但订单已更新为 paid，需要记录异常并告警
                    console.error(`[WechatNotify] 金额不一致: 预期${expectedFee}分, 实收${paidFee}分, 订单${orderNo}`);
                    // 暂不回滚，因为微信已经扣款，需要人工处理
                }

                await _markOrderAsPaid(order, t);
                await t.commit();

                console.log(`[WechatNotify] 订单支付成功: ${orderNo}`);
                return { xml_success: true };
            } catch (innerErr) {
                await t.rollback();
                console.error('[WechatNotify] 事务失败:', innerErr);
                return { xml_fail: 'server error' };
            }
        } catch (error) {
            console.error('[WechatNotify] 处理异常:', error);
            return { xml_fail: 'server error' };
        }
    };


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
                await t.rollback();
                throw new Error('订单不存在');
            }

            if (order.status !== 'pending') {
                await t.rollback();
                throw new Error('订单状态不正确');
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
            await t.rollback();
            logError('ORDER', '支付订单失败', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id,
                orderId: req.params?.id
            });
            console.error('支付订单失败:', error);
            throw new Error('支付失败');
        }
    };


    static async confirmOrder(req) {
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
                await t.rollback();
                throw new Error('订单不存在');
            }
            if (!['shipped', 'completed'].includes(order.status)) {
                await t.rollback();
                throw new Error('订单状态不正确');
            }

            const relatedOrders = await loadRelatedOrders(order, userId, t, t.LOCK.UPDATE);
            const blockedOrder = relatedOrders.find(item => !['shipped', 'completed'].includes(item.status));
            if (blockedOrder) {
                await t.rollback();
                throw new Error('订单仍有未发货的拆单包裹，请全部发货后再确认收货');
            }

            const pendingConfirmOrders = relatedOrders.filter(item => item.status === 'shipped');
            if (pendingConfirmOrders.length === 0) {
                await t.rollback();
                throw new Error('订单已确认收货');
            }

            // ★ 设置售后期结束时间（从配置读取，默认15天）
            const refundDeadline = new Date();
            refundDeadline.setDate(refundDeadline.getDate() + (constants.REFUND?.MAX_REFUND_DAYS || constants.COMMISSION.FREEZE_DAYS));
            const completedAt = new Date();
            for (const item of pendingConfirmOrders) {
                item.status = 'completed';
                item.completed_at = completedAt;
                item.settlement_at = refundDeadline; // 复用此字段表示售后期结束
                await item.save({ transaction: t });
            }

            // ★ 确认收货后，设置该订单所有冻结佣金的 refund_deadline（售后期结束时间）
            // 注意：不是 available_at，佣金需要等售后期结束 + 无退款 + 管理员审批后才能结算
            await CommissionLog.update(
                { refund_deadline: refundDeadline },
                {
                    where: {
                        order_id: { [Op.in]: pendingConfirmOrders.map(item => item.id) },
                        status: 'frozen'
                    },
                    transaction: t
                }
            );

            await t.commit();

            const remainDays = constants.REFUND?.MAX_REFUND_DAYS || constants.COMMISSION.FREEZE_DAYS;
            const splitOrderTip = pendingConfirmOrders.length > 1 ? `已同步确认 ${pendingConfirmOrders.length} 个拆单包裹，` : '';
            return { message: `确认收货成功！${splitOrderTip}售后期${remainDays}天后，佣金将进入审批流程。` };
        } catch (error) {
            await t.rollback();
            console.error('确认收货失败:', error);
            throw new Error('确认收货失败');
        }
    };



    static async agentConfirmOrder(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const { id } = req.params;

            // ★ 事务 + 行锁，防止并发竞态
            const order = await Order.findOne({
                where: { id, agent_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!order) {
                await t.rollback();
                throw new Error('订单不存在或您无权操作');
            }
            if (order.status !== 'paid') {
                await t.rollback();
                throw new Error('订单需为已支付状态');
            }

            order.status = 'agent_confirmed';
            order.agent_confirmed_at = new Date();
            await order.save({ transaction: t });
            await t.commit();

            return { data: order, message: '代理人已确认订单' };
        } catch (error) {
            await t.rollback();
            console.error('代理人确认订单失败:', error);
            throw new Error('确认失败');
        }
    };


    static async requestShipping(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const { id } = req.params;
            const { tracking_no } = req.body;

            // ★ 事务 + 行锁
            const order = await Order.findOne({
                where: { id, agent_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!order) throw new Error('订单不存在或您无权操作');
            // 代理商确认为可选：允许 paid 直接申请发货
            if (!['paid', 'agent_confirmed'].includes(order.status)) {
                throw new Error('订单状态不允许申请发货');
            }

            // ★ 锁住代理商行，防止并发库存校验不准确
            const agent = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!agent || agent.stock_count < order.quantity) {
                await t.rollback();
                throw new Error(`库存不足，当前 ${agent?.stock_count || 0} 件，需要 ${order.quantity} 件`);
            }

            // 申请发货即预扣代理商库存，避免多个订单并发超卖
            await agent.decrement('stock_count', { by: order.quantity, transaction: t });

            // 若未确认，记录一次自动确认时间（用于审计，不阻塞流程）
            if (!order.agent_confirmed_at) {
                order.agent_confirmed_at = new Date();
            }

            order.status = 'shipping_requested';
            order.shipping_requested_at = new Date();
            order.tracking_no = tracking_no || null;
            order.fulfillment_partner_id = userId;
            order.remark = appendReservedStockMarker(order.remark);
            await order.save({ transaction: t });
            await t.commit();

            return { data: order, message: '已申请发货，等待后台确认' };
        } catch (error) {
            await t.rollback();
            console.error('申请发货失败:', error);
            throw new Error('申请失败');
        }
    };



    static async cancelOrder(req) {
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
                await t.rollback();
                throw new Error('订单不存在');
            }

            if (order.status !== 'pending') {
                await t.rollback();
                throw new Error('仅待付款订单可取消');
            }

            // ★ 查找子订单（拆单场景）
            const childOrders = await Order.findAll({
                where: { parent_order_id: order.id, status: 'pending' },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            // ★★★ 修复库存双重恢复：计算总恢复量 = 主订单数量 + 所有子订单数量
            // createOrder 中是按整单(quantity)一次性扣减平台库存的，
            // 所以恢复时也必须只恢复一次总量，不能主+子各恢复一次
            const totalRestoreQty = order.quantity + childOrders.reduce((sum, c) => sum + c.quantity, 0);

            const product = await Product.findByPk(order.product_id, { transaction: t });
            if (product) {
                await product.increment('stock', { by: totalRestoreQty, transaction: t });
            }
            if (order.sku_id) {
                const sku = await SKU.findByPk(order.sku_id, { transaction: t });
                if (sku) {
                    await sku.increment('stock', { by: totalRestoreQty, transaction: t });
                }
            }

            order.status = 'cancelled';
            await order.save({ transaction: t });

            // 同步取消子订单（不再重复恢复库存）
            for (const child of childOrders) {
                child.status = 'cancelled';
                await child.save({ transaction: t });
            }

            await t.commit();
            return { message: '订单已取消' };
        } catch (error) {
            await t.rollback();
            console.error('取消订单失败:', error);
            throw new Error('取消订单失败');
        }
    };


    static async shipOrder(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const { id } = req.params;
            const { fulfillment_type, type, tracking_no, tracking_company, logistics_company } = req.body;
            // fulfillment_type: 'agent'（代理商发） 或 'platform'（平台发）

            const order = await Order.findOne({
                where: { id },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!order) {
                await t.rollback();
                throw new Error('订单不存在');
            }

            // ★ 安全校验：验证订单归属（防止越权访问他人订单）
            // 仅当订单有归属买家时校验，平台发货场景可能无 buyer_id（如历史数据）
            if (order.buyer_id && order.buyer_id !== userId) {
                await t.rollback();
                throw new Error('无权操作此订单');
            }

            if (!['paid', 'agent_confirmed', 'shipping_requested'].includes(order.status)) {
                await t.rollback();
                throw new Error('当前订单状态不允许发货');
            }

            // ★★★ 安全修复：发货类型应从订单状态推断，而不是信任前端参数
            // 订单已有 fulfillment_type 标记（创建订单时设置），根据它来判断
            // - Agent_Pending / Agent：代理商发货
            // - Company / Platform / null：平台发货
            // 如果前端传了参数且与订单标记不一致，以订单标记为准
            const requestedFulfillmentType = String(fulfillment_type || type || '').toLowerCase();
            let actualFulfillmentType = 'platform'; // 默认平台发
            if (order.status === 'shipping_requested' && order.agent_id) {
                actualFulfillmentType = 'agent';
            } else if (order.fulfillment_type && ['Agent_Pending', 'Agent'].includes(order.fulfillment_type)) {
                actualFulfillmentType = 'agent';
            }
            // 仅当订单没有明确标记时，才参考前端参数（兼容旧数据）
            if (requestedFulfillmentType === 'agent' && order.agent_id) {
                actualFulfillmentType = 'agent';
            }

            if (actualFulfillmentType !== 'agent' && order.agent_id &&
                ['agent_confirmed', 'shipping_requested'].includes(order.status)) {
                await t.rollback();
                throw new Error(`该订单代理商(ID:${order.agent_id})已在处理中（状态: ${order.status}），如需平台发货请先将状态回退为 paid`);
            }

            if (actualFulfillmentType === 'agent') {
                // ==================== 代理商发货 ====================
                const agentId = order.agent_id;
                if (!agentId) {
                    await t.rollback();
                    throw new Error('该订单没有归属代理商');
                }

                const agent = await User.findByPk(agentId, { transaction: t, lock: t.LOCK.UPDATE });
                if (!agent || agent.role_level < 3) {
                    await t.rollback();
                    throw new Error('代理商信息异常');
                }

                const alreadyDeducted = order.status === 'shipping_requested' && hasReservedStockMarker(order);
                if (!alreadyDeducted) {
                    if (agent.stock_count < order.quantity) {
                        await t.rollback();
                        throw new Error(`代理商云库存不足，当前库存 ${agent.stock_count}，需要 ${order.quantity}`);
                    }

                    // 扣减代理商云库存
                    await agent.decrement('stock_count', { by: order.quantity, transaction: t });
                }

                const platformDeducted = parseInt(order.platform_stock_deducted) !== 0;
                if (platformDeducted) {
                    const orderProductSku = await Product.findByPk(order.product_id, { transaction: t, lock: t.LOCK.UPDATE });
                    if (orderProductSku) {
                        await orderProductSku.increment('stock', { by: order.quantity, transaction: t });
                    }
                    if (order.sku_id) {
                        const orderSku = await SKU.findByPk(order.sku_id, { transaction: t, lock: t.LOCK.UPDATE });
                        if (orderSku) {
                            await orderSku.increment('stock', { by: order.quantity, transaction: t });
                        }
                    }
                    order.platform_stock_deducted = 0;
                }

                if (alreadyDeducted) {
                    order.remark = removeReservedStockMarker(order.remark);
                }

                order.fulfillment_type = 'Agent';
                order.fulfillment_partner_id = agentId;

                // ★★★ 核心：代理商发货 → 调用统一方法计算级差佣金 + 代理商发货利润
                //   原先 110 行重复逻辑已提取到 CommissionService.calculateGapAndFulfillmentCommissions
                const buyer = await User.findByPk(order.buyer_id, { transaction: t });
                const orderProduct = await Product.findByPk(order.product_id, { transaction: t });

                if (orderProduct && buyer) {
                    await CommissionService.calculateGapAndFulfillmentCommissions({
                        order,
                        buyer,
                        product: orderProduct,
                        agentId,
                        transaction: t,
                        notifySource: '平台代发(代理商)'
                    });
                }
            } else {
                // ==================== 平台发货 ====================
                // ★ 平台/工厂直发，利润归平台，团队不产生任何佣金
                order.fulfillment_type = 'Company';
                order.middle_commission_total = 0;
            }

            const finalCompany = normalizeCompanyCode(tracking_company || logistics_company || order.logistics_company || '');
            const finalCompanyLabel = tracking_company || getCompanyDisplayName(finalCompany) || finalCompany;
            const finalTrackingNo = tracking_no || order.tracking_no || null;

            order.status = 'shipped';
            order.shipped_at = new Date();
            order.tracking_no = finalTrackingNo;
            order.logistics_company = finalCompany || null;
            if (finalCompanyLabel || finalTrackingNo) {
                const logisticsSummary = [finalCompanyLabel, finalTrackingNo].filter(Boolean).join(' ');
                order.remark = (order.remark ? order.remark + ' | ' : '') + `物流: ${logisticsSummary}`;
            }
            await order.save({ transaction: t });

            await t.commit();

            return { data: order, message: '发货成功' };
        } catch (error) {
            await t.rollback();
            console.error('发货失败:', error);
            throw new Error('发货失败');
        }
    };


}
module.exports = OrderCoreService;
