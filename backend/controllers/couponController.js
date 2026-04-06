// backend/controllers/couponController.js
/**
 * 优惠券：C 端列表/可用券、管理端 CRUD、发券，以及下单侧复用的校验工具。
 *
 * - scope=all：全场；scope=product|category 须带 scope_ids（与 admin 创建/更新校验一致，见 validateCouponScopePayload）。
 * - 核销口径与下单一致：OrderCoreService 创建订单时用 isCouponApplicable + calcCouponDiscount；
 *   GET /api/coupons/available 用同一套过滤逻辑。
 */
const { Coupon, UserCoupon, User, sequelize } = require('../models');
const { Op } = require('sequelize');

function normalizeScopeIds(value) {
    if (Array.isArray(value)) return value.map(item => Number(item)).filter(Number.isFinite);
    if (!value) return [];
    return String(value)
        .split(',')
        .map(item => Number(item.trim()))
        .filter(Number.isFinite);
}

/**
 * 校验优惠券 scope / scope_ids，并返回写入库的 scope_ids（数组或 null）
 */
function validateCouponScopePayload(scope, scope_ids) {
    const s = scope && String(scope).trim() ? String(scope).trim() : 'all';
    if (s === 'all') {
        return { ok: true, scope: 'all', scope_ids: null };
    }
    if (s !== 'product' && s !== 'category') {
        return { ok: false, message: '无效的使用范围' };
    }
    const ids = normalizeScopeIds(scope_ids);
    if (ids.length === 0) {
        return { ok: false, message: '选择「指定商品」或「指定分类」时，请至少选择一项' };
    }
    return { ok: true, scope: s, scope_ids: ids };
}

function isCouponApplicable(userCoupon, { productIds = [], categoryIds = [] } = {}) {
    const scope = userCoupon.scope || 'all';
    if (scope === 'all') return true;
    const ids = normalizeScopeIds(userCoupon.scope_ids);
    if (ids.length === 0) return false;
    if (scope === 'product') {
        return productIds.some(id => ids.includes(Number(id)));
    }
    if (scope === 'category') {
        return categoryIds.some(id => ids.includes(Number(id)));
    }
    return false;
}

/**
 * GET /api/coupons/mine
 * 我的优惠券列表（分tab：unused/used/expired）
 */
