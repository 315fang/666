// backend/controllers/slashController.js
/**
 * 砍一刀控制器
 * 无资格限制——任何用户都可以发起，任何人都可以帮砍
 */
const { Op } = require('sequelize');
const {
    SlashActivity, SlashRecord, SlashHelper,
    Product, User, sequelize
} = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const PointService = require('../services/PointService');

// 生成砍价单号
function genSlashNo() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    return `SL${date}${rand}`;
}

function resolveSlashExpireAt(recordExpireAt, activityEndAt) {
    const candidates = [recordExpireAt, activityEndAt]
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()));

    if (!candidates.length) return null;
    return new Date(Math.min(...candidates.map((date) => date.getTime())));
}

function buildSlashActiveWhere(now, extra = {}) {
    return {
        ...extra,
        status: 1,
        [Op.and]: [
            {
                [Op.or]: [
                    { start_at: null },
                    { start_at: { [Op.lte]: now } }
                ]
            },
            {
                [Op.or]: [
                    { end_at: null },
                    { end_at: { [Op.gt]: now } }
                ]
            }
        ]
    };
}

/**
 * GET /api/slash/activities
 * 活动列表（按商品筛选，或不传返回全部）
 */
exports.getActivities = async (req, res, next) => {
    try {
        const { product_id } = req.query;
        const now = new Date();
        const where = buildSlashActiveWhere(now, product_id ? { product_id } : {});

        const activities = await SlashActivity.findAll({
            where,
            include: [
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'images', 'retail_price'],
                    where: { visible_in_mall: true },
                    required: true
                }
            ],
            order: [['created_at', 'DESC']]
        });
        res.json({ code: 0, data: activities });
    } catch (err) { next(err); }
};

/**
 * POST /api/slash/start
 * 发起砍价（任何人，无会员限制）
 * body: { activity_id, sku_id? }
 */
exports.startSlash = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;
        const { activity_id } = req.body;

        const now = new Date();
        const activity = await SlashActivity.findOne({
            where: buildSlashActiveWhere(now, { id: activity_id }),
            transaction: t, lock: t.LOCK.UPDATE
        });

        if (!activity) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '砍价活动不存在或已结束' });
        }

        if (activity.sold_count >= activity.stock_limit) {
            await t.rollback();
            return res.json({ code: -1, message: '活动库存已售罄' });
        }

        // 检查同商品是否已有进行中的砍价
        const existing = await SlashRecord.findOne({
            where: { user_id: userId, activity_id, status: 'active' },
            transaction: t
        });
        if (existing) {
            const existingExpireAt = resolveSlashExpireAt(existing.expire_at, activity.end_at);
            if (existingExpireAt && existingExpireAt <= now) {
                await existing.update({ status: 'expired' }, { transaction: t });
            } else {
                await t.rollback();
                return res.json({
                    code: 0,
                    message: '您已有进行中的砍价，已为您继续进入详情',
                    data: {
                        slash_no: existing.slash_no,
                        existing: true
                    }
                });
            }
        }

        const expireAt = resolveSlashExpireAt(
            new Date(now.getTime() + activity.expire_hours * 3600 * 1000),
            activity.end_at
        );
        const record = await SlashRecord.create({
            slash_no: genSlashNo(),
            activity_id: activity.id,
            user_id: userId,
            product_id: activity.product_id,
            original_price: activity.original_price,
            floor_price: activity.floor_price,
            current_price: activity.initial_price,
            total_slashed: 0,
            helper_count: 0,
            status: 'active',
            expire_at: expireAt
        }, { transaction: t });

        await t.commit();

        res.json({
            code: 0,
            message: '砍价发起成功！快分享给朋友帮你砍吧',
            data: {
                slash_no: record.slash_no,
                current_price: record.current_price,
                floor_price: record.floor_price,
                expire_at: record.expire_at,
                expires_at: record.expire_at
            }
        });
    } catch (err) {
        await t.rollback();
        next(err);
    }
};

/**
 * GET /api/slash/:slash_no
 * 砍价详情（分享页，无需登录）
 */
exports.getDetail = async (req, res, next) => {
    try {
        const { slash_no } = req.params;
        const record = await SlashRecord.findOne({
            where: { slash_no },
            include: [
                { model: SlashActivity, as: 'activity', attributes: ['id', 'end_at', 'expire_hours', 'status'] },
                { model: Product, as: 'product', attributes: ['id', 'name', 'images', 'retail_price'] },
                { model: User, as: 'initiator', attributes: ['id', 'nickname', 'avatar_url'] },
                {
                    model: SlashHelper, as: 'helpers',
                    include: [{ model: User, as: 'helper', attributes: ['id', 'nickname', 'avatar_url'] }],
                    order: [['created_at', 'ASC']],
                    limit: 20
                }
            ]
        });

        if (!record) return res.status(404).json({ code: -1, message: '砍价不存在' });

        const now = new Date();
        const effectiveExpireAt = resolveSlashExpireAt(record.expire_at, record.activity?.end_at);
        const remainSeconds = effectiveExpireAt
            ? Math.max(0, Math.floor((effectiveExpireAt - now) / 1000))
            : null;

        if (effectiveExpireAt && remainSeconds === 0 && record.status === 'active') {
            await record.update({ status: 'expired' });
            record.status = 'expired';
        }

        // 当前用户是否已帮砍
        let hasHelped = false;
        if (req.user) {
            const helpRecord = await SlashHelper.findOne({
                where: { slash_record_id: record.id, helper_user_id: req.user.id }
            });
            hasHelped = !!helpRecord;
        }

        const rawRecord = record.toJSON();
        const helpers = (rawRecord.helpers || []).map((item) => ({
            ...item,
            user: item.user || item.helper || null,
            cut_amount: item.cut_amount ?? item.slash_amount
        }));

        res.json({
            code: 0,
            data: {
                ...rawRecord,
                helpers,
                expires_at: effectiveExpireAt ? effectiveExpireAt.toISOString() : null,
                remain_seconds: remainSeconds,
                has_helped: hasHelped,
                amount_to_floor: Math.max(0, parseFloat(record.current_price) - parseFloat(record.floor_price))
            }
        });
    } catch (err) { next(err); }
};

