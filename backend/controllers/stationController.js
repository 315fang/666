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
    ServiceStation, StationClaim, StationStaff, User,
    CommissionLog, AppConfig, sequelize
} = require('../models');

const { getBranchAgentPolicy } = require('../utils/branchAgentPolicy');
const logger = require('../utils/logger');
const { reverseGeocode } = require('../utils/tencentGeocoder');

function parseStationMeta(station) {
    const raw = station?.remark;
    if (!raw) return {};
    try {
        return typeof raw === 'string' ? (JSON.parse(raw) || {}) : (raw || {});
    } catch (_) {
        return {};
    }
}

/** 球面距离（千米），用于自提点排序（前端可传 wx.chooseLocation 的经纬度，无第三方费用） */
function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function buildStationMeta(station, extra = {}) {
    const oldMeta = parseStationMeta(station);
    return JSON.stringify({
        ...oldMeta,
        ...extra
    });
}

function maskPhone(phone) {
    if (!phone) return '';
    const raw = String(phone);
    if (raw.length < 7) return raw;
    return `${raw.slice(0, 3)}****${raw.slice(-4)}`;
}

function maskNickname(nickname, fallback = '成员') {
    const raw = String(nickname || '').trim();
    if (!raw) return fallback;
    if (raw.length <= 1) return `${raw}*`;
    return `${raw.slice(0, 1)}${'*'.repeat(Math.min(raw.length - 1, 2))}`;
}

function buildStaffSummary(staffMembers = []) {
    const activeMembers = (Array.isArray(staffMembers) ? staffMembers : []).filter((item) => item && item.status === 'active');
    const preview = activeMembers.slice(0, 4).map((item) => ({
        id: item.id,
        user_id: item.user_id,
        role: item.role || 'staff',
        can_verify: Number(item.can_verify || 0) === 1,
        remark: item.remark || '',
        user: item.user ? {
            id: item.user.id,
            nickname: maskNickname(item.user.nickname, `用户${item.user_id}`),
            phone: maskPhone(item.user.phone)
        } : null
    }));
    return {
        total: activeMembers.length,
        verify_count: activeMembers.filter((item) => Number(item.can_verify || 0) === 1).length,
        manager_count: activeMembers.filter((item) => item.role === 'manager').length,
        preview
    };
}

async function getClaimedStationsByUser(userId) {
    const rows = await ServiceStation.findAll({
        where: { claimant_id: userId, status: 'active' }
    });
    return rows.map(st => ({
        station: st,
        branchType: parseStationMeta(st).branch_type || 'city'
    }));
}

async function getStationStaffSummaryMap(stationIds = []) {
    if (!Array.isArray(stationIds) || stationIds.length === 0) {
        return {};
    }
    const rows = await StationStaff.findAll({
        where: {
            station_id: { [Op.in]: stationIds },
            status: 'active'
        },
        include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'nickname', 'phone'],
            required: false
        }],
        order: [['created_at', 'ASC']]
    });

    return rows.reduce((acc, item) => {
        const plain = item.get ? item.get({ plain: true }) : item;
        const key = String(plain.station_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(plain);
        return acc;
    }, {});
}

async function getManagedStationsByUser(userId) {
    const rows = await ServiceStation.findAll({
        where: { status: 'active' },
        include: [
            {
                model: StationStaff,
                as: 'staffMembers',
                where: { user_id: userId, status: 'active' },
                attributes: ['id', 'role', 'can_verify', 'status', 'remark'],
                required: true
            }
        ],
        order: [['name', 'ASC']]
    });
    const staffSummaryMap = await getStationStaffSummaryMap(rows.map((item) => item.id));
    return rows.map((station) => {
        const plain = station.get ? station.get({ plain: true }) : station;
        const member = (plain.staffMembers || [])[0] || null;
        const meta = parseStationMeta(station);
        return {
            ...plain,
            branch_type: meta.branch_type || 'city',
            region_name: meta.region_name || '',
            my_role: member?.role || 'staff',
            can_verify: Number(member?.can_verify || 0) === 1,
            staff_summary: buildStaffSummary(staffSummaryMap[String(plain.id)] || [])
        };
    });
}

/**
 * GET /api/stations/my-scope
 * 当前用户的门店归属与核销范围
 */
