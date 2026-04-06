/**
 * 纯游客账号清理：长期未登录、无任何订单/团队/资产/券等痕迹时物理删除（释放 openid）。
 * 阈值天数由 SYSTEM.USER_IDLE_GUEST_PURGE_DAYS 或 env USER_IDLE_GUEST_PURGE_DAYS 控制，0=关闭。
 */

const { Op } = require('sequelize');
const { error: logError, info: logInfo } = require('../utils/logger');
const {
    sequelize,
    User,
    Order,
    Cart,
    Address,
    UserFavorite,
    PointAccount,
    PointLog,
    Notification,
    CommissionLog,
    Withdrawal,
    Refund,
    Review,
    Dealer,
    UserCoupon,
    GroupOrder,
    GroupMember,
    SlashRecord,
    SlashHelper,
    LotteryRecord,
    PortalAccount,
    AgentWalletAccount,
    AgentWalletLog,
    StockReservation,
    UpgradeApplication,
    PartnerExitApplication,
    UserMassMessage,
    UserTagRelation
} = require('../models');
const { getUserMaintenanceConfig } = require('../utils/runtimeBusinessConfig');

class UserCleanupService {
    /**
     * @returns {Promise<{ purged: number, skipped: number }>}
     */
    static async purgeIdleGuestUsers() {
        const { idleGuestPurgeDays } = await getUserMaintenanceConfig();
        if (!idleGuestPurgeDays || idleGuestPurgeDays <= 0) {
            return { purged: 0, skipped: 0 };
        }

        const cutoff = new Date(Date.now() - idleGuestPurgeDays * 86400000);

        const candidates = await User.findAll({
            where: {
                role_level: 0,
                order_count: 0,
                parent_id: null,
                participate_distribution: 0,
                status: 1,
                balance: 0,
                debt_amount: 0,
                referee_count: 0,
                total_sales: 0,
                growth_value: 0,
                [Op.or]: [
                    { last_login: { [Op.lt]: cutoff } },
                    { last_login: { [Op.is]: null }, created_at: { [Op.lt]: cutoff } }
                ]
            },
            attributes: ['id'],
            limit: 100,
            order: [['id', 'ASC']]
        });

        let purged = 0;
        let skipped = 0;

        for (const row of candidates) {
            const id = row.id;
            const t = await sequelize.transaction();
            try {
                const ok = await UserCleanupService._canSafelyPurgeGuestUser(id, t);
                if (!ok) {
                    await t.rollback();
                    skipped++;
                    continue;
                }
                await UserCleanupService._purgeGuestUserArtifacts(id, t);
                await User.destroy({ where: { id }, transaction: t });
                await t.commit();
                purged++;
            } catch (e) {
                if (!t.finished) await t.rollback();
                logError('USER_CLEANUP', `删除游客用户失败 id=${id}`, { error: e.message });
                skipped++;
            }
        }

        if (purged > 0) {
            logInfo('USER_CLEANUP', `闲置纯游客清理：已删除 ${purged} 个，跳过 ${skipped} 个`);
        }
        return { purged, skipped };
    }

    static async _canSafelyPurgeGuestUser(userId, transaction) {
        const t = transaction;
        const checks = await Promise.all([
            Order.count({ where: { buyer_id: userId }, transaction: t }),
            Order.count({ where: { distributor_id: userId }, transaction: t }),
            User.count({ where: { parent_id: userId }, transaction: t }),
            CommissionLog.count({ where: { user_id: userId }, transaction: t }),
            Withdrawal.count({ where: { user_id: userId }, transaction: t }),
            Refund.count({ where: { user_id: userId }, transaction: t }),
            Review.count({ where: { user_id: userId }, transaction: t }),
            Dealer.count({ where: { user_id: userId }, transaction: t }),
            UserCoupon.count({ where: { user_id: userId }, transaction: t }),
            GroupMember.count({ where: { user_id: userId }, transaction: t }),
            GroupOrder.count({ where: { [Op.or]: [{ leader_id: userId }, { inviter_id: userId }] }, transaction: t }),
            SlashRecord.count({ where: { user_id: userId }, transaction: t }),
            SlashHelper.count({ where: { helper_user_id: userId }, transaction: t }),
            LotteryRecord.count({ where: { user_id: userId }, transaction: t }),
            PortalAccount.count({ where: { user_id: userId }, transaction: t }),
            UpgradeApplication.count({ where: { user_id: userId }, transaction: t }),
            PartnerExitApplication.count({ where: { user_id: userId }, transaction: t })
        ]);

        if (checks.some((c) => c > 0)) return false;

        const u = await User.findByPk(userId, { attributes: ['stock_count'], transaction: t, lock: t.LOCK.UPDATE });
        if (!u) return false;
        if (Number(u.stock_count || 0) !== 0) return false;

        const wallet = await AgentWalletAccount.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE
        });
        if (wallet && parseFloat(wallet.balance || 0) > 0.0001) return false;

        return true;
    }

    static async _purgeGuestUserArtifacts(userId, transaction) {
        const t = transaction;
        await UserMassMessage.destroy({ where: { user_id: userId }, transaction: t });
        await UserTagRelation.destroy({ where: { user_id: userId }, transaction: t });
        await StockReservation.destroy({ where: { user_id: userId }, transaction: t });
        await Notification.destroy({ where: { user_id: userId }, transaction: t });
        await Cart.destroy({ where: { user_id: userId }, transaction: t });
        await Address.destroy({ where: { user_id: userId }, transaction: t });
        await UserFavorite.destroy({ where: { user_id: userId }, transaction: t });
        await PointLog.destroy({ where: { user_id: userId }, transaction: t });
        await PointAccount.destroy({ where: { user_id: userId }, transaction: t });

        const wallet = await AgentWalletAccount.findOne({ where: { user_id: userId }, transaction: t });
        if (wallet) {
            await AgentWalletLog.destroy({ where: { account_id: wallet.id }, transaction: t });
            await AgentWalletLog.destroy({ where: { user_id: userId }, transaction: t });
            await wallet.destroy({ transaction: t });
        }
    }
}

module.exports = UserCleanupService;
