const { Order, User, Product, Address, SKU, CommissionLog, AppConfig, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../../../models/notificationUtil');
const AdminOrderService = require('../../../services/AdminOrderService');
const OrderCoreService = require('../../../services/OrderCoreService');
const OrderFulfillmentService = require('../../../services/OrderFulfillmentService');
const { queryLogistics } = require('../../../services/LogisticsService');
const { loadMiniProgramConfig } = require('../../../utils/miniprogramConfig');
const { scheduleUploadShippingInfoAfterShip } = require('../../../services/WechatShippingInfoService');
const { isManualStatusBypassRisk } = require('../../../utils/orderGuards');

async function loadLogisticsConfig() {
    const config = await loadMiniProgramConfig(AppConfig);
    return config.logistics_config || {};
}

function buildManualTrackingPayload(order, logisticsConfig = {}) {
    return {
        order_no: order.order_no,
        tracking_no: order.tracking_no,
        company: order.logistics_company || '手工发货',
        status: 'manual',
        statusText: logisticsConfig.manual_status_text || '商家已手工发货',
        traces: [
            {
                time: order.shipped_at || new Date().toISOString(),
                desc: logisticsConfig.manual_status_desc || '当前订单走手工发货模式，可查看单号和发货时间'
            }
        ],
        manual_mode: true,
        query_time: new Date().toISOString()
    };
}

function roundYuan(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return NaN;
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

function normalizeAdminOrderAmountInput(rawValue, oldAmount, amountUnit = '') {
    const raw = String(rawValue ?? '').trim();
    if (!raw) return NaN;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return NaN;

    const unit = String(amountUnit || '').trim().toLowerCase();
    if (unit === 'yuan') return roundYuan(parsed);
    if (unit === 'fen') return roundYuan(parsed / 100);

    // 兼容历史调用：优先使用更接近当前订单金额的解释方式
    if (raw.includes('.')) return roundYuan(parsed);

    const asYuan = roundYuan(parsed);
    const asFenYuan = roundYuan(parsed / 100);
    const baseline = roundYuan(oldAmount);

    if (!Number.isFinite(baseline) || baseline <= 0) {
        return parsed >= 10000 ? asFenYuan : asYuan;
    }

    return Math.abs(asFenYuan - baseline) < Math.abs(asYuan - baseline)
        ? asFenYuan
        : asYuan;
}

/**
 * 管理端订单列表/导出共用筛选条件
 * @returns {{ where: object, buyerWhere?: object, productWhere?: object, addressWhere?: object, buyerRequired: boolean }}
 */
function buildAdminOrderListFilters(query) {
    const {
        status,
        status_group,
        order_no,
        keyword,
        search_field,
        search_value,
        product_name,
        buyer_keyword,
        payment_method,
        delivery_type,
        start_date,
        end_date,
        include_suborders
    } = query;

    const where = {};

    if (include_suborders !== '1' && include_suborders !== 'true') {
        where.parent_order_id = { [Op.is]: null };
    }

    if (status) {
        where.status = status;
    } else if (status_group && String(status_group) !== 'all') {
        const g = String(status_group);
        if (g === 'pending_pay') where.status = 'pending';
        else if (g === 'pending_ship') {
            where.status = { [Op.in]: ['paid', 'agent_confirmed', 'shipping_requested'] };
        } else if (g === 'pending_receive') where.status = 'shipped';
        else if (g === 'completed') where.status = 'completed';
        else if (g === 'closed') where.status = { [Op.in]: ['cancelled', 'refunded'] };
    }

    if (start_date && end_date) {
        const start = new Date(start_date);
        const end = new Date(end_date);
        end.setHours(23, 59, 59, 999);
        where.created_at = { [Op.between]: [start, end] };
    }

    if (payment_method) where.payment_method = payment_method;
    if (delivery_type) where.delivery_type = delivery_type;

    const sv = String(search_value || keyword || '').trim();
    const sf = sv ? String(search_field || 'auto') : null;

    let buyerWhere = undefined;
    let addressWhere = undefined;
    const productWhereObj = {};

    if (product_name && String(product_name).trim()) {
        productWhereObj.name = { [Op.like]: `%${String(product_name).trim()}%` };
    }

    if (sf) {
        switch (sf) {
            case 'order_no':
                where.order_no = { [Op.like]: `%${sv}%` };
                break;
            case 'buyer_nickname':
                buyerWhere = { nickname: { [Op.like]: `%${sv}%` } };
                break;
            case 'buyer_phone':
                buyerWhere = { phone: { [Op.like]: `%${sv}%` } };
                break;
            case 'member_no':
                buyerWhere = { member_no: { [Op.like]: `%${sv}%` } };
                break;
            case 'receiver_name':
                addressWhere = { receiver_name: { [Op.like]: `%${sv}%` } };
                break;
            case 'receiver_phone':
                addressWhere = { phone: { [Op.like]: `%${sv}%` } };
                break;
            case 'product_name':
                productWhereObj.name = { [Op.like]: `%${sv}%` };
                break;
            case 'auto':
            default:
                where[Op.or] = [
                    { order_no: { [Op.like]: `%${sv}%` } },
                    { '$buyer.nickname$': { [Op.like]: `%${sv}%` } },
                    { '$buyer.phone$': { [Op.like]: `%${sv}%` } },
                    { '$buyer.member_no$': { [Op.like]: `%${sv}%` } }
                ];
                break;
        }
    } else if (order_no && String(order_no).trim()) {
        where.order_no = { [Op.like]: `%${String(order_no).trim()}%` };
    }

    if (buyer_keyword && String(buyer_keyword).trim() && !sv) {
        buyerWhere = { nickname: { [Op.like]: `%${String(buyer_keyword).trim()}%` } };
    }

    const productWhere = Object.keys(productWhereObj).length ? productWhereObj : undefined;
    const buyerRequired = !!buyerWhere;

    return { where, buyerWhere, productWhere, addressWhere, buyerRequired };
}

const orderListInclude = (buyerWhere, productWhere, addressWhere, buyerRequired, exportMode = false) => [
    {
        model: User,
        as: 'buyer',
        attributes: exportMode
            // ★ 安全修复：导出不包含 openid，使用 member_no 作为用户唯一标识
            ? ['id', 'nickname', 'member_no', 'phone']
            : ['id', 'nickname', 'openid', 'role_level', 'member_no', 'phone', 'avatar_url'],
        where: buyerWhere,
        required: buyerRequired
    },
    {
        model: Product,
        as: 'product',
        attributes: exportMode ? ['id', 'name'] : ['id', 'name', 'images'],
        where: productWhere,
        required: !!productWhere
    },
    {
        model: SKU,
        as: 'sku',
        attributes: ['id', 'spec_name', 'spec_value', 'sku_code'],
        required: false
    },
    {
        model: Address,
        as: 'address',
        attributes: exportMode
            ? ['receiver_name', 'phone', 'province', 'city', 'district', 'detail']
            : ['id', 'receiver_name', 'phone'],
        where: addressWhere,
        required: !!addressWhere
    }
];

// 获取订单列表
const getOrders = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const { where, buyerWhere, productWhere, addressWhere, buyerRequired } = buildAdminOrderListFilters(req.query);

        const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const include = orderListInclude(buyerWhere, productWhere, addressWhere, buyerRequired);

        // 拆成 count + findAll。注意：col 必须是字符串，不能传 sequelize.col() 对象，否则 MySQL 会出现
        // Unknown column 'Order.[object Object]' in 'field list'
        const [count, rows] = await Promise.all([
            Order.count({
                where,
                distinct: true,
                col: 'id',
                include
            }),
            Order.findAll({
                where,
                include,
                order: [['created_at', 'DESC']],
                offset,
                limit: parseInt(limit, 10)
            })
        ]);

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
            Order.count({ where: { status: { [Op.in]: ['paid', 'agent_confirmed', 'shipping_requested'] } } })
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
        const sqlMsg = error?.parent?.sqlMessage || error?.original?.sqlMessage;
        console.error('获取订单列表失败:', sqlMsg || error.message, {
            method: req.method,
            path: req.originalUrl || req.url,
            query: req.query,
            stack: error.stack
        });
        res.status(500).json({
            code: -1,
            message: '获取订单列表失败: ' + (sqlMsg || error.message)
        });
    }
};

