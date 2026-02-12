/**
 * 代理商控制器
 * 
 * 提供代理商专属功能：
 * - 工作台数据（云库存、待发货统计）
 * - 待发货订单管理
 * - 代理商自行发货（扣云库存 + 佣金计算）
 * - 采购入仓（补充云库存）
 * - 库存变动日志
 */
const { Order, Product, SKU, User, CommissionLog, StockTransaction, sequelize } = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const { Op } = require('sequelize');
const constants = require('../config/constants');

/**
 * 获取代理商工作台数据
 * GET /api/agent/workbench
 */
const getWorkbench = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findByPk(userId);

        if (!user || user.role_level < 3) {
            return res.status(403).json({ code: -1, message: '仅代理商可访问' });
        }

        // 待处理订单统计
        const [pendingShip, pendingConfirm, totalHandled] = await Promise.all([
            // 待发货：分配给我且已支付的
            Order.count({
                where: {
                    agent_id: userId,
                    status: { [Op.in]: ['paid', 'agent_confirmed'] }
                }
            }),
            // 已申请发货待平台确认
            Order.count({
                where: {
                    agent_id: userId,
                    status: 'shipping_requested'
                }
            }),
            // 累计处理订单
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

        res.json({
            code: 0,
            data: {
                stock_count: user.stock_count || 0,
                pending_ship: pendingShip,
                pending_confirm: pendingConfirm,
                total_handled: totalHandled,
                month_profit: parseFloat(monthProfit).toFixed(2),
                debt_amount: parseFloat(user.debt_amount || 0).toFixed(2)
            }
        });
    } catch (error) {
        console.error('获取代理商工作台失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 获取代理商待处理订单列表
 * GET /api/agent/orders?status=paid|agent_confirmed|shipping_requested|shipped
 */
const getAgentOrderList = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findByPk(userId);

        if (!user || user.role_level < 3) {
            return res.status(403).json({ code: -1, message: '仅代理商可访问' });
        }

        const { status, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const where = { agent_id: userId };
        if (status) {
            if (status === 'pending_ship') {
                where.status = { [Op.in]: ['paid', 'agent_confirmed'] };
            } else {
                where.status = status;
            }
        } else {
            // 默认显示需要处理的订单
            where.status = { [Op.in]: ['paid', 'agent_confirmed', 'shipping_requested', 'shipped'] };
        }

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'images', 'price_agent'] },
                { model: User, as: 'buyer', attributes: ['id', 'nickname'] }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
            }
        });
    } catch (error) {
        console.error('获取代理商订单失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 代理商自行发货（确认+扣库存+填单号，一步完成）
 * POST /api/agent/ship/:id
 * body: { tracking_no, tracking_company }
 * 
 * ★ 核心流程：
 * 1. 校验身份和库存
 * 2. 扣减代理商云库存
 * 3. 计算发货利润（冻结）
 * 4. 更新订单状态为 shipped
 */
const agentShip = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { tracking_no, tracking_company } = req.body;

        if (!tracking_no) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '请填写物流单号' });
        }

        // 锁定订单
        const order = await Order.findOne({
            where: { id, agent_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!order) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '订单不存在或您无权操作' });
        }

        // 允许 paid / agent_confirmed 状态发货
        if (!['paid', 'agent_confirmed'].includes(order.status)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: `当前订单状态(${order.status})不可发货` });
        }

        // 锁定代理商，校验库存
        const agent = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (agent.stock_count < order.quantity) {
            await t.rollback();
            return res.status(400).json({
                code: -1,
                message: `云库存不足，当前 ${agent.stock_count} 件，需要 ${order.quantity} 件`
            });
        }

        // ★ 扣减代理商云库存
        await agent.decrement('stock_count', { by: order.quantity, transaction: t });

        // ★★★ 核心：计算团队级差佣金 + 代理商发货利润（与 shipOrder 逻辑统一）
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
            const agentProfit = buyerPaid - agentCost - middleCommissionTotal;

            // ★ 代理商自购也能获得利润（自己库存发自己的货，利润 = 价差）
            if (agentProfit > 0) {
                await CommissionLog.create({
                    order_id: order.id,
                    user_id: userId,
                    amount: agentProfit,
                    type: 'agent_fulfillment',
                    status: 'frozen',
                    available_at: null,
                    refund_deadline: null, // 确认收货后设置
                    remark: `代理商发货利润 (进货价${agentCostPrice}×${order.quantity}=${agentCost}, 中间佣金${middleCommissionTotal.toFixed(2)})`
                }, { transaction: t });

                await sendNotification(
                    userId,
                    '发货收益提醒',
                    `您的团队产生了一笔发货订单，发货利润 ¥${agentProfit.toFixed(2)}（需售后期结束+审批后结算）。`,
                    'commission',
                    order.id
                );
            } else if (agentProfit < 0) {
                // ★★★ 佣金负数保护：不产生佣金记录，只告警
                console.error(`⚠️ [利润异常] 订单 ${order.order_no || order.id} 代理商(ID:${userId})发货利润为 ¥${agentProfit.toFixed(2)}，不产生佣金！`);
                await sendNotification(
                    0,
                    '⚠️ 发货利润异常告警',
                    `订单ID:${order.id} 代理商发货利润为 ¥${agentProfit.toFixed(2)}（<0），不产生佣金。实付=${buyerPaid}，进货成本=${agentCost}，中间佣金=${middleCommissionTotal}。请检查商品定价！`,
                    'system_alert',
                    order.id
                );
            }
            // agentProfit === 0 时不产生佣金记录，但也不告警
        }

        // 更新订单
        order.status = 'shipped';
        order.shipped_at = new Date();
        order.tracking_no = tracking_no;
        order.fulfillment_type = 'Agent';
        order.fulfillment_partner_id = userId;
        if (tracking_company) {
            order.remark = (order.remark ? order.remark + ' | ' : '') + `物流: ${tracking_company} ${tracking_no}`;
        }
        await order.save({ transaction: t });

        await t.commit();

        // 通知买家（事务外）
        await sendNotification(
            order.buyer_id,
            '订单已发货',
            `您的订单 ${order.order_no} 已由代理商发货，物流单号: ${tracking_no}`,
            'order',
            order.id
        );

        res.json({
            code: 0,
            message: '发货成功',
            data: {
                order_no: order.order_no,
                tracking_no,
                stock_remaining: agent.stock_count - order.quantity
            }
        });
    } catch (error) {
        await t.rollback();
        console.error('代理商发货失败:', error);
        res.status(500).json({ code: -1, message: '发货失败' });
    }
};

