/**
 * 一次性修复：抽奖记录为 coupon + pending，但未写入 user_coupons 的历史数据
 * 用法：node backend/scripts/repair-lottery-coupon-records.js
 * （需在项目根目录、已配置数据库）
 */
const { sequelize, LotteryRecord, LotteryPrize } = require('../models');
const { issueUserCouponFromTemplate } = require('../services/UserCouponIssueService');

async function main() {
    await sequelize.authenticate();
    const pending = await LotteryRecord.findAll({
        where: { prize_type: 'coupon', status: 'pending' },
        order: [['id', 'ASC']]
    });
    let fixed = 0;
    let skipped = 0;
    for (const rec of pending) {
        const prize = await LotteryPrize.findByPk(rec.prize_id);
        const couponId = prize ? parseInt(prize.prize_value, 10) : NaN;
        if (!Number.isFinite(couponId) || couponId <= 0) {
            console.warn(`跳过 record#${rec.id}：无法解析券模板ID`);
            skipped++;
            continue;
        }
        const t = await sequelize.transaction();
        try {
            await issueUserCouponFromTemplate({
                user_id: rec.user_id,
                couponId,
                transaction: t
            });
            await rec.update(
                { status: 'claimed', claimed_at: new Date() },
                { transaction: t }
            );
            await t.commit();
            fixed++;
            console.log(`已修复 record#${rec.id} user#${rec.user_id} coupon#${couponId}`);
        } catch (e) {
            await t.rollback();
            console.warn(`record#${rec.id} 失败: ${e.message}`);
            skipped++;
        }
    }
    console.log(`完成：修复 ${fixed} 条，跳过/失败 ${skipped} 条`);
    await sequelize.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
