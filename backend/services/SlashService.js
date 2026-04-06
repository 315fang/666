/**
 * 砍一刀(Slash)服务层
 * 封装所有砍价相关的业务逻辑与数据库操作
 *
 * 无资格限制——任何用户都可以发起，任何人都可以帮砍
 */

const { Op } = require('sequelize');
const {
    SlashActivity, SlashRecord, SlashHelper,
    Product, User, sequelize
} = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const PointService = require('./PointService');
const { secureRandomHex } = require('../utils/secureRandom');
const { BusinessError } = require('../utils/errors');

// ─────────────────── 工具函数 ───────────────────

/**
 * 生成砍价单号
 * 格式: SL + 日期(8位) + 6位安全随机十六进制数
 */
function genSlashNo() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = secureRandomHex(6);
    return `SL${date}${rand}`;
}

/**
 * 计算砍价记录的有效过期时间
 * 取 recordExpireAt 和 activityEndAt 中较早的一个（若均有效）
 *
 * @param {Date|string|null} recordExpireAt - 记录级过期时间
 * @param {Date|string|null} activityEndAt   - 活动结束时间
 * @returns {Date|null}
 */
function resolveSlashExpireAt(recordExpireAt, activityEndAt) {
    const candidates = [recordExpireAt, activityEndAt]
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()));

    if (!candidates.length) return null;
    return new Date(Math.min(...candidates.map((date) => date.getTime())));
}

/**
 * 构建进行中活动的查询条件
 *
 * @param {Date}   now       - 当前时间（用于判断 start_at / end_at）
 * @param {object} [extra={}] - 额外查询条件
 * @returns {object} Sequelize where 条件对象
 */
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

// ────────────── 安全随机浮点数 [min, max] ──────────────

/**
 * 基于加密安全的随机整数生成 [min, max) 范围内的均匀分布浮点数。
 * 用于帮砍金额等需要不可预测随机性的场景，替代 Math.random()。
 *
 * @param {number} min - 最小值（包含）
 * @param {number} max - 最大值（不包含）
 * @returns {number}
 */
function secureRandomFloat(min, max) {
    // 利用 crypto.randomBytes 生成 48 位 (6 字节) 随机整数
    const buf = require('crypto').randomBytes(6);
    const randInt = buf.readUIntBE(0, 6);           // 0 ~ 2^48-1
    const range = max - min;                         // > 0
    return min + (randInt / (2 ** 48)) * range;      // [min, max)
}

// ─────────────────── 业务方法 ───────────────────

/**
 * 活动列表查询
 * 支持按 product_id 筛选，不传则返回全部进行中活动
 *
 * @param {object|null} user - 当前用户（本接口不依赖用户信息，保留签名一致性）
 * @param {object}      query - req.query: { product_id? }
 * @returns {Array} 活动列表
 */
async function getActivities(user, query) {
    const { product_id } = query || {};
    const now = new Date();
    const where = buildSlashActiveWhere(now, product_id ? { product_id } : {});

    return await SlashActivity.findAll({
        where,
        include: [
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'images', 'retail_price', 'description', 'market_price'],
                where: { visible_in_mall: true },
                required: true
            }
        ],
        order: [['created_at', 'DESC']]
    });
}

/**
 * 发起砍价（含事务）
 * 任何人可发起，无会员限制
 *
 * @param {object} user - 当前登录用户
 * @param {object} body - req.body: { activity_id, sku_id? }
 * @returns {object} 结果数据
 */
