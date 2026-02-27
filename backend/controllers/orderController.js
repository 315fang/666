const { Order, Product, SKU, User, Cart, CommissionLog, Address, Notification, sequelize } = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const { Op } = require('sequelize');
const constants = require('../config/constants');
const { logOrder, logCommission, error: logError } = require('../utils/logger');
const { createUnifiedOrder, buildJsApiParams, parseXml, verifyNotifySign } = require('../utils/wechat');
// Phase 2: 积分 + 成长値
const PointService = require('../services/PointService');
// Phase 4: 自提核销 + 地区分成
const { generatePickupCredentials } = require('./pickupController');
const { attributeRegionalProfit } = require('./stationController');

// 自增序列（进程内唯一），防止同毫秒碰撞
let _orderSeq = 0;

// 生成订单号（时间戳+序列+随机，多实例安全）
// ★ 增加随机位数到6位，碰撞概率从 1/100 降至 1/1000000
const generateOrderNo = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    _orderSeq = (_orderSeq + 1) % 10000;
    const seq = String(_orderSeq).padStart(4, '0');
    const random = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    return `ORD${year}${month}${day}${hour}${min}${sec}${seq}${random}`;
};

/**
 * 创建订单（含库存校验 + 数据库事务）
 * ★★★ 支持多商品：对 items 中每个商品分别走完整下单逻辑，共享同一事务
 */
const createOrder = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;
        // ★ 兼容两种下单格式:
        // 1. 前端标准: { items:[{product_id,sku_id,quantity,cart_id}], address_id, remark }
        // 2. 历史格式: { product_id, sku_id, quantity, address_id, remark, cart_id }
        let items = req.body.items;
        const address_id = req.body.address_id;
        const remark = req.body.remark;

        if (!items || !Array.isArray(items) || items.length === 0) {
            const { product_id: pid, sku_id: sid, quantity: qty, cart_id: cid } = req.body;
            if (!pid || !qty || qty < 1) {
                await t.rollback();
                return res.status(400).json({ code: -1, message: '缺少必要参数（product_id/quantity 或 items[]）' });
            }
            items = [{ product_id: pid, sku_id: sid, quantity: qty, cart_id: cid }];
        }

        for (const item of items) {
            if (!item.product_id || !item.quantity || item.quantity < 1) {
                await t.rollback();
                return res.status(400).json({ code: -1, message: 'items 中每项都需要 product_id 和 quantity' });
            }
        }

        if (!address_id) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '请选择收货地址' });
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
                return res.status(404).json({ code: -1, message: `商品 ${product_id} 不存在或已下架` });
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
                    return res.status(404).json({ code: -1, message: `商品 ${product_id} 的规格 ${sku_id} 不存在` });
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
                return res.status(400).json({ code: -1, message: `商品「${product.name}」库存不足，当前仅剩 ${stockTarget.stock} 件` });
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
                return res.status(400).json({ code: -1, message: `商品「${product.name}」价格倒挂，无法作为代理发货，请联系客服` });
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
        res.json({
            code: 0,
            data: returnData,
            message: items.length > 1 ? `订单创建成功，共 ${items.length} 件商品` : '订单创建成功'
        });
    } catch (error) {
        await t.rollback();
        logError('ORDER', '创建订单失败', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.id
        });
        console.error('创建订单失败:', error);
        res.status(500).json({ code: -1, message: '创建订单失败' });
    }
};

/**
 * ★ 内部函数：将订单标记为已支付（供 payOrder 和 wechatPayNotify 复用）
 * 必须在外部已开启的事务 t 中调用。
 * @param {Order} order  - 已加行锁的订单实例
 * @param {Transaction} t
 */
const _markOrderAsPaid = async (order, t) => {
    order.status = 'paid';
    order.paid_at = new Date();
    await order.save({ transaction: t });

    // ★ 同步支付子订单（拆单场景）
    const childOrders = await Order.findAll({
        where: { parent_order_id: order.id },
        transaction: t,
        lock: t.LOCK.UPDATE
    });
    for (const child of childOrders) {
        if (child.status !== 'pending') {
            throw new Error(`关联子订单(ID:${child.id})状态异常(${child.status})，请联系客服`);
        }
        child.status = 'paid';
        child.paid_at = new Date();
        await child.save({ transaction: t });
    }

    // 身份升级：普通用户首单 → 会员
    const buyer = await User.findByPk(order.buyer_id, { transaction: t });
    if (buyer.role_level === constants.ROLES.GUEST) {
        buyer.role_level = constants.ROLES.MEMBER;
        await buyer.save({ transaction: t });
        await sendNotification(
            buyer.id,
            '身份升级成功',
            '恭喜！您已成功下单，系统已为您升级为"尊享会员"，邀请好友下单可赚取丰厚回报！',
            'upgrade'
        );
    }
    await buyer.increment('total_sales', { by: parseFloat(order.total_amount), transaction: t });

    logOrder('订单支付', {
        userId: order.buyer_id,
        orderId: order.id,
        orderNo: order.order_no,
        amount: parseFloat(order.total_amount),
        childOrders: childOrders.length,
    });

    // ★ Phase 2：支付成功后异步发积分 + 成长値（不阻塞支付事务）
    setImmediate(async () => {
        try {
            const amount = parseFloat(order.total_amount);
            const earnedPoints = Math.floor(amount); // 消费 1 元得 1 积分
            if (earnedPoints > 0) {
                await PointService.addPoints(
                    order.buyer_id, earnedPoints, 'purchase',
                    order.id, `订单消费积分（订单号：${order.order_no}）`
                );
                await PointService.addGrowthValue(order.buyer_id, amount);
                console.log(`[Phase2] 积分发放: 用户${order.buyer_id} +${earnedPoints}积分, +${amount}成长値`);
            }
        } catch (e) {
            // 静默失败，不影响支付结果
            console.error('[Phase2] 积分/成长値发放失败:', e.message);
        }
    });

    // ★ Phase 4a：地区成交利润归因（异步，不阻塞）
    setImmediate(async () => {
        try {
            const buyer = await User.findByPk(order.buyer_id, { attributes: ['city'] });
            if (buyer?.city) {
                await attributeRegionalProfit(order.id, buyer.city, parseFloat(order.total_amount));
            }
        } catch (e) {
            console.error('[Phase4] 地区分成失败:', e.message);
        }
    });

    // ★ Phase 4b：自提订单——生成核销凭证（事务内同步）
    if (order.delivery_type === 'pickup' && !order.pickup_code) {
        try {
            const creds = generatePickupCredentials(order.id);
            await Order.update(
                { pickup_code: creds.pickup_code, pickup_qr_token: creds.pickup_qr_token },
                { where: { id: order.id } }
            );
            console.log(`[Phase4] 自提凭证生成: 订单${order.id} 码=${creds.pickup_code}`);
        } catch (e) {
            console.error('[Phase4] 自提凭证生成失败:', e.message);
        }
    }

    return { order, childOrders };
};

