const { Order, Product, SKU, User, Cart, CommissionLog, Address, Notification, sequelize } = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const { Op } = require('sequelize');
const constants = require('../config/constants');
const { logOrder, logCommission, error: logError } = require('../utils/logger');
// Phase 2: 积分 + 成长値
const PointService = require('../services/PointService');
// Phase 4: 自提核销 + 地区分成
const { generatePickupCredentials } = require('./pickupController');
const { attributeRegionalProfit } = require('./stationController');
// ★ 核心订单服务（事务/库存/支付回调/优惠券等）
const OrderCoreService = require('../services/OrderCoreService');

// 自增序列（进程内唯一），防止同毫秒碰撞

// 生成订单号（时间戳+序列+随机，多实例安全）
// ★ 增加随机位数到6位，碰撞概率从 1/100 降至 1/1000000

/**
 * 创建订单（含库存校验 + 数据库事务）
 * ★★★ 支持多商品：对 items 中每个商品分别走完整下单逻辑，共享同一事务
 */
const createOrder = async (req, res) => {
    try {
        const result = await OrderCoreService.createOrder(req);
        if (result && result.xml_success) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
        }
        if (result && result.xml_fail) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[' + result.xml_fail + ']]></return_msg></xml>');
        }
        res.json({ code: 0, ...result });
    } catch (error) {
        console.error('createOrder 失败:', error);
        res.status(400).json({ code: -1, message: error.message || '操作失败' });
    }
}

/** 微信小程序支付：V3 统一下单，返回 wx.requestPayment 参数 */
const prepayOrder = async (req, res) => {
    try {
        const result = await OrderCoreService.prepayOrder(req);
        if (result && result.xml_success) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
        }
        if (result && result.xml_fail) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[' + result.xml_fail + ']]></return_msg></xml>');
        }
        res.json({ code: 0, ...result });
    } catch (error) {
        console.error('prepayOrder 失败:', error);
        res.status(400).json({ code: -1, message: error.message || '操作失败' });
    }
}

/** 待付款：向微信查单并补记账（notify 漏回调时使用） */
const syncWechatPayStatus = async (req, res) => {
    try {
        const result = await OrderCoreService.syncPendingOrderWechatPay(req);
        res.json({ code: 0, ...result });
    } catch (error) {
        console.error('syncWechatPayStatus 失败:', error);
        res.status(400).json({ code: -1, message: error.message || '操作失败' });
    }
};

/** 微信 V3 支付结果通知：无用户 Token，凭平台签名与 APIv3 密钥验真（body 见 req.rawBody） */
const wechatPayNotify = async (req, res) => {
    try {
        const result = await OrderCoreService.wechatPayNotify(req);
        if (result && result.json_success) {
            return res.status(200).json({ code: 'SUCCESS', message: '成功' });
        }
        if (result && result.json_fail) {
            return res.status(result.statusCode || 500).json({ code: 'ERROR', message: result.json_fail });
        }
        res.json({ code: 0, ...result });
    } catch (error) {
        console.error('wechatPayNotify 失败:', error);
        res.status(500).json({ code: 'ERROR', message: error.message || '操作失败' });
    }
}
/**
 * 支付订单（历史/兼容入口）
 *
 * ★ 佣金不在支付时计算：级差与代理商利润在发货 shipOrder 时按履约方式落库。
 * ★ 生产环境用户支付：prepayOrder（V3 统一下单）+ 微信回调 wechatPayNotify（/api/wechat/pay/notify）。
 * 本方法仍可能被旧客户端或内部调用；若返回 xml_* 字段则为兼容旧版 XML 应答形态，与当前 V3 JSON 回调无关。
 */
const payOrder = async (req, res) => {
    try {
        const result = await OrderCoreService.payOrder(req);
        if (result && result.xml_success) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
        }
        if (result && result.xml_fail) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[' + result.xml_fail + ']]></return_msg></xml>');
        }
        res.json({ code: 0, ...result });
    } catch (error) {
        console.error('payOrder 失败:', error);
        res.status(400).json({ code: -1, message: error.message || '操作失败' });
    }
}
/**
 * 确认收货
 *
 * 1. 设置售后期相关时间（如 refund_deadline）
 * 2. 佣金：frozen → 售后期结束后 pending_approval → 审批 approved → 结算 settled（见定时任务与后台流程）
 * 3. 有效单统计与角色升级在售后期结束后由 OrderJobService.processOrderCompletion 处理，幂等字段 orders.completion_processed
 */
const confirmOrder = async (req, res) => {
    try {
        const result = await OrderCoreService.confirmOrder(req);
        if (result && result.xml_success) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
        }
        if (result && result.xml_fail) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[' + result.xml_fail + ']]></return_msg></xml>');
        }
        res.json({ code: 0, ...result });
    } catch (error) {
        console.error('confirmOrder 失败:', error);
        res.status(400).json({ code: -1, message: error.message || '操作失败' });
    }
}
/**
 * 代理人确认订单
 * POST /api/orders/:id/agent-confirm
 */
const agentConfirmOrder = async (req, res) => {
    try {
        const result = await OrderCoreService.agentConfirmOrder(req);
        if (result && result.xml_success) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
        }
        if (result && result.xml_fail) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[' + result.xml_fail + ']]></return_msg></xml>');
        }
        res.json({ code: 0, ...result });
    } catch (error) {
        console.error('agentConfirmOrder 失败:', error);
        res.status(400).json({ code: -1, message: error.message || '操作失败' });
    }
}
/**
 * 代理人申请发货
 * POST /api/orders/:id/request-shipping
 */