async function startSlash(user, body) {
    const t = await sequelize.transaction();
    try {
        const userId = user.id;
        const { activity_id } = body;

        const now = new Date();
        const activity = await SlashActivity.findOne({
            where: buildSlashActiveWhere(now, { id: activity_id }),
            transaction: t, lock: t.LOCK.UPDATE
        });

        if (!activity) {
            await t.rollback();
            throw new BusinessError('砍价活动不存在或已结束', 400);
        }

        if (activity.sold_count >= activity.stock_limit) {
            await t.rollback();
            throw new BusinessError('活动库存已售罄', 400);
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
                return {
                    code: 0,
                    message: '您已有进行中的砍价，已为您继续进入详情',
                    data: {
                        slash_no: existing.slash_no,
                        existing: true
                    }
                };
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

        return {
            code: 0,
            message: '砍价发起成功！快分享给朋友帮你砍吧',
            data: {
                slash_no: record.slash_no,
                current_price: record.current_price,
                floor_price: record.floor_price,
                expire_at: record.expire_at,
                expires_at: record.expire_at
            }
        };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

/**
 * 砍价详情（分享页，无需登录）
 *
 * @param {object|null} user     - 当前用户（可能为 null，用于判断是否已帮砍）
 * @param {object}      params   - req.params: { slash_no }
 * @returns {object} 详情数据
 */
async function getDetail(user, params) {
    const { slash_no } = params;

    const record = await SlashRecord.findOne({
        where: { slash_no },
        include: [
            {
                model: SlashActivity,
                as: 'activity',
                attributes: [
                    'id', 'product_id', 'sku_id',
                    'original_price', 'floor_price', 'initial_price',
                    'max_slash_per_helper', 'min_slash_per_helper', 'max_helpers',
                    'expire_hours', 'stock_limit', 'sold_count',
                    'status', 'start_at', 'end_at'
                ]
            },
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'images', 'retail_price', 'description', 'category_id', 'supports_pickup', 'market_price']
            },
            { model: User, as: 'initiator', attributes: ['id', 'nickname', 'avatar_url'] },
            {
                model: SlashHelper, as: 'helpers',
                include: [{ model: User, as: 'helper', attributes: ['id', 'nickname', 'avatar_url'] }],
                order: [['created_at', 'ASC']],
                limit: 20
            }
        ]
    });

    if (!record) {
        throw new BusinessError('砍价不存在', 404);
    }

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
    if (user) {
        const helpRecord = await SlashHelper.findOne({
            where: { slash_record_id: record.id, helper_user_id: user.id }
        });
        hasHelped = !!helpRecord;
    }

    const rawRecord = record.toJSON();
    const helpers = (rawRecord.helpers || []).map((item) => ({
        ...item,
        user: item.user || item.helper || null,
        cut_amount: item.cut_amount ?? item.slash_amount
    }));

    return {
        ...rawRecord,
        helpers,
        expires_at: effectiveExpireAt ? effectiveExpireAt.toISOString() : null,
        remain_seconds: remainSeconds,
        has_helped: hasHelped,
        amount_to_floor: Math.max(0, parseFloat(record.current_price) - parseFloat(record.floor_price))
    };
}

/**
 * 帮砍一刀（含事务、安全随机砍价金额计算）
 * 登录用户才能帮砍，但不限制身份
 *
 * @param {object} user   - 当前登录用户
 * @param {object} params - req.params: { slash_no }
 * @returns {object} 结果数据
 */
async function helpSlash(user, params) {
    const t = await sequelize.transaction();
    try {
        const helperId = user.id;
        const { slash_no } = params;

        const record = await SlashRecord.findOne({
            where: { slash_no },
            transaction: t, lock: t.LOCK.UPDATE
        });

        if (!record) {
            await t.rollback();
            throw new BusinessError('砍价活动不存在', 404);
        }

        if (record.status !== 'active') {
            await t.rollback();
            const msg = record.status === 'success' ? '该砍价已砍到底价' : '砍价已结束';
            throw new BusinessError(msg, 400);
        }

        const activity = await SlashActivity.findByPk(record.activity_id, { transaction: t });
        const effectiveExpireAt = resolveSlashExpireAt(record.expire_at, activity?.end_at);

        if (effectiveExpireAt && new Date() > effectiveExpireAt) {
            await record.update({ status: 'expired' }, { transaction: t });
            await t.commit();
            throw new BusinessError('砍价已超时', 400);
        }

        // 发起者不能帮自己砍
        if (record.user_id === helperId) {
            await t.rollback();
            throw new BusinessError('不能帮自己砍价哦，快去分享给朋友吧', 400);
        }

        // 检查是否已帮砍过
        const alreadyHelped = await SlashHelper.findOne({
            where: { slash_record_id: record.id, helper_user_id: helperId },
            transaction: t
        });
        if (alreadyHelped) {
            await t.rollback();
            throw new BusinessError('您已经帮过这个砍价了', 400, -1, { slash_amount: alreadyHelped.slash_amount });
        }

        // 获取活动配置
        const maxHelpers = activity.max_helpers;
        if (maxHelpers !== -1 && record.helper_count >= maxHelpers) {
            await t.rollback();
            throw new BusinessError('帮砍人数已满，活动结束', 400);
        }

        // ── 计算砍价金额（安全随机）──
        const currentPrice = parseFloat(record.current_price);
        const floorPrice = parseFloat(record.floor_price);
        const gap = currentPrice - floorPrice;
        if (gap <= 0) {
            // 已到底价，直接成功
            await record.update({ status: 'success', success_at: new Date() }, { transaction: t });
            await t.commit();
            return { code: 0, message: '已砍到底价！', data: { already_floor: true } };
        }

        // 随机砍价（基于当前缺口，越接近底价砍得越少）— 使用安全随机替代 Math.random()
        const maxSlash = Math.min(parseFloat(activity.max_slash_per_helper), gap * 0.6);
        const minSlash = parseFloat(activity.min_slash_per_helper);
        let slashAmount = minSlash + secureRandomFloat(minSlash, maxSlash);
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

        return {
            code: 0,
            message: isFloor ? '🎉 砍到底价了！可以购买了！' : `砍掉了 ¥${slashAmount}！`,
            data: {
                slash_amount: slashAmount,
                current_price: newPrice,
                floor_price: floorPrice,
                is_floor: isFloor,
                helper_count: record.helper_count + 1
            }
        };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

/**
 * 我发起的砍价记录
 *
 * @param {object} user - 当前登录用户
 * @returns {Array} 砍价记录列表
 */
async function getMy(user) {
    return await SlashRecord.findAll({
        where: { user_id: user.id },
        include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images'] }],
        order: [['created_at', 'DESC']],
        limit: 20
    });
}

module.exports = {
    genSlashNo,
    resolveSlashExpireAt,
    buildSlashActiveWhere,
    getActivities,
    startSlash,
    getDetail,
    helpSlash,
    getMy
};
