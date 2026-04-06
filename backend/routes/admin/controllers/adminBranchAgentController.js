const { Op } = require('sequelize');
const { ServiceStation, StationClaim, User, AppConfig, sequelize } = require('../../../models');
const { resolveCoordsForCreate, resolveCoordsForUpdate } = require('../../../utils/stationGeocode');
const { mergePickupTiersFromParsed, DEFAULT_PICKUP_TIERS } = require('../../../utils/branchAgentPolicy');
const { normalizePickupTierKey } = require('../../../utils/serviceStationRemark');

const POLICY_KEY = 'branch_agent_policy';
const DEFAULT_POLICY = {
    enabled: false,
    min_apply_role_level: 3,
    type_commission_rate: {
        school: 0.01,
        area: 0.015,
        city: 0.02,
        province: 0.03
    },
    pickup_station_subsidy_enabled: false,
    pickup_station_subsidy_amount: 0,
    pickup_tiers: JSON.parse(JSON.stringify(DEFAULT_PICKUP_TIERS))
};

function parseMeta(station) {
    const raw = station?.remark;
    if (!raw) return {};
    try { return typeof raw === 'string' ? JSON.parse(raw) || {} : raw; } catch (_) { return {}; }
}

function clampRate(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
}

function withMeta(station) {
    const plain = station.get ? station.get({ plain: true }) : station;
    const meta = parseMeta(station);
    plain.branch_type = meta.branch_type || 'city';
    plain.region_name = meta.region_name || '';
    plain.extra = meta.extra || '';
    plain.pickup_commission_tier = normalizePickupTierKey(meta.pickup_commission_tier);
    return plain;
}

async function getClaimedStationsByUser(userId, transaction = null) {
    const rows = await ServiceStation.findAll({
        where: { claimant_id: userId, status: 'active' },
        transaction
    });
    return rows.map(st => ({
        station: st,
        branchType: parseMeta(st).branch_type || 'city'
    }));
}

async function getPolicyRaw() {
    const row = await AppConfig.findOne({ where: { category: 'branch_agent', config_key: POLICY_KEY, status: 1 } });
    if (!row?.config_value) return { ...DEFAULT_POLICY };
    try {
        const parsed = JSON.parse(row.config_value) || {};
        return {
            ...DEFAULT_POLICY,
            ...parsed,
            enabled: parsed.enabled === true,
            pickup_station_subsidy_enabled: parsed.pickup_station_subsidy_enabled === true,
            pickup_station_subsidy_amount: Math.max(0, Number(parsed.pickup_station_subsidy_amount) || 0),
            type_commission_rate: { ...DEFAULT_POLICY.type_commission_rate, ...(parsed.type_commission_rate || {}) },
            pickup_tiers: mergePickupTiersFromParsed(parsed)
        };
    } catch (_) {
        return { ...DEFAULT_POLICY };
    }
}

