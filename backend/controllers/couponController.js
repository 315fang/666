// backend/controllers/couponController.js
/**
 * 优惠券控制器
 */
const { Coupon, UserCoupon, User, sequelize } = require('../models');
const { Op } = require('sequelize');

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
 * GET /api/coupons/available?amount=xxx&product_id=xxx
 * 结算页：获取可用优惠券列表（按订单金额/商品筛选）
 */
exports.getAvailableCoupons = async (req, res, next) => {
    try {
        const { amount = 0, product_id } = req.query;
        const userId = req.user.id;

        // 过期处理
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

        res.json({ code: 0, data: coupons });
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

        const coupon = await Coupon.create({
            name, type, value: parseFloat(value),
            min_purchase: parseFloat(min_purchase),
            scope, scope_ids: scope_ids || null,
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
        await coupon.update(req.body);
        res.json({ code: 0, data: coupon });
    } catch (err) {
        next(err);
    }
};

/**
 * 辅助函数：计算优惠券抵扣金额
 * @param {object} userCoupon   UserCoupon instance
 * @param {number} orderAmount  订单金额
 * @returns {number} 抵扣金额
 */
exports.calcCouponDiscount = (userCoupon, orderAmount) => {
    if (!userCoupon) return 0;
    if (parseFloat(userCoupon.min_purchase) > orderAmount) return 0;

    if (userCoupon.coupon_type === 'fixed') {
        return Math.min(parseFloat(userCoupon.coupon_value), orderAmount);
    } else if (userCoupon.coupon_type === 'percent') {
        const discount = 1 - parseFloat(userCoupon.coupon_value);
        return parseFloat((orderAmount * discount).toFixed(2));
    }
    return 0;
};
