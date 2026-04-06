/**
 * 管理端优惠券：列表/CRUD/发券/自动规则。
 * 指定商品、指定分类与 C 端核销一致，创建与更新须经 validateCouponScopePayload（与 couponController 共用）。
 */
const { Coupon, UserCoupon, User, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const CouponAutomationService = require('../../../services/CouponAutomationService');
const { buildRecordsForUsers } = require('../../../services/UserCouponIssueService');
const { validateCouponScopePayload } = require('../../../controllers/couponController');

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

        const normalizedMinPurchase = type === 'no_threshold' ? 0 : (min_purchase || 0);

        const scopeCheck = validateCouponScopePayload(scope || 'all', scope_ids);
        if (!scopeCheck.ok) {
            return res.status(400).json({ code: -1, message: scopeCheck.message });
        }

        const coupon = await Coupon.create({
            name,
            type,
            value,
            min_purchase: normalizedMinPurchase,
            scope: scopeCheck.scope,
            scope_ids: scopeCheck.scope_ids,
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

        if (updates.type === 'no_threshold') updates.min_purchase = 0;

        const nextScope = updates.scope !== undefined ? updates.scope : coupon.scope;
        const nextScopeIds = updates.scope_ids !== undefined ? updates.scope_ids : coupon.scope_ids;
        const scopeCheck = validateCouponScopePayload(nextScope, nextScopeIds);
        if (!scopeCheck.ok) {
            return res.status(400).json({ code: -1, message: scopeCheck.message });
        }
        updates.scope = scopeCheck.scope;
        updates.scope_ids = scopeCheck.scope_ids;

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
        const { id } = req.params;
        // 支持两种模式：
        //   1. user_ids: [1,2,3]              — 指定用户ID
        //   2. role_levels: [1,2]             — 按等级批量发放
        //   两者可同时传，取并集去重
        const { user_ids, role_levels } = req.body;

        if ((!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) &&
            (!role_levels || !Array.isArray(role_levels) || role_levels.length === 0)) {
            return res.status(400).json({ code: -1, message: '请指定用户ID或用户等级' });
        }

        const coupon = await Coupon.findByPk(id);
        if (!coupon || !coupon.is_active) {
            return res.status(400).json({ code: -1, message: '优惠券不存在或未启用' });
        }

        // 收集目标用户ID
        let targetIds = new Set(Array.isArray(user_ids) ? user_ids.map(Number).filter(Boolean) : []);

        if (Array.isArray(role_levels) && role_levels.length > 0) {
            const { Op } = require('sequelize');
            const { User } = require('../../../models');
            const levelUsers = await User.findAll({
                where: { role_level: { [Op.in]: role_levels.map(Number) }, status: 1 },
                attributes: ['id']
            });
            levelUsers.forEach(u => targetIds.add(u.id));
        }

        if (targetIds.size === 0) {
            return res.status(400).json({ code: -1, message: '未找到符合条件的用户' });
        }

        // 过滤掉已持有该券的用户，防止重复发放
        const existing = await UserCoupon.findAll({
            where: { coupon_id: coupon.id, user_id: { [require('sequelize').Op.in]: [...targetIds] } },
            attributes: ['user_id']
        });
        const existingIds = new Set(existing.map(r => r.user_id));
        const newIds = [...targetIds].filter(uid => !existingIds.has(uid));

        if (newIds.length === 0) {
            return res.json({ code: 0, message: '所有目标用户已拥有该券，无需重复发放' });
        }

        const records = buildRecordsForUsers(coupon, newIds);

        await UserCoupon.bulkCreate(records);
        const skippedCount = existingIds.size;
        res.json({
            code: 0,
            message: `成功向 ${records.length} 名用户发放优惠券${skippedCount > 0 ? `（已跳过 ${skippedCount} 名重复用户）` : ''}`
        });

    } catch (error) {
        console.error('手动发放优惠券失败:', error);
        res.status(500).json({ code: -1, message: '发放失败' });
    }
};

// 获取自动发券规则
const getAutoRules = async (req, res) => {
    try {
        const rules = await CouponAutomationService.getRules();
        res.json({ code: 0, data: rules });
    } catch (error) {
        console.error('获取自动发券规则失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 保存自动发券规则
const saveAutoRules = async (req, res) => {
    try {
        const { rules } = req.body || {};
        if (!Array.isArray(rules)) {
            return res.status(400).json({ code: -1, message: 'rules 必须是数组' });
        }
        await CouponAutomationService.saveRules(rules);
        res.json({ code: 0, message: '自动发券规则已保存' });
    } catch (error) {
        console.error('保存自动发券规则失败:', error);
        res.status(500).json({ code: -1, message: '保存失败' });
    }
};

module.exports = {
    getCoupons,
    getCouponById,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    issueCoupon,
    getAutoRules,
    saveAutoRules
};