/**
 * 预下单（统一下单）：生成 wx.requestPayment() 所需参数
 * POST /api/orders/:id/prepay
 */
const prepayOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        // 查询订单并验证归属
        const order = await Order.findOne({ where: { id, buyer_id: userId } });
        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }
        if (order.status !== 'pending') {
            return res.status(400).json({ code: -1, message: '订单状态不正确，无法发起支付' });
        }

        // 获取用户 openid
        const user = await User.findByPk(userId, { attributes: ['id', 'openid'] });
        if (!user || !user.openid) {
            return res.status(400).json({ code: -1, message: '用户 openid 缺失，请重新登录后重试' });
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

        res.json({ code: 0, data: jsApiParams });
    } catch (error) {
        logError('ORDER', '预下单失败', { error: error.message, userId: req.user?.id, orderId: req.params?.id });
        console.error('预下单失败:', error);
        res.status(500).json({ code: -1, message: error.message || '预下单失败' });
    }
};

/**
 * 微信支付回调（notify）
 * POST /wechat/pay/notify  ← 无需鉴权，由签名验证保障安全
 * 请求体格式：text/xml（由路由层中间件 express.text({ type: 'text/xml' }) 解析）
 */
const wechatPayNotify = async (req, res) => {
    // 统一返回 XML 响应的辅助函数
    const replyXml = (returnCode, returnMsg = 'OK') => {
        res.set('Content-Type', 'text/xml');
        res.send(`<xml><return_code><![CDATA[${returnCode}]]></return_code><return_msg><![CDATA[${returnMsg}]]></return_msg></xml>`);
    };

    try {
        const rawBody = req.body; // express.text() 中间件已将 body 解析为字符串
        if (!rawBody || typeof rawBody !== 'string') {
            return replyXml('FAIL', 'empty body');
        }

        const notifyData = parseXml(rawBody);

        // 1. 通信层校验
        if (notifyData.return_code !== 'SUCCESS') {
            console.error('[WechatNotify] return_code FAIL:', notifyData.return_msg);
            return replyXml('SUCCESS'); // 仍返回 SUCCESS，避免微信重复推送
        }

        // 2. 验签
        const apiKey = process.env.WECHAT_API_KEY;
        if (!verifyNotifySign(notifyData, apiKey)) {
            console.error('[WechatNotify] 签名验证失败');
            return replyXml('FAIL', 'sign error');
        }

        // 3. 业务层校验
        if (notifyData.result_code !== 'SUCCESS') {
            console.error('[WechatNotify] 支付失败:', notifyData.err_code, notifyData.err_code_des);
            return replyXml('SUCCESS');
        }

        const orderNo = notifyData.out_trade_no;
        const paidFee = parseInt(notifyData.total_fee, 10); // 分

        const t = await sequelize.transaction();
        try {
            const order = await Order.findOne({
                where: { order_no: orderNo },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!order) {
                await t.rollback();
                console.error('[WechatNotify] 订单不存在:', orderNo);
                return replyXml('FAIL', 'order not found');
            }

            // 幂等处理：已支付则直接返回成功
            if (order.status !== 'pending') {
                await t.rollback();
                return replyXml('SUCCESS');
            }

            // 金额一致性校验（误差容忍 1 分，防止浮点精度问题）
            const expectedFee = Math.round(parseFloat(order.total_amount) * 100);
            if (Math.abs(paidFee - expectedFee) > 1) {
                await t.rollback();
                console.error(`[WechatNotify] 金额不一致: 预期${expectedFee}分, 实收${paidFee}分, 订单${orderNo}`);
                return replyXml('FAIL', 'amount mismatch');
            }

            await _markOrderAsPaid(order, t);
            await t.commit();

            console.log(`[WechatNotify] 订单支付成功: ${orderNo}`);
            return replyXml('SUCCESS');
        } catch (innerErr) {
            await t.rollback();
            console.error('[WechatNotify] 事务失败:', innerErr);
            return replyXml('FAIL', 'server error');
        }
    } catch (error) {
        console.error('[WechatNotify] 处理异常:', error);
        return replyXml('FAIL', 'server error');
    }
};

/**
 * 支付订单
 * 
 * ★★★ 核心改动：支付时不再计算佣金！
 * 佣金（级差 + 代理商利润）全部在 shipOrder（发货时）根据实际发货方式计算：
 * - 代理商发货 → 团队产生级差佣金 + 代理商发货利润
 * - 平台发货   → 利润归平台，团队无佣金
 * 
 * ★ 此接口保留供内部测试/后台使用，正式支付流程通过 prepayOrder + wechatPayNotify 完成
 */
const payOrder = async (req, res) => {
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
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        if (order.status !== 'pending') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '订单状态不正确' });
        }

        let allOrders;
        try {
            const result = await _markOrderAsPaid(order, t);
            allOrders = [result.order, ...result.childOrders];
        } catch (innerErr) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: innerErr.message });
        }

        await t.commit();

        res.json({
            code: 0,
            data: allOrders.length === 1 ? allOrders[0] : allOrders,
            message: '支付成功'
        });
    } catch (error) {
        await t.rollback();
        logError('ORDER', '支付订单失败', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.id,
            orderId: req.params?.id
        });
        console.error('支付订单失败:', error);
        res.status(500).json({ code: -1, message: '支付失败' });
    }
};

