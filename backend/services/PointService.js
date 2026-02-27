/**
 * 积分服务
 * 统一管理所有积分的增减操作，确保原子性和数据一致性
 */
const { PointAccount, PointLog, sequelize } = require('../models');

// ============================================================
// 等级阈值配置
// ============================================================
const LEVEL_CONFIG = [
    { level: 1, name: '体验官', min: 0, max: 100, perks: ['全场包邮'] },
    { level: 2, name: '品质会员', min: 101, max: 500, perks: ['敬请期待'] },
    { level: 3, name: '精选达人', min: 501, max: 2000, perks: ['敬请期待'] },
    { level: 4, name: '首席鉴赏家', min: 2001, max: Infinity, perks: ['敬请期待'] }
];

// ============================================================
// 积分规则（每种行为赚多少分）
// ============================================================
const POINT_RULES = {
    register: { points: 0, remark: '注册自动升级体验官，享全场包邮特权' },
    purchase: { rate: 1, remark: '消费积分（1元=1积分）' },   // 按金额动态
    share: { points: 5, remark: '分享商品获得积分' },
    review: { points: 10, remark: '写评价获得积分' },
    review_image: { points: 20, remark: '图文评价获得积分' },
    checkin: { points: 5, remark: '每日签到' },
    checkin_streak: { points: 50, remark: '连续签到7天奖励' },        // 额外奖励
    invite_success: { points: 50, remark: '成功邀请新用户加入团队' },
    group_start: { points: 10, remark: '发起拼团' },
    group_success: { points: 30, remark: '拼团成功奖励' }
};

/**
 * 根据累计积分计算等级
 */
function calcLevel(totalPoints) {
    for (let i = LEVEL_CONFIG.length - 1; i >= 0; i--) {
        if (totalPoints >= LEVEL_CONFIG[i].min) {
            return LEVEL_CONFIG[i].level;
        }
    }
    return 1;
}

/**
 * 获取等级信息
 */
function getLevelInfo(level) {
    return LEVEL_CONFIG.find(c => c.level === level) || LEVEL_CONFIG[0];
}

/**
 * ★ 核心方法：给用户增加/扣减积分（事务安全）
 * 
 * @param {number} userId    用户ID
 * @param {number} points    积分变动量（正=增加 负=扣减）
 * @param {string} type      类型标识
 * @param {string} refId     关联业务ID（可选）
 * @param {string} remark    说明文字（可选，不传则用规则默认）
 * @param {object} t         外部事务（可选，不传则自动创建）
 * @returns {object}         { account, log, levelUp }
 */
