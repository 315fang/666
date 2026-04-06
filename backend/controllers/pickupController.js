// backend/controllers/pickupController.js
/**
 * 自提核销控制器
 *
 * 流程：
 * 1. 用户下单选择自提 → 生成 pickup_code (16位) + pickup_qr_token (SHA256)
 * 2. 与快递一致：须先走「发货」→ 订单 status = shipped（分润/冻结流水在发货链路完成）
 * 3. 用户到店（可在任意已认领的自提站点核销，不必与下单时选择的 pickup_station_id 一致）：
 *    a) 出示二维码 → 工作人员扫码 → POST /api/pickup/verify-qr
 *    b) 报出数字码 → 工作人员输入 → POST /api/pickup/verify-code
 *    body 可选 station_id：核销所在站点；认领多站点时必须传入。未传则若认领站点唯一则自动使用该站。
 * 4. 核销成功 → 等同确认收货：completed + settlement_at + 冻结佣金 refund_deadline
 */
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Order, ServiceStation, User, sequelize, CommissionLog } = require('../models');
const logger = require('../utils/logger');
const { logActivity } = require('./activityLogController');
const constants = require('../config/constants');
const { getBranchAgentPolicy, computePickupSubsidyForOrder } = require('../utils/branchAgentPolicy');

const writePickupAudit = async ({ operator, order, action, status, description, details = {} }) => {
    try {
        await logActivity({
            user_id: operator?.id || null,
            user_type: 'user',
            username: operator?.nickname || operator?.username || `uid_${operator?.id || 'unknown'}`,
            action,
            resource: 'pickup',
            resource_id: String(order?.id || ''),
            description,
            details,
            status,
            platform: 'api'
        });
    } catch (e) {
        logger.error('PICKUP_CTRL', '静默捕获异常', { error: e.message });
    }
};

// 重导出：函数体已提取至 PickupService（解除 Service→Controller 反向依赖），保持向后兼容
const { generatePickupCredentials } = require('../services/PickupService');
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
            include: [{
                model: ServiceStation,
                as: 'pickupStation',
                attributes: [
                    'id', 'name', 'address', 'province', 'city', 'district',
                    'pickup_contact', 'contact_name', 'contact_phone',
                    'logo_url', 'business_days', 'business_time_start', 'business_time_end', 'intro'
                ]
            }],
            attributes: ['id', 'order_no', 'status', 'pickup_code', 'pickup_qr_token', 'verified_at', 'pickup_station_id']
        });

        if (!order) return res.status(404).json({ code: -1, message: '订单不存在或非自提订单' });

        // 已核销则不再显示 token
        const data = order.toJSON();
        if (order.verified_at) {
            data.pickup_qr_token = null;
        } else if (data.pickup_qr_token) {
            try {
                data.pickup_qr_data_url = await QRCode.toDataURL(data.pickup_qr_token, {
                    width: 240,
                    margin: 2,
                    errorCorrectionLevel: 'M'
                });
            } catch (_) {
                data.pickup_qr_data_url = null;
            }
        }

        res.json({ code: 0, data });
    } catch (err) { next(err); }
};

/**
 * POST /api/pickup/verify-code
 * 通过16位核销码核销（工作人员端）
 * body: { pickup_code, station_id? }
 * 需要：操作人员必须是某一运营中站点的认领人；station_id 为该次核销所在站（可与订单自提点不同）
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
 * body: { qr_token, station_id? }
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

/**
 * 解析「谁在什么站点执行核销」：须为运营中站点且 operator 为该站 claimant。
 * stationId 未传时：仅当该用户只认领一个运营中站点时可自动确定，否则须显式传 station_id。
 */
async function resolveVerifierPickupStation(operator, stationId, t) {
    const opId = parseInt(operator.id, 10);
    if (!Number.isFinite(opId)) {
        return { error: '无效操作者' };
    }
    const raw = stationId;
    const nid =
        raw !== undefined && raw !== null && raw !== ''
            ? parseInt(raw, 10)
            : null;

    if (nid !== null) {
        if (!Number.isFinite(nid)) {
            return { error: '站点参数无效' };
        }
        const st = await ServiceStation.findByPk(nid, { transaction: t, lock: t.LOCK.UPDATE });
        if (!st || st.status !== 'active') {
            return { error: '当前站点不可用或未启用' };
        }
        if (!st.claimant_id || parseInt(st.claimant_id, 10) !== opId) {
            return { error: '您不是该站点的认领人，无法在此站点核销' };
        }
        return { station: st };
    }

    const candidates = await ServiceStation.findAll({
        where: { claimant_id: opId, status: 'active' },
        transaction: t,
        lock: t.LOCK.UPDATE
    });
    if (candidates.length === 0) {
        return { error: '您尚未认领运营中的服务站点，无法核销' };
    }
    if (candidates.length > 1) {
        return { error: '您认领了多个站点，请在请求中指定 station_id（当前核销所在站点）' };
    }
    return { station: candidates[0] };
}