// 获取订单详情
const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findByPk(id, {
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'nickname', 'openid', 'role_level', 'member_no', 'phone', 'avatar_url', 'invite_code', 'parent_id'] },
                { model: User, as: 'distributor', attributes: ['id', 'nickname'] },
                { model: Product, as: 'product' },
                { model: Address, as: 'address' },
                { model: SKU, as: 'sku', attributes: ['id', 'spec_name', 'spec_value', 'sku_code', 'image'] },
                { model: CommissionLog, as: 'commissions', attributes: ['id', 'user_id', 'amount', 'type', 'status', 'available_at', 'remark', 'created_at'], required: false }
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
    let t;
    try {
        const { id } = req.params;
        const { status, remark } = req.body;

        if (isManualStatusBypassRisk(status)) {
            return res.status(400).json({
                code: -1,
                message: '请使用专用流程：发货请走“发货接口”，退款请走“售后退款接口”'
            });
        }

        t = await sequelize.transaction();

        const order = await Order.findByPk(id, {
            transaction: t,
            lock: t.LOCK.UPDATE
        });
        if (!order) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        // ★ 校验状态流转是否合法
        const allowedNext = ORDER_STATUS_TRANSITIONS[order.status] || [];
        if (!allowedNext.includes(status)) {
            await t.rollback();
            return res.status(400).json({
                code: -1,
                message: `状态流转不合法: ${order.status} → ${status}（允许: ${allowedNext.join(', ') || '无'}）`
            });
        }

        order.status = status;
        if (status === 'completed') {
            await OrderFulfillmentService._completeShippedOrder(order, t);
        }
        if (status === 'shipped') order.shipped_at = new Date();
        if (remark) order.remark = (order.remark ? order.remark + ' | ' : '') + remark;
        await order.save({ transaction: t });

        await t.commit();

        if (status === 'shipped') {
            scheduleUploadShippingInfoAfterShip(order.id);
        }

        res.json({ code: 0, message: '状态更新成功' });
    } catch (error) {
        if (t && !t.finished) {
            await t.rollback();
        }
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
            order.logistics_company = tracking_company;
            order.remark = (order.remark ? order.remark + ' | ' : '') + `物流更新: ${tracking_company} ${tracking_no || order.tracking_no}`;
        }
        await order.save();

        scheduleUploadShippingInfoAfterShip(order.id);

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

