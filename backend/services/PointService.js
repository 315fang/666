/**
 * 积分服务
 * 统一管理所有积分的增减操作，确保原子性和数据一致性
 * 任务发分规则来自 point_rule_config；积分页「等级特权」定档按用户成长值（users.growth_value），
 * 与可消费积分（签到/任务/消费累计分、余额）分离。
 */
const { PointAccount, PointLog, User, sequelize } = require('../models');
const MemberTierService = require('./MemberTierService');

/** 按成长值在 point_level_config 阶梯上定档（min 表示成长值下限，非积分） */
async function calcLevelFromGrowth(growthValue) {
    const levels = await MemberTierService.getPointLevels();
    if (!levels.length) return 1;

    const sorted = [...levels].sort((a, b) => a.min - b.min || a.level - b.level);
    const g = Math.max(0, Number(growthValue) || 0);
    let chosen = sorted[0];

    for (let i = sorted.length - 1; i >= 0; i--) {
        if (g >= sorted[i].min) {
            chosen = sorted[i];
            break;
        }
    }
    return chosen.level;
}

async function getLevelInfo(level) {
    const levels = await MemberTierService.getPointLevels();
    const n = Number(level);
    const idx = Number.isFinite(n) ? n : 1;
    const hit = levels.find(c => c.level === idx);
    return hit || levels[0] || { level: 1, name: '体验官', min: 0, max: null, perks: [] };
}

/**
 * ★ 核心方法：给用户增加/扣减积分（事务安全）
 */
