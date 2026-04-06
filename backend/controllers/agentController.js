/**
 * 代理商控制器（薄包装层）
 *
 * 职责仅限：参数提取 → 调用 AgentService → res.json() / next(err)
 * 所有 DB 操作已迁移至 AgentService
 */

const AgentService = require('../services/AgentService');

/**
 * 获取代理商工作台数据
 * GET /api/agent/workbench
 */
const getWorkbench = async (req, res, next) => {
    try {
        const data = await AgentService.getWorkbench(req.user.id);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
};

/**
 * 获取代理商待处理订单列表
 * GET /api/agent/orders?status=paid|agent_confirmed|shipping_requested|shipped
 */
const getAgentOrderList = async (req, res, next) => {
    try {
        const data = await AgentService.getAgentOrderList(req.user.id, req.query);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
};

/**
 * 代理商自行发货（确认+扣货款+填单号，一步完成）
 * POST /api/agent/ship/:id
 * body: { tracking_no, tracking_company }
 */
const agentShip = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { tracking_no, tracking_company } = req.body;
        const data = await AgentService.agentShip(req.user.id, id, { tracking_no, tracking_company });
        res.json({
            code: 0,
            message: '发货成功',
            data
        });
    } catch (error) {
        next(error);
    }
};

/**
 * 代理商货款充值（兼容旧采购入仓接口）
 * POST /api/agent/restock
 * body: { product_id, quantity } 或 { amount }
 */
const restockOrder = async (req, res, next) => {
    try {
        const { product_id, quantity, amount } = req.body;
        const data = await AgentService.restockOrder(req.user.id, { product_id, quantity, amount });
        res.json({
            code: 0,
            message: '货款充值成功',
            data
        });
    } catch (error) {
        next(error);
    }
};

/**
 * 获取货款流水（兼容旧 stock-logs 路径）
 * GET /api/agent/stock-logs
 */
const getStockLogs = async (req, res, next) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const data = await AgentService.getStockLogs(req.user.id, page, limit);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
};

/**
 * 代理商货款账户信息
 * GET /api/agent/wallet
 */
const getWalletInfo = async (req, res, next) => {
    try {
        const data = await AgentService.getWalletInfo(req.user.id);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
};

/**
 * 货款充值单详情
 * GET /api/agent/wallet/recharge-orders/:id
 */
const getRechargeOrderDetail = async (req, res, next) => {
    try {
        const data = await AgentService.getRechargeOrderDetail(req.user.id, req.params.id);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
};

/**
 * 代理商货款充值（手动，默认关闭）
 * POST /api/agent/wallet/recharge
 */
const rechargeWallet = async (req, res, next) => {
    try {
        const amount = parseFloat(req.body?.amount || 0);
        const data = await AgentService.rechargeWallet(req.user.id, amount);
        res.json({
            code: 0,
            message: '充值成功',
            data
        });
    } catch (error) {
        next(error);
    }
};

/**
 * 货款流水
 * GET /api/agent/wallet/logs
 */
const getWalletLogs = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, filter = 'all' } = req.query;
        const data = await AgentService.getWalletLogs(req.user.id, page, limit, filter);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
};

/**
 * 获取代理门户地址（用于小程序 web-view 跳转）
 * GET /api/agent/portal-token
 */
const getPortalToken = async (req, res, next) => {
    try {
        const data = await AgentService.getPortalToken(req.user.id);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
};

/**
 * 货款充值微信支付预下单
 * POST /api/agent/wallet/prepay
 * 仅代理商（role_level >= 3）可用
 */
const prepayWalletRecharge = async (req, res, next) => {
    try {
        const amount = parseFloat(req.body?.amount || 0);
        const rechargeOrderId = req.body?.recharge_order_id || null;
        const data = await AgentService.prepayWalletRecharge(req.user.id, amount, rechargeOrderId);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getWorkbench,
    getAgentOrderList,
    agentShip,
    restockOrder,
    getStockLogs,
    getWalletInfo,
    getRechargeOrderDetail,
    rechargeWallet,
    prepayWalletRecharge,
    getWalletLogs,
    getPortalToken
};
