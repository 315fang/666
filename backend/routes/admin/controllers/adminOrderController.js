const { Order, User, Product, Address, SKU, CommissionLog, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../../../models/notificationUtil');

// 获取订单列表
const getOrders = async (req, res) => {
    try {
        const { status, order_no, keyword, buyer_keyword, start_date, end_date, page = 1, limit = 20 } = req.query;
        const where = {};

        if (status) where.status = status;
        // 支持 order_no 精确搜索 + keyword 模糊搜索
        const searchTerm = keyword || order_no;
        if (searchTerm) where.order_no = { [Op.like]: `%${searchTerm}%` };
        if (start_date && end_date) {
            where.created_at = { [Op.between]: [new Date(start_date), new Date(end_date)] };
        }

        // 如果搜索关键字也可能是买家昵称
        let buyerWhere = undefined;
        if (keyword && !/^ORD/.test(keyword)) {
            buyerWhere = { nickname: { [Op.like]: `%${keyword}%` } };
            delete where.order_no; // 改为搜索买家
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'nickname', 'openid'], where: buyerWhere, required: !!buyerWhere },
                { model: Product, as: 'product', attributes: ['id', 'name', 'images'] }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // 计算今日销售额（仪表盘统计）
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [todaySalesResult, pendingShipCount] = await Promise.all([
            Order.sum('total_amount', {
                where: {
                    status: { [Op.in]: ['paid', 'shipped', 'completed'] },
                    created_at: { [Op.between]: [today, tomorrow] }
                }
            }),
            Order.count({ where: { status: 'paid' } })
        ]);

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit) },
                todaySales: todaySalesResult || 0,
                pendingShip: pendingShipCount || 0
            }
        });
    } catch (error) {
        console.error('获取订单列表失败:', error);
        res.status(500).json({ code: -1, message: '获取订单列表失败: ' + error.message });
    }
};

// 获取订单详情
const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findByPk(id, {
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'nickname', 'openid', 'role_level'] },
                { model: User, as: 'distributor', attributes: ['id', 'nickname'] },
                { model: Product, as: 'product' },
                { model: Address, as: 'address' }
            ]
        });

        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        res.json({ code: 0, data: order });
    } catch (error) {
        console.error('获取订单详情失败:', error);
        res.status(500).json({ code: -1, message: '获取订单详情失败: ' + error.message });
    }
};

// ★ 订单状态机：定义合法的状态流转
const ORDER_STATUS_TRANSITIONS = {
    'pending': ['paid', 'cancelled'],
    'paid': ['agent_confirmed', 'shipping_requested', 'shipped', 'cancelled'],
    'agent_confirmed': ['shipping_requested', 'shipped', 'cancelled'],
    'shipping_requested': ['shipped', 'cancelled'],
    'shipped': ['completed', 'refunded'],
    'completed': ['refunded'],
    'cancelled': [],
    'refunded': []
};

// 更新订单状态（★ 加入状态机校验，防止非法状态流转）
const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remark } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        // ★ 校验状态流转是否合法
        const allowedNext = ORDER_STATUS_TRANSITIONS[order.status] || [];
        if (!allowedNext.includes(status)) {
            return res.status(400).json({
                code: -1,
                message: `状态流转不合法: ${order.status} → ${status}（允许: ${allowedNext.join(', ') || '无'}）`
            });
        }

        order.status = status;
        if (status === 'completed') order.completed_at = new Date();
        if (status === 'shipped') order.shipped_at = new Date();
        if (remark) order.remark = (order.remark ? order.remark + ' | ' : '') + remark;
        await order.save();

        res.json({ code: 0, message: '状态更新成功' });
    } catch (error) {
        console.error('更新订单状态失败:', error);
        res.status(500).json({ code: -1, message: '更新失败: ' + error.message });
    }
};