/**
 * 确认收货
 * 
 * ★★★ 重要改动：
 * 1. 确认收货后设置售后期结束时间（refund_deadline）
 * 2. 佣金状态流转：frozen → (售后期结束后) → pending_approval → (管理员审批) → approved → settled
 * 3. 升级检查也延迟到售后期结束后执行
 */
const confirmOrder = async (req, res) => {
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
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }
        if (order.status !== 'shipped') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '订单状态不正确' });
        }

        order.status = 'completed';
        order.completed_at = new Date();

        // ★ 设置售后期结束时间（从配置读取，默认15天）
        const refundDeadline = new Date();
        refundDeadline.setDate(refundDeadline.getDate() + (constants.REFUND?.MAX_REFUND_DAYS || constants.COMMISSION.FREEZE_DAYS));
        order.settlement_at = refundDeadline; // 复用此字段表示售后期结束
        await order.save({ transaction: t });

        // ★ 确认收货后，设置该订单所有冻结佣金的 refund_deadline（售后期结束时间）
        // 注意：不是 available_at，佣金需要等售后期结束 + 无退款 + 管理员审批后才能结算
        await CommissionLog.update(
            { refund_deadline: refundDeadline },
            { where: { order_id: order.id, status: 'frozen' }, transaction: t }
        );

        await t.commit();

        const remainDays = constants.REFUND?.MAX_REFUND_DAYS || constants.COMMISSION.FREEZE_DAYS;
        res.json({
            code: 0,
            message: `确认收货成功！售后期${remainDays}天后，佣金将进入审批流程。`
        });
    } catch (error) {
        await t.rollback();
        console.error('确认收货失败:', error);
        res.status(500).json({ code: -1, message: '确认收货失败' });
    }
};


/**
 * 代理人确认订单
 * POST /api/orders/:id/agent-confirm
 */
const agentConfirmOrder = async (req, res) => {
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
            return res.status(404).json({ code: -1, message: '订单不存在或您无权操作' });
        }
        if (order.status !== 'paid') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '订单需为已支付状态' });
        }

        order.status = 'agent_confirmed';
        order.agent_confirmed_at = new Date();
        await order.save({ transaction: t });
        await t.commit();

        res.json({ code: 0, data: order, message: '代理人已确认订单' });
    } catch (error) {
        await t.rollback();
        console.error('代理人确认订单失败:', error);
        res.status(500).json({ code: -1, message: '确认失败' });
    }
};

/**
 * 代理人申请发货
 * POST /api/orders/:id/request-shipping
 */
const requestShipping = async (req, res) => {
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
        if (!order) return res.status(404).json({ code: -1, message: '订单不存在或您无权操作' });
        // 代理商确认为可选：允许 paid 直接申请发货
        if (!['paid', 'agent_confirmed'].includes(order.status)) {
            return res.status(400).json({ code: -1, message: '订单状态不允许申请发货' });
        }

        // ★ 锁住代理商行，防止并发库存校验不准确
        const agent = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!agent || agent.stock_count < order.quantity) {
            await t.rollback();
            return res.status(400).json({
                code: -1,
                message: `库存不足，当前 ${agent?.stock_count || 0} 件，需要 ${order.quantity} 件`
            });
        }

        // 若未确认，记录一次自动确认时间（用于审计，不阻塞流程）
        if (!order.agent_confirmed_at) {
            order.agent_confirmed_at = new Date();
        }

        order.status = 'shipping_requested';
        order.shipping_requested_at = new Date();
        order.tracking_no = tracking_no || null;
        order.fulfillment_partner_id = userId;
        await order.save({ transaction: t });
        await t.commit();

        res.json({ code: 0, data: order, message: '已申请发货，等待后台确认' });
    } catch (error) {
        await t.rollback();
        console.error('申请发货失败:', error);
        res.status(500).json({ code: -1, message: '申请失败' });
    }
};

/**
 * 结算已审批通过的佣金（定时任务调用）
 * 
 * ★★★ 重要改动：
 * 只结算 approved（审批通过）状态的佣金，而不是直接结算 frozen
 * 
 * 佣金状态流转：
 * frozen → pending_approval（售后期结束后自动转换）→ approved（管理员审批）→ settled（结算到账）
 */