exports.getMyCoupons = async (req, res, next) => {
    try {
        const { status = 'unused' } = req.query;
        const userId = req.user.id;

        // 先过期检查
        await UserCoupon.update(
            { status: 'expired' },
            {
                where: {
                    user_id: userId,
                    status: 'unused',
                    expire_at: { [Op.lt]: new Date() }
                }
            }
        );

        const coupons = await UserCoupon.findAll({
            where: { user_id: userId, status },
            order: [['expire_at', 'ASC']],
            limit: 50
        });

        res.json({ code: 0, data: coupons });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/coupons/available?amount=&product_id=&category_id=&product_ids=&category_ids=
 * 结算页可用券：门槛 + 未过期 + isCouponApplicable（与下单 OrderCoreService 一致）
 */
exports.getAvailableCoupons = async (req, res, next) => {
    try {
        const { amount = 0, product_id, category_id, product_ids, category_ids } = req.query;
        const userId = req.user.id;

        await UserCoupon.update(
            { status: 'expired' },
            { where: { user_id: userId, status: 'unused', expire_at: { [Op.lt]: new Date() } } }
        );

        const coupons = await UserCoupon.findAll({
            where: {
                user_id: userId,
                status: 'unused',
                expire_at: { [Op.gte]: new Date() },
                min_purchase: { [Op.lte]: parseFloat(amount) }
            },
            order: [['coupon_value', 'DESC']]
        });

        const scopedProductIds = [...new Set([
            ...normalizeScopeIds(product_ids),
            ...normalizeScopeIds(product_id)
        ])];
        const scopedCategoryIds = [...new Set([
            ...normalizeScopeIds(category_ids),
            ...normalizeScopeIds(category_id)
        ])];

        const filtered = coupons.filter(c => {
            return isCouponApplicable(c, {
                productIds: scopedProductIds,
                categoryIds: scopedCategoryIds
            });
        });

        res.json({ code: 0, data: filtered });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/admin/coupons
 * 后台：创建优惠券模板
 */
exports.createCoupon = async (req, res, next) => {
    try {
        const { name, type, value, min_purchase = 0, scope = 'all', scope_ids,
            valid_days = 30, stock = -1, target_level, target_region, description } = req.body;

        if (!name || !type || !value) {
            return res.json({ code: 1, message: '缺少必填字段' });
        }

        const scopeCheck = validateCouponScopePayload(scope, scope_ids);
        if (!scopeCheck.ok) {
            return res.json({ code: 1, message: scopeCheck.message });
        }

        const coupon = await Coupon.create({
            name, type, value: parseFloat(value),
            min_purchase: parseFloat(min_purchase),
            scope: scopeCheck.scope, scope_ids: scopeCheck.scope_ids,
            valid_days: parseInt(valid_days),
            stock: parseInt(stock),
            target_level: target_level ? parseInt(target_level) : null,
            target_region: target_region || null,
            description: description || null
        });

        res.json({ code: 0, data: coupon, message: '优惠券创建成功' });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/admin/coupons/:id/issue
 * 后台：批量发放优惠券（按等级/地区）
 */
exports.issueCoupons = async (req, res, next) => {
    try {
        const couponId = parseInt(req.params.id);
        const { user_ids, level, region } = req.body;

        const coupon = await Coupon.findByPk(couponId);
        if (!coupon || !coupon.is_active) {
            return res.json({ code: 1, message: '优惠券不存在或已禁用' });
        }

        // 确定目标用户
        let targetUsers = [];
        if (user_ids && user_ids.length > 0) {
            targetUsers = await User.findAll({ where: { id: { [Op.in]: user_ids } }, attributes: ['id'] });
        } else {
            const where = {};
            if (level != null) where.role_level = parseInt(level);
            // region 简单匹配（预留，需要地址关联时再扩展）
            targetUsers = await User.findAll({ where, attributes: ['id'] });
        }

        if (targetUsers.length === 0) {
            return res.json({ code: 1, message: '没有找到符合条件的用户' });
        }

        // 计算过期时间
        const expireAt = new Date();
        expireAt.setDate(expireAt.getDate() + coupon.valid_days);

        // 批量创建 UserCoupon（跳过已有的，防止重复）
        const existingIds = (await UserCoupon.findAll({
            where: { coupon_id: couponId, user_id: { [Op.in]: targetUsers.map(u => u.id) }, status: 'unused' },
            attributes: ['user_id']
        })).map(uc => uc.user_id);

        const toCreate = targetUsers
            .filter(u => !existingIds.includes(u.id))
            .map(u => ({
                user_id: u.id,
                coupon_id: couponId,
                coupon_name: coupon.name,
                coupon_type: coupon.type,
                coupon_value: coupon.value,
                min_purchase: coupon.min_purchase,
                scope: coupon.scope,
                scope_ids: coupon.scope_ids,
                expire_at: expireAt,
                status: 'unused'
            }));

        if (toCreate.length === 0) {
            return res.json({ code: 0, message: '所有目标用户已有此券，无需重复发放', data: { issued: 0 } });
        }

        await UserCoupon.bulkCreate(toCreate);

        res.json({
            code: 0,
            message: `成功发放 ${toCreate.length} 张，跳过 ${existingIds.length} 张（已有）`,
            data: { issued: toCreate.length, skipped: existingIds.length }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/admin/coupons
 * 后台：优惠券列表
 */
exports.getCoupons = async (req, res, next) => {
    try {
        const coupons = await Coupon.findAll({ order: [['created_at', 'DESC']] });
        res.json({ code: 0, data: coupons });
    } catch (err) {
        next(err);
    }
};

/**
 * PUT /api/admin/coupons/:id
 * 后台：更新优惠券
 */
exports.updateCoupon = async (req, res, next) => {
    try {
        const coupon = await Coupon.findByPk(req.params.id);
        if (!coupon) return res.json({ code: 1, message: '优惠券不存在' });
        const ALLOWED_FIELDS = ['name', 'type', 'value', 'min_purchase', 'scope', 'scope_ids',
            'valid_days', 'stock', 'target_level', 'target_region', 'description', 'is_active'];
        const updates = {};
        for (const key of ALLOWED_FIELDS) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }
        const nextScope = updates.scope !== undefined ? updates.scope : coupon.scope;
        const nextScopeIds = updates.scope_ids !== undefined ? updates.scope_ids : coupon.scope_ids;
        const scopeCheck = validateCouponScopePayload(nextScope, nextScopeIds);
        if (!scopeCheck.ok) {
            return res.json({ code: 1, message: scopeCheck.message });
        }
        updates.scope = scopeCheck.scope;
        updates.scope_ids = scopeCheck.scope_ids;
        await coupon.update(updates);
        res.json({ code: 0, data: coupon });
    } catch (err) {
        next(err);
    }
};

// 重导出：calcCouponDiscount 函数体已提取至 CouponCalcService（解除 Service→Controller 反向依赖），保持向后兼容
const { calcCouponDiscount: _calcCouponDiscount } = require('../services/CouponCalcService');
exports.calcCouponDiscount = _calcCouponDiscount;

exports.isCouponApplicable = isCouponApplicable;
exports.validateCouponScopePayload = validateCouponScopePayload;