// 发货（★ 使用事务，代理商发货时扣减云仓库存并计算发货利润）
const shipOrder = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { tracking_company, tracking_number, tracking_no: trackingNoAlt, logistics_company, fulfillment_type } = req.body;

        const order = await Order.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!order) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        // 允许 paid / agent_confirmed / shipping_requested 状态发货
        const allowedStatuses = ['paid', 'agent_confirmed', 'shipping_requested'];
        if (!allowedStatuses.includes(order.status)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: `当前订单状态(${order.status})不可发货` });
        }

        // ★★★ 修复"撞单"风险：如果代理商已进入发货流程，管理员却要用平台发货，给予拦截
        if (fulfillment_type !== 'agent' && order.agent_id &&
            ['agent_confirmed', 'shipping_requested'].includes(order.status)) {
            await t.rollback();
            return res.status(400).json({
                code: -1,
                message: `该订单代理商(ID:${order.agent_id})已在处理中（状态: ${order.status}），如需平台发货请先将状态回退为 paid，或联系代理商取消操作`
            });
        }

        // ★ 如果是代理商发货，扣减代理商云仓库存 + 计算发货利润
        if (fulfillment_type === 'agent' && order.agent_id) {
            const agent = await User.findByPk(order.agent_id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!agent || agent.role_level < 3) {
                await t.rollback();
                return res.status(400).json({ code: -1, message: '代理商信息异常' });
            }

            // ★ 检查是否在 requestShipping 阶段已预扣库存
            const alreadyDeducted = order.status === 'shipping_requested' && order.remark && order.remark.includes('[库存已预扣]');

            if (!alreadyDeducted) {
                if (agent.stock_count < order.quantity) {
                    await t.rollback();
                    return res.status(400).json({ code: -1, message: `代理商云库存不足（当前${agent.stock_count}，需要${order.quantity}）` });
                }
                await agent.decrement('stock_count', { by: order.quantity, transaction: t });
            }

            // ★★★ 修复"库存双重扣除"：仅当 createOrder 阶段扣了平台库存时才补回
            // 如果下单时走的是代理商云库存兜底（platform_stock_deducted=0），则不需要补回
            const platformDeducted = parseInt(order.platform_stock_deducted) !== 0;
            if (platformDeducted) {
                const orderProduct = await Product.findByPk(order.product_id, { transaction: t });
                if (orderProduct) {
                    await orderProduct.increment('stock', { by: order.quantity, transaction: t });
                }
                if (order.sku_id) {
                    const orderSku = await SKU.findByPk(order.sku_id, { transaction: t });
                    if (orderSku) {
                        await orderSku.increment('stock', { by: order.quantity, transaction: t });
                    }
                }
            }

            order.fulfillment_type = 'Agent';
            order.fulfillment_partner_id = order.agent_id;

            // ★★★ 在实际发货时计算代理商利润（使用下单时锁定的进货价）
            const orderProduct2 = await Product.findByPk(order.product_id, { transaction: t });
            if (orderProduct2) {
                const agentCostPrice = order.locked_agent_cost
                    ? parseFloat(order.locked_agent_cost)
                    : parseFloat(orderProduct2.price_agent || orderProduct2.price_leader || orderProduct2.price_member || orderProduct2.retail_price);
                const agentCost = agentCostPrice * order.quantity;
                const buyerPaid = parseFloat(order.actual_price);
                const middleCommission = parseFloat(order.middle_commission_total) || 0;
                const agentProfit = buyerPaid - agentCost - middleCommission;

                // ★ 代理商自购不产生发货利润
                if (agentProfit > 0 && order.buyer_id !== order.agent_id) {
                    await CommissionLog.create({
                        order_id: order.id,
                        user_id: order.agent_id,
                        amount: agentProfit,
                        type: 'agent_fulfillment',
                        status: 'frozen',
                        available_at: null, // 确认收货后才设置
                        remark: `代理商发货利润 (锁定进货价${agentCostPrice}×${order.quantity}=${agentCost}, 中间佣金${middleCommission.toFixed(2)})`
                    }, { transaction: t });

                    await sendNotification(
                        order.agent_id,
                        '发货收益提醒',
                        `您的团队产生了一笔发货订单，发货利润 ¥${agentProfit.toFixed(2)}（确认收货后T+7结算）。`,
                        'commission',
                        order.id
                    );
                } else {
                    // ★★★ 利润 <= 0 告警：通知管理员人工核查
                    console.error(`⚠️ [利润异常] 订单 ${order.order_no || order.id} 代理商(ID:${order.agent_id})发货利润为 ¥${agentProfit.toFixed(2)}，请人工核查！`);
                    await sendNotification(
                        0,
                        '⚠️ 发货利润异常',
                        `订单ID:${order.id} 代理商发货利润为 ¥${agentProfit.toFixed(2)}（<=0），买家实付=${buyerPaid}，进货成本=${agentCost}，中间佣金=${middleCommission}。请人工核查！`,
                        'system_alert',
                        order.id
                    );
                }
            }
        } else {
            order.fulfillment_type = 'Company';
        }

        // 兼容不同字段名
        const finalTrackingNo = tracking_number || trackingNoAlt || '';
        const finalCompany = tracking_company || logistics_company || '';

        order.status = 'shipped';
        order.shipped_at = new Date();
        order.tracking_no = finalTrackingNo;
        // 将物流公司存入 remark（如有独立字段可替换）
        if (finalCompany) {
            order.remark = (order.remark ? order.remark + ' | ' : '') + `物流: ${finalCompany} ${finalTrackingNo}`;
        }
        await order.save({ transaction: t });

        await t.commit();

        res.json({ code: 0, message: '发货成功', data: { tracking_no: finalTrackingNo, logistics_company: finalCompany } });
    } catch (error) {
        await t.rollback();
        console.error('发货失败:', error);
        res.status(500).json({ code: -1, message: '发货失败: ' + error.message });
    }
};