const settleCommissions = async () => {
    try {
        const now = new Date();
        // ★ 只结算已审批通过 + available_at已到期的佣金
        const approvedLogs = await CommissionLog.findAll({
            where: {
                status: 'approved',
                available_at: {
                    [Op.ne]: null,
                    [Op.lte]: now
                }
            }
        });

        let settledCount = 0;
        for (const log of approvedLogs) {
            const t = await sequelize.transaction();
            try {
                const freshLog = await CommissionLog.findByPk(log.id, { transaction: t, lock: t.LOCK.UPDATE });
                if (!freshLog || freshLog.status !== 'approved') {
                    await t.rollback();
                    continue;
                }

                freshLog.status = 'settled';
                freshLog.settled_at = new Date();
                await freshLog.save({ transaction: t });

                // ★ 欠款优先抵扣
                const commissionAmount = parseFloat(freshLog.amount);
                const commUser = await User.findByPk(freshLog.user_id, { transaction: t, lock: t.LOCK.UPDATE });
                if (commUser) {
                    const currentDebt = parseFloat(commUser.debt_amount) || 0;
                    if (currentDebt > 0) {
                        if (currentDebt >= commissionAmount) {
                            await commUser.decrement('debt_amount', { by: commissionAmount, transaction: t });
                            freshLog.remark = (freshLog.remark || '') + ` [全额抵扣欠款¥${commissionAmount.toFixed(2)}]`;
                            await freshLog.save({ transaction: t });
                        } else {
                            const remaining = parseFloat((commissionAmount - currentDebt).toFixed(2));
                            await commUser.update({ debt_amount: 0 }, { transaction: t });
                            await commUser.increment('balance', { by: remaining, transaction: t });
                            freshLog.remark = (freshLog.remark || '') + ` [抵扣欠款¥${currentDebt.toFixed(2)}, 入账¥${remaining}]`;
                            await freshLog.save({ transaction: t });
                        }
                    } else {
                        await commUser.increment('balance', { by: commissionAmount, transaction: t });
                    }

                    // ★ 结算时通知用户
                    await sendNotification(
                        commUser.id,
                        '佣金到账通知',
                        `您有一笔佣金 ¥${commissionAmount.toFixed(2)} 已结算到账，可前往钱包查看。`,
                        'commission',
                        log.order_id
                    );
                }
                await t.commit();
                settledCount++;
            } catch (err) {
                await t.rollback();
                console.error(`佣金结算失败(ID:${log.id}):`, err);
            }
        }

        if (settledCount > 0) {
            logCommission('佣金结算完成', {
                settledCount,
                totalAmount: approvedLogs.reduce((sum, log) => sum + parseFloat(log.amount), 0)
            });
            console.log(`[定时任务] 佣金结算完成：${settledCount} 条记录`);
        }
        return settledCount;
    } catch (error) {
        logError('COMMISSION', '佣金结算查询失败', {
            error: error.message,
            stack: error.stack
        });
        console.error('佣金结算查询失败:', error);
        return 0;
    }
};

/**
 * ★★★ 新增：售后期结束后处理佣金和升级（定时任务调用）
 * 
 * 1. 检查已完成订单的售后期是否结束
 * 2. 如果售后期结束 + 无退款申请 → 佣金转为 pending_approval（待审批）
 * 3. 同时检查用户升级条件，确认有效订单后才 +1 order_count
 */
const processRefundDeadlineExpired = async () => {
    const { Refund } = require('../models');

    try {
        const now = new Date();

        // 查找售后期已结束的冻结佣金
        const expiredFrozenLogs = await CommissionLog.findAll({
            where: {
                status: 'frozen',
                refund_deadline: {
                    [Op.ne]: null,
                    [Op.lte]: now
                }
            }
        });

        let processedCount = 0;
        const processedOrderIds = new Set(); // 记录已处理的订单ID

        for (const log of expiredFrozenLogs) {
            const t = await sequelize.transaction();
            try {
                const freshLog = await CommissionLog.findByPk(log.id, { transaction: t, lock: t.LOCK.UPDATE });
                if (!freshLog || freshLog.status !== 'frozen') {
                    await t.rollback();
                    continue;
                }

                // 检查该订单是否有进行中的退款申请
                const pendingRefund = await Refund.findOne({
                    where: {
                        order_id: freshLog.order_id,
                        status: { [Op.in]: ['pending', 'approved', 'processing'] }
                    },
                    transaction: t
                });

                if (pendingRefund) {
                    // 有进行中的退款，暂不处理，等退款完成后再决定
                    await t.rollback();
                    continue;
                }

                // 无退款申请，转为待审批
                freshLog.status = 'pending_approval';
                freshLog.remark = (freshLog.remark || '') + ' [售后期结束，待管理员审批]';
                await freshLog.save({ transaction: t });

                // ★ 记录订单ID，稍后统一处理升级
                processedOrderIds.add(freshLog.order_id);

                await t.commit();
                processedCount++;
            } catch (err) {
                await t.rollback();
                console.error(`处理售后期结束失败(佣金ID:${log.id}):`, err);
            }
        }

        // ★ 处理订单完成后的有效订单统计和升级检查
        for (const orderId of processedOrderIds) {
            await processOrderCompletion(orderId);
        }

        if (processedCount > 0) {
            console.log(`[定时任务] 售后期结束处理完成：${processedCount} 条佣金转为待审批`);
        }
        return processedCount;
    } catch (error) {
        console.error('处理售后期结束查询失败:', error);
        return 0;
    }
};

