// backend/controllers/logisticsController.js
/**
 * 物流查询控制器
 *
 * 接口：
 * GET /api/logistics/:tracking_no?company=SF - 查询物流（有缓存）
 * POST /api/logistics/:tracking_no/refresh   - 强制刷新（用户主动触发）
 * GET /api/logistics/order/:order_id          - 通过订单ID查询
 */
const { Order } = require('../models');
const { queryLogistics, clearCache } = require('../services/LogisticsService');

/**
 * GET /api/logistics/order/:order_id
 * 通过订单ID查询物流（验证订单归属）
 */
exports.getByOrder = async (req, res, next) => {
    try {
        const { order_id } = req.params;
        const order = await Order.findOne({
            where: { id: order_id, buyer_id: req.user.id },
            attributes: ['id', 'order_no', 'tracking_no', 'logistics_company', 'status', 'delivery_type']
        });

        if (!order) return res.status(404).json({ code: -1, message: '订单不存在' });
        if (order.delivery_type === 'pickup') {
            return res.json({ code: -1, message: '该订单为自提订单，无物流信息' });
        }
        if (!order.tracking_no) {
            return res.json({ code: -1, message: '运单号尚未生成，请等待发货' });
        }

        const forceRefresh = req.query.refresh === '1';
        const data = await queryLogistics(order.tracking_no, order.logistics_company, forceRefresh);
        res.json({ code: 0, data: { order_no: order.order_no, ...data } });
    } catch (err) {
        if (err.message.includes('API错误') || err.message.includes('超时')) {
            return res.json({ code: -1, message: '物流查询暂时不可用，请稍后重试' });
        }
        next(err);
    }
};

/**
 * GET /api/logistics/:tracking_no
 * 直接通过运单号查询（open，无需验证订单归属）
 * query: company=SF
 */
exports.getByTrackingNo = async (req, res, next) => {
    try {
        const { tracking_no } = req.params;
        const company = (req.query.company || 'auto').toUpperCase();
        const forceRefresh = req.query.refresh === '1';

        const data = await queryLogistics(tracking_no, company, forceRefresh);
        res.json({ code: 0, data });
    } catch (err) {
        if (err.message.includes('API错误') || err.message.includes('超时')) {
            return res.json({ code: -1, message: '物流查询暂时不可用，请稍后重试' });
        }
        next(err);
    }
};

/**
 * POST /api/logistics/:tracking_no/refresh
 * 用户主动刷新物流（清除缓存后重新查询）
 */
exports.forceRefresh = async (req, res, next) => {
    try {
        const { tracking_no } = req.params;
        const company = (req.query.company || req.body.company || 'auto').toUpperCase();

        clearCache(tracking_no, company);
        const data = await queryLogistics(tracking_no, company, true);
        res.json({ code: 0, data, message: '物流信息已刷新' });
    } catch (err) {
        if (err.message.includes('API错误') || err.message.includes('超时')) {
            return res.json({ code: -1, message: '物流查询暂时不可用，请稍后重试' });
        }
        next(err);
    }
};
