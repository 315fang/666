const { Coupon, UserCoupon, User, sequelize } = require('../../../models');
const { Op } = require('sequelize');

// 获取优惠券列表
const getCoupons = async (req, res) => {
    try {
        const { keyword, status, page = 1, limit = 20 } = req.query;
        const where = {};

        if (keyword) {
            where.name = { [Op.like]: `%${keyword}%` };
        }
        if (status !== undefined && status !== '') {
            where.is_active = status;
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Coupon.findAndCountAll({
            where,
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // 统计发券量和使用量 (循环查询，虽然有N+1嫌疑但在后台分页20条问题不大，且非常稳健)
        const list = [];
        for (const row of rows) {
            const item = row.toJSON();
            const issued_count = await UserCoupon.count({ where: { coupon_id: item.id } });
            const used_count = await UserCoupon.count({ where: { coupon_id: item.id, status: 'used' } });
            item.issued_count = issued_count;
            item.used_count = used_count;
            list.push(item);
        }

        res.json({
            code: 0,
            data: {
                list,
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
            }
        });
    } catch (error) {
        console.error('获取优惠券列表失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 获取单张优惠券
const getCouponById = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findByPk(id);
        if (!coupon) {
            return res.status(404).json({ code: -1, message: '优惠券不存在' });
        }
        res.json({ code: 0, data: coupon });
    } catch (error) {
        console.error('获取优惠券失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 创建优惠券
const createCoupon = async (req, res) => {
    try {
        const { name, type, value, min_purchase, scope, scope_ids, valid_days, stock, target_level, description, is_active } = req.body;

        if (!name || !type || value === undefined) {
            return res.status(400).json({ code: -1, message: '基本信息不完整' });
        }

        const coupon = await Coupon.create({
            name,
            type,
            value,
            min_purchase: min_purchase || 0,
            scope: scope || 'all',
            scope_ids: scope_ids && scope_ids.length > 0 ? scope_ids : null,
            valid_days: valid_days || 30,
            stock: stock === undefined ? -1 : stock,
            target_level: target_level !== undefined ? target_level : null,
            description,
            is_active: is_active !== undefined ? is_active : 1
        });

        res.json({ code: 0, data: coupon, message: '创建成功' });
    } catch (error) {
        console.error('创建优惠券失败:', error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

// 更新优惠券
const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const coupon = await Coupon.findByPk(id);
        if (!coupon) {
            return res.status(404).json({ code: -1, message: '优惠券不存在' });
        }

        if (updates.scope_ids && updates.scope_ids.length === 0) updates.scope_ids = null;

        await coupon.update(updates);
        res.json({ code: 0, data: coupon, message: '更新成功' });
    } catch (error) {
        console.error('更新优惠券失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

// 删除优惠券
const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findByPk(id);
        if (!coupon) {
            return res.status(404).json({ code: -1, message: '优惠券不存在' });
        }

        // 检查是否已有用户领取
        const issuedCount = await UserCoupon.count({ where: { coupon_id: id } });
        if (issuedCount > 0) {
            return res.status(400).json({ code: -1, message: '该优惠券已被领取，无法删除，建议将其下架' });
        }

        await coupon.destroy();
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除优惠券失败:', error);
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

// 人工发券
const issueCoupon = async (req, res) => {
    try {
        const { id } = req.params; // coupon id
        const { user_ids } = req.body;

        if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
            return res.status(400).json({ code: -1, message: '请选择要发放的用户' });
        }

        const coupon = await Coupon.findByPk(id);
        if (!coupon || !coupon.is_active) {
            return res.status(400).json({ code: -1, message: '优惠券不存在或未启用' });
        }

        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + coupon.valid_days);

        const records = user_ids.map(uid => ({
            user_id: uid,
            coupon_id: coupon.id,
            coupon_name: coupon.name,
            coupon_type: coupon.type,
            coupon_value: coupon.value,
            min_purchase: coupon.min_purchase,
            scope: coupon.scope,
            scope_ids: coupon.scope_ids,
            status: 'unused',
            expire_at: expireDate
        }));

        await UserCoupon.bulkCreate(records);
        res.json({ code: 0, message: `成功向 ${records.length} 名用户发放优惠券` });

    } catch (error) {
        console.error('手动发放优惠券失败:', error);
        res.status(500).json({ code: -1, message: '发放失败' });
    }
};

module.exports = {
    getCoupons,
    getCouponById,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    issueCoupon
};
