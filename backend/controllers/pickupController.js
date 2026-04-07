// backend/controllers/pickupController.js
/**
 * 自提核销控制器
 *
 * 流程：
 * 1. 用户下单选择自提 → 生成 pickup_code (16位) + pickup_qr_token (SHA256)
 * 2. 与快递一致：须先走「发货」→ 订单 status = shipped（分润/冻结流水在发货链路完成）
 * 3. 用户到店（仅限下单时选择的自提站点人员核销）：
 *    a) 出示二维码 → 工作人员扫码 → POST /api/pickup/verify-qr
 *    b) 报出数字码 → 工作人员输入 → POST /api/pickup/verify-code
 *    body 可选 station_id：当前核销站点；若传入，必须与订单所属自提门店一致。
 * 4. 核销成功 → 等同确认收货：completed + settlement_at + 冻结佣金 refund_deadline
 */
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Order, ServiceStation, StationStaff, User, sequelize, CommissionLog } = require('../models');
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

async function getVerifyStationsForUser(userId, transaction = null) {
    const stations = await ServiceStation.findAll({
        where: { status: 'active', is_pickup_point: 1 },
        include: [
            {
                model: StationStaff,
                as: 'staffMembers',
                where: {
                    user_id: userId,
                    status: 'active',
                    can_verify: 1
                },
                attributes: ['id'],
                required: false
            }
        ],
        attributes: ['id', 'name', 'claimant_id'],
        order: [['name', 'ASC']],
        ...(transaction ? { transaction } : {})
    });

    return stations
        .filter((station) => {
            const plain = station.get ? station.get({ plain: true }) : station;
            const isClaimant = !!plain.claimant_id && parseInt(plain.claimant_id, 10) === parseInt(userId, 10);
            const hasVerifyStaff = Array.isArray(plain.staffMembers) && plain.staffMembers.length > 0;
            return isClaimant || hasVerifyStaff;
        })
        .map((station) => {
            const plain = station.get ? station.get({ plain: true }) : station;
            return { id: plain.id, name: plain.name };
        });
}

exports.getPendingPickupOrders = async (req, res, next) => {
    try {
        const operatorId = parseInt(req.user.id, 10);
        const requestedStationId = req.query.station_id ? parseInt(req.query.station_id, 10) : null;
        const page = Math.max(parseInt(req.query.page || 1, 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || 20, 10), 1), 50);
        const offset = (page - 1) * limit;

        const claimedStations = await getVerifyStationsForUser(operatorId);

        if (claimedStations.length === 0) {
            return res.status(403).json({ code: -1, message: '您暂无可核销门店' });
        }

        const claimedStationIds = claimedStations.map((item) => item.id);
        let stationId = null;

        if (requestedStationId != null) {
            if (!claimedStationIds.includes(requestedStationId)) {
                return res.status(403).json({ code: -1, message: '您无权查看该门店的待核销订单' });
            }
            stationId = requestedStationId;
        } else if (claimedStationIds.length === 1) {
            stationId = claimedStationIds[0];
        } else {
            return res.status(400).json({
                code: -1,
                message: '请先指定门店后再查看待核销订单',
                data: {
                    requires_station_selection: true,
                    stations: claimedStations
                }
            });
        }

        const { count, rows } = await Order.findAndCountAll({
            where: {
                delivery_type: 'pickup',
                pickup_station_id: stationId,
                status: 'shipped',
                verified_at: null
            },
            include: [
                {
                    model: ServiceStation,
                    as: 'pickupStation',
                    attributes: ['id', 'name', 'city', 'district', 'address', 'contact_phone'],
                    required: false
                },
                {
                    model: User,
                    as: 'buyer',
                    attributes: ['id', 'nickname', 'phone'],
                    required: false
                }
            ],
            attributes: ['id', 'order_no', 'status', 'quantity', 'total_amount', 'pickup_code', 'created_at', 'shipped_at'],
            order: [['shipped_at', 'DESC'], ['created_at', 'DESC']],
            offset,
            limit
        });

        return res.json({
            code: 0,
            data: {
                list: rows.map((order) => {
                    const plain = order.get ? order.get({ plain: true }) : order;
                    return {
                        id: plain.id,
                        order_no: plain.order_no,
                        status: plain.status,
                        quantity: plain.quantity,
                        total_amount: plain.total_amount,
                        pickup_code: plain.pickup_code,
                        created_at: plain.created_at,
                        shipped_at: plain.shipped_at,
                        buyer: plain.buyer ? {
                            id: plain.buyer.id,
                            nickname: plain.buyer.nickname ? `${plain.buyer.nickname.charAt(0)}***` : '用户***',
                            phone: plain.buyer.phone ? `${String(plain.buyer.phone).slice(0, 3)}****${String(plain.buyer.phone).slice(-4)}` : ''
                        } : null,
                        pickupStation: plain.pickupStation || null
                    };
                }),
                station: claimedStations.find((item) => item.id === stationId) || null,
                pagination: {
                    total: count,
                    page,
                    limit,
                    totalPages: Math.ceil(count / limit)
                }
            }
        });
    } catch (err) {
        next(err);
    }
};

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
 * 需要：操作人员必须是订单所属自提站点的认领人；station_id 为当前核销站点，且必须等于订单 pickup_station_id
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
 * 解析「谁在什么站点执行核销」：须为订单所属自提站点且 operator 为该站 claimant。
 * stationId 未传时：默认按订单所属站点校验；传入时必须与订单所属站点一致。
 */
async function resolveVerifierPickupStation(operator, stationId, orderPickupStationId, t) {
    const opId = parseInt(operator.id, 10);
    if (!Number.isFinite(opId)) {
        return { error: '无效操作者' };
    }
    const orderStationId = parseInt(orderPickupStationId, 10);
    if (!Number.isFinite(orderStationId)) {
        return { error: '订单未绑定有效自提站点' };
    }
    const raw = stationId;
    const nid =
        raw !== undefined && raw !== null && raw !== ''
            ? parseInt(raw, 10)
            : orderStationId;

    if (!Number.isFinite(nid)) {
        return { error: '站点参数无效' };
    }
    if (nid !== orderStationId) {
        return { error: '当前订单仅限所属自提门店核销，请前往下单所选门店处理' };
    }
    const st = await ServiceStation.findByPk(orderStationId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!st || st.status !== 'active') {
        return { error: '当前订单所属门店未处于运营状态，暂不可核销' };
    }
    const isClaimant = !!st.claimant_id && parseInt(st.claimant_id, 10) === opId;
    if (!isClaimant) {
        const staff = await StationStaff.findOne({
            where: {
                station_id: orderStationId,
                user_id: opId,
                status: 'active',
                can_verify: 1
            },
            transaction: t,
            lock: t.LOCK.UPDATE
        });
        if (!staff) {
            return { error: `该订单属于「${st.name || '指定门店'}」自提，您暂无该门店核销权限` };
        }
    }
    return { station: st };
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

    // 订单须为自提且已绑定用户选择的自提点；仅允许订单所属门店人员核销
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

    const resolved = await resolveVerifierPickupStation(operator, stationId, order.pickup_station_id, t);
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
        const isPerm = /认领|认领人|核销权限|所属自提门店/.test(resolved.error);
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