/**
 * ★ 处理单个订单完成后的逻辑（升级检查）
 * 在售后期结束且无退款后调用
 */
const processOrderCompletion = async (orderId) => {
    const { checkRoleUpgrade } = require('../utils/commission');

    const t = await sequelize.transaction();
    try {
        const order = await Order.findByPk(orderId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!order || order.status !== 'completed') {
            await t.rollback();
            return;
        }

        // 避免重复处理
        if (order.remark && order.remark.includes('[已计入有效订单]')) {
            await t.rollback();
            return;
        }

        const buyer = await User.findByPk(order.buyer_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!buyer) {
            await t.rollback();
            return;
        }

        const orderAmount = parseFloat(order.actual_price || order.total_amount || 0);

        // ★ 售后期结束，此订单确认为"有效订单"，计入升级统计
        await buyer.increment('order_count', { transaction: t });
        order.remark = (order.remark || '') + ' [已计入有效订单]';
        await order.save({ transaction: t });

        // 刷新 buyer 数据
        await buyer.reload({ transaction: t });

        // ★ 检查买家是否应该升级
        const buyerNewRole = checkRoleUpgrade(buyer);
        if (buyerNewRole && buyerNewRole > buyer.role_level) {
            const roleNames = { 2: '团长', 3: '代理商' };
            const oldRole = buyer.role_level;
            buyer.role_level = buyerNewRole;
            await buyer.save({ transaction: t });

            // ★ 如果升级为代理商，处理独立逻辑
            if (buyerNewRole >= 3) {
                await handleAgentPromotion(buyer, t);
            }

            await sendNotification(
                buyer.id,
                '身份升级',
                `恭喜！您的有效订单已达标，系统已将您升级为${roleNames[buyerNewRole] || '更高等级'}，享受更多权益！`,
                'upgrade'
            );
        }

        // ★ 检查上级是否应该升级
        if (buyer.parent_id) {
            const parent = await User.findByPk(buyer.parent_id, { transaction: t, lock: t.LOCK.UPDATE });
            if (parent) {
                await parent.increment('order_count', { transaction: t });
                if (!Number.isNaN(orderAmount) && orderAmount > 0) {
                    await parent.increment('total_sales', { by: orderAmount, transaction: t });
                }
                await parent.reload({ transaction: t });

                const parentNewRole = checkRoleUpgrade(parent);
                if (parentNewRole && parentNewRole > parent.role_level) {
                    const roleNames = { 2: '团长', 3: '代理商' };
                    parent.role_level = parentNewRole;
                    await parent.save({ transaction: t });

                    if (parentNewRole >= 3) {
                        await handleAgentPromotion(parent, t);
                    }

                    await sendNotification(
                        parent.id,
                        '身份升级',
                        `恭喜！您的团队业绩达标，系统已将您升级为${roleNames[parentNewRole] || '更高等级'}！`,
                        'upgrade'
                    );
                }
            }
        }

        await t.commit();
    } catch (error) {
        await t.rollback();
        console.error(`处理订单完成失败(订单ID:${orderId}):`, error);
    }
};

/**
 * ★ 处理用户升级为代理商后的独立逻辑
 * 
 * 业务规则（用户确认）：
 * - 代理商升级后脱离上级代理商的团队（agent_id 变为自己）
 * - 下级的 agent_id 保持不变，仍然归属原代理商团队
 * - 直到下级也升级为代理商，才会独立
 * 
 * 示例：A(代理商) → B(会员) → C(会员)
 * B升级为代理商后：
 *   - B.agent_id = B（B独立）
 *   - C.agent_id = A（C仍属于A，不变）
 */
const handleAgentPromotion = async (newAgent, transaction) => {
    // 新代理商的 agent_id 改为自己，完成独立
    newAgent.agent_id = newAgent.id;
    await newAgent.save({ transaction });

    // ★ 不更新下级的 agent_id
    // 按业务规则：下级仍然归属原代理商，直到他们也升级为代理商

    console.log(`[升级处理] 用户 ${newAgent.id} 升级为代理商，已独立（下级归属不变）`);
};


/**
 * ★ 代理商订单超时自动转平台发货（定时任务调用）
 * 
 * 场景：订单分配给代理商后，代理商迟迟不处理
 * 超过 N 小时后，自动将订单转为平台发货，避免用户等待
 */
const autoTransferAgentOrders = async () => {
    try {
        const timeoutHours = constants.ORDER.AGENT_TIMEOUT_HOURS;
        const expireTime = new Date();
        expireTime.setHours(expireTime.getHours() - timeoutHours);

        // 查找超时的代理商待发货订单
        const expiredOrders = await Order.findAll({
            where: {
                fulfillment_type: 'Agent_Pending',
                status: 'paid',  // 只处理已支付未处理的
                paid_at: { [Op.lt]: expireTime }
            }
        });

        if (expiredOrders.length === 0) return 0;

        let transferredCount = 0;
        for (const order of expiredOrders) {
            const t = await sequelize.transaction();
            try {
                const freshOrder = await Order.findByPk(order.id, { transaction: t, lock: t.LOCK.UPDATE });
                if (!freshOrder || freshOrder.fulfillment_type !== 'Agent_Pending' || freshOrder.status !== 'paid') {
                    await t.commit();
                    continue;
                }

                // 转为平台发货
                freshOrder.fulfillment_type = 'Company';
                freshOrder.remark = (freshOrder.remark || '') + ` [系统自动转平台发货，原代理商超时${timeoutHours}小时未处理]`;
                await freshOrder.save({ transaction: t });

                // 通知用户
                await sendNotification(
                    freshOrder.buyer_id,
                    '订单发货方式变更',
                    `您的订单将由平台直接发货，请耐心等待。`,
                    'order',
                    freshOrder.id
                );

                // 通知原代理商（如果有）
                if (freshOrder.agent_id) {
                    await sendNotification(
                        freshOrder.agent_id,
                        '订单已自动转移',
                        `订单 ${freshOrder.order_no} 因超时未处理已自动转为平台发货。`,
                        'order',
                        freshOrder.id
                    );
                }

                await t.commit();
                transferredCount++;
            } catch (err) {
                await t.rollback();
                console.error(`转移订单失败(${order.id}):`, err);
            }
        }

        if (transferredCount > 0) {
            console.log(`[定时任务] 代理商订单超时转平台: ${transferredCount} 单`);
        }
        return transferredCount;
    } catch (error) {
        console.error('代理商订单超时检查失败:', error);
        return 0;
    }
};