// 核销执行（共用逻辑）
async function _doVerify(order, operator, stationId, t, res) {
    if (!order) {
        await t.rollback();
        await writePickupAudit({
            operator,
            order: null,
            action: 'pickup_verify',
            status: 'failed',
            description: '核销失败：无效核销凭证',
            details: { stationId }
        });
        return res.json({ code: -1, message: '核销码无效或不存在' });
    }

    if (order.verified_at) {
        await t.rollback();
        await writePickupAudit({
            operator,
            order,
            action: 'pickup_verify',
            status: 'failed',
            description: '核销失败：订单已核销',
            details: { stationId, verified_at: order.verified_at }
        });
        return res.json({ code: -1, message: '该订单已核销', data: { verified_at: order.verified_at } });
    }

    if (order.status !== 'shipped') {
        await t.rollback();
        await writePickupAudit({
            operator,
            order,
            action: 'pickup_verify',
            status: 'failed',
            description: '核销失败：订单状态不可核销',
            details: { stationId, order_status: order.status }
        });
        return res.json({
            code: -1,
            message: `请先完成发货后再核销（当前：${order.status}，自提核销相当于确认收货）`
        });
    }

    // 订单须为自提且已绑定用户选择的自提点（用户端展示用）；核销可在其它站点由任一认领人完成
    if (!order.pickup_station_id) {
        await t.rollback();
        await writePickupAudit({
            operator,
            order,
            action: 'pickup_verify',
            status: 'failed',
            description: '核销失败：订单未绑定自提站点',
            details: { stationId }
        });
        return res.json({ code: -1, message: '订单未绑定自提站点，不可核销' });
    }

    const resolved = await resolveVerifierPickupStation(operator, stationId, t);
    if (resolved.error) {
        await t.rollback();
        await writePickupAudit({
            operator,
            order,
            action: 'pickup_verify',
            status: 'failed',
            description: `核销失败：${resolved.error}`,
            details: { stationId, order_pickup_station_id: order.pickup_station_id }
        });
        const isPerm = /认领|认领人|多个站点/.test(resolved.error);
        return res.status(isPerm ? 403 : 400).json({ code: -1, message: resolved.error });
    }
    const verifyStation = resolved.station;

    // 与 OrderCoreService._completeShippedOrder / 自动确认收货一致：写入售后期截止时间，否则冻结佣金 refund_deadline 一直为 null，定时任务永不推进
    const refundDays = constants.REFUND?.MAX_REFUND_DAYS || constants.COMMISSION?.FREEZE_DAYS || 15;
    const refundDeadline = new Date();
    refundDeadline.setDate(refundDeadline.getDate() + Number(refundDays));

    const verifiedAt = new Date();
    const completedAt = new Date();
    await order.update({
        verified_at: verifiedAt,
        status: 'completed',
        completed_at: completedAt,
        settlement_at: refundDeadline
    }, { transaction: t });

    await CommissionLog.update(
        { refund_deadline: refundDeadline },
        { where: { order_id: order.id, status: 'frozen' }, transaction: t }
    );

    const branchPolicy = await getBranchAgentPolicy();
    const sub = computePickupSubsidyForOrder(order, verifyStation, branchPolicy);
    if (sub.amount > 0 && verifyStation.claimant_id) {
        const dup = await CommissionLog.count({
            where: { order_id: order.id, type: 'pickup_subsidy' },
            transaction: t
        });
        if (dup === 0) {
            let remark = `自提核销补贴 ${sub.tierKey}档：比例部分${sub.ratePart}元+固定${sub.fixedPart}元，合计${sub.amount}元`;
            if (sub.legacyFixed) {
                remark = `自提核销补贴 ${sub.tierKey}档（档位合计为0，使用兼容固定额）${sub.amount}元`;
            }
            await User.increment('balance', { by: sub.amount, where: { id: verifyStation.claimant_id }, transaction: t });
            await CommissionLog.create({
                user_id: verifyStation.claimant_id,
                order_id: order.id,
                amount: sub.amount,
                type: 'pickup_subsidy',
                status: 'settled',
                settled_at: new Date(),
                remark
            }, { transaction: t });
        }
    }

    await t.commit();
    await writePickupAudit({
        operator,
        order,
        action: 'pickup_verify',
        status: 'success',
        description: '自提核销成功',
        details: {
            verify_station_id: verifyStation.id,
            order_pickup_station_id: order.pickup_station_id
        }
    });

    res.json({
        code: 0,
        message: '核销成功！',
        data: {
            order_no: order.order_no,
            verified_at: verifiedAt,
            buyer_id: order.buyer_id
        }
    });
}
