const { Order, User, Product, Address, SKU, CommissionLog, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../../../models/notificationUtil');
const AdminOrderService = require('../../../services/AdminOrderService');
const { normalizeCompanyCode, getCompanyDisplayName } = require('../../../services/LogisticsService');

// 获取订单列表
const getOrders = async (req, res) => {
    try {
        const {
            status,
            order_no,
            keyword,
            buyer_keyword,
            company,
            start_date,
            end_date,
            page = 1,
            limit,
            page_size
        } = req.query;
        const where = {};
        const resolvedLimit = parseInt(limit || page_size || 20, 10);

        if (status) where.status = status;
        if (company) where.logistics_company = normalizeCompanyCode(company);
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

        const offset = (parseInt(page, 10) - 1) * resolvedLimit;

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'nickname', 'openid'], where: buyerWhere, required: !!buyerWhere },
                { model: Product, as: 'product', attributes: ['id', 'name', 'images'] },
                { model: Address, as: 'address', attributes: ['id', 'receiver_name', 'phone', 'province', 'city', 'district', 'detail'], required: false }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit: resolvedLimit
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
                pagination: { total: count, page: parseInt(page, 10), limit: resolvedLimit },
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

// 发货（提取至 AdminOrderService）
const shipOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await AdminOrderService.shipOrder(id, req.body);
        res.json({ code: 0, message: '发货成功', data: result });
    } catch (error) {
        console.error('发货失败:', error);
        res.status(500).json({ code: -1, message: error.message || '发货失败' });
    }
};

/**
 * 修改物流信息（发货后 ~ 确认收货前可修改）
 * PUT /admin/api/orders/:id/shipping-info
 */
const updateShippingInfo = async (req, res) => {
    try {
        const { id } = req.params;
        const { tracking_no, tracking_company, logistics_company } = req.body;

        if (!tracking_no && !tracking_company && !logistics_company) {
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
        const finalCompany = normalizeCompanyCode(logistics_company || tracking_company || order.logistics_company || '');
        const finalCompanyLabel = tracking_company || getCompanyDisplayName(finalCompany) || finalCompany;
        if (tracking_company || logistics_company !== undefined) {
            order.logistics_company = finalCompany || null;
        }
        if (finalCompanyLabel || tracking_no || order.tracking_no) {
            const logisticsSummary = [finalCompanyLabel, tracking_no || order.tracking_no].filter(Boolean).join(' ');
            order.remark = (order.remark ? order.remark + ' | ' : '') + `物流更新: ${logisticsSummary}`;
        }
        await order.save();

        res.json({
            code: 0,
            message: '物流信息更新成功',
            data: {
                old_tracking_no: oldTrackingNo,
                new_tracking_no: order.tracking_no,
                logistics_company: order.logistics_company
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
 * ★ 转移订单归属代理商 (提取至 AdminOrderService)
 * PUT /admin/api/orders/:id/transfer-agent
 */
const transferOrderAgent = async (req, res) => {
    try {
        const { id } = req.params;
        const { new_agent_id, reason } = req.body;
        const adminName = req.admin?.username || 'unknown';

        const result = await AdminOrderService.transferOrderAgent(id, new_agent_id, reason, adminName);

        res.json({
            code: 0,
            message: '订单转移操作成功',
            data: result
        });
    } catch (error) {
        console.error('转移订单失败:', error);
        res.status(500).json({ code: -1, message: error.message || '转移失败' });
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
 * ★ 强制取消订单（退款+恢复库存）(提取至 AdminOrderService)
 * PUT /admin/api/orders/:id/force-cancel
 */
const forceCancelOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminName = req.admin?.username || 'unknown';

        if (!reason) {
            return res.status(400).json({ code: -1, message: '请说明取消原因' });
        }

        await AdminOrderService.forceCancelOrder(id, reason, adminName);

        res.json({ code: 0, message: '订单已取消' });
    } catch (error) {
        console.error('取消订单失败:', error);
        res.status(500).json({ code: -1, message: error.message || '取消失败' });
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
        let failedItems = [];

        for (const item of orders) {
            try {
                await AdminOrderService.shipOrder(item.id, item);
                successCount++;
            } catch (e) {
                failedIds.push(item.id);
                failedItems.push({ id: item.id, message: e.message || '发货失败' });
            }
        }

        res.json({
            code: 0,
            message: `批量发货完成: 成功 ${successCount} 笔，失败 ${failedIds.length} 笔`,
            data: { success_count: successCount, failed_ids: failedIds, failed_items: failedItems }
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