/**
 * ★ 自动取消超时未支付订单（定时任务调用）
 * 超过 N 分钟未支付的 pending 订单自动取消并恢复库存
 */
const autoCancelExpiredOrders = async () => {
    try {
        const expireMinutes = constants.ORDER.AUTO_CANCEL_MINUTES;
        const expireTime = new Date();
        expireTime.setMinutes(expireTime.getMinutes() - expireMinutes);

        const expiredOrders = await Order.findAll({
            where: {
                status: 'pending',
                created_at: { [Op.lt]: expireTime },
                // ★ 排除子订单（子订单跟随主订单一起取消，不单独处理）
                parent_order_id: null
            }
        });

        let cancelledCount = 0;
        for (const order of expiredOrders) {
            const t = await sequelize.transaction();
            try {
                // 行锁防并发
                const freshOrder = await Order.findByPk(order.id, { transaction: t, lock: t.LOCK.UPDATE });
                if (!freshOrder || freshOrder.status !== 'pending') {
                    await t.rollback();
                    continue;
                }

                // 恢复商品库存
                // ★ 修复：拆单场景下需要查找子订单，一起恢复总库存量
                const childOrders = await Order.findAll({
                    where: { parent_order_id: freshOrder.id, status: 'pending' },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });
                const totalRestoreQty = freshOrder.quantity + childOrders.reduce((sum, c) => sum + c.quantity, 0);

                const product = await Product.findByPk(freshOrder.product_id, { transaction: t });
                if (product) {
                    await product.increment('stock', { by: totalRestoreQty, transaction: t });
                }
                if (freshOrder.sku_id) {
                    const sku = await SKU.findByPk(freshOrder.sku_id, { transaction: t });
                    if (sku) {
                        await sku.increment('stock', { by: totalRestoreQty, transaction: t });
                    }
                }

                freshOrder.status = 'cancelled';
                freshOrder.remark = (freshOrder.remark || '') + ` [系统自动取消：超过${expireMinutes}分钟未支付]`;
                await freshOrder.save({ transaction: t });

                // 同步取消子订单
                for (const child of childOrders) {
                    child.status = 'cancelled';
                    child.remark = (child.remark || '') + ` [系统自动取消：主订单超时]`;
                    await child.save({ transaction: t });
                }

                await t.commit();
                cancelledCount++;
            } catch (err) {
                await t.rollback();
                console.error(`自动取消订单失败(ID:${order.id}):`, err);
            }
        }

        if (cancelledCount > 0) {
            console.log(`[定时任务] 自动取消过期订单: ${cancelledCount} 笔`);
        }
        return cancelledCount;
    } catch (error) {
        console.error('自动取消过期订单查询失败:', error);
        return 0;
    }
};

/**
 * ★ 自动确认收货（定时任务调用）
 * 发货后超过 N 天未确认收货的订单自动完成
 */
const autoConfirmOrders = async () => {
    try {
        const confirmDays = constants.ORDER.AUTO_CONFIRM_DAYS;
        const expireTime = new Date();
        expireTime.setDate(expireTime.getDate() - confirmDays);

        const expiredOrders = await Order.findAll({
            where: {
                status: 'shipped',
                shipped_at: { [Op.lt]: expireTime }
            }
        });

        let confirmedCount = 0;
        for (const order of expiredOrders) {
            const t = await sequelize.transaction();
            try {
                const freshOrder = await Order.findByPk(order.id, { transaction: t, lock: t.LOCK.UPDATE });
                if (!freshOrder || freshOrder.status !== 'shipped') {
                    await t.rollback();
                    continue;
                }

                freshOrder.status = 'completed';
                freshOrder.completed_at = new Date();
                const settlementDate = new Date();
                settlementDate.setDate(settlementDate.getDate() + constants.COMMISSION.FREEZE_DAYS);
                freshOrder.settlement_at = settlementDate;
                freshOrder.remark = (freshOrder.remark || '') + ` [系统自动确认收货：发货${confirmDays}天后]`;
                await freshOrder.save({ transaction: t });

                // 设置佣金 available_at
                await CommissionLog.update(
                    { available_at: settlementDate },
                    { where: { order_id: freshOrder.id, status: 'frozen' }, transaction: t }
                );

                await t.commit();
                confirmedCount++;
            } catch (err) {
                await t.rollback();
                console.error(`自动确认收货失败(ID:${order.id}):`, err);
            }
        }

        if (confirmedCount > 0) {
            console.log(`[定时任务] 自动确认收货: ${confirmedCount} 笔`);
        }
        return confirmedCount;
    } catch (error) {
        console.error('自动确认收货查询失败:', error);
        return 0;
    }
};