exports.getMyVerifyScope = async (req, res, next) => {
    try {
        let stations = await getManagedStationsByUser(req.user.id);
        if (stations.length === 0) {
            const claimedRows = await ServiceStation.findAll({
                where: { claimant_id: req.user.id, status: 'active' },
                attributes: [
                    'id', 'name', 'province', 'city', 'district', 'address',
                    'status', 'is_pickup_point', 'pickup_contact', 'contact_name',
                    'contact_phone', 'business_days', 'business_time_start', 'business_time_end'
                ],
                include: [
                    {
                        model: StationStaff,
                        as: 'staffMembers',
                        where: { status: 'active' },
                        attributes: ['id', 'user_id', 'role', 'can_verify', 'status', 'remark'],
                        include: [{
                            model: User,
                            as: 'user',
                            attributes: ['id', 'nickname', 'phone'],
                            required: false
                        }],
                        required: false
                    }
                ],
                order: [['name', 'ASC']]
            });
            stations = claimedRows.map((station) => {
                const plain = station.get ? station.get({ plain: true }) : station;
                const meta = parseStationMeta(station);
                return {
                    ...plain,
                    branch_type: meta.branch_type || 'city',
                    region_name: meta.region_name || '',
                    my_role: 'manager',
                    can_verify: true,
                    staff_summary: buildStaffSummary(plain.staffMembers || [])
                };
            });
        }

        const verifyStations = stations.filter((item) => item.can_verify && Number(item.is_pickup_point) === 1);

        res.json({
            code: 0,
            data: {
                has_verify_access: verifyStations.length > 0,
                station_count: stations.length,
                requires_station_selection: verifyStations.length > 1,
                stations
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/stations/region-from-point
 * 根据坐标逆解析省市区（小程序模糊定位后缩放到「市区」视图；需配置 TENCENT_MAP_KEY）
 */
exports.getRegionFromPoint = async (req, res, next) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            res.status(400).json({ code: 400, message: '请提供有效 lat、lng' });
            return;
        }
        let region = null;
        try {
            region = await reverseGeocode(lat, lng);
        } catch (e) {
            logger.warn('STATION_CTRL', 'region-from-point reverseGeocode', { error: e.message || e });
        }
        res.json({
            code: 0,
            data: {
                region,
                configured: !!(process.env.TENCENT_MAP_KEY || '').trim()
            }
        });
    } catch (err) {
        next(err);
    }
};

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
                claimant: s.claimant ? { nickname: s.claimant.nickname, avatar_url: s.claimant.avatar_url } : null,
                branch_type: parseStationMeta(s).branch_type || 'city'
            }));

        res.json({
            code: 0,
            data: {
                list: stations.map(s => {
                    const plain = s.get ? s.get({ plain: true }) : s;
                    const meta = parseStationMeta(s);
                    plain.branch_type = meta.branch_type || 'city';
                    plain.region_name = meta.region_name || '';
                    return plain;
                }),
                echarts: echartsData,
                total: stations.length
            }
        });
    } catch (err) { next(err); }
};

/**
 * GET /api/stations/pickup-options
 * 小程序下单：可选自提门店（运营中 + 支持自提）
 */
exports.getPickupOptions = async (req, res, next) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        const sortCity = req.query.sort_city ? String(req.query.sort_city).trim() : '';

        const rows = await ServiceStation.findAll({
            where: { status: 'active', is_pickup_point: 1 },
            attributes: [
                'id', 'name', 'province', 'city', 'district', 'address',
                'longitude', 'latitude', 'logo_url', 'pickup_contact',
                'contact_name', 'contact_phone', 'business_days',
                'business_time_start', 'business_time_end', 'intro'
            ],
            order: [['name', 'ASC']]
        });

        const hasRef = Number.isFinite(lat) && Number.isFinite(lng);
        const list = rows.map((r) => {
            const plain = r.get ? r.get({ plain: true }) : r;
            let distance_km = null;
            if (hasRef && plain.latitude != null && plain.longitude != null) {
                const la = parseFloat(plain.latitude);
                const lo = parseFloat(plain.longitude);
                if (Number.isFinite(la) && Number.isFinite(lo)) {
                    distance_km = Math.round(haversineKm(lat, lng, la, lo) * 100) / 100;
                }
            }
            return { ...plain, distance_km };
        });

        const cityHit = (stationCity) => {
            if (!sortCity || !stationCity) return false;
            const a = String(stationCity).trim();
            const b = sortCity.trim();
            return a === b || a.includes(b) || b.includes(a);
        };

        list.sort((a, b) => {
            if (sortCity) {
                const ac = cityHit(a.city) ? 0 : 1;
                const bc = cityHit(b.city) ? 0 : 1;
                if (ac !== bc) return ac - bc;
            }
            if (a.distance_km != null && b.distance_km != null) {
                return a.distance_km - b.distance_km;
            }
            if (a.distance_km != null) return -1;
            if (b.distance_km != null) return 1;
            return String(a.name || '').localeCompare(String(b.name || ''), 'zh');
        });

        res.json({ code: 0, data: list });
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
        const user = await User.findByPk(userId, { attributes: ['id', 'role_level'] });
        const policy = await getBranchAgentPolicy();
        const minApplyRoleLevel = Number(policy.min_apply_role_level || 3);

        if (!real_name || !phone) {
            return res.json({ code: -1, message: '请填写真实姓名和联系方式' });
        }
        if (!user || Number(user.role_level || 0) < minApplyRoleLevel) {
            return res.status(403).json({ code: -1, message: `仅代理商等级及以上可申请（当前最低等级: Lv${minApplyRoleLevel}）` });
        }

        const station = await ServiceStation.findByPk(id);
        if (!station) return res.status(404).json({ code: -1, message: '站点不存在' });
        const targetBranchType = parseStationMeta(station).branch_type || 'city';

        // 规则1：先学校后市代理
        // 仅当目标为市代理时，要求当前用户已持有至少一个学校代理据点
        if (targetBranchType === 'city') {
            const claimed = await getClaimedStationsByUser(userId);
            const hasSchool = claimed.some(item => item.branchType === 'school');
            if (!hasSchool) {
                return res.status(400).json({
                    code: -1,
                    message: '请先认领学校据点，再申请所在市代理'
                });
            }
        }

        // 已是市代理时，不再允许申请学校代理（避免反向降级冲突）
        if (targetBranchType === 'school') {
            const claimed = await getClaimedStationsByUser(userId);
            const hasCity = claimed.some(item => item.branchType === 'city');
            if (hasCity) {
                return res.status(400).json({
                    code: -1,
                    message: '您已是市代理，无需再申请学校代理'
                });
            }
        }

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

// 重导出：函数体已提取至 StationProfitService（解除 Service→Controller 反向依赖），保持向后兼容
// parseStationMeta 保留在当前文件中（controller 内部仍有 6 处使用）
const { attributeRegionalProfit } = require('../services/StationProfitService');
exports.attributeRegionalProfit = attributeRegionalProfit;