async function addPoints(userId, points, type, refId = null, remark = null, t = null) {
    const ownTransaction = !t;
    if (ownTransaction) t = await sequelize.transaction();

    try {
        // 1. 获取或初始化积分账户（加行锁防并发）
        let [account] = await PointAccount.findOrCreate({
            where: { user_id: userId },
            defaults: { total_points: 0, used_points: 0, balance_points: 0, level: 1 },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        // 锁定现有账户
        account = await PointAccount.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        const oldLevel = account.level;

        // 2. 更新积分
        if (points > 0) {
            account.total_points += points;
            account.balance_points += points;
        } else if (points < 0) {
            const deduct = Math.abs(points);
            if (account.balance_points < deduct) {
                throw new Error(`积分余额不足，当前 ${account.balance_points}，需要 ${deduct}`);
            }
            account.balance_points += points; // 加负数
            account.used_points += deduct;
        }

        // 3. 重新计算等级（基于累计积分）
        const newLevel = calcLevel(account.total_points);
        account.level = newLevel;
        await account.save({ transaction: t });

        // 4. 写流水
        const finalRemark = remark || POINT_RULES[type]?.remark || type;
        const log = await PointLog.create({
            user_id: userId,
            points,
            type,
            ref_id: refId ? String(refId) : null,
            remark: finalRemark,
            balance_after: account.balance_points
        }, { transaction: t });

        if (ownTransaction) await t.commit();

        return {
            account,
            log,
            levelUp: newLevel > oldLevel ? newLevel : null   // 升级了则返回新等级
        };
    } catch (err) {
        if (ownTransaction) await t.rollback();
        throw err;
    }
}

/**
 * 注册新用户时初始化积分账户（Lv1）
 * 不赠送积分，但创建账户，等级默认1
 */
async function initForNewUser(userId, t = null) {
    const ownTransaction = !t;
    if (ownTransaction) t = await sequelize.transaction();

    try {
        const [account, created] = await PointAccount.findOrCreate({
            where: { user_id: userId },
            defaults: { total_points: 0, used_points: 0, balance_points: 0, level: 1 },
            transaction: t
        });

        if (created) {
            // 记录注册日志（无积分奖励，只是标记身份）
            await PointLog.create({
                user_id: userId,
                points: 0,
                type: 'register',
                remark: '注册升级体验官·享全场包邮特权',
                balance_after: 0
            }, { transaction: t });
        }

        if (ownTransaction) await t.commit();
        return account;
    } catch (err) {
        if (ownTransaction) await t.rollback();
        throw err;
    }
}

/**
 * 每日签到
 * 自动计算连续签到，7天额外奖励
 */
async function doCheckin(userId) {
    const t = await sequelize.transaction();
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        let account = await PointAccount.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!account) {
            // 用户还没有积分账户，初始化
            account = await PointAccount.create(
                { user_id: userId, total_points: 0, used_points: 0, balance_points: 0, level: 1 },
                { transaction: t }
            );
        }

        // 检查今天是否已签到
        if (account.last_checkin === today) {
            await t.rollback();
            return { success: false, message: '今日已签到', account };
        }

        // 计算连续签到
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        let newStreak = account.last_checkin === yesterdayStr
            ? (account.checkin_streak || 0) + 1
            : 1; // 连续中断，重置为1

        let totalPointsToAdd = POINT_RULES.checkin.points;
        const logs = [];
        let bonusPoints = 0;

        // 连续7天奖励
        if (newStreak % 7 === 0) {
            bonusPoints = POINT_RULES.checkin_streak.points;
            totalPointsToAdd += bonusPoints;
        }

        // 更新账户
        account.total_points += totalPointsToAdd;
        account.balance_points += totalPointsToAdd;
        account.last_checkin = today;
        account.checkin_streak = newStreak;
        account.level = calcLevel(account.total_points);
        await account.save({ transaction: t });

        // 写流水
        await PointLog.create({
            user_id: userId,
            points: POINT_RULES.checkin.points,
            type: 'checkin',
            remark: `每日签到（连续${newStreak}天）`,
            balance_after: account.balance_points - (bonusPoints > 0 ? bonusPoints : 0)
        }, { transaction: t });

        if (bonusPoints > 0) {
            await PointLog.create({
                user_id: userId,
                points: bonusPoints,
                type: 'checkin_streak',
                remark: `连续签到${newStreak}天奖励`,
                balance_after: account.balance_points
            }, { transaction: t });
        }

        await t.commit();

        return {
            success: true,
            points_earned: totalPointsToAdd,
            streak: newStreak,
            bonus: bonusPoints,
            account,
            message: bonusPoints > 0
                ? `签到成功！连续${newStreak}天，额外奖励${bonusPoints}积分！`
                : `签到成功！获得${totalPointsToAdd}积分`
        };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

/**
 * 获取用户积分账户（含等级特权信息）
 */
async function getAccountInfo(userId) {
    let account = await PointAccount.findOne({ where: { user_id: userId } });

    if (!account) {
        // 懒初始化
        account = await PointAccount.create({
            user_id: userId, total_points: 0, used_points: 0, balance_points: 0, level: 1
        });
    }

    const levelInfo = getLevelInfo(account.level);
    const nextLevelInfo = LEVEL_CONFIG.find(c => c.level === account.level + 1);

    return {
        ...account.toJSON(),
        level_name: levelInfo.name,
        level_perks: levelInfo.perks,
        next_level: nextLevelInfo ? {
            level: nextLevelInfo.level,
            name: nextLevelInfo.name,
            points_needed: nextLevelInfo.min - account.total_points
        } : null,
        is_free_shipping: account.level >= 1  // Lv1+ 全场包邮
    };
}

// ============================================================
// 成长値阶梯配置（消费金额→会员折扣）
// ============================================================
const GROWTH_TIERS = [
    { min: 0, discount: 1.00, name: 'Lv1 体验官', desc: '无折扣' },
    { min: 500, discount: 0.95, name: 'Lv2 品质会员', desc: '9.5折' },
    { min: 2000, discount: 0.90, name: 'Lv3 精选达人', desc: '9折' },
    { min: 5000, discount: 0.85, name: 'Lv4 首席鉴赏家', desc: '8.5折' }
];

/**
 * 根据成长値计算对应折扣率
 */
function calcDiscountRate(growthValue) {
    let rate = 1.00;
    for (const tier of GROWTH_TIERS) {
        if (growthValue >= tier.min) rate = tier.discount;
        else break;
    }
    return rate;
}

/**
 * ★ 核心枹法：重新算计并保存成长値属性倒用户
 * @param {number} userId       用户ID
 * @param {number} amount       消费金额（元）
 * @param {object} [t]          外部事务（可选）
 * @returns {{ oldRate, newRate, levelUp }}
 */
async function addGrowthValue(userId, amount, t = null) {
    const { User } = require('../models');
    const ownTransaction = !t;
    if (ownTransaction) t = await sequelize.transaction();

    try {
        const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!user) throw new Error(`用户 ${userId} 不存在`);

        const oldGrowth = parseFloat(user.growth_value) || 0;
        const oldRate = parseFloat(user.discount_rate) || 1.00;

        const newGrowth = oldGrowth + parseFloat(amount);
        const newRate = calcDiscountRate(newGrowth);

        await user.update({ growth_value: newGrowth, discount_rate: newRate }, { transaction: t });

        if (ownTransaction) await t.commit();

        return {
            oldRate,
            newRate,
            levelUp: newRate < oldRate  // 折扣更小，说明升级了
        };
    } catch (err) {
        if (ownTransaction) await t.rollback();
        throw err;
    }
}

module.exports = {
    addPoints,
    initForNewUser,
    doCheckin,
    getAccountInfo,
    calcLevel,
    getLevelInfo,
    addGrowthValue,
    calcDiscountRate,
    LEVEL_CONFIG,
    POINT_RULES,
    GROWTH_TIERS
};