/**
 * 代理商确认订单（工厂直发模式）
 * POST /api/agent/confirm-order/:id
 *
 * ★ 业务模型：工厂直接发货，代理商管理云库存
 * ★ 核心流程：
 * 1. 校验代理商身份和云库存
 * 2. 扣减代理商云库存
 * 3. 计算佣金（团队级差 + 代理商发货利润）
 * 4. 更新订单状态为 agent_confirmed（通知工厂发货）
 * 5. 工厂后台会看到此订单，负责实际发货和物流录入
 */
const confirmOrder = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;
        const { id } = req.params;

        // 锁定订单
        const order = await Order.findOne({
            where: { id, agent_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!order) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '订单不存在或您无权操作' });
        }

        // 只允许 paid 状态确认订单
        if (order.status !== 'paid') {
            await t.rollback();
            return res.status(400).json({
                code: -1,
                message: `当前订单状态(${order.status})不可确认`
            });
        }

        // 锁定代理商，校验云库存
        const agent = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (agent.stock_count < order.quantity) {
            await t.rollback();
            return res.status(400).json({
                code: -1,
                message: `云库存不足，当前 ${agent.stock_count} 件，需要 ${order.quantity} 件`
            });
        }

        // ★ 扣减代理商云库存
        const balance_before = agent.stock_count;
        await agent.decrement('stock_count', { by: order.quantity, transaction: t });
        await agent.reload({ transaction: t });  // 重新加载获取最新库存
        const balance_after = agent.stock_count;

        // ★ 记录库存变动审计
        await StockTransaction.recordTransaction({
            user_id: userId,
            product_id: order.product_id,
            order_id: order.id,
            type: 'order_confirm',
            quantity: -order.quantity,  // 负数表示出库
            balance_before,
            balance_after,
            amount: null,
            operator_id: null,
            operator_type: 'user',
            remark: `代理商确认订单 ${order.order_no}，扣减云库存`,
            metadata: {
                order_no: order.order_no,
                buyer_id: order.buyer_id,
                fulfillment_type: 'Platform'
            },
            ip_address: null,
            transaction: t
        });

        // ★★★ 核心：计算团队级差佣金 + 代理商发货利润
        const buyer = await User.findByPk(order.buyer_id, { transaction: t });
        const orderProduct = await Product.findByPk(order.product_id, { transaction: t });

        let middleCommissionTotal = 0;

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
            const visitedIds = new Set();
            visitedIds.add(buyer.id);

            while (pRef) {
                if (visitedIds.has(pRef) || visitedIds.size > 50) break;
                visitedIds.add(pRef);

                const p = await User.findByPk(pRef, { transaction: t });
                if (!p) break;

                if (p.role_level > currentLevel) {
                    const parentCost = priceMap[p.role_level];
                    const gapProfit = (lastCost - parentCost) * order.quantity;

                    if (gapProfit > 0) {
                        const isOrderAgent = (order.agent_id && order.agent_id === p.id);
                        if (!isOrderAgent) {
                            await CommissionLog.create({
                                order_id: order.id,
                                user_id: p.id,
                                amount: gapProfit,
                                type: 'gap',
                                status: 'frozen',
                                available_at: null,
                                refund_deadline: null,
                                remark: `团队级差利润 Lv${currentLevel}→Lv${p.role_level}`
                            }, { transaction: t });

                            middleCommissionTotal += gapProfit;

                            await sendNotification(
                                p.id,
                                '收益到账提醒',
                                `您的下级产生了一笔订单(工厂直发)，您获得级差收益 ¥${gapProfit.toFixed(2)}（需售后期结束+审批后结算）。`,
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
            const agentProfit = buyerPaid - agentCost - middleCommissionTotal;

            if (agentProfit > 0) {
                await CommissionLog.create({
                    order_id: order.id,
                    user_id: userId,
                    amount: agentProfit,
                    type: 'agent_fulfillment',
                    status: 'frozen',
                    available_at: null,
                    refund_deadline: null,
                    remark: `代理商发货利润(工厂直发) (进货价${agentCostPrice}×${order.quantity}=${agentCost}, 中间佣金${middleCommissionTotal.toFixed(2)})`
                }, { transaction: t });

                await sendNotification(
                    userId,
                    '订单确认成功',
                    `您已确认订单，发货利润 ¥${agentProfit.toFixed(2)}（需售后期结束+审批后结算）。工厂将在24小时内发货。`,
                    'commission',
                    order.id
                );
            } else if (agentProfit < 0) {
                console.error(`⚠️ [利润异常] 订单 ${order.order_no || order.id} 代理商(ID:${userId})确认订单利润为 ¥${agentProfit.toFixed(2)}，不产生佣金！`);
                await sendNotification(
                    0,
                    '⚠️ 确认订单利润异常告警',
                    `订单ID:${order.id} 代理商确认订单利润为 ¥${agentProfit.toFixed(2)}（<0），不产生佣金。实付=${buyerPaid}，进货成本=${agentCost}，中间佣金=${middleCommissionTotal}。请检查商品定价！`,
                    'system_alert',
                    order.id
                );
            }
        }

        // 更新订单状态：agent_confirmed = 代理商已确认，等待工厂发货
        order.status = 'agent_confirmed';
        order.fulfillment_type = 'Platform'; // 工厂直发模式
        order.fulfillment_partner_id = userId; // 记录确认的代理商
        order.platform_stock_deducted = true; // 标记已扣库存
        await order.save({ transaction: t });

        await t.commit();

        // 通知买家（事务外）
        await sendNotification(
            order.buyer_id,
            '订单已确认',
            `您的订单 ${order.order_no} 已确认，工厂将在24小时内为您发货`,
            'order',
            order.id
        );

        // TODO: 通知工厂后台有新订单待发货
        // await sendNotification(FACTORY_ADMIN_ID, '新订单待发货', ...);

        res.json({
            code: 0,
            message: '确认成功，已通知工厂发货',
            data: {
                order_no: order.order_no,
                status: 'agent_confirmed',
                stock_remaining: agent.stock_count
            }
        });
    } catch (error) {
        await t.rollback();
        console.error('代理商确认订单失败:', error);
        res.status(500).json({ code: -1, message: '确认失败' });
    }
};

/**
 * 代理商采购入仓（补货）
 * POST /api/agent/restock
 * body: { product_id, quantity }
 * 
 * ★ 采购流程：
 * 1. 以代理商价（price_agent）计算总价
 * 2. 创建"采购订单"（特殊类型）
 * 3. 模拟支付后增加云库存（TODO: 接入微信支付）
 */
const restockOrder = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;
        const { product_id, quantity } = req.body;

        if (!product_id || !quantity || quantity < 1) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '请选择商品和数量' });
        }

        const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!user || user.role_level < 3) {
            await t.rollback();
            return res.status(403).json({ code: -1, message: '仅代理商可进货' });
        }

        const product = await Product.findByPk(product_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!product || product.status !== 1) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '商品不存在或已下架' });
        }

        // 代理商进货价
        const agentPrice = parseFloat(product.price_agent || product.price_leader || product.price_member || product.retail_price);
        const totalAmount = agentPrice * quantity;

        // 校验平台库存
        if (product.stock < quantity) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: `平台库存不足，当前仅剩 ${product.stock} 件` });
        }

        // 扣减平台库存
        await product.decrement('stock', { by: quantity, transaction: t });

        // 生成采购订单（标记为 restock 类型）
        const orderNo = `RST${Date.now()}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
        const order = await Order.create({
            order_no: orderNo,
            buyer_id: userId,
            product_id,
            quantity,
            total_amount: totalAmount,
            actual_price: totalAmount,
            status: 'paid', // TODO: 接入微信支付后改为 pending
            paid_at: new Date(),
            fulfillment_type: 'Restock', // 标记为采购入仓
            agent_id: userId,
            remark: `代理商采购入仓 (${quantity}件 × ¥${agentPrice})`
        }, { transaction: t });

        // ★ 增加代理商云库存
        await user.increment('stock_count', { by: quantity, transaction: t });

        await t.commit();

        res.json({
            code: 0,
            message: '采购入仓成功',
            data: {
                order_no: orderNo,
                quantity,
                unit_price: agentPrice,
                total_amount: totalAmount,
                stock_after: (user.stock_count || 0) + quantity
            }
        });
    } catch (error) {
        await t.rollback();
        console.error('代理商进货失败:', error);
        res.status(500).json({ code: -1, message: '进货失败' });
    }
};

/**
 * 获取库存变动日志
 * GET /api/agent/stock-logs
 */
const getStockLogs = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findByPk(userId);

        if (!user || user.role_level < 3) {
            return res.status(403).json({ code: -1, message: '仅代理商可访问' });
        }

        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // 采购入仓记录（Restock 订单）
        const restockOrders = await Order.findAll({
            where: {
                buyer_id: userId,
                fulfillment_type: 'Restock'
            },
            attributes: ['id', 'order_no', 'quantity', 'total_amount', 'created_at'],
            include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }],
            order: [['created_at', 'DESC']],
            limit: 50
        });

        // 发货扣减记录（Agent 发货）
        const shipOrders = await Order.findAll({
            where: {
                fulfillment_partner_id: userId,
                fulfillment_type: 'Agent',
                status: { [Op.in]: ['shipped', 'completed'] }
            },
            attributes: ['id', 'order_no', 'quantity', 'shipped_at'],
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name'] },
                { model: User, as: 'buyer', attributes: ['id', 'nickname'] }
            ],
            order: [['shipped_at', 'DESC']],
            limit: 50
        });

        // 合并并按时间排序
        const logs = [
            ...restockOrders.map(o => ({
                id: `in_${o.id}`,
                type: 'in',
                label: '采购入仓',
                product_name: o.product?.name || '未知商品',
                quantity: o.quantity,
                amount: parseFloat(o.total_amount),
                time: o.created_at,
                order_no: o.order_no
            })),
            ...shipOrders.map(o => ({
                id: `out_${o.id}`,
                type: 'out',
                label: '发货出库',
                product_name: o.product?.name || '未知商品',
                buyer_name: o.buyer?.nickname || '未知',
                quantity: o.quantity,
                time: o.shipped_at || o.created_at,
                order_no: o.order_no
            }))
        ].sort((a, b) => new Date(b.time) - new Date(a.time));

        // 分页
        const total = logs.length;
        const paginatedLogs = logs.slice(offset, offset + parseInt(limit));

        res.json({
            code: 0,
            data: {
                list: paginatedLogs,
                current_stock: user.stock_count || 0,
                pagination: { total, page: parseInt(page), limit: parseInt(limit) }
            }
        });
    } catch (error) {
        console.error('获取库存日志失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

module.exports = {
    getWorkbench,
    getAgentOrderList,
    agentShip,
    confirmOrder,
    restockOrder,
    getStockLogs
};