const requestShipping = async (req, res) => {
    try {
        const result = await OrderCoreService.requestShipping(req);
        if (result && result.xml_success) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
        }
        if (result && result.xml_fail) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[' + result.xml_fail + ']]></return_msg></xml>');
        }
        res.json({ code: 0, ...result });
    } catch (error) {
        console.error('requestShipping 失败:', error);
        res.status(400).json({ code: -1, message: error.message || '操作失败' });
    }
}
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
    try {
        const result = await OrderCoreService.cancelOrder(req);
        if (result && result.xml_success) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
        }
        if (result && result.xml_fail) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[' + result.xml_fail + ']]></return_msg></xml>');
        }
        res.json({ code: 0, ...result });
    } catch (error) {
        console.error('cancelOrder 失败:', error);
        res.status(400).json({ code: -1, message: error.message || '操作失败' });
    }
}
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
    try {
        const result = await OrderCoreService.shipOrder(req);
        if (result && result.xml_success) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
        }
        if (result && result.xml_fail) {
            res.set('Content-Type', 'text/xml');
            return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[' + result.xml_fail + ']]></return_msg></xml>');
        }
        res.json({ code: 0, ...result });
    } catch (error) {
        console.error('shipOrder 失败:', error);
        res.status(400).json({ code: -1, message: error.message || '操作失败' });
    }
}
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
        if (status === 'paid' || status === 'pending_ship') {
            where.status = { [Op.in]: ['paid', 'agent_confirmed', 'shipping_requested'] };
        } else if (status) {
            where.status = status;
        }

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'images'] },
                { model: SKU, as: 'sku', attributes: ['id', 'spec_name', 'spec_value'], required: false }
            ],
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
        const raw = req.params.id;
        const isNumericId = /^\d+$/.test(String(raw));

        // 买家本人或归属代理商均可查看；支持数字 id 或商户订单号 order_no（与微信支付 out_trade_no 一致，供「小程序购物订单」跳转）
        const identityClause = isNumericId
            ? { id: parseInt(raw, 10) }
            : { order_no: String(raw) };

        const order = await Order.findOne({
            where: {
                [Op.and]: [
                    identityClause,
                    { [Op.or]: [{ buyer_id: userId }, { agent_id: userId }] }
                ]
            },
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'images', 'retail_price'] },
                { model: User, as: 'distributor', attributes: ['id', 'nickname'] },
                { model: Address, as: 'address', attributes: ['id', 'receiver_name', 'phone', 'province', 'city', 'district', 'detail'] },
                { model: SKU, as: 'sku', attributes: ['id', 'spec_name', 'spec_value'], required: false }
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
        result.address = result.address || result.address_snapshot || null;
        result.reviewed = typeof result.remark === 'string' && result.remark.includes('[已评价]');
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

/**
 * 用户提交订单评价
 * POST /api/orders/:id/review
 * body: { rating, content, images[] }
 */
const submitOrderReview = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id: orderId } = req.params;
        const { rating, content, images } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ code: -1, message: '评分必须在1-5之间' });
        }
        if (!content || content.trim().length < 5) {
            return res.status(400).json({ code: -1, message: '评价内容不能少于5个字' });
        }
        if (content.trim().length > 500) {
            return res.status(400).json({ code: -1, message: '评价内容不能超过500字' });
        }

        const { Review } = require('../models');

        // 验证订单归属和状态
        const order = await Order.findOne({
            where: { id: orderId, buyer_id: userId }
        });
        if (!order) {
            return res.status(404).json({ code: -1, message: '订单不存在' });
        }
        if (!['completed', 'shipped'].includes(order.status)) {
            return res.status(400).json({ code: -1, message: '只有已收货/已完成的订单才能评价' });
        }

        // 防止重复评价
        const existing = await Review.findOne({
            where: { order_id: orderId, user_id: userId }
        });
        if (existing) {
            return res.status(400).json({ code: -1, message: '该订单已评价，不能重复提交' });
        }

        // 创建评价
        const review = await Review.create({
            product_id: order.product_id,
            user_id: userId,
            order_id: orderId,
            rating: parseInt(rating),
            content: content.trim(),
            images: Array.isArray(images) ? images.slice(0, 9) : [],
            status: 1
        });

        // 标记订单已评价
        await Order.update(
            { remark: (order.remark || '') + ' [已评价]' },
            { where: { id: orderId } }
        );

        // 积分奖励
        try {
            await PointService.addPoints(userId, PointService.POINT_RULES.review.points, 'review', orderId, '评价商品奖励');
            await PointService.addGrowthValue(userId, 1, null, 'review');
        } catch (e) { /* 积分失败不影响评价提交 */ }

        res.json({ code: 0, data: { id: review.id }, message: '评价提交成功' });
    } catch (error) {
        console.error('submitOrderReview 失败:', error);
        res.status(500).json({ code: -1, message: error.message || '提交失败' });
    }
};

module.exports = {
    createOrder,
    payOrder,
    prepayOrder,
    syncWechatPayStatus,
    wechatPayNotify,
    shipOrder,
    confirmOrder,
    cancelOrder,
    getOrders,
    getOrderById,
    agentConfirmOrder,
    requestShipping,
    getAgentOrders,
    submitOrderReview
};
