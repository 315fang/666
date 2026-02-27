// backend/controllers/stationController.js
/**
 * 服务站点控制器
 *
 * 功能：
 * 1. 站点列表/地图数据（eCharts scatter 格式）
 * 2. 站点详情
 * 3. 申请认领站点
 * 4. 管理员：审核认领申请
 * 5. 区域成交钩子（由 orderController 调用，自动归因利润）
 */
const { Op } = require('sequelize');
const {
    ServiceStation, StationClaim, User,
    CommissionLog, sequelize
} = require('../models');

/**
 * GET /api/stations
 * 全部站点列表（含 eCharts scatter 数据格式）
 * query: { province?, city?, status? }
 */
exports.getStations = async (req, res, next) => {
    try {
        const { province, city, status } = req.query;
        const where = {};
        if (province) where.province = province;
        if (city) where.city = city;
        where.status = status || 'active';

        const stations = await ServiceStation.findAll({
            where,
            include: [
                {
                    model: User, as: 'claimant',
                    attributes: ['id', 'nickname', 'avatar_url'],
                    required: false
                }
            ],
            order: [['total_orders', 'DESC']]
        });

        // eCharts scatter 格式：[[longitude, latitude, name, total_orders], ...]
        const echartsData = stations
            .filter(s => s.longitude && s.latitude)
            .map(s => ({
                name: s.name,
                value: [
                    parseFloat(s.longitude),
                    parseFloat(s.latitude),
                    s.total_orders
                ],
                city: s.city,
                province: s.province,
                status: s.status,
                is_pickup_point: s.is_pickup_point,
                claimant: s.claimant ? { nickname: s.claimant.nickname, avatar_url: s.claimant.avatar_url } : null
            }));

        res.json({
            code: 0,
            data: {
                list: stations,
                echarts: echartsData,
                total: stations.length
            }
        });
    } catch (err) { next(err); }
};

/**
 * GET /api/stations/:id
 * 站点详情
 */
exports.getStationDetail = async (req, res, next) => {
    try {
        const station = await ServiceStation.findByPk(req.params.id, {
            include: [
                { model: User, as: 'claimant', attributes: ['id', 'nickname', 'avatar_url'], required: false }
            ]
        });
        if (!station) return res.status(404).json({ code: -1, message: '站点不存在' });
        res.json({ code: 0, data: station });
    } catch (err) { next(err); }
};

/**
 * POST /api/stations/:id/claim
 * 用户申请认领站点
 * body: { real_name, phone, id_card?, intro? }
 */
exports.applyClaim = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { real_name, phone, id_card, intro } = req.body;
        const userId = req.user.id;

        if (!real_name || !phone) {
            return res.json({ code: -1, message: '请填写真实姓名和联系方式' });
        }

        const station = await ServiceStation.findByPk(id);
        if (!station) return res.status(404).json({ code: -1, message: '站点不存在' });

        // 已被认领
        if (station.claimant_id && station.status === 'active') {
            return res.json({ code: -1, message: '该站点已被认领' });
        }

        // 检查是否已申请过（待审核中）
        const existing = await StationClaim.findOne({
            where: { station_id: id, applicant_id: userId, status: 'pending' }
        });
        if (existing) {
            return res.json({ code: 1, message: '您已提交过申请，等待审核中', data: { claim_id: existing.id } });
        }

        const claim = await StationClaim.create({
            station_id: id,
            applicant_id: userId,
            real_name,
            phone,
            id_card: id_card ? id_card.replace(/^(.{3})(.+)(.{4})$/, '$1****$3') : null, // 脱敏
            intro,
            status: 'pending'
        });

        res.json({ code: 0, message: '申请已提交，等待管理员审核', data: { claim_id: claim.id } });
    } catch (err) { next(err); }
};

/**
 * GET /api/stations/my-claims
 * 我的认领申请记录
 */
exports.getMyClaims = async (req, res, next) => {
    try {
        const claims = await StationClaim.findAll({
            where: { applicant_id: req.user.id },
            include: [{ model: ServiceStation, as: 'station', attributes: ['id', 'name', 'city', 'province', 'status'] }],
            order: [['created_at', 'DESC']]
        });
        res.json({ code: 0, data: claims });
    } catch (err) { next(err); }
};

/**
 * ★ 内部方法：区域成交利润归因
 * 由 orderController._markOrderAsPaid 调用
 * 根据买家所在城市，查找对应 active 站点，发放认领人利润分成
 */
exports.attributeRegionalProfit = async (orderId, buyerCity, orderAmount) => {
    try {
        if (!buyerCity) return;

        const station = await ServiceStation.findOne({
            where: { city: buyerCity, status: 'active', claimant_id: { [Op.not]: null } }
        });
        if (!station || !station.claimant_id) return;

        const commission = parseFloat((orderAmount * parseFloat(station.commission_rate)).toFixed(2));
        if (commission <= 0) return;

        const t = await sequelize.transaction();
        try {
            // 发放利润到认领人余额
            await User.increment('balance', { by: commission, where: { id: station.claimant_id }, transaction: t });
            await CommissionLog.create({
                user_id: station.claimant_id,
                order_id: orderId,
                amount: commission,
                type: 'Regional',
                status: 'settled',
                settled_at: new Date(),
                remark: `地区站点分成：${buyerCity}（${(station.commission_rate * 100).toFixed(1)}%）`
            }, { transaction: t });
            await ServiceStation.increment(
                { total_orders: 1, total_commission: commission },
                { where: { id: station.id }, transaction: t }
            );
            await t.commit();
            console.log(`[Station] 地区分成: 站点${station.id}(${buyerCity}) 认领人${station.claimant_id} +¥${commission}`);
        } catch (e) {
            await t.rollback();
            console.error('[Station] 地区分成发放失败:', e.message);
        }
    } catch (err) {
        console.error('[Station] attributeRegionalProfit error:', err.message);
    }
};