/**
 * 修改物流信息（发货后 ~ 确认收货前可修改）
 * PUT /admin/api/orders/:id/shipping-info
 */
const updateShippingInfo = async (req, res) => {
    try {
        const { id } = req.params;
        const { tracking_no, tracking_company } = req.body;

        if (!tracking_no && !tracking_company) {
            return res.status(400).json({ code: -1, message: '请提供要修改的物流单号或物流公司' });
        }

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        // 仅允许已发货且未确认收货的订单修改物流信息
        if (!['shipped'].includes(order.status)) {
            return res.status(400).json({
                code: -1,
                message: `当前订单状态(${order.status})不允许修改物流信息，仅已发货(shipped)状态可修改`
            });
        }

        const oldTrackingNo = order.tracking_no;
        if (tracking_no !== undefined) {
            order.tracking_no = tracking_no;
        }
        if (tracking_company) {
            order.remark = (order.remark ? order.remark + ' | ' : '') + `物流更新: ${tracking_company} ${tracking_no || order.tracking_no}`;
        }
        await order.save();

        res.json({
            code: 0,
            message: '物流信息更新成功',
            data: {
                old_tracking_no: oldTrackingNo,
                new_tracking_no: order.tracking_no
            }
        });
    } catch (error) {
        console.error('修改物流信息失败:', error);
        res.status(500).json({ code: -1, message: '修改物流信息失败: ' + error.message });
    }
};

// ==================== ★ 以下为新增高级管理功能 ★ ====================

/**
 * ★ 修改订单金额（活动补差/错价补偿）
 * PUT /admin/api/orders/:id/amount
 * body: { new_amount: 100, reason: '说明' }
 */
const adjustOrderAmount = async (req, res) => {
    try {
        const { id } = req.params;
        const { new_amount, reason } = req.body;
        const adminName = req.admin?.username || 'unknown';

        if (!new_amount || !reason) {
            return res.status(400).json({ code: -1, message: '新金额和原因都是必填项' });
        }

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        // 仅允许未完成订单修改金额
        if (['completed', 'cancelled', 'refunded'].includes(order.status)) {
            return res.status(400).json({ code: -1, message: '已完成/取消/退款的订单不允许修改金额' });
        }

        const oldAmount = parseFloat(order.actual_price);
        const adjustAmount = parseFloat(new_amount);

        if (isNaN(adjustAmount) || adjustAmount <= 0) {
            return res.status(400).json({ code: -1, message: '金额必须为正数' });
        }

        await order.update({
            actual_price: adjustAmount,
            remark: (order.remark || '') + ` [管理员${adminName}调价: ¥${oldAmount.toFixed(2)}→¥${adjustAmount.toFixed(2)} 原因:${reason}]`
        });

        res.json({
            code: 0,
            message: '订单金额调整成功',
            data: { old_amount: oldAmount, new_amount: adjustAmount }
        });
    } catch (error) {
        console.error('调整订单金额失败:', error);
        res.status(500).json({ code: -1, message: '调整失败' });
    }
};