async function addPoints(userId, points, type, refId = null, remark = null, t = null) {
    const pointRules = await MemberTierService.getPointRules();
    const ownTransaction = !t;
    if (ownTransaction) t = await sequelize.transaction();

    try {
        let [account] = await PointAccount.findOrCreate({
            where: { user_id: userId },
            defaults: { total_points: 0, used_points: 0, balance_points: 0, level: 1 },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        account = await PointAccount.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        const oldLevel = account.level;

        if (points > 0) {
            account.total_points += points;
            account.balance_points += points;
        } else if (points < 0) {
            const deduct = Math.abs(points);
            if (account.balance_points < deduct) {
                throw new Error(`积分余额不足，当前 ${account.balance_points}，需要 ${deduct}`);
            }
            account.balance_points += points;
            account.used_points += deduct;
        }

        const userRow = await User.findByPk(userId, { attributes: ['growth_value'], transaction: t });
        const growth = Math.max(0, parseFloat(userRow?.growth_value) || 0);
        account.level = await calcLevelFromGrowth(growth);
        await account.save({ transaction: t });

        const ruleRemark = pointRules[type]?.remark;
        const finalRemark = remark || ruleRemark || type;
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
            levelUp: newLevel > oldLevel ? newLevel : null
        };
    } catch (err) {
        if (ownTransaction) await t.rollback();
        throw err;
    }
}

/**
 * 注册新用户时初始化积分账户（Lv1）
 */
async function initForNewUser(userId, t = null) {
    const pointRules = await MemberTierService.getPointRules();
    const ownTransaction = !t;
    if (ownTransaction) t = await sequelize.transaction();

    try {
        const [account, created] = await PointAccount.findOrCreate({
            where: { user_id: userId },
            defaults: { total_points: 0, used_points: 0, balance_points: 0, level: 1 },
            transaction: t
        });

        if (created) {
            await PointLog.create({
                user_id: userId,
                points: 0,
                type: 'register',
                remark: pointRules.register?.remark || '注册升级体验官·享全场包邮特权',
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
 */
async function doCheckin(userId) {
    const pointRules = await MemberTierService.getPointRules();
    const t = await sequelize.transaction();
    try {
        const today = new Date().toISOString().split('T')[0];

        let account = await PointAccount.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!account) {
            account = await PointAccount.create(
                { user_id: userId, total_points: 0, used_points: 0, balance_points: 0, level: 1 },
                { transaction: t }
            );
        }

        if (account.last_checkin === today) {
            await t.rollback();
            return { success: false, message: '今日已签到', account };
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        let newStreak = account.last_checkin === yesterdayStr
            ? (account.checkin_streak || 0) + 1
            : 1;

        const checkinPts = pointRules.checkin?.points ?? 5;
        let totalPointsToAdd = checkinPts;
        let bonusPoints = 0;

        if (newStreak % 7 === 0) {
            bonusPoints = pointRules.checkin_streak?.points ?? 50;
            totalPointsToAdd += bonusPoints;
        }

        account.total_points += totalPointsToAdd;
        account.balance_points += totalPointsToAdd;
        account.last_checkin = today;
        account.checkin_streak = newStreak;
        const userRow = await User.findByPk(userId, { attributes: ['growth_value'], transaction: t });
        const growthBeforeCheckinGrowth = Math.max(0, parseFloat(userRow?.growth_value) || 0);
        account.level = await calcLevelFromGrowth(growthBeforeCheckinGrowth);
        await account.save({ transaction: t });

        await PointLog.create({
            user_id: userId,
            points: checkinPts,
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

        try {
            await addGrowthValue(userId, 1, null, 'checkin');
        } catch (e) {
            logError('POINT', '静默捕获异常（签到成长值）', { error: e.message });
        }

        const accountAfter = await PointAccount.findOne({ where: { user_id: userId } });

        return {
            success: true,
            points_earned: totalPointsToAdd,
            streak: newStreak,
            bonus: bonusPoints,
            account: accountAfter || account,
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
    const levelsSorted = [...await MemberTierService.getPointLevels()].sort(
        (a, b) => a.min - b.min || a.level - b.level
    );

    let account = await PointAccount.findOne({ where: { user_id: userId } });

    if (!account) {
        account = await PointAccount.create({
            user_id: userId, total_points: 0, used_points: 0, balance_points: 0, level: 1
        });
    }

    const user = await User.findByPk(userId, { attributes: ['id', 'growth_value'] });
    const growthValue = Math.max(0, parseFloat(user?.growth_value) || 0);
    const totalPoints = Math.max(0, Math.floor(Number(account.total_points) || 0));
    const balancePoints = Math.max(0, Math.floor(Number(account.balance_points) || 0));

    const derivedLevel = await calcLevelFromGrowth(growthValue);
    const storedLevel = Number(account.level);
    const levelNum = Number.isFinite(storedLevel) ? storedLevel : 1;

    if (derivedLevel !== levelNum) {
        account.level = derivedLevel;
        await account.save();
    }

    let currentIdx = 0;
    for (let i = levelsSorted.length - 1; i >= 0; i--) {
        if (growthValue >= levelsSorted[i].min) {
            currentIdx = i;
            break;
        }
    }

    const levelInfo = levelsSorted[currentIdx] || (await getLevelInfo(derivedLevel));
    const nextTier = levelsSorted[currentIdx + 1] || null;

    const freeByPerk = (levelInfo.perks || []).some(p => /包邮|免邮|全场邮/i.test(String(p)));

    let growthProgress = 100;
    if (nextTier) {
        const span = Math.max(1, nextTier.min - levelInfo.min);
        growthProgress = Math.min(100, Math.round(((growthValue - levelInfo.min) / span) * 100));
    }

    const growthNeeded = nextTier ? Math.max(0, nextTier.min - growthValue) : 0;

    return {
        ...account.toJSON(),
        total_points: totalPoints,
        balance_points: balancePoints,
        growth_value: growthValue,
        level: derivedLevel,
        level_name: levelInfo.name,
        level_perks: levelInfo.perks,
        growth_progress: growthProgress,
        next_level: nextTier ? {
            level: nextTier.level,
            name: nextTier.name,
            min: nextTier.min,
            growth_needed: growthNeeded,
            points_needed: growthNeeded
        } : null,
        is_free_shipping: freeByPerk || derivedLevel >= 1
    };
}

async function calcDiscountRate(growthValue) {
    return MemberTierService.calcDiscountRate(growthValue);
}

async function addGrowthValue(userId, amount, t = null, source = 'purchase') {
    const { User } = require('../models');
    const ownTransaction = !t;
    if (ownTransaction) t = await sequelize.transaction();

    try {
        const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!user) throw new Error(`用户 ${userId} 不存在`);

        const oldGrowth = parseFloat(user.growth_value) || 0;
        const oldRate = parseFloat(user.discount_rate) || 1.00;

        const gain = await MemberTierService.calcGrowthGain(source, amount);
        const newGrowth = oldGrowth + parseFloat(gain);
        const newRate = await calcDiscountRate(newGrowth);

        await user.update({ growth_value: newGrowth, discount_rate: newRate }, { transaction: t });

        const newPrivLevel = await calcLevelFromGrowth(newGrowth);
        let pa = await PointAccount.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE
        });
        if (!pa) {
            pa = await PointAccount.create({
                user_id: userId,
                total_points: 0,
                used_points: 0,
                balance_points: 0,
                level: newPrivLevel
            }, { transaction: t });
        } else if (Number(pa.level) !== Number(newPrivLevel)) {
            pa.level = newPrivLevel;
            await pa.save({ transaction: t });
        }

        if (ownTransaction) await t.commit();

        return {
            oldRate,
            newRate,
            growthAdded: gain,
            levelUp: newRate < oldRate
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
    calcLevelFromGrowth,
    getLevelInfo,
    addGrowthValue,
    calcDiscountRate,
    getPointLevels: () => MemberTierService.getPointLevels(),
    getPointRules: () => MemberTierService.getPointRules(),
    getGrowthTiers: MemberTierService.getGrowthTiers
};
