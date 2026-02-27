// backend/controllers/pickupController.js
/**
 * 自提核销控制器
 *
 * 流程：
 * 1. 用户下单选择自提 → 生成 pickup_code (16位) + pickup_qr_token (SHA256)
 * 2. 用户到店：
 *    a) 出示二维码 → 工作人员扫码 → POST /api/pickup/verify-qr
 *    b) 报出数字码 → 工作人员输入 → POST /api/pickup/verify-code
 * 3. 核销成功 → 订单状态 → completed
 */
const crypto = require('crypto');
const { Order, ServiceStation, User, sequelize } = require('../models');

// ── 工具函数 ──
function genPickupCode() {
    // 16位大写字母+数字，排除易混淆字符 0/O/I/1
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function genQrToken(orderId, pickupCode) {
    return crypto
        .createHash('sha256')
        .update(`${orderId}:${pickupCode}:${process.env.JWT_SECRET || 'pickup_salt'}`)
        .digest('hex');
}

/**
 * 生成自提凭证（下单时调用，内部方法，非路由直接调用）
 * 返回 { pickup_code, pickup_qr_token } 以供写入订单
 */
function generatePickupCredentials(orderId) {
    const pickup_code = genPickupCode();
    const pickup_qr_token = genQrToken(orderId, pickup_code);
    return { pickup_code, pickup_qr_token };
}
exports.generatePickupCredentials = generatePickupCredentials;

/**
 * GET /api/pickup/my/:order_id
 * 用户查看自己订单的自提凭证
 */
exports.getPickupInfo = async (req, res, next) => {
    try {
        const { order_id } = req.params;
        const order = await Order.findOne({
            where: { id: order_id, buyer_id: req.user.id, delivery_type: 'pickup' },
            include: [{ model: ServiceStation, as: 'pickupStation', attributes: ['id', 'name', 'address', 'pickup_contact'] }],
            attributes: ['id', 'order_no', 'status', 'pickup_code', 'pickup_qr_token', 'verified_at', 'pickup_station_id']
        });

        if (!order) return res.status(404).json({ code: -1, message: '订单不存在或非自提订单' });

        // 已核销则不再显示 token
        const data = order.toJSON();
        if (order.verified_at) {
            data.pickup_qr_token = null;
        }

        res.json({ code: 0, data });
    } catch (err) { next(err); }
};

/**
 * POST /api/pickup/verify-code
 * 通过16位核销码核销（工作人员端）
 * body: { pickup_code, station_id }
 * 需要：操作人员必须是该站点的 claimant 或 管理员
 */
exports.verifyByCode = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { pickup_code, station_id } = req.body;
        if (!pickup_code || pickup_code.length !== 16) {
            await t.rollback();
            return res.json({ code: -1, message: '请输入16位核销码' });
        }

        const order = await Order.findOne({
            where: { pickup_code: pickup_code.toUpperCase(), delivery_type: 'pickup' },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        return await _doVerify(order, req.user, station_id, t, res);
    } catch (err) {
        await t.rollback();
        next(err);
    }
};

/**
 * POST /api/pickup/verify-qr
 * 通过二维码token核销（工作人员扫码）
 * body: { qr_token, station_id }
 */
exports.verifyByQr = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { qr_token, station_id } = req.body;
        if (!qr_token) {
            await t.rollback();
            return res.json({ code: -1, message: '二维码无效' });
        }

        const order = await Order.findOne({
            where: { pickup_qr_token: qr_token, delivery_type: 'pickup' },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        return await _doVerify(order, req.user, station_id, t, res);
    } catch (err) {
        await t.rollback();
        next(err);
    }
};

// 核销执行（共用逻辑）
async function _doVerify(order, operator, stationId, t, res) {
    if (!order) {
        await t.rollback();
        return res.json({ code: -1, message: '核销码无效或不存在' });
    }

    if (order.verified_at) {
        await t.rollback();
        return res.json({ code: -1, message: '该订单已核销', data: { verified_at: order.verified_at } });
    }

    if (!['paid', 'agent_confirmed', 'shipped'].includes(order.status)) {
        await t.rollback();
        return res.json({ code: -1, message: `订单状态不可核销（当前：${order.status}）` });
    }

    await order.update({
        verified_at: new Date(),
        status: 'completed',
        completed_at: new Date()
    }, { transaction: t });

    await t.commit();

    res.json({
        code: 0,
        message: '核销成功！',
        data: {
            order_no: order.order_no,
            verified_at: order.verified_at,
            buyer_id: order.buyer_id
        }
    });
}