/**
 * 代理人获取待处理订单
 */
const getAgentOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const where = { agent_id: userId };
        if (status) where.status = status;

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'images'] },
                { model: User, as: 'buyer', attributes: ['id', 'nickname'] }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({ code: 0, data: { list: rows, pagination: { total: count, page, limit } } });
    } catch (error) {
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 取消订单（仅待付款的可取消，恢复库存）
 * ★ 支持拆单：取消主订单时同步取消子订单
 */
const cancelOrder = async (req, res) => {
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
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        if (order.status !== 'pending') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '仅待付款订单可取消' });
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
        res.json({ code: 0, message: '订单已取消' });
    } catch (error) {
        await t.rollback();
        console.error('取消订单失败:', error);
        res.status(500).json({ code: -1, message: '取消订单失败' });
    }
};

/**
 * 发货（支持代理商发货 + 平台发货）
 * 
 * ★★★ 核心改动：佣金计算全部在此处完成（不再在 payOrder 中算）
 * 
 * 业务规则：
 * - 代理商发货(agent)：扣代理商云库存 → 产生团队级差佣金 + 代理商发货利润
 * - 平台发货(platform)：工厂直发 → 利润归平台，团队无任何佣金
 * 
 * 拆单场景：同一用户的订单可能被拆为"代理商发"+"平台发"两个子订单，各自独立发货
 */
const shipOrder = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { fulfillment_type, tracking_no } = req.body;
        // fulfillment_type: 'agent'（代理商发） 或 'platform'（平台发）

        const order = await Order.findOne({
            where: { id },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!order) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        if (!['paid', 'agent_confirmed', 'shipping_requested'].includes(order.status)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '当前订单状态不允许发货' });
        }

        // ★★★ 安全修复：发货类型应从订单状态推断，而不是信任前端参数
        // 订单已有 fulfillment_type 标记（创建订单时设置），根据它来判断
        // - Agent_Pending / Agent：代理商发货
        // - Company / Platform / null：平台发货
        // 如果前端传了参数且与订单标记不一致，以订单标记为准
        let actualFulfillmentType = 'platform'; // 默认平台发
        if (order.fulfillment_type && ['Agent_Pending', 'Agent'].includes(order.fulfillment_type)) {
            actualFulfillmentType = 'agent';
        }
        // 仅当订单没有明确标记时，才参考前端参数（兼容旧数据）
        if (!order.fulfillment_type && fulfillment_type === 'agent' && order.agent_id) {
            actualFulfillmentType = 'agent';
        }

        if (actualFulfillmentType === 'agent') {
            // ==================== 代理商发货 ====================
            const agentId = order.agent_id;
            if (!agentId) {
                await t.rollback();
                return res.status(400).json({ code: -1, message: '该订单没有归属代理商' });
            }

            const agent = await User.findByPk(agentId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!agent || agent.role_level < 3) {
                await t.rollback();
                return res.status(400).json({ code: -1, message: '代理商信息异常' });
            }

            if (agent.stock_count < order.quantity) {
                await t.rollback();
                return res.status(400).json({
                    code: -1,
                    message: `代理商云库存不足，当前库存 ${agent.stock_count}，需要 ${order.quantity}`
                });
            }

            // 扣减代理商云库存
            await agent.decrement('stock_count', { by: order.quantity, transaction: t });

            order.fulfillment_type = 'Agent';
            order.fulfillment_partner_id = agentId;

            // ★★★ 核心：代理商发货 → 计算团队级差佣金 + 代理商发货利润
            const buyer = await User.findByPk(order.buyer_id, { transaction: t });
            const orderProduct = await Product.findByPk(order.product_id, { transaction: t });

            if (orderProduct && buyer) {
                const priceMap = {
                    0: parseFloat(orderProduct.retail_price || 0),
                    1: parseFloat(orderProduct.price_member || orderProduct.retail_price || 0),
                    2: parseFloat(orderProduct.price_leader || orderProduct.price_member || orderProduct.retail_price || 0),
                    3: parseFloat(orderProduct.price_agent || orderProduct.price_leader || orderProduct.price_member || orderProduct.retail_price || 0)
                };

                // ---- 1. 级差分润：向上遍历分销链 ----
                let currentLevel = buyer.role_level;
                let lastCost = priceMap[currentLevel] || priceMap[0];
                let pRef = buyer.parent_id;
                let middleCommissionTotal = 0;
                const visitedIds = new Set();
                visitedIds.add(buyer.id); // 防止自购自佣

                while (pRef) {
                    if (visitedIds.has(pRef) || visitedIds.size > 50) break;
                    visitedIds.add(pRef);

                    const p = await User.findByPk(pRef, { transaction: t });
                    if (!p) break;

                    if (p.role_level > currentLevel) {
                        const parentCost = priceMap[p.role_level];
                        const gapProfit = (lastCost - parentCost) * order.quantity;

                        if (gapProfit > 0) {
                            // 如果该上级就是代理商本人，不发级差佣金（代理商利润在下面统一算）
                            const isOrderAgent = (order.agent_id && order.agent_id === p.id);
                            if (!isOrderAgent) {
                                await CommissionLog.create({
                                    order_id: order.id,
                                    user_id: p.id,
                                    amount: gapProfit,
                                    type: 'gap',
                                    status: 'frozen',
                                    available_at: null,
                                    refund_deadline: null, // 确认收货后设置
                                    remark: `团队级差利润 Lv${currentLevel}→Lv${p.role_level}`
                                }, { transaction: t });

                                middleCommissionTotal += gapProfit;

                                await sendNotification(
                                    p.id,
                                    '收益到账提醒',
                                    `您的下级产生了一笔订单(代理商发货)，您获得级差收益 ¥${gapProfit.toFixed(2)}（需售后期结束+审批后结算）。`,
                                    'commission',
                                    order.id
                                );
                            }
                        }

                        lastCost = parentCost;
                        currentLevel = p.role_level;
                    }

                    pRef = p.parent_id;
                    if (currentLevel >= 3) break;
                }

                // 记录中间佣金总额到订单
                order.middle_commission_total = middleCommissionTotal;

                // ---- 2. 代理商发货利润 ----
                const agentCostPrice = order.locked_agent_cost
                    ? parseFloat(order.locked_agent_cost)
                    : parseFloat(orderProduct.price_agent || orderProduct.price_leader || orderProduct.price_member || orderProduct.retail_price);
                const agentCost = agentCostPrice * order.quantity;
                const buyerPaid = parseFloat(order.actual_price);
                const agentSettlementAmount = buyerPaid - middleCommissionTotal;

                if (agentSettlementAmount > 0) {
                    await CommissionLog.create({
                        order_id: order.id,
                        user_id: agentId,
                        amount: agentSettlementAmount,
                        type: 'agent_fulfillment',
                        status: 'frozen',
                        available_at: null,
                        refund_deadline: null, // 确认收货后设置
                        remark: `代理商发货结算(含成本) (进货价${agentCostPrice}×${order.quantity}=${agentCost}, 中间佣金${middleCommissionTotal.toFixed(2)})`
                    }, { transaction: t });

                    await sendNotification(
                        agentId,
                        '发货收益提醒',
                        `您的团队产生了一笔发货订单，结算金额 ¥${agentSettlementAmount.toFixed(2)}（需售后期结束+审批后结算）。`,
                        'commission',
                        order.id
                    );
                } else {
                    console.error(`⚠️ [结算异常] 订单 ${order.order_no || order.id} 代理商(ID:${agentId})发货结算金额为 ¥${agentSettlementAmount.toFixed(2)}，不产生佣金！`);
                    await sendNotification(
                        0,
                        '⚠️ 发货结算异常告警',
                        `订单ID:${order.id} 代理商发货结算金额为 ¥${agentSettlementAmount.toFixed(2)}（<=0），买家实付=${buyerPaid}，进货成本=${agentCost}，中间佣金=${middleCommissionTotal}。请检查商品定价！`,
                        'system_alert',
                        order.id
                    );
                }
            }
        } else {
            // ==================== 平台发货 ====================
            // ★ 平台/工厂直发，利润归平台，团队不产生任何佣金
            order.fulfillment_type = 'Company';
            order.middle_commission_total = 0;
        }

        order.status = 'shipped';
        order.shipped_at = new Date();
        order.tracking_no = tracking_no || null;
        await order.save({ transaction: t });

        await t.commit();

        res.json({ code: 0, data: order, message: '发货成功' });
    } catch (error) {
        await t.rollback();
        console.error('发货失败:', error);
        res.status(500).json({ code: -1, message: '发货失败' });
    }
};