/**
 * ★ 添加订单内部备注
 * PUT /admin/api/orders/:id/remark
 * body: { remark: '内部备注内容' }
 */
const addOrderRemark = async (req, res) => {
    try {
        const { id } = req.params;
        const { remark } = req.body;
        const adminName = req.admin?.username || 'unknown';

        if (!remark) {
            return res.status(400).json({ code: -1, message: '请输入备注内容' });
        }

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        const timestamp = new Date().toLocaleString('zh-CN');
        await order.update({
            remark: (order.remark || '') + ` [${timestamp} ${adminName}] ${remark}`
        });

        res.json({ code: 0, message: '备注添加成功' });
    } catch (error) {
        console.error('添加备注失败:', error);
        res.status(500).json({ code: -1, message: '添加失败' });
    }
};

/**
 * ★ 转移订单归属代理商
 * PUT /admin/api/orders/:id/transfer-agent
 * body: { new_agent_id: 123, reason: '说明' }
 */
const transferOrderAgent = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { new_agent_id, reason } = req.body;
        const adminName = req.admin?.username || 'unknown';

        const order = await Order.findByPk(id, { transaction: t });
        if (!order) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        // 仅允许待发货的订单转移
        if (!['paid', 'agent_confirmed', 'shipping_requested'].includes(order.status)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '仅待发货订单可以转移' });
        }

        const oldAgentId = order.agent_id;

        // 转为平台发货：new_agent_id 为 null 或 0
        if (!new_agent_id || new_agent_id === 0) {
            await order.update({
                agent_id: null,
                fulfillment_type: 'Company',
                status: 'paid',
                remark: (order.remark || '') + ` [管理员${adminName}转平台发货 原因:${reason || '-'}]`
            }, { transaction: t });

            await t.commit();
            return res.json({
                code: 0,
                message: '订单已转为平台发货',
                data: { old_agent_id: oldAgentId, new_agent_id: null }
            });
        }

        // 转给新代理商
        const newAgent = await User.findByPk(new_agent_id, { transaction: t });
        if (!newAgent || newAgent.role_level < 3) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '目标用户不存在或不是代理商' });
        }

        await order.update({
            agent_id: newAgent.id,
            fulfillment_type: 'Agent_Pending',
            status: 'paid',
            remark: (order.remark || '') + ` [管理员${adminName}转代理商${newAgent.nickname}(${newAgent.id}) 原因:${reason || '-'}]`
        }, { transaction: t });

        await t.commit();

        // 通知新代理商
        await sendNotification(
            newAgent.id,
            '新订单分配',
            `管理员转移给您一笔订单 ${order.order_no}，请及时处理发货。`,
            'order',
            order.id
        );

        res.json({
            code: 0,
            message: '订单转移成功',
            data: { old_agent_id: oldAgentId, new_agent_id: newAgent.id }
        });
    } catch (error) {
        await t.rollback();
        console.error('转移订单失败:', error);
        res.status(500).json({ code: -1, message: '转移失败' });
    }
};

/**
 * ★ 强制完成订单（跳过确认收货流程）
 * PUT /admin/api/orders/:id/force-complete
 * body: { reason: '说明' }
 */
const forceCompleteOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminName = req.admin?.username || 'unknown';

        if (!reason) {
            return res.status(400).json({ code: -1, message: '请说明强制完成的原因' });
        }

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        if (!['shipped'].includes(order.status)) {
            return res.status(400).json({ code: -1, message: '仅已发货订单可以强制完成' });
        }

        await order.update({
            status: 'completed',
            completed_at: new Date(),
            remark: (order.remark || '') + ` [管理员${adminName}强制完成 原因:${reason}]`
        });

        res.json({ code: 0, message: '订单已强制完成' });
    } catch (error) {
        console.error('强制完成订单失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

/**
 * ★ 强制取消订单（退款+恢复库存）
 * PUT /admin/api/orders/:id/force-cancel
 * body: { reason: '说明' }
 */
const forceCancelOrder = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminName = req.admin?.username || 'unknown';

        if (!reason) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '请说明取消原因' });
        }

        const order = await Order.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!order) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        if (['completed', 'cancelled', 'refunded'].includes(order.status)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '该订单状态不允许取消' });
        }

        // 恢复库存
        const product = await Product.findByPk(order.product_id, { transaction: t });
        if (product && order.status !== 'pending') {
            await product.increment('stock', { by: order.quantity, transaction: t });
        }

        // 撤销相关佣金
        await CommissionLog.update(
            { status: 'cancelled', remark: `[管理员${adminName}取消订单] ${reason}` },
            { where: { order_id: id, status: { [Op.in]: ['frozen', 'pending_approval'] } }, transaction: t }
        );

        await order.update({
            status: 'cancelled',
            remark: (order.remark || '') + ` [管理员${adminName}强制取消 原因:${reason}]`
        }, { transaction: t });

        await t.commit();

        // 通知买家
        await sendNotification(
            order.buyer_id,
            '订单取消通知',
            `您的订单 ${order.order_no} 已被取消，如有疑问请联系客服。`,
            'order',
            order.id
        );

        res.json({ code: 0, message: '订单已取消' });
    } catch (error) {
        await t.rollback();
        console.error('取消订单失败:', error);
        res.status(500).json({ code: -1, message: '取消失败' });
    }
};

/**
 * ★ 批量发货
 * POST /admin/api/orders/batch-ship
 * body: { orders: [{ id: 1, tracking_no: 'xxx' }, ...] }
 */
const batchShipOrders = async (req, res) => {
    try {
        const { orders } = req.body;

        if (!orders || !Array.isArray(orders) || orders.length === 0) {
            return res.status(400).json({ code: -1, message: '请提供要发货的订单列表' });
        }

        let successCount = 0;
        let failedIds = [];

        for (const item of orders) {
            try {
                const order = await Order.findByPk(item.id);
                if (!order || !['paid', 'agent_confirmed', 'shipping_requested'].includes(order.status)) {
                    failedIds.push(item.id);
                    continue;
                }

                await order.update({
                    status: 'shipped',
                    shipped_at: new Date(),
                    tracking_no: item.tracking_no || '',
                    fulfillment_type: 'Company'
                });

                successCount++;
            } catch (e) {
                failedIds.push(item.id);
            }
        }

        res.json({
            code: 0,
            message: `批量发货完成: 成功 ${successCount} 笔，失败 ${failedIds.length} 笔`,
            data: { success_count: successCount, failed_ids: failedIds }
        });
    } catch (error) {
        console.error('批量发货失败:', error);
        res.status(500).json({ code: -1, message: '批量发货失败' });
    }
};

/**
 * ★ 导出订单（返回JSON，前端可转Excel）
 * GET /admin/api/orders/export?status=xxx&start_date=xxx&end_date=xxx
 */
const exportOrders = async (req, res) => {
    try {
        const { status, start_date, end_date, limit = 1000 } = req.query;
        const where = {};

        if (status) where.status = status;
        if (start_date && end_date) {
            where.created_at = { [Op.between]: [new Date(start_date), new Date(end_date + ' 23:59:59')] };
        }

        const orders = await Order.findAll({
            where,
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'nickname', 'openid'] },
                { model: Product, as: 'product', attributes: ['id', 'name'] },
                { model: Address, as: 'address', attributes: ['name', 'phone', 'province', 'city', 'district', 'detail'] }
            ],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: orders,
            message: `导出 ${orders.length} 条订单`
        });
    } catch (error) {
        console.error('导出订单失败:', error);
        res.status(500).json({ code: -1, message: '导出失败' });
    }
};

module.exports = {
    getOrders,
    getOrderById,
    updateOrderStatus,
    shipOrder,
    updateShippingInfo,
    // ★ 新增高级管理功能
    adjustOrderAmount,
    addOrderRemark,
    transferOrderAgent,
    forceCompleteOrder,
    forceCancelOrder,
    batchShipOrders,
    exportOrders
};