exports.getPolicy = async (req, res) => {
    try {
        res.json({ code: 0, data: await getPolicyRaw() });
    } catch (error) {
        console.error('获取分支代理策略失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

exports.updatePolicy = async (req, res) => {
    try {
        const body = req.body || {};
        const rates = { ...(body.type_commission_rate || {}) };
        const safeRate = (v, fallback) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.min(1, Math.max(0, n));
        };
        const policy = {
            ...DEFAULT_POLICY,
            ...body,
            enabled: body.enabled === true,
            min_apply_role_level: Number(body.min_apply_role_level || 3),
            pickup_station_subsidy_enabled: body.pickup_station_subsidy_enabled === true,
            pickup_station_subsidy_amount: Math.max(0, Number(body.pickup_station_subsidy_amount) || 0),
            type_commission_rate: {
                school: safeRate(rates.school, DEFAULT_POLICY.type_commission_rate.school),
                area: safeRate(rates.area, DEFAULT_POLICY.type_commission_rate.area),
                city: safeRate(rates.city, DEFAULT_POLICY.type_commission_rate.city),
                province: safeRate(rates.province, DEFAULT_POLICY.type_commission_rate.province)
            },
            pickup_tiers: mergePickupTiersFromParsed({ pickup_tiers: body.pickup_tiers })
        };
        await AppConfig.upsert({
            config_key: POLICY_KEY,
            config_value: JSON.stringify(policy),
            config_type: 'json',
            category: 'branch_agent',
            description: '分支代理配置',
            is_public: false,
            status: 1
        });
        res.json({ code: 0, message: '保存成功' });
    } catch (error) {
        console.error('更新分支代理策略失败:', error);
        res.status(500).json({ code: -1, message: '保存失败' });
    }
};

exports.getStations = async (req, res) => {
    try {
        const { keyword = '', status = '', branch_type = '' } = req.query;
        const where = {};
        if (status) where.status = status;
        if (keyword) {
            where[Op.or] = [
                { name: { [Op.like]: `%${keyword}%` } },
                { city: { [Op.like]: `%${keyword}%` } },
                { district: { [Op.like]: `%${keyword}%` } }
            ];
        }
        const rows = await ServiceStation.findAll({
            where,
            include: [{ model: User, as: 'claimant', attributes: ['id', 'nickname', 'phone'], required: false }],
            order: [['id', 'DESC']]
        });
        let list = rows.map(withMeta);
        if (branch_type) {
            list = list.filter(item => item.branch_type === branch_type);
        }
        res.json({ code: 0, data: list });
    } catch (error) {
        console.error('获取分支代理网点失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

exports.createStation = async (req, res) => {
    try {
        const {
            name, province, city, district, address,
            commission_rate,
            branch_type = 'city', region_name = '',
            pickup_commission_tier
        } = req.body || {};
        if (!name || !province || !city) {
            return res.status(400).json({ code: -1, message: '名称、省、市必填' });
        }
        const policy = await getPolicyRaw();
        const defaultRate = clampRate(policy.type_commission_rate?.[branch_type], 0.02);
        const geo = await resolveCoordsForCreate(req.body || {}, {
            province,
            city,
            district: district || null,
            address: address || null
        });
        const station = await ServiceStation.create({
            name,
            province,
            city,
            district: district || null,
            address: address || null,
            longitude: geo.longitude != null ? geo.longitude : null,
            latitude: geo.latitude != null ? geo.latitude : null,
            commission_rate: clampRate(commission_rate, defaultRate),
            status: 'active',
            remark: JSON.stringify({
                branch_type,
                region_name: region_name || district || city || province,
                pickup_commission_tier: normalizePickupTierKey(pickup_commission_tier)
            })
        });
        res.json({
            code: 0,
            data: withMeta(station),
            message: '创建成功',
            geocode_note: geo.geocode_note || undefined
        });
    } catch (error) {
        console.error('创建分支代理网点失败:', error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

exports.updateStation = async (req, res) => {
    try {
        const station = await ServiceStation.findByPk(req.params.id);
        if (!station) return res.status(404).json({ code: -1, message: '网点不存在' });
        const body = req.body || {};
        const meta = parseMeta(station);
        station.name = body.name ?? station.name;
        station.province = body.province ?? station.province;
        station.city = body.city ?? station.city;
        station.district = body.district ?? station.district;
        station.address = body.address ?? station.address;
        station.longitude = body.longitude ?? station.longitude;
        station.latitude = body.latitude ?? station.latitude;
        station.status = body.status ?? station.status;
        if (body.commission_rate !== undefined) {
            station.commission_rate = clampRate(body.commission_rate, station.commission_rate || 0);
        }
        const nextTier =
            body.pickup_commission_tier !== undefined
                ? normalizePickupTierKey(body.pickup_commission_tier)
                : normalizePickupTierKey(meta.pickup_commission_tier);
        station.remark = JSON.stringify({
            ...meta,
            branch_type: body.branch_type || meta.branch_type || 'city',
            region_name: body.region_name || meta.region_name || station.district || station.city || station.province,
            pickup_commission_tier: nextTier
        });
        const geo = await resolveCoordsForUpdate(station, body);
        if (geo.apply) {
            station.latitude = geo.latitude;
            station.longitude = geo.longitude;
        }
        await station.save();
        res.json({
            code: 0,
            data: withMeta(station),
            message: '更新成功',
            geocode_note: geo.geocode_note || undefined
        });
    } catch (error) {
        console.error('更新分支代理网点失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

exports.getClaims = async (req, res) => {
    try {
        const { status = '' } = req.query;
        const where = {};
        if (status) where.status = status;
        const rows = await StationClaim.findAll({
            where,
            include: [
                { model: ServiceStation, as: 'station', required: false },
                { model: User, as: 'applicant', attributes: ['id', 'nickname', 'phone', 'role_level'], required: false }
            ],
            order: [['id', 'DESC']]
        });
        const list = rows.map(item => {
            const plain = item.get ? item.get({ plain: true }) : item;
            const meta = parseMeta(plain.station || {});
            plain.branch_type = meta.branch_type || 'city';
            plain.region_name = meta.region_name || '';
            return plain;
        });
        res.json({ code: 0, data: list });
    } catch (error) {
        console.error('获取分支代理申请失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

exports.reviewClaim = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const claim = await StationClaim.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!claim) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '申请不存在' });
        }
        if (claim.status !== 'pending') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '该申请已处理' });
        }
        const { action, note } = req.body || {};
        if (!['approve', 'reject'].includes(action)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: 'action 必须为 approve/reject' });
        }
        claim.status = action === 'approve' ? 'approved' : 'rejected';
        claim.review_note = note || '';
        claim.reviewed_at = new Date();
        await claim.save({ transaction: t });

        if (action === 'approve') {
            const station = await ServiceStation.findByPk(claim.station_id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!station) {
                await t.rollback();
                return res.status(404).json({ code: -1, message: '网点不存在' });
            }
            const stationMeta = parseMeta(station);
            const targetBranchType = stationMeta.branch_type || 'city';

            // 规则1（审核兜底）：市代理必须先有学校代理
            if (targetBranchType === 'city') {
                const claimed = await getClaimedStationsByUser(claim.applicant_id, t);
                const hasSchool = claimed.some(item => item.branchType === 'school');
                if (!hasSchool) {
                    await t.rollback();
                    return res.status(400).json({ code: -1, message: '该申请人尚未认领学校据点，不能通过市代理申请' });
                }
            }

            station.claimant_id = claim.applicant_id;
            station.status = 'active';
            await station.save({ transaction: t });

            // 规则2：成为市代理后，自动释放其学校代理
            let releasedSchoolCount = 0;
            if (targetBranchType === 'city') {
                const claimed = await getClaimedStationsByUser(claim.applicant_id, t);
                const schoolStations = claimed
                    .filter(item => item.branchType === 'school' && Number(item.station.id) !== Number(station.id))
                    .map(item => item.station);
                for (const schoolStation of schoolStations) {
                    schoolStation.claimant_id = null;
                    // 保持站点可继续运营和被认领
                    schoolStation.status = 'active';
                    await schoolStation.save({ transaction: t });
                    releasedSchoolCount += 1;
                }
            }

            const user = await User.findByPk(claim.applicant_id, { transaction: t });
            if (user && Number(user.role_level || 0) < 3) {
                user.role_level = 3;
                await user.save({ transaction: t });
            }

            await t.commit();
            return res.json({
                code: 0,
                message: action === 'approve' ? '已通过' : '已拒绝',
                data: { released_school_count: releasedSchoolCount }
            });
        }

        await t.commit();
        res.json({ code: 0, message: action === 'approve' ? '已通过' : '已拒绝' });
    } catch (error) {
        await t.rollback();
        console.error('审核分支代理申请失败:', error);
        res.status(500).json({ code: -1, message: '审核失败' });
    }
};