/**
 * 获取订单列表
 * ★ 排除子订单（拆单的子订单通过详情页关联展示）
 */
const getOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const where = {
            buyer_id: userId,
            // ★ 排除子订单，只显示主订单（或独立订单）
            parent_order_id: null
        };
        if (status) where.status = status;

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images'] }],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({ code: 0, data: { list: rows, pagination: { total: count, page, limit } } });
    } catch (error) {
        res.status(500).json({ code: -1, message: '获取列表失败' });
    }
};

/**
 * 获取订单详情
 */
const getOrderById = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const order = await Order.findOne({
            where: { id, buyer_id: userId },
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'images', 'retail_price'] },
                { model: User, as: 'distributor', attributes: ['id', 'nickname'] }
            ]
        });

        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        // 如果有归属代理商，查询代理商信息
        let agentInfo = null;
        if (order.agent_id) {
            const agent = await User.findByPk(order.agent_id, {
                attributes: ['id', 'nickname', 'invite_code']
            });
            if (agent) {
                agentInfo = {
                    id: agent.id,
                    nickname: agent.nickname,
                    invite_code: agent.invite_code
                };
            }
        }

        const result = order.toJSON();
        result.agent_info = agentInfo;

        // ★ 如果有子订单（拆单），附加子订单信息
        const childOrders = await Order.findAll({
            where: { parent_order_id: order.id },
            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images'] }],
            order: [['created_at', 'ASC']]
        });
        if (childOrders.length > 0) {
            result.child_orders = childOrders;
            result.is_split_order = true;
        }

        res.json({ code: 0, data: result });
    } catch (error) {
        console.error('获取订单详情失败:', error);
        res.status(500).json({ code: -1, message: '获取订单详情失败' });
    }
};

module.exports = {
    createOrder,
    payOrder,
    prepayOrder,
    wechatPayNotify,
    shipOrder,
    confirmOrder,
    cancelOrder,
    getOrders,
    getOrderById,
    agentConfirmOrder,
    requestShipping,
    settleCommissions,
    getAgentOrders,
    autoCancelExpiredOrders,
    autoConfirmOrders,
    processRefundDeadlineExpired,
    autoTransferAgentOrders  // ★ 新增：代理商订单超时转平台
};
