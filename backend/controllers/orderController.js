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
const wechatPayNotify = async (req, res) => {
    try {
        const result = await OrderCoreService.wechatPayNotify(req);
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
        console.error('wechatPayNotify 失败:', error);
        res.status(400).json({ code: -1, message: error.message || '操作失败' });
    }
}
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
 * ★★★ 重要改动：
 * 1. 确认收货后设置售后期结束时间（refund_deadline）
 * 2. 佣金状态流转：frozen → (售后期结束后) → pending_approval → (管理员审批) → approved → settled
 * 3. 升级检查也延迟到售后期结束后执行
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
    getAgentOrders
};