/**
 * POST /api/slash/:slash_no/help
 * 帮砍一刀（任何人，无会员限制）
 * 登录用户才能帮砍，但不限制身份
 */
exports.helpSlash = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const helperId = req.user.id;
        const { slash_no } = req.params;

        const record = await SlashRecord.findOne({
            where: { slash_no },
            transaction: t, lock: t.LOCK.UPDATE
        });

        if (!record) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '砍价活动不存在' });
        }

        if (record.status !== 'active') {
            await t.rollback();
            const msg = record.status === 'success' ? '该砍价已砍到底价' : '砍价已结束';
            return res.json({ code: -1, message: msg });
        }

        const activity = await SlashActivity.findByPk(record.activity_id, { transaction: t });
        const effectiveExpireAt = resolveSlashExpireAt(record.expire_at, activity?.end_at);

        if (effectiveExpireAt && new Date() > effectiveExpireAt) {
            await record.update({ status: 'expired' }, { transaction: t });
            await t.commit();
            return res.json({ code: -1, message: '砍价已超时' });
        }

        // 发起者不能帮自己砍
        if (record.user_id === helperId) {
            await t.rollback();
            return res.json({ code: -1, message: '不能帮自己砍价哦，快去分享给朋友吧' });
        }

        // 检查是否已帮砍过
        const alreadyHelped = await SlashHelper.findOne({
            where: { slash_record_id: record.id, helper_user_id: helperId },
            transaction: t
        });
        if (alreadyHelped) {
            await t.rollback();
            return res.json({ code: -1, message: '您已经帮过这个砍价了', data: { slash_amount: alreadyHelped.slash_amount } });
        }

        // 获取活动配置
        const maxHelpers = activity.max_helpers;
        if (maxHelpers !== -1 && record.helper_count >= maxHelpers) {
            await t.rollback();
            return res.json({ code: -1, message: '帮砍人数已满，活动结束' });
        }

        // ── 计算砍价金额（随机）──
        const currentPrice = parseFloat(record.current_price);
        const floorPrice = parseFloat(record.floor_price);
        const gap = currentPrice - floorPrice;
        if (gap <= 0) {
            // 已到底价，直接成功
            await record.update({ status: 'success', success_at: new Date() }, { transaction: t });
            await t.commit();
            return res.json({ code: 0, message: '已砍到底价！', data: { already_floor: true } });
        }

        // 随机砍价（基于当前缺口，越接近底价砍得越少）
        const maxSlash = Math.min(parseFloat(activity.max_slash_per_helper), gap * 0.6);
        const minSlash = parseFloat(activity.min_slash_per_helper);
        let slashAmount = minSlash + Math.random() * (maxSlash - minSlash);
        slashAmount = Math.min(slashAmount, gap);  // 最多砍到底价
        slashAmount = parseFloat(slashAmount.toFixed(2));

        const newPrice = parseFloat(Math.max(floorPrice, currentPrice - slashAmount).toFixed(2));
        const isFloor = newPrice <= floorPrice;

        // 写帮砍记录
        const helper = await User.findByPk(helperId, { transaction: t, attributes: ['parent_id'] });
        await SlashHelper.create({
            slash_record_id: record.id,
            helper_user_id: helperId,
            slash_amount: slashAmount,
            is_new_user: !helper?.parent_id ? 1 : 0
        }, { transaction: t });

        // 更新主记录
        await record.update({
            current_price: newPrice,
            total_slashed: parseFloat(record.total_slashed) + slashAmount,
            helper_count: record.helper_count + 1,
            status: isFloor ? 'success' : 'active',
            success_at: isFloor ? new Date() : null
        }, { transaction: t });

        await t.commit();

        // 通知发起者
        sendNotification(
            record.user_id,
            '好友帮你砍了一刀！',
            `有好友帮你砍掉了 ¥${slashAmount}，当前价格 ¥${newPrice}${isFloor ? '，已砍到底价！快去购买！' : ''}`,
            'slash',
            slash_no
        ).catch(() => { });

        // 砍价活动成长值奖励（按后台配置）
        PointService.addGrowthValue(helperId, 1, null, 'slash_help').catch(() => { });
        if (isFloor) {
            PointService.addGrowthValue(record.user_id, 1, null, 'slash_start').catch(() => { });
        }

        res.json({
            code: 0,
            message: isFloor ? '🎉 砍到底价了！可以购买了！' : `砍掉了 ¥${slashAmount}！`,
            data: {
                slash_amount: slashAmount,
                current_price: newPrice,
                floor_price: floorPrice,
                is_floor: isFloor,
                helper_count: record.helper_count + 1
            }
        });
    } catch (err) {
        await t.rollback();
        next(err);
    }
};

/**
 * GET /api/slash/my
 * 我发起的砍价记录
 */
exports.getMy = async (req, res, next) => {
    try {
        const records = await SlashRecord.findAll({
            where: { user_id: req.user.id },
            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images'] }],
            order: [['created_at', 'DESC']],
            limit: 20
        });
        res.json({ code: 0, data: records });
    } catch (err) { next(err); }
};