const getAdminOrderLogistics = async (req, res) => {
    try {
        const { id } = req.params;
        const logisticsConfig = await loadLogisticsConfig();
        const order = await Order.findByPk(id, {
            attributes: ['id', 'order_no', 'tracking_no', 'logistics_company', 'delivery_type', 'shipped_at', 'status']
        });

        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }
        if (order.delivery_type === 'pickup') {
            return res.status(400).json({ code: -1, message: '该订单为自提订单，无物流信息' });
        }
        if (!order.tracking_no) {
            return res.status(400).json({ code: -1, message: '订单尚未录入物流单号' });
        }

        if (logisticsConfig.shipping_mode === 'manual') {
            return res.json({ code: 0, data: buildManualTrackingPayload(order, logisticsConfig) });
        }

        const forceRefresh = req.query.refresh === '1';
        const data = await queryLogistics(order.tracking_no, order.logistics_company, forceRefresh);
        return res.json({
            code: 0,
            data: {
                ...data,
                statusText: data.status_text
            }
        });
    } catch (error) {
        console.error('后台查询物流失败:', error);
        res.status(500).json({ code: -1, message: error.message || '物流查询失败' });
    }
};

// ==================== ★ 以下为新增高级管理功能 ★ ====================

/**
 * ★ 修改订单金额（活动补差/错价补偿）
 * PUT /admin/api/orders/:id/amount
 * body: { actual_price: 100.00, amount_unit?: 'yuan'|'fen', reason: '说明' }
 */
const adjustOrderAmount = async (req, res) => {
    try {
        const { id } = req.params;
        const { actual_price, amount_unit, reason } = req.body;
        const adminName = req.admin?.username || 'unknown';

        if (actual_price == null || !reason) {
            return res.status(400).json({ code: -1, message: '新金额和原因都是必填项' });
        }

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }

        // 仅允许待支付订单修改金额，避免已支付订单与支付/退款/佣金口径不一致
        if (order.status !== 'pending') {
            return res.status(400).json({ code: -1, message: '仅待支付订单允许修改金额' });
        }

        const oldAmount = roundYuan(order.actual_price);
        const adjustAmount = normalizeAdminOrderAmountInput(actual_price, oldAmount, amount_unit);

        if (!Number.isFinite(adjustAmount) || adjustAmount <= 0) {
            return res.status(400).json({ code: -1, message: '金额必须为有效正数' });
        }

        await order.update({
            total_amount: adjustAmount,
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

        const result = await OrderCoreService.forceCompleteOrderByAdmin(id, adminName, reason);

        res.json({
            code: 0,
            message: `订单已强制完成，售后期${result.refundDays}天后佣金将进入审批流程`
        });
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

        for (const item of orders) {
            try {
                if (!item?.id) {
                    failedIds.push(item.id);
                    continue;
                }
                await AdminOrderService.shipOrder(item.id, {
                    tracking_no: item.tracking_no || '',
                    tracking_company: item.tracking_company || item.logistics_company || '',
                    fulfillment_type: item.fulfillment_type || 'platform'
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
 * ★ 导出订单（返回 JSON 附件，兼容多套管理后台实现）
 * GET /admin/api/orders/export?status=xxx&start_date=xxx&end_date=xxx
 */
const exportOrders = async (req, res) => {
    try {
        const { limit = 1000 } = req.query;
        const { where, buyerWhere, productWhere, addressWhere, buyerRequired } = buildAdminOrderListFilters(req.query);

        const orders = await Order.findAll({
            where,
            include: orderListInclude(buyerWhere, productWhere, addressWhere, buyerRequired, true),
            order: [['created_at', 'DESC']],
            limit: parseInt(limit, 10)
        });

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="orders.json"');
        res.send(JSON.stringify(orders, null, 2));
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
    getAdminOrderLogistics,
    // ★ 新增高级管理功能
    adjustOrderAmount,
    addOrderRemark,
    transferOrderAgent,
    forceCompleteOrder,
    forceCancelOrder,
    batchShipOrders,
    exportOrders
};
