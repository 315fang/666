const { Op } = require('sequelize');
const { ServiceStation, User } = require('../../../models');
const { resolveCoordsForCreate, resolveCoordsForUpdate } = require('../../../utils/stationGeocode');

function clampRate(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
}

function normalizeBusinessDays(raw) {
    if (raw == null || raw === '') return null;
    let arr = raw;
    if (typeof raw === 'string') {
        try {
            arr = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    if (!Array.isArray(arr)) return null;
    const set = new Set();
    for (const x of arr) {
        const n = parseInt(x, 10);
        if (n >= 1 && n <= 7) set.add(n);
    }
    return set.size ? [...set].sort((a, b) => a - b) : null;
}

function buildPickupContact(contactName, contactPhone) {
    const a = String(contactName || '').trim();
    const b = String(contactPhone || '').trim();
    if (a && b) return `${a} ${b}`;
    return a || b || null;
}

function applyContactSync(station, body) {
    if (body.contact_name !== undefined) station.contact_name = body.contact_name || null;
    if (body.contact_phone !== undefined) station.contact_phone = body.contact_phone || null;
    if (body.contact_name !== undefined || body.contact_phone !== undefined) {
        station.pickup_contact = buildPickupContact(station.contact_name, station.contact_phone);
    } else if (body.pickup_contact !== undefined) {
        station.pickup_contact = body.pickup_contact || null;
    }
}

exports.listPickupStations = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            keyword,
            status,
            is_pickup_point: isPickupRaw
        } = req.query;
        const where = {};
        if (keyword) {
            const k = `%${String(keyword).trim()}%`;
            where[Op.or] = [
                { name: { [Op.like]: k } },
                { address: { [Op.like]: k } },
                { city: { [Op.like]: k } },
                { contact_name: { [Op.like]: k } },
                { contact_phone: { [Op.like]: k } }
            ];
        }
        if (status) where.status = status;
        if (isPickupRaw !== undefined && isPickupRaw !== '') {
            where.is_pickup_point = parseInt(isPickupRaw, 10) ? 1 : 0;
        }
        const p = Math.max(1, parseInt(page, 10) || 1);
        const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const offset = (p - 1) * l;

        const { count, rows } = await ServiceStation.findAndCountAll({
            where,
            include: [{ model: User, as: 'claimant', attributes: ['id', 'nickname', 'phone'], required: false }],
            order: [['updated_at', 'DESC']],
            offset,
            limit: l
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: { total: count, page: p, limit: l }
            }
        });
    } catch (error) {
        console.error('自提门店列表失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

exports.getPickupStation = async (req, res) => {
    try {
        const row = await ServiceStation.findByPk(req.params.id, {
            include: [{ model: User, as: 'claimant', attributes: ['id', 'nickname', 'phone'], required: false }]
        });
        if (!row) return res.status(404).json({ code: -1, message: '门店不存在' });
        res.json({ code: 0, data: row });
    } catch (error) {
        console.error('自提门店详情失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

exports.createPickupStation = async (req, res) => {
    try {
        const body = req.body || {};
        const {
            name, province, city, district, address,
            commission_rate,
            is_pickup_point: isPickupRaw = 1,
            logo_url, business_time_start, business_time_end, intro,
            status = 'active'
        } = body;

        if (!name || !province || !city) {
            return res.status(400).json({ code: -1, message: '名称、省、市必填' });
        }

        const business_days = normalizeBusinessDays(body.business_days);
        const geo = await resolveCoordsForCreate(body, {
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
            commission_rate: clampRate(commission_rate, 0.05),
            is_pickup_point: parseInt(isPickupRaw, 10) ? 1 : 0,
            logo_url: logo_url || null,
            business_days,
            business_time_start: business_time_start || null,
            business_time_end: business_time_end || null,
            intro: intro || null,
            status: ['pending', 'active', 'inactive'].includes(status) ? status : 'active',
            pickup_contact: null,
            contact_name: null,
            contact_phone: null
        });
        applyContactSync(station, body);
        await station.save();

        const full = await ServiceStation.findByPk(station.id, {
            include: [{ model: User, as: 'claimant', attributes: ['id', 'nickname', 'phone'], required: false }]
        });
        res.json({
            code: 0,
            data: full,
            message: '创建成功',
            geocode_note: geo.geocode_note || undefined
        });
    } catch (error) {
        console.error('创建自提门店失败:', error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

exports.updatePickupStation = async (req, res) => {
    try {
        const station = await ServiceStation.findByPk(req.params.id);
        if (!station) return res.status(404).json({ code: -1, message: '门店不存在' });
        const body = req.body || {};

        if (body.name !== undefined) station.name = body.name;
        if (body.province !== undefined) station.province = body.province;
        if (body.city !== undefined) station.city = body.city;
        if (body.district !== undefined) station.district = body.district;
        if (body.address !== undefined) station.address = body.address;
        if (body.longitude !== undefined) station.longitude = body.longitude === '' ? null : body.longitude;
        if (body.latitude !== undefined) station.latitude = body.latitude === '' ? null : body.latitude;
        if (body.status !== undefined && ['pending', 'active', 'inactive'].includes(body.status)) {
            station.status = body.status;
        }
        if (body.commission_rate !== undefined) {
            station.commission_rate = clampRate(body.commission_rate, station.commission_rate || 0);
        }
        if (body.is_pickup_point !== undefined) {
            station.is_pickup_point = parseInt(body.is_pickup_point, 10) ? 1 : 0;
        }
        if (body.logo_url !== undefined) station.logo_url = body.logo_url || null;
        if (body.business_time_start !== undefined) station.business_time_start = body.business_time_start || null;
        if (body.business_time_end !== undefined) station.business_time_end = body.business_time_end || null;
        if (body.intro !== undefined) station.intro = body.intro || null;
        if (body.business_days !== undefined) {
            station.business_days = normalizeBusinessDays(body.business_days);
        }
        applyContactSync(station, body);

        const geo = await resolveCoordsForUpdate(station, body);
        if (geo.apply) {
            station.latitude = geo.latitude;
            station.longitude = geo.longitude;
        }

        await station.save();
        const full = await ServiceStation.findByPk(station.id, {
            include: [{ model: User, as: 'claimant', attributes: ['id', 'nickname', 'phone'], required: false }]
        });
        res.json({
            code: 0,
            data: full,
            message: '更新成功',
            geocode_note: geo.geocode_note || undefined
        });
    } catch (error) {
        console.error('更新自提门店失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};
