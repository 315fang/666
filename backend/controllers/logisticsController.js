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
const { AppConfig } = require('../models');
const { loadMiniProgramConfig } = require('../utils/miniprogramConfig');

async function loadLogisticsConfig() {
    const config = await loadMiniProgramConfig(AppConfig);
    return config.logistics_config || {};
}

function buildManualTrackingPayload(order, logisticsConfig = {}) {
    const shippedAt = order.shipped_at || new Date().toISOString();
    return {
        order_no: order.order_no,
        tracking_no: order.tracking_no,
        company: order.logistics_company || '手工发货',
        status: 'manual',
        status_text: logisticsConfig.manual_status_text || '商家已手工发货',
        manual_mode: true,
        traces: [
            {
                time: shippedAt,
                desc: logisticsConfig.manual_status_desc || '当前订单走手工发货模式，可查看单号和发货时间',
                location: order.logistics_company || ''
            }
        ],
        query_time: new Date().toISOString()
    };
}

/**
 * GET /api/logistics/order/:order_id
 * 通过订单ID查询物流（验证订单归属）
 */
exports.getByOrder = async (req, res, next) => {
    try {
        const { order_id } = req.params;
        const logisticsConfig = await loadLogisticsConfig();
        const order = await Order.findOne({
            where: { id: order_id, buyer_id: req.user.id },
            attributes: ['id', 'order_no', 'tracking_no', 'logistics_company', 'status', 'delivery_type', 'shipped_at']
        });

        if (!order) return res.status(404).json({ code: -1, message: '订单不存在' });
        if (order.delivery_type === 'pickup') {
            return res.json({ code: -1, message: '该订单为自提订单，无物流信息' });
        }
        if (!order.tracking_no) {
            return res.json({ code: -1, message: '运单号尚未生成，请等待发货' });
        }

        if (logisticsConfig.shipping_mode === 'manual') {
            return res.json({ code: 0, data: buildManualTrackingPayload(order, logisticsConfig) });
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
        const logisticsConfig = await loadLogisticsConfig();
        const forceRefresh = req.query.refresh === '1';

        if (logisticsConfig.shipping_mode === 'manual') {
            return res.json({
                code: 0,
                data: {
                    tracking_no,
                    company: company === 'AUTO' ? '手工发货' : company,
                    status: 'manual',
                    status_text: logisticsConfig.manual_status_text || '商家已手工发货',
                    manual_mode: true,
                    traces: [],
                    query_time: new Date().toISOString()
                }
            });
        }

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
        const logisticsConfig = await loadLogisticsConfig();

        if (logisticsConfig.shipping_mode === 'manual') {
            return res.json({
                code: 0,
                data: {
                    tracking_no,
                    company: company === 'AUTO' ? '手工发货' : company,
                    status: 'manual',
                    status_text: logisticsConfig.manual_status_text || '商家已手工发货',
                    manual_mode: true,
                    traces: [],
                    query_time: new Date().toISOString()
                },
                message: logisticsConfig.manual_refresh_toast || '手工发货模式无需刷新轨迹'
            });
        }

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
